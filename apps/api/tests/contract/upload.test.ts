/**
 * T173 + T178 — `POST /scans/upload`, end to end through the real route.
 *
 * `packages/safe-archive`'s own adverse suite (T169) proves the guard refuses
 * hostile archives. This suite proves something different and equally
 * necessary: that the *route* runs the guard before it does anything else, and
 * that a refusal reaches the client as a usable answer rather than a 500.
 *
 * The two most valuable assertions here are negative ones, because both
 * failure modes are silent:
 *
 *   - **A refused archive never reaches storage.** The fake storage records
 *     every `put`, and a refusal case asserts it recorded none. A route that
 *     staged first and validated second would pass every status-code assertion
 *     in this file and still write a zip bomb into R2.
 *   - **A refused archive never creates a target.** Same reasoning: a `Target`
 *     row pointing at an object that was never written is a scan that fails
 *     later, for a reason with no connection to the upload that caused it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  MODE_DIRECTORY,
  MODE_REGULAR,
  MODE_SYMLINK,
  buildBenignZip,
  buildZip,
} from '@webaudit/safe-archive/testing';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import type { UploadStorage } from '../../src/services/storage/uploads.js';

const CREDS = { email: 'upload@example.com', password: 'correct-horse-battery-staple' };

/** In-memory `UploadStorage`, recording what it was asked to keep. */
function fakeStorage(): UploadStorage & { readonly puts: string[] } {
  const objects = new Map<string, Uint8Array>();
  const puts: string[] = [];
  return {
    puts,
    put(userId, sha256, body) {
      const key = `uploads/${userId}/${sha256}.zip`;
      objects.set(key, body);
      puts.push(key);
      return Promise.resolve(key);
    },
    get(key) {
      const found = objects.get(key);
      if (found === undefined) return Promise.reject(new Error(`no object at ${key}`));
      return Promise.resolve(found);
    },
    remove(key) {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

async function signIn(plan: 'free' | 'pro'): Promise<string> {
  const bootstrap = createApp({ db: testDb });
  await request(bootstrap).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  if (plan === 'pro') {
    await testDb.subscription.create({
      data: {
        userId: user.id,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  }
  const res = await request(bootstrap).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

function auth(bearer: string): Record<string, string> {
  return { Authorization: `Bearer ${bearer}` };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('POST /scans/upload', () => {
  it('stages a benign archive and returns an auditable ARCHIVE target', async () => {
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', buildBenignZip(), 'my-project.zip')
      .expect(201);

    const upload = (
      res.body as {
        upload: { targetId: string; key: string; fileCount: number; archiveBytes: number };
      }
    ).upload;
    expect(upload.fileCount).toBe(2); // The directory entry is not a file.
    expect(upload.key).toMatch(/^uploads\/[^/]+\/[a-f0-9]{64}\.zip$/);
    expect(storage.puts).toEqual([upload.key]);

    const target = await testDb.target.findUniqueOrThrow({ where: { id: upload.targetId } });
    expect(target.inputType).toBe('ARCHIVE');
    expect(target.canonicalValue).toBe(upload.key);
    expect(target.displayName).toBe('my-project.zip');
    // An archive is not a live target: there is nothing to attest control of.
    expect(target.controlLevel).toBe('NONE');
  });

  it('is content-addressed, so re-uploading the same archive reuses one target', async () => {
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const first = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', buildBenignZip(), 'my-project.zip')
      .expect(201);
    const second = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', buildBenignZip(), 'renamed.zip')
      .expect(201);

    const a = (first.body as { upload: { targetId: string } }).upload;
    const b = (second.body as { upload: { targetId: string } }).upload;
    expect(b.targetId).toBe(a.targetId);
    expect(await testDb.target.count({ where: { inputType: 'ARCHIVE' } })).toBe(1);
    // The name follows the most recent upload — the user renamed it and meant it.
    const target = await testDb.target.findUniqueOrThrow({ where: { id: a.targetId } });
    expect(target.displayName).toBe('renamed.zip');
  });

  it('refuses a traversal member with 422 and stages nothing', async () => {
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const hostile = buildZip([
      { path: 'project/', mode: MODE_DIRECTORY },
      { path: '../../etc/cron.d/pwn', content: '* * * * * root sh\n', mode: MODE_REGULAR },
    ]);

    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', hostile, 'project.zip')
      .expect(422);

    expect((res.body as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'PATH_ESCAPES_ROOT',
    );
    expect(storage.puts).toEqual([]);
    expect(await testDb.target.count()).toBe(0);
  });

  it('refuses a symlink member, which no path check alone would catch', async () => {
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const hostile = buildZip([
      { path: 'project/link', content: '/etc/passwd', mode: MODE_SYMLINK },
    ]);

    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', hostile, 'project.zip')
      .expect(422);

    expect((res.body as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'NON_REGULAR_ENTRY',
    );
    expect(storage.puts).toEqual([]);
  });

  it('refuses something that is not an archive at all', async () => {
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    // Named .zip, and it is not one. The filename is never trusted.
    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', Buffer.from('<!doctype html><p>not a zip'), 'project.zip')
      .expect(422);

    expect((res.body as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'UNSUPPORTED_FORMAT',
    );
    expect(storage.puts).toEqual([]);
  });

  it('refuses an upload the plan does not permit, naming the tier that does', async () => {
    const token = await signIn('free');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .attach('archive', buildBenignZip(), 'my-project.zip')
      .expect(403);

    const body = res.body as {
      error: { code: string; details: { inputType: string; requiredTier: string | null } };
    };
    expect(body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(body.error.details.inputType).toBe('ARCHIVE');
    expect(body.error.details.requiredTier).toBe('pro');
    expect(storage.puts).toEqual([]);
  });

  it('answers a body with no file part as the client error it is, not a 500', async () => {
    // The refusal shapes above all mean "we read your archive and it broke a
    // rule". This one means there was no archive to read, and it used to leave
    // the busboy callback as a bare Error — which reaches the client as a 500,
    // telling a user who sent a malformed request that the platform is broken.
    const token = await signIn('pro');
    const storage = fakeStorage();
    const app = createApp({ db: testDb, intake: { storage } });

    const res = await request(app)
      .post('/scans/upload')
      .set(auth(token))
      .field('note', 'no file attached')
      .expect(400);

    expect((res.body as { error: { code: string } }).error.code).toBe('UPLOAD_MALFORMED');
    expect(storage.puts).toEqual([]);
    expect(await testDb.target.count()).toBe(0);
  });

  it('requires authentication', async () => {
    const app = createApp({ db: testDb, intake: { storage: fakeStorage() } });
    await request(app)
      .post('/scans/upload')
      .attach('archive', buildBenignZip(), 'my-project.zip')
      .expect(401);
  });
});
