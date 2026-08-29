/**
 * T057 — the target and verification routes against contracts/http-api.md.
 *
 * The adverse suite proves the gate cannot be bypassed. This proves the HTTP
 * surface in front of it says what the contract says it says — statuses, error
 * codes, and the two properties that are easy to lose in a refactor:
 *
 *   - `POST /targets` refuses an SSRF target with 422 and never contacts it;
 *   - every handler treats "not yours" and "does not exist" identically.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { CONTROL_GATE } from '@webaudit/config';
import { SsrfRefusedError, assertPublicTarget } from '@webaudit/safe-net';
import type { ControlProbe } from '../../src/services/control-gate/verify.js';

const mailer = createCapturingMailer();

/** Published-token state the test owns, plus a record of what was read. */
const published = new Map<string, string>();
const txtRecords = new Map<string, string[]>();
const probe: ControlProbe = {
  fetchFile: (url) => Promise.resolve(published.get(url) ?? null),
  resolveTxt: (name) => Promise.resolve(txtRecords.get(name) ?? []),
};

/**
 * Records every URL the route layer tried to canonicalise, so the "never
 * contacts the target" claim is checked rather than asserted in a comment.
 */
const validated: string[] = [];

/**
 * The real guard, with resolution assumed to succeed for names.
 *
 * Everything layer 1 refuses still refuses here — schemes, credentials, malformed
 * URLs, internal-scope names, and every private/metadata literal in every
 * notation — because layer 1 runs before any lookup. What is faked is only the
 * DNS stage, and only for hostnames: `mine.example.com` deliberately does not
 * exist, and a resolver that answers NXDOMAIN with an address of its own (plenty
 * do) would otherwise turn this suite into a report on the tester's ISP.
 *
 * The resolution stage itself is covered exhaustively by
 * `packages/safe-net/tests/adverse/ssrf.rebinding.test.ts`, where a scripted DNS
 * server makes it deterministic. Duplicating it over HTTP would add no coverage
 * and one flake.
 */
const RESOLUTION_STAGE = new Set(['DNS_NO_ADDRESSES', 'RESOLVED_ADDRESS_DISALLOWED']);

const validateTarget = async (url: string): Promise<{ origin: string }> => {
  validated.push(url);
  try {
    return await assertPublicTarget(url);
  } catch (error) {
    if (error instanceof SsrfRefusedError && RESOLUTION_STAGE.has(error.reason)) {
      return { origin: new URL(url).origin };
    }
    throw error;
  }
};

const app = createApp({ db: testDb, mailer, targets: { probe, validateTarget } });

const CREDS = { email: 'targets@example.com', password: 'correct-horse-battery-staple' };
const OTHER = { email: 'other-targets@example.com', password: 'correct-horse-battery-staple' };

async function signIn(creds: typeof CREDS): Promise<string> {
  await request(app).post('/auth/register').send(creds).expect(201);
  await testDb.user.update({
    where: { email: creds.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(creds).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

let token = '';
let otherToken = '';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  published.clear();
  txtRecords.clear();
  validated.length = 0;
  mailer.clear();
  token = await signIn(CREDS);
  otherToken = await signIn(OTHER);
});
afterAll(closeDb);

function auth(bearer: string) {
  return { Authorization: `Bearer ${bearer}` };
}

async function createTarget(
  bearer = token,
  value = 'https://example.com/some/page',
): Promise<string> {
  const res = await request(app)
    .post('/targets')
    .set(auth(bearer))
    .send({ inputType: 'URL', value })
    .expect(201);
  return (res.body as { target: { id: string } }).target.id;
}

describe('POST /targets', () => {
  it('canonicalises a URL to its origin', async () => {
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://Example.com:443/deep/path?q=1' })
      .expect(201);

    expect(res.body.target.canonicalValue).toBe('https://example.com');
  });

  it('refuses an SSRF target with 422 and never fetches it', async () => {
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'http://169.254.169.254/latest/meta-data/' })
      .expect(422);

    expect(res.body.error.code).toBe('TARGET_REFUSED');
    expect(res.body.error.details.addressClass).toBe('METADATA');
    // Validated, not fetched. The probe is the only thing here that makes
    // requests, and it was never asked for anything.
    expect(validated).toEqual(['http://169.254.169.254/latest/meta-data/']);
    expect(await testDb.target.count()).toBe(0);
  });

  it('refuses a loopback target with 422', async () => {
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'http://127.0.0.1:8080/' })
      .expect(422);
    expect(res.body.error.details.addressClass).toBe('LOOPBACK');
  });

  it('returns the existing row rather than duplicating it (FR-018)', async () => {
    const first = await createTarget();
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(200);

    expect(res.body.target.id).toBe(first);
    expect(await testDb.target.count()).toBe(1);
  });

  it('does not reset control established against an existing target', async () => {
    const id = await createTarget();
    await request(app).post(`/targets/${id}/attest`).set(auth(token)).expect(200);

    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(200);

    expect(res.body.target.controlLevel).toBe('ATTESTED');
  });

  it('accepts a repository in owner/repo form and refuses anything else', async () => {
    await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'REPOSITORY', value: 'Acme/Web-App' })
      .expect(201);

    const bad = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'REPOSITORY', value: 'https://github.com/acme/web-app' })
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_REQUEST');
  });

  it('points an archive submission at the upload path instead of inventing a row', async () => {
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'ARCHIVE', value: 'bundle.zip' })
      .expect(400);
    expect(res.body.error.details.note).toContain('/scans/upload');
  });

  it('still refuses an internal-scope name through the same 422', async () => {
    // Proves the stub above only fakes resolution: this one never reaches it.
    const res = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'http://metadata.google.internal/computeMetadata/v1/' })
      .expect(422);
    expect(res.body.error.details.reason).toBe('HOSTNAME_NOT_PUBLIC');
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/targets')
      .send({ inputType: 'URL', value: 'https://x.test' })
      .expect(401);
    await request(app).get('/targets').expect(401);
  });
});

describe('GET /targets', () => {
  it('lists only the caller own targets', async () => {
    await createTarget(token, 'https://mine.example.com');
    await createTarget(otherToken, 'https://theirs.example.com');

    const res = await request(app).get('/targets').set(auth(token)).expect(200);
    expect(res.body.targets).toHaveLength(1);
    expect(res.body.targets[0].canonicalValue).toBe('https://mine.example.com');
  });
});

describe('POST /targets/:id/attest', () => {
  it('records who attested and when', async () => {
    const id = await createTarget();
    const res = await request(app).post(`/targets/${id}/attest`).set(auth(token)).expect(200);

    expect(res.body.target.controlLevel).toBe('ATTESTED');
    expect(res.body.target.attestedAt).toBeTruthy();
  });

  it('404s for another account target, exactly as for a missing one', async () => {
    const id = await createTarget();
    const stranger = await request(app)
      .post(`/targets/${id}/attest`)
      .set(auth(otherToken))
      .expect(404);
    const missing = await request(app)
      .post('/targets/clzzzznotarealid/attest')
      .set(auth(otherToken))
      .expect(404);

    expect(stranger.body).toEqual(missing.body);
  });
});

describe('POST /targets/:id/verify/start and /verify/check', () => {
  it('issues a FILE token with the path to publish it at', async () => {
    const id = await createTarget();
    const res = await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(token))
      .send({ method: 'FILE' })
      .expect(201);

    expect(res.body.verification.token).toHaveLength(43);
    expect(res.body.verification.fileUrl).toBe(
      `https://example.com${CONTROL_GATE.verificationFilePath}`,
    );
  });

  it('confirms once the token is published', async () => {
    const id = await createTarget();
    const start = await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(token))
      .send({ method: 'FILE' })
      .expect(201);

    published.set(
      `https://example.com${CONTROL_GATE.verificationFilePath}`,
      start.body.verification.token,
    );

    const res = await request(app).post(`/targets/${id}/verify/check`).set(auth(token)).expect(200);
    expect(res.body.verification.controlLevel).toBe('VERIFIED');
  });

  it('409s when the token is not published, naming the accepted methods', async () => {
    const id = await createTarget();
    await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(token))
      .send({ method: 'FILE' })
      .expect(201);

    const res = await request(app).post(`/targets/${id}/verify/check`).set(auth(token)).expect(409);
    expect(res.body.error.code).toBe('VERIFICATION_NOT_CONFIRMED');
    expect(res.body.error.details.methods).toEqual(['FILE', 'DNS']);
  });

  it('issues a DNS record name for a domain target', async () => {
    const id = await createTarget();
    const res = await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(token))
      .send({ method: 'DNS' })
      .expect(201);

    expect(res.body.verification.recordName).toBe(`${CONTROL_GATE.dnsRecordPrefix}.example.com`);
  });

  it('refuses DNS verification for a repository target, which has no domain', async () => {
    const create = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'REPOSITORY', value: 'acme/web-app' })
      .expect(201);

    const res = await request(app)
      .post(`/targets/${create.body.target.id}/verify/start`)
      .set(auth(token))
      .send({ method: 'DNS' })
      .expect(400);
    expect(res.body.error.message).toContain('no domain');
  });

  it('rejects an unknown method rather than defaulting to one', async () => {
    const id = await createTarget();
    const res = await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(token))
      .send({ method: 'EMAIL' })
      .expect(400);
    expect(res.body.error.details.methods).toEqual(['FILE', 'DNS']);
  });

  it('404s a stranger starting verification on someone else target', async () => {
    const id = await createTarget();
    await request(app)
      .post(`/targets/${id}/verify/start`)
      .set(auth(otherToken))
      .send({ method: 'FILE' })
      .expect(404);
  });
});
