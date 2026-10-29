/**
 * T189 — report retention (FR-092): warn before removal, then remove.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { enforceRetention } from '../../src/services/storage/retention.js';
import { createMemoryArtifactStore, createArtifact } from '../../src/services/evidence/index.js';

const mailer = createCapturingMailer();
const deps = { mailer, storage: null, webUrl: 'https://app.example' };

const DAY = 86_400_000;

async function completedScan(email: string, completedDaysAgo: number): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: `https://${email}`,
      displayName: 'ret',
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
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 70 },
  });
  await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp',
      checkId: 'headers.csp-missing',
      severity: 'HIGH',
      title: 't',
      explanation: 'x',
      consequence: 'y',
      attribution: 'MEASURED',
      fixPrompt: 'z',
    },
  });
  return scan.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('enforceRetention', () => {
  it('warns once for a free-tier report within 3 days of its 7-day expiry', async () => {
    // free retention is 7 days; completed 5 days ago → expires in 2 → within the 3-day window.
    const scanId = await completedScan('ret-warn@example.com', 5);

    const first = await enforceRetention(testDb, deps);
    expect(first.warned).toBe(1);
    expect(mailer.retentionWarnings()).toHaveLength(1);
    expect(mailer.retentionWarnings()[0]?.mail.exportUrl).toContain(`/scans/${scanId}/export`);

    // Second run does not re-warn.
    mailer.clear();
    const second = await enforceRetention(testDb, deps);
    expect(second.warned).toBe(0);
    expect(mailer.retentionWarnings()).toHaveLength(0);
  });

  it('removes a report past its retention period: findings gone, row kept, flag set', async () => {
    const scanId = await completedScan('ret-remove@example.com', 10); // > 7 days on free

    const result = await enforceRetention(testDb, deps);
    expect(result.removed).toBe(1);

    const scan = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan.reportRemovedAt).not.toBeNull();
    expect(scan.overallScore).toBeNull();
    expect(scan.summary).toBeNull();
    expect(await testDb.issue.count({ where: { scanId } })).toBe(0);
    expect(await testDb.moduleResult.count({ where: { scanId } })).toBe(0);
  });

  it('SPEC 009 FR-034: removes Artifact rows in the same transaction, objects after commit; a failed delete leaves an orphan, never a dangling row', async () => {
    const scanId = await completedScan('ret-artifacts@example.com', 10);
    const scan = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
    const plan = await testDb.scanPlan.create({
      data: {
        kind: 'INITIAL',
        userId: scan.userId,
        scanId,
        state: 'RESOLVED',
        deadlineMs: 900_000,
      },
    });
    await testDb.$executeRawUnsafe(
      `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey") VALUES ('ret-u',$1,$2,$3,'PASSIVE_HTTP','e','{}'::jsonb,0,1000,'{}'::jsonb,false,'ret-u:1')`,
      plan.id,
      scan.userId,
      scan.targetId,
    );
    const store = createMemoryArtifactStore();
    const a = await createArtifact(testDb, store, {
      scanId,
      userId: scan.userId,
      executionUnitId: 'ret-u',
      contentType: 'image/png',
      body: new Uint8Array([1, 2, 3]),
    });
    const result = await enforceRetention(testDb, { ...deps, artifactStore: store });
    expect(result.removed).toBe(1);
    expect(await testDb.artifact.count({ where: { id: a.id } })).toBe(0);
    expect(store.objects.size).toBe(0);

    const scan2 = await completedScan('ret-artifacts2@example.com', 10);
    const s2 = await testDb.scan.findUniqueOrThrow({ where: { id: scan2 } });
    const plan2 = await testDb.scanPlan.create({
      data: {
        kind: 'INITIAL',
        userId: s2.userId,
        scanId: scan2,
        state: 'RESOLVED',
        deadlineMs: 900_000,
      },
    });
    await testDb.$executeRawUnsafe(
      `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey") VALUES ('ret-u2',$1,$2,$3,'PASSIVE_HTTP','e','{}'::jsonb,0,1000,'{}'::jsonb,false,'ret-u2:1')`,
      plan2.id,
      s2.userId,
      s2.targetId,
    );
    const failing = { ...store, delete: () => Promise.reject(new Error('r2 down')) };
    await createArtifact(testDb, store, {
      scanId: scan2,
      userId: s2.userId,
      executionUnitId: 'ret-u2',
      contentType: 'image/png',
      body: new Uint8Array([9]),
    });
    await enforceRetention(testDb, { ...deps, artifactStore: failing });
    expect(await testDb.artifact.count({ where: { scanId: scan2 } })).toBe(0);
    expect(store.objects.size).toBe(1); // orphan object remains for the reaper
  });

  it('leaves a fresh report alone', async () => {
    await completedScan('ret-fresh@example.com', 1);
    const result = await enforceRetention(testDb, deps);
    expect(result).toEqual({ warned: 0, removed: 0 });
  });

  it('does not remove a report at the exact expiry instant, only strictly after it', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const user = await testDb.user.create({
      data: { email: 'ret-boundary@example.com', emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://ret-boundary.example.com',
        displayName: 'ret',
      },
    });
    await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'COMPLETED',
        overallScore: 70,
        completedAt,
      },
    });

    const exactExpiry = new Date(completedAt.getTime() + 7 * DAY); // free tier: retentionDays 7
    const result = await enforceRetention(testDb, deps, exactExpiry);
    expect(result.removed).toBe(0);
  });
});
