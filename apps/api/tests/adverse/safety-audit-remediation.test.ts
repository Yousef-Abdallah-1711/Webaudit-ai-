/**
 * SPEC 008 independent final audit — regression tests for the defects the
 * requirement-by-requirement delta review found in the first implementation:
 *
 *  D-A  FR-016a  a lease renewal must not outlive its grant
 *  D-B  FR-021   uncertainty is STATE_UNCERTAIN, never "no stop pending"
 *  D-C  FR-015   one live lease per execution unit
 *  D-D  FR-016   an environment refusal at a checkpoint is a persisted stop
 *  D-E  FR-020   audit rows carry scope, environment and execution class
 *  D-F  FR-023   previously unaudited refusals now write an event
 *  D-G  FR-024   execution audit follows plan retention
 *
 * Real PostgreSQL throughout; failures are injected at the client boundary.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import {
  WEB_DESTINATION,
  admissionRequest,
  auditTypes,
  makeWorld,
} from '../helpers/safety-fixtures.js';
import {
  purgeExpiredExecutionAudit,
  releaseLeaseByToken,
  renewLease,
  requestAdmission,
  safetyCheckpoint,
  type CheckpointRequest,
} from '../../src/services/safety/index.js';
import { reclaimExpiredLeases } from '../../src/services/safety/sweeps.js';

beforeEach(resetDb);
afterAll(closeDb);

type World = Awaited<ReturnType<typeof makeWorld>>;

async function lease(world: World, executionId: string, key = executionId) {
  const r = await requestAdmission(
    testDb,
    admissionRequest(world, { executionId, idempotencyKey: key }),
  );
  if (r.outcome !== 'GRANTED' || !r.leaseId || !r.holderToken) throw new Error(JSON.stringify(r));
  return { grantId: r.grantId, leaseId: r.leaseId, holderToken: r.holderToken };
}

function checkpointFor(
  world: World,
  executionId: string,
  held: Awaited<ReturnType<typeof lease>>,
): CheckpointRequest {
  return {
    executionId,
    targetId: world.targetId,
    executionClass: 'BROWSER',
    destination: WEB_DESTINATION,
    idempotencyKey: executionId,
    consumes: { request: false, concurrency: true },
    abortController: new AbortController(),
    lease: held,
  };
}

describe('D-A FR-016a: a lease cannot outlive its grant', () => {
  it('renewal is refused once the grant has expired (database clock), and the checkpoint stops', async () => {
    const world = await makeWorld('da1@example.com');
    const held = await lease(world, 'da-exec');
    expect((await renewLease(testDb, held)).status).toBe('RENEWED');
    await testDb.$executeRaw`UPDATE "TargetAuthorization" SET "expiresAt" = now() - interval '1 second' WHERE id = ${world.grantId}`;
    expect(await renewLease(testDb, held)).toEqual({ status: 'GRANT_INVALID', reason: 'EXPIRED' });
    const request = checkpointFor(world, 'da-exec', held);
    const result = await safetyCheckpoint(testDb, request);
    expect(result).toMatchObject({ outcome: 'STOP', reason: 'EXPIRED' });
    expect(request.abortController.signal.aborted).toBe(true);
  });

  it('renewal is refused for a revoked grant even if no stop row exists (defence in depth)', async () => {
    const world = await makeWorld('da2@example.com');
    const held = await lease(world, 'da-exec2');
    await testDb.$executeRaw`UPDATE "TargetAuthorization" SET "revokedAt" = now() WHERE id = ${world.grantId}`;
    expect(await renewLease(testDb, held)).toEqual({ status: 'GRANT_INVALID', reason: 'REVOKED' });
  });

  it('a lease is never extended past a grant that is about to expire', async () => {
    const world = await makeWorld('da3@example.com');
    const held = await lease(world, 'da-exec3');
    await testDb.$executeRaw`UPDATE "TargetAuthorization" SET "expiresAt" = now() + interval '2 seconds' WHERE id = ${world.grantId}`;
    expect((await renewLease(testDb, held)).status).toBe('RENEWED');
    await new Promise((r) => setTimeout(r, 2300));
    expect((await renewLease(testDb, held)).status).toBe('GRANT_INVALID');
  });
});

describe('D-B FR-021: uncertainty is its own stop reason', () => {
  type RawFn = (
    query: { sql?: string; strings?: readonly string[] },
    ...rest: unknown[]
  ) => unknown;
  /** Fails any raw query matching `match`, including those issued inside `$transaction` callbacks. */
  const failing = <T extends object>(target: T, match: RegExp): T => {
    const wrap = (client: object): object =>
      new Proxy(client, {
        get(t, prop, receiver) {
          if (prop === '$queryRaw') {
            return (query: { sql?: string; strings?: readonly string[] }, ...rest: unknown[]) => {
              const text = String(query?.sql ?? query?.strings?.join('') ?? '');
              if (match.test(text)) return Promise.reject(new Error('database unreachable'));
              return (t as unknown as { $queryRaw: RawFn }).$queryRaw(query, ...rest);
            };
          }
          if (prop === '$transaction') {
            return (fn: (tx: object) => unknown, ...rest: unknown[]) =>
              (t as unknown as { $transaction: (...a: unknown[]) => unknown }).$transaction(
                (tx: object) => fn(wrap(tx)),
                ...rest,
              );
          }
          return Reflect.get(t, prop, receiver) as unknown;
        },
      });
    return wrap(target) as T;
  };

  it('a failed lease renewal read aborts with STATE_UNCERTAIN, distinguishable from KILL_SWITCH_PENDING', async () => {
    const world = await makeWorld('db1@example.com');
    const held = await lease(world, 'db-exec');
    const request = checkpointFor(world, 'db-exec', held);
    const result = await safetyCheckpoint(failing(testDb, /f07_renew_lease/), request);
    expect(result).toEqual({ outcome: 'STOP', reason: 'STATE_UNCERTAIN' });
    expect(request.abortController.signal.aborted).toBe(true);
  });

  it('an authorization re-check that throws is STATE_UNCERTAIN, never PROCEED', async () => {
    const world = await makeWorld('db2@example.com');
    const held = await lease(world, 'db-exec2');
    const request = checkpointFor(world, 'db-exec2', held);
    const broken = new Proxy(testDb, {
      get(t, prop, receiver) {
        if (prop === 'targetAuthorization') {
          return { findMany: () => Promise.reject(new Error('read failed')) };
        }
        return Reflect.get(t, prop, receiver) as unknown;
      },
    });
    const result = await safetyCheckpoint(broken as typeof testDb, request);
    expect(result).toEqual({ outcome: 'STOP', reason: 'STATE_UNCERTAIN' });
    expect(request.abortController.signal.aborted).toBe(true);
  });

  it('an admission internal error is surfaced as STATE_UNCERTAIN by the checkpoint', async () => {
    const world = await makeWorld('db3@example.com');
    const request = {
      ...checkpointFor(world, 'db-exec3', { grantId: '', leaseId: '', holderToken: '' }),
      idempotencyKey: 'k',
    };
    delete request.lease;
    const result = await safetyCheckpoint(failing(testDb, /f07_admit/), request);
    expect(result).toEqual({ outcome: 'STOP', reason: 'STATE_UNCERTAIN' });
    expect(request.abortController.signal.aborted).toBe(true);
  });
});

describe('D-C FR-015: one live lease per execution unit', () => {
  it('a different worker cannot take a live execution id under a new key; the original keeps its lease', async () => {
    const world = await makeWorld('dc1@example.com', { concurrencyBudget: 3 });
    const original = await lease(world, 'unit-1', 'worker-a-key');
    const dup = await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'unit-1', idempotencyKey: 'worker-b-key' }),
    );
    expect(dup).toMatchObject({ outcome: 'REFUSED', reason: 'EXECUTION_ALREADY_LEASED' });
    expect(await testDb.admissionLease.count()).toBe(1);
    expect((await renewLease(testDb, original)).status).toBe('RENEWED');
    expect(await auditTypes({ eventType: 'ADMISSION_REFUSED' })).toHaveLength(1);
  });

  it('a replay with the original key still returns the original lease', async () => {
    const world = await makeWorld('dc2@example.com');
    const original = await lease(world, 'unit-2', 'k-orig');
    const replay = await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'unit-2', idempotencyKey: 'k-orig' }),
    );
    expect(replay).toMatchObject({ outcome: 'GRANTED', leaseId: original.leaseId, replay: true });
  });

  it('after release or reclaim the unit may be re-acquired by a new worker, and the old holder is fenced', async () => {
    const world = await makeWorld('dc3@example.com');
    const a = await lease(world, 'unit-3', 'a');
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE id = ${a.leaseId}`;
    // expired-but-unreclaimed is not live: takeover is allowed without waiting for the sweep
    const b = await lease(world, 'unit-3', 'b');
    expect(b.leaseId).not.toBe(a.leaseId);
    expect((await renewLease(testDb, a)).status).toBe('FENCED');
    await releaseLeaseByToken(testDb, b);
    await reclaimExpiredLeases(testDb);
    expect((await lease(world, 'unit-3', 'c')).leaseId).toBeTruthy();
  });

  it('concurrent acquisitions of one execution id with different keys: exactly one wins', async () => {
    const world = await makeWorld('dc4@example.com', { concurrencyBudget: 10 });
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        requestAdmission(
          testDb,
          admissionRequest(world, { executionId: 'unit-4', idempotencyKey: `race-${String(i)}` }),
        ),
      ),
    );
    expect(results.filter((r) => r.outcome === 'GRANTED')).toHaveLength(1);
    expect(
      results.filter((r) => r.outcome === 'REFUSED' && r.reason === 'EXECUTION_ALREADY_LEASED'),
    ).toHaveLength(7);
    expect(await testDb.admissionLease.count()).toBe(1);
  });

  it('request-only consumption for a leased unit is unaffected', async () => {
    const world = await makeWorld('dc5@example.com');
    await lease(world, 'unit-5');
    const r = await requestAdmission(
      testDb,
      admissionRequest(world, {
        executionId: 'unit-5',
        idempotencyKey: 'step-2',
        consumes: { request: true, concurrency: false },
      }),
    );
    expect(r.outcome).toBe('GRANTED');
  });
});

describe('D-D FR-016: an environment refusal at a checkpoint is a persisted, permanent stop', () => {
  it('reclassification done outside classifyEnvironment still stops the unit; reverting does not resume it', async () => {
    const world = await makeWorld('dd1@example.com');
    const held = await lease(world, 'dd-exec');
    await testDb.$executeRaw`UPDATE "TargetEnvironment" SET classification = 'PRODUCTION' WHERE "targetId" = ${world.targetId}`;
    const first = await safetyCheckpoint(testDb, checkpointFor(world, 'dd-exec', held));
    expect(first).toMatchObject({
      outcome: 'STOP',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
    });
    const row = await testDb.killSwitchState.findFirstOrThrow({
      where: { scope: 'EXECUTION', scopeId: 'dd-exec' },
    });
    expect(row).toMatchObject({
      state: 'REQUESTED',
      reason: 'ENVIRONMENT_RECLASSIFIED',
      triggeredBy: 'SYSTEM',
    });

    await testDb.$executeRaw`UPDATE "TargetEnvironment" SET classification = 'STAGING' WHERE "targetId" = ${world.targetId}`;
    const request = checkpointFor(world, 'dd-exec', held);
    expect(await safetyCheckpoint(testDb, request)).toMatchObject({
      outcome: 'STOP',
      reason: 'KILL_SWITCH_PENDING',
      scope: 'EXECUTION',
    });
    expect(await testDb.killSwitchState.count()).toBe(1);
  });
});

describe('D-E FR-020: audit rows carry scope, environment and execution class', () => {
  it('admission, reservation, consumption, release and reclaim events all carry the context', async () => {
    const world = await makeWorld('de1@example.com', { concurrencyBudget: 2 });
    const grant = await testDb.targetAuthorization.findUniqueOrThrow({
      where: { id: world.grantId },
    });
    const a = await lease(world, 'de-a');
    await lease(world, 'de-b');
    await releaseLeaseByToken(testDb, a);
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE "executionId" = 'de-b'`;
    await reclaimExpiredLeases(testDb);
    const events = await testDb.executionAuditEvent.findMany({
      where: {
        eventType: {
          in: ['ADMISSION_GRANTED', 'BUDGET_RESERVED', 'BUDGET_CONSUMED', 'BUDGET_RELEASED'],
        },
      },
    });
    expect(events.length).toBeGreaterThanOrEqual(8);
    for (const e of events) {
      expect(e.scopeId, `${e.eventType} scopeId`).toBe(grant.scopeId);
      expect(e.environmentAtEvent, `${e.eventType} env`).toBe('STAGING');
      expect(e.executionClass, `${e.eventType} class`).toBe('BROWSER');
      expect(e.targetAuthorizationId).toBe(world.grantId);
    }
    expect(events.some((e) => e.outcome === 'RECLAIMED_EXPIRED')).toBe(true);
  });

  it('a refusal records the class and the environment in effect', async () => {
    const world = await makeWorld('de2@example.com');
    await requestAdmission(
      testDb,
      admissionRequest(world, { destination: { host: 'other.test', path: '/', scheme: 'https' } }),
    );
    const e = await testDb.executionAuditEvent.findFirstOrThrow({
      where: { eventType: 'ADMISSION_REFUSED' },
    });
    expect(e).toMatchObject({
      executionClass: 'BROWSER',
      environmentAtEvent: 'STAGING',
      outcome: 'OUT_OF_SCOPE',
    });
  });
});

describe('D-F FR-023: refusals that were silent are audited', () => {
  it('a grant that does not belong to the target, and a foreign scan, each write ADMISSION_REFUSED', async () => {
    const a = await makeWorld('df-a@example.com');
    const b = await makeWorld('df-b@example.com');
    const wrongGrant = await testDb.$queryRaw<Array<{ r: { reason: string } }>>`
      SELECT public.f07_admit(${a.targetId}, ${b.grantId}, 'df-x', NULL, 'k1', true, true, 'BROWSER') AS r`;
    expect(wrongGrant[0]?.r.reason).toBe('NO_MATCHING_GRANT');
    const scan = await testDb.scan.create({
      data: {
        userId: b.userId,
        targetId: b.targetId,
        requestedModules: ['PERFORMANCE'],
        capabilitySnapshot: {},
        quotedCredits: 0,
      },
    });
    const foreign = await requestAdmission(testDb, admissionRequest(a, { scanId: scan.id }));
    expect(foreign).toMatchObject({ reason: 'NO_MATCHING_GRANT' });
    const events = await testDb.executionAuditEvent.findMany({
      where: { eventType: 'ADMISSION_REFUSED', outcome: 'NO_MATCHING_GRANT' },
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.targetId === a.targetId)).toBe(true);
  });
});

describe('D-G FR-024: execution audit follows plan retention', () => {
  const insertEvent = (
    ids: { grant?: string; target?: string },
    daysOld: number,
    outcome: string,
  ) =>
    testDb.$executeRaw`INSERT INTO "ExecutionAuditEvent" (id,"eventType","actorId","targetId","targetAuthorizationId",outcome,"timestamp")
      VALUES (gen_random_uuid()::text,'ADMISSION_GRANTED','x',${ids.target ?? null},${ids.grant ?? null},${outcome}, now() - (${daysOld} || ' days')::interval)`;

  it("deletes a tenant's events older than that tenant's plan retention and keeps newer ones; other tenants are untouched", async () => {
    const free = await makeWorld('dg-free@example.com'); // free plan: 7 days
    const pro = await makeWorld('dg-pro@example.com');
    await seedPlans();
    await testDb.subscription.create({
      data: {
        userId: pro.userId,
        planId: 'pro', // 365-day retention
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    await insertEvent({ grant: free.grantId, target: free.targetId }, 10, 'free-old');
    await insertEvent({ grant: free.grantId, target: free.targetId }, 3, 'free-new');
    await insertEvent({ grant: pro.grantId, target: pro.targetId }, 10, 'pro-10d');
    const before = await testDb.executionAuditEvent.count();
    const result = await purgeExpiredExecutionAudit(testDb);
    expect(result.owners).toBeGreaterThanOrEqual(2);
    const kept = (await testDb.executionAuditEvent.findMany({ select: { outcome: true } })).map(
      (e) => e.outcome,
    );
    expect(kept).not.toContain('free-old');
    expect(kept).toContain('free-new');
    expect(kept).toContain('pro-10d'); // the Pro plan keeps 365 days; the same age on Free was purged
    expect(await testDb.executionAuditEvent.count()).toBe(before - 1);
  });

  it('unowned events are kept for the longest plan retention and then removed', async () => {
    await insertEvent({}, 100, 'unowned-100d');
    await insertEvent({}, 800, 'unowned-800d');
    const result = await purgeExpiredExecutionAudit(testDb);
    expect(result.unownedPurged).toBe(1);
    const kept = (await testDb.executionAuditEvent.findMany({ select: { outcome: true } })).map(
      (e) => e.outcome,
    );
    expect(kept).toContain('unowned-100d');
    expect(kept).not.toContain('unowned-800d');
  });

  it('is idempotent, refuses a future cutoff, and the audit table stays append-only for UPDATE', async () => {
    const world = await makeWorld('dg-idem@example.com');
    await insertEvent({ grant: world.grantId, target: world.targetId }, 30, 'old');
    const first = await purgeExpiredExecutionAudit(testDb);
    const second = await purgeExpiredExecutionAudit(testDb);
    expect(first.purged).toBe(1);
    expect(second.purged).toBe(0);
    await expect(
      testDb.$queryRaw`SELECT public.f07_purge_execution_audit(${world.userId}, now() + interval '1 day')`,
    ).rejects.toThrow();
    await requestAdmission(testDb, admissionRequest(world));
    await expect(
      testDb.$executeRawUnsafe(`UPDATE "ExecutionAuditEvent" SET outcome = 'forged'`),
    ).rejects.toThrow();
  });
});

describe('D-I FR-001: the environment is re-verified under the locks, not only before them', () => {
  it('f07_admit itself refuses a grant whose environment no longer permits it, even if the caller skipped isAuthorized', async () => {
    const world = await makeWorld('di1@example.com');
    await testDb.$executeRaw`UPDATE "TargetEnvironment" SET classification = 'PRODUCTION' WHERE "targetId" = ${world.targetId}`;
    const rows = await testDb.$queryRaw<Array<{ r: { outcome: string; reason?: string } }>>`
      SELECT public.f07_admit(${world.targetId}, ${world.grantId}, 'di-exec', NULL, 'di-key', true, true, 'BROWSER') AS r`;
    expect(rows[0]?.r).toMatchObject({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
    });
    expect(await testDb.admissionLease.count()).toBe(0);
    expect(await testDb.budgetCounter.count()).toBe(0);
    const e = await testDb.executionAuditEvent.findFirstOrThrow({
      where: { outcome: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED' },
    });
    expect(e).toMatchObject({ eventType: 'ADMISSION_REFUSED', environmentAtEvent: 'PRODUCTION' });
  });

  it('an unclassified target is refused inside f07_admit as well', async () => {
    const world = await makeWorld('di2@example.com');
    await testDb.$executeRaw`DELETE FROM "TargetEnvironment" WHERE "targetId" = ${world.targetId}`;
    const rows = await testDb.$queryRaw<Array<{ r: { outcome: string; reason?: string } }>>`
      SELECT public.f07_admit(${world.targetId}, ${world.grantId}, 'di-exec2', NULL, 'di-key2', true, true, 'BROWSER') AS r`;
    expect(rows[0]?.r).toMatchObject({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
    });
  });
});
