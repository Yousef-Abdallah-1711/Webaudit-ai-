/**
 * SPEC 008 T009/T010/T014a — the race SPEC 007 FR-024 leaves to this spec:
 * concurrent admissions must never over-subscribe a grant's budget. Real
 * PostgreSQL, real concurrent connections (the Prisma pool), no mocks.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  admissionRequest,
  counterOf,
  liveLeaseCount,
  makeWorld,
} from '../helpers/safety-fixtures.js';
import {
  releaseLeaseByToken,
  renewLease,
  requestAdmission,
} from '../../src/services/safety/admission.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('T009 concurrency budget', () => {
  it('two concurrent admissions for the last concurrency slot: exactly one GRANTED, one refused', async () => {
    const world = await makeWorld('race1@example.com', { concurrencyBudget: 1 });
    const results = await Promise.all([
      requestAdmission(testDb, admissionRequest(world)),
      requestAdmission(testDb, admissionRequest(world)),
    ]);
    const granted = results.filter((r) => r.outcome === 'GRANTED');
    const refused = results.filter((r) => r.outcome === 'REFUSED');
    expect(granted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ reason: 'BUDGET_EXHAUSTED_CONCURRENCY' });
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(1);
    expect(await liveLeaseCount(world.grantId)).toBe(1);
  });

  it('never over-subscribes under heavy contention (25 callers, 5 slots)', async () => {
    const world = await makeWorld('race-many@example.com', { concurrencyBudget: 5 });
    const results = await Promise.all(
      Array.from({ length: 25 }, () => requestAdmission(testDb, admissionRequest(world))),
    );
    expect(results.filter((r) => r.outcome === 'GRANTED')).toHaveLength(5);
    expect(
      results.filter((r) => r.outcome === 'REFUSED' && r.reason === 'INTERNAL_ERROR'),
    ).toHaveLength(0);
    expect(await liveLeaseCount(world.grantId)).toBe(5);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(5);
  });
});

describe('T010 request budget', () => {
  it('two concurrent admissions for the last request unit: exactly one success', async () => {
    const world = await makeWorld('race2@example.com', { requestBudget: 1 });
    const results = await Promise.all([
      requestAdmission(
        testDb,
        admissionRequest(world, { consumes: { request: true, concurrency: false } }),
      ),
      requestAdmission(
        testDb,
        admissionRequest(world, { consumes: { request: true, concurrency: false } }),
      ),
    ]);
    expect(results.filter((r) => r.outcome === 'GRANTED')).toHaveLength(1);
    expect(results.find((r) => r.outcome === 'REFUSED')).toMatchObject({
      reason: 'BUDGET_EXHAUSTED_REQUEST',
    });
    expect((await counterOf(world.grantId))?.consumedRequests).toBe(1);
    expect(await testDb.budgetConsumption.count()).toBe(1);
  });

  it('a refused admission consumes nothing', async () => {
    const world = await makeWorld('refused-free@example.com', { requestBudget: 1 });
    await requestAdmission(
      testDb,
      admissionRequest(world, { consumes: { request: true, concurrency: false } }),
    );
    const refused = await requestAdmission(
      testDb,
      admissionRequest(world, { consumes: { request: true, concurrency: true } }),
    );
    expect(refused).toMatchObject({ outcome: 'REFUSED', reason: 'BUDGET_EXHAUSTED_REQUEST' });
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(0);
    expect(await testDb.admissionLease.count()).toBe(0);
  });
});

describe('T014a lease fencing', () => {
  it('a reclaimed lease cannot be renewed by its original holder token', async () => {
    const world = await makeWorld('fence@example.com', { concurrencyBudget: 2 });
    const granted = await requestAdmission(testDb, admissionRequest(world));
    if (
      granted.outcome !== 'GRANTED' ||
      granted.leaseId === undefined ||
      granted.holderToken === undefined
    ) {
      throw new Error('expected a lease');
    }
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE id = ${granted.leaseId}`;
    const sweep = await testDb.$queryRaw<
      Array<{ r: { reclaimed: number } }>
    >`SELECT public.f07_reclaim_expired_leases(100) AS r`;
    expect(sweep[0]?.r.reclaimed).toBe(1);

    const renewed = await renewLease(testDb, {
      leaseId: granted.leaseId,
      holderToken: granted.holderToken,
    });
    expect(renewed.status).toBe('FENCED');
    const row = await testDb.admissionLease.findUniqueOrThrow({ where: { id: granted.leaseId } });
    expect(row.reclaimedAt).not.toBeNull();
    expect(row.expiresAt.getTime()).toBeLessThan(Date.now());
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(0);
  });

  it('a stale token cannot renew or release a live lease held by another acquisition', async () => {
    const world = await makeWorld('fence2@example.com');
    const a = await requestAdmission(testDb, admissionRequest(world));
    if (a.outcome !== 'GRANTED' || a.leaseId === undefined) throw new Error('lease');
    expect((await renewLease(testDb, { leaseId: a.leaseId, holderToken: 'forged' })).status).toBe(
      'FENCED',
    );
    expect(
      await releaseLeaseByToken(testDb, { leaseId: a.leaseId, holderToken: 'forged' }),
    ).toEqual({ released: false });
    expect(await liveLeaseCount(world.grantId)).toBe(1);
  });

  it('an expired, not-yet-reclaimed lease cannot be revived by a late heartbeat', async () => {
    const world = await makeWorld('late@example.com');
    const a = await requestAdmission(testDb, admissionRequest(world));
    if (a.outcome !== 'GRANTED' || a.leaseId === undefined || a.holderToken === undefined)
      throw new Error('lease');
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE id = ${a.leaseId}`;
    const r = await renewLease(testDb, { leaseId: a.leaseId, holderToken: a.holderToken });
    expect(r.status).toBe('FENCED');
  });
});
