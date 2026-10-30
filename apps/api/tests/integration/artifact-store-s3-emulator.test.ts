/**
 * D01 (emulator acceptance ONLY; DEC-075): the artifact lifecycle against a local S3-compatible emulator (MinIO).
 * This is NOT real-R2 acceptance. Skipped unless S3_EMULATOR_ENDPOINT / S3_EMULATOR_ACCESS_KEY / S3_EMULATOR_SECRET_KEY are
 * set; the credentials are throwaway values for a disposable container, never customer or production credentials.
 * Signed (presigned) download access is not exercised: the code under test has no download or presign path.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  createArtifact,
  createR2ArtifactStore,
  reclaimOrphanedArtifacts,
  type ArtifactStore,
} from '../../src/services/evidence/index.js';
import { enforceRetention } from '../../src/services/storage/retention.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const endpoint = process.env['S3_EMULATOR_ENDPOINT'];
const accessKeyId = process.env['S3_EMULATOR_ACCESS_KEY'];
const secretAccessKey = process.env['S3_EMULATOR_SECRET_KEY'];
const enabled =
  endpoint !== undefined && accessKeyId !== undefined && secretAccessKey !== undefined;
const bucket = `d01-${Math.random().toString(36).slice(2, 10)}`;
const client = enabled
  ? new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 1,
    })
  : (undefined as unknown as S3Client);

const deps = { mailer: createCapturingMailer(), storage: null, webUrl: 'https://app.example' };
const DAY = 86_400_000;

async function scanWithUnit(email: string, unitId: string, completedDaysAgo = 10) {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: `https://${email}`,
      displayName: 'd',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state: 'COMPLETED',
      overallScore: 70,
      summary: 'x',
      completedAt: new Date(Date.now() - completedDaysAgo * DAY),
    },
  });
  const plan = await testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId: user.id,
      scanId: scan.id,
      state: 'RESOLVED',
      deadlineMs: 900_000,
    },
  });
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey") VALUES ($4,$1,$2,$3,'PASSIVE_HTTP','e','{}'::jsonb,0,1000,'{}'::jsonb,false,$5)`,
    plan.id,
    user.id,
    target.id,
    unitId,
    `${unitId}:1`,
  );
  return { userId: user.id, scanId: scan.id, unitId };
}

const text = (s: string) => new TextEncoder().encode(s);

describe.skipIf(!enabled)(
  'artifact lifecycle against an S3-compatible emulator (not real R2)',
  () => {
    let store: ArtifactStore;
    beforeAll(async () => {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      store = createR2ArtifactStore(client, bucket);
    });
    beforeEach(resetDb);
    afterAll(async () => {
      for (const o of await store.list('artifacts/')) await store.delete(o.key);
      await closeDb();
    });

    it('uploads, lists and downloads an artifact; the row and the object agree', async () => {
      const w = await scanWithUnit('d01-a@example.com', 'd01-unit-a');
      const a = await createArtifact(testDb, store, {
        scanId: w.scanId,
        userId: w.userId,
        executionUnitId: w.unitId,
        contentType: 'text/plain',
        body: text('hello artifact'),
      });
      expect((await store.list(`artifacts/${w.scanId}/`)).map((o) => o.key)).toEqual([
        a.storageKey,
      ]);
      const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: a.storageKey }));
      expect(await got.Body?.transformToString()).toBe('hello artifact');
      expect(await testDb.artifact.count({ where: { storageKey: a.storageKey } })).toBe(1);
    });

    it('is content-addressed: the same bytes make one object and one row', async () => {
      const w = await scanWithUnit('d01-dup@example.com', 'd01-unit-dup');
      const input = {
        scanId: w.scanId,
        userId: w.userId,
        executionUnitId: w.unitId,
        contentType: 'text/plain',
      };
      const one = await createArtifact(testDb, store, {
        ...input,
        body: new Uint8Array([7, 7, 7]),
      });
      const two = await createArtifact(testDb, store, {
        ...input,
        body: new Uint8Array([7, 7, 7]),
      });
      expect(two.id).toBe(one.id);
      expect(await store.list(`artifacts/${w.scanId}/`)).toHaveLength(1);
    });

    it('refuses another tenant, a foreign scan id and a hostile key, writing nothing', async () => {
      const a = await scanWithUnit('d01-t1@example.com', 'd01-unit-t1');
      const b = await scanWithUnit('d01-t2@example.com', 'd01-unit-t2');
      const base = { contentType: 'text/plain', body: new Uint8Array([1]) };
      await expect(
        createArtifact(testDb, store, {
          ...base,
          scanId: a.scanId,
          userId: b.userId,
          executionUnitId: a.unitId,
        }),
      ).rejects.toThrow();
      await expect(
        createArtifact(testDb, store, {
          ...base,
          scanId: b.scanId,
          userId: a.userId,
          executionUnitId: a.unitId,
        }),
      ).rejects.toThrow();
      await expect(
        store.put('artifacts/../x/y/zzzzzzzz', new Uint8Array([1]), 'text/plain'),
      ).rejects.toThrow();
      await expect(store.list('other/')).rejects.toThrow();
      expect(await store.list(`artifacts/${a.scanId}/`)).toHaveLength(0);
      expect(await store.list(`artifacts/${b.scanId}/`)).toHaveLength(0);
    });

    it('retention removes rows first; a failed delete leaves an orphan the reaper reclaims only after the grace period, once', async () => {
      const w = await scanWithUnit('d01-ret@example.com', 'd01-unit-ret');
      await createArtifact(testDb, store, {
        scanId: w.scanId,
        userId: w.userId,
        executionUnitId: w.unitId,
        contentType: 'text/plain',
        body: new Uint8Array([4, 4]),
      });
      const failing: ArtifactStore = {
        ...store,
        delete: () => Promise.reject(new Error('object store down')),
      };
      await enforceRetention(testDb, { ...deps, artifactStore: failing });
      expect(await testDb.artifact.count({ where: { scanId: w.scanId } })).toBe(0);
      const orphans = await store.list(`artifacts/${w.scanId}/`);
      expect(orphans).toHaveLength(1);
      const early = await reclaimOrphanedArtifacts(testDb, store, { graceMs: 3_600_000 });
      expect(early.reclaimed).toEqual([]);
      const later = await reclaimOrphanedArtifacts(testDb, store, {
        now: new Date(Date.now() + 2 * 3_600_000),
        graceMs: 3_600_000,
      });
      expect(later.reclaimed).toContain(orphans[0]?.key); // other tests unreferenced objects may be reaped too
      expect(await store.list(`artifacts/${w.scanId}/`)).toHaveLength(0);
      const again = await reclaimOrphanedArtifacts(testDb, store, {
        now: new Date(Date.now() + 2 * 3_600_000),
        graceMs: 3_600_000,
      });
      expect(again.reclaimed).toEqual([]);
    });

    it('never reaps a referenced object; deleting a missing object is harmless', async () => {
      const w = await scanWithUnit('d01-keep@example.com', 'd01-unit-keep', 1);
      const a = await createArtifact(testDb, store, {
        scanId: w.scanId,
        userId: w.userId,
        executionUnitId: w.unitId,
        contentType: 'text/plain',
        body: new Uint8Array([5]),
      });
      const out = await reclaimOrphanedArtifacts(testDb, store, {
        now: new Date(Date.now() + 99 * DAY),
        graceMs: 1000,
      });
      expect(out.reclaimed).not.toContain(a.storageKey);
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: 'artifacts/none/none/nonenone1' }),
      );
    });

    it('an unreachable object store fails the upload without leaving a row', async () => {
      const w = await scanWithUnit('d01-down@example.com', 'd01-unit-down');
      const dead = createR2ArtifactStore(
        new S3Client({
          region: 'us-east-1',
          endpoint: 'http://127.0.0.1:1',
          forcePathStyle: true,
          credentials: { accessKeyId: 'x', secretAccessKey: 'y' },
          maxAttempts: 1,
        }),
        bucket,
      );
      await expect(
        createArtifact(testDb, dead, {
          scanId: w.scanId,
          userId: w.userId,
          executionUnitId: w.unitId,
          contentType: 'text/plain',
          body: new Uint8Array([6]),
        }),
      ).rejects.toThrow();
      expect(await testDb.artifact.count({ where: { scanId: w.scanId } })).toBe(0);
    });
  },
);
