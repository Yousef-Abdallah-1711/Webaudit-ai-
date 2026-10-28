/**
 * SPEC 008 US2 + DEC-048/049/050/063 — kill-switch lifecycle, authority,
 * reconciler, lease reclaim and the lock-order races. Real PostgreSQL, real
 * concurrent connections.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  admissionRequest,
  auditTypes,
  counterOf,
  liveLeaseCount,
  makeUser,
  makeWorld,
} from '../helpers/safety-fixtures.js';
import {
  releaseLeaseByToken,
  releaseLeasesByExecution,
  renewLease,
  requestAdmission,
} from '../../src/services/safety/admission.js';
import {
  acknowledgeStop,
  acknowledgeStopByAuthority,
  markEscalated,
  recordStopped,
  triggerStop,
} from '../../src/services/safety/kill-switch.js';
import { SafetyForbiddenError } from '../../src/services/safety/db.js';
import { reclaimExpiredLeases, reconcileStrandedStops } from '../../src/services/safety/sweeps.js';

beforeEach(resetDb);
afterAll(closeDb);

async function stopRow(scope: string, scopeId: string) {
  return testDb.killSwitchState.findFirst({ where: { scope: scope as never, scopeId } });
}

async function lease(
  world: Awaited<ReturnType<typeof makeWorld>>,
  executionId: string,
  key = executionId,
) {
  const r = await requestAdmission(
    testDb,
    admissionRequest(world, { executionId, idempotencyKey: key }),
  );
  if (r.outcome !== 'GRANTED' || r.leaseId === undefined || r.holderToken === undefined) {
    throw new Error(`expected a lease: ${JSON.stringify(r)}`);
  }
  return { leaseId: r.leaseId, holderToken: r.holderToken };
}

describe('T018 triggerStop idempotency', () => {
  it('two (and many concurrent) triggers for one scope key produce one row and one STOP_REQUESTED event', async () => {
    const world = await makeWorld('ks-idem@example.com');
    const input = {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    } as const;
    const results = await Promise.all(Array.from({ length: 6 }, () => triggerStop(testDb, input)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await testDb.killSwitchState.count()).toBe(1);
    expect(await auditTypes({ eventType: 'STOP_REQUESTED' })).toHaveLength(1);
  });

  it('a trigger against an already-STOPPED key starts a new incident', async () => {
    const world = await makeWorld('ks-again@example.com');
    const input = {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    } as const;
    await triggerStop(testDb, input);
    await acknowledgeStop(testDb, { executionId: 'x', scope: 'GRANT', scopeId: world.grantId });
    expect(
      (await recordStopped(testDb, { executionId: 'x', scope: 'GRANT', scopeId: world.grantId }))
        .changed,
    ).toBe(true);
    const again = await triggerStop(testDb, input);
    expect(again).toMatchObject({ created: true, state: 'REQUESTED' });
    expect((await stopRow('GRANT', world.grantId))?.stoppedAt).toBeNull();
  });
});

describe('T019 authority', () => {
  it('an operator may stop any scope; an ordinary user may not stop TARGET/TENANT/PLATFORM', async () => {
    const world = await makeWorld('ks-auth@example.com');
    const operator = await makeUser('op@example.com', { operator: true });
    for (const [scope, scopeId] of [
      ['TARGET', world.targetId],
      ['TENANT', world.userId],
      ['PLATFORM', 'platform'],
      ['GRANT', world.grantId],
    ] as const) {
      const r = await triggerStop(testDb, {
        scope,
        scopeId,
        triggeredBy: operator,
        reason: 'OPERATOR_EMERGENCY_STOP',
      });
      expect(r.created).toBe(true);
    }
    for (const [scope, scopeId] of [
      ['TARGET', world.targetId],
      ['TENANT', world.userId],
      ['PLATFORM', 'platform'],
    ] as const) {
      await expect(
        triggerStop(testDb, {
          scope,
          scopeId,
          triggeredBy: world.userId,
          reason: 'USER_CANCELLATION',
        }),
      ).rejects.toBeInstanceOf(SafetyForbiddenError);
    }
  });

  it("a user can cancel their own execution but not another tenant's, and the refusals are indistinguishable", async () => {
    const mine = await makeWorld('ks-mine@example.com');
    const theirs = await makeWorld('ks-theirs@example.com');
    await lease(mine, 'exec-mine');
    await lease(theirs, 'exec-theirs');
    const ok = await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'exec-mine',
      triggeredBy: mine.userId,
      reason: 'USER_CANCELLATION',
    });
    expect(ok.created).toBe(true);
    const foreign = await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'exec-theirs',
      triggeredBy: mine.userId,
      reason: 'USER_CANCELLATION',
    }).catch((e: unknown) => e);
    const missing = await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'nope',
      triggeredBy: mine.userId,
      reason: 'USER_CANCELLATION',
    }).catch((e: unknown) => e);
    expect(foreign).toBeInstanceOf(SafetyForbiddenError);
    expect(missing).toBeInstanceOf(SafetyForbiddenError);
    expect((foreign as Error).message).toBe((missing as Error).message);
    expect(await stopRow('EXECUTION', 'exec-theirs')).toBeNull();
  });

  it('SYSTEM may only stop GRANT/EXECUTION with a system reason, and a claimed operator flag is ignored', async () => {
    const world = await makeWorld('ks-sys@example.com');
    await expect(
      triggerStop(testDb, {
        scope: 'TENANT',
        scopeId: world.userId,
        triggeredBy: 'SYSTEM',
        reason: 'SYSTEM_SAFETY_POLICY',
      }),
    ).rejects.toBeInstanceOf(SafetyForbiddenError);
    await expect(
      triggerStop(testDb, {
        scope: 'GRANT',
        scopeId: world.grantId,
        triggeredBy: 'SYSTEM',
        reason: 'OPERATOR_EMERGENCY_STOP',
      }),
    ).rejects.toBeInstanceOf(SafetyForbiddenError);
    await expect(
      triggerStop(testDb, {
        scope: 'GRANT',
        scopeId: world.grantId,
        triggeredBy: world.userId,
        reason: 'AUTHORIZATION_REVOKED',
      }),
    ).rejects.toBeInstanceOf(SafetyForbiddenError);
    await expect(
      triggerStop(testDb, {
        scope: 'PLATFORM',
        scopeId: 'not-platform',
        triggeredBy: 'SYSTEM',
        reason: 'SYSTEM_SAFETY_POLICY',
      }),
    ).rejects.toThrow();
    expect(await testDb.killSwitchState.count()).toBe(0);
  });

  it('an operator TARGET stop is observed by every execution under that target', async () => {
    const world = await makeWorld('ks-target@example.com', { concurrencyBudget: 3 });
    const operator = await makeUser('op2@example.com', { operator: true });
    const a = await lease(world, 'exec-a');
    await triggerStop(testDb, {
      scope: 'TARGET',
      scopeId: world.targetId,
      triggeredBy: operator,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect((await renewLease(testDb, a)).status).toBe('STOP_PENDING');
    const b = await requestAdmission(testDb, admissionRequest(world, { executionId: 'exec-b' }));
    expect(b).toMatchObject({ outcome: 'REFUSED', reason: 'KILL_SWITCH_PENDING', scope: 'TARGET' });
  });
});

describe('FR-015 no resurrection / FR-016 reclassification', () => {
  it('a STOPPED execution is refused on every redelivery before admission logic runs', async () => {
    const world = await makeWorld('ks-resurrect@example.com');
    const l = await lease(world, 'exec-r', 'k-r');
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'exec-r',
      triggeredBy: world.userId,
      reason: 'USER_CANCELLATION',
    });
    await acknowledgeStop(testDb, { executionId: 'exec-r', scope: 'EXECUTION', scopeId: 'exec-r' });
    await releaseLeaseByToken(testDb, l);
    expect(
      (
        await recordStopped(testDb, {
          executionId: 'exec-r',
          scope: 'EXECUTION',
          scopeId: 'exec-r',
        })
      ).changed,
    ).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      const again = await requestAdmission(
        testDb,
        admissionRequest(world, {
          executionId: 'exec-r',
          idempotencyKey: `redeliver-${String(i)}`,
        }),
      );
      expect(again).toMatchObject({
        outcome: 'REFUSED',
        reason: 'KILL_SWITCH_PENDING',
        scope: 'EXECUTION',
      });
    }
    const replay = await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'exec-r', idempotencyKey: 'k-r' }),
    );
    expect(replay).toMatchObject({ outcome: 'REFUSED', reason: 'KILL_SWITCH_PENDING' });
  });

  it('reclassifying staging -> production stops a grant that forbids it; reclassifying back does not cancel the stop', async () => {
    const { classifyEnvironment } =
      await import('../../src/services/authorization/classify-environment.js');
    const world = await makeWorld('ks-env@example.com');
    const l = await lease(world, 'exec-env');
    await classifyEnvironment(testDb, {
      targetId: world.targetId,
      actingUserId: world.userId,
      classification: 'PRODUCTION',
    });
    expect(await stopRow('GRANT', world.grantId)).toMatchObject({
      state: 'REQUESTED',
      reason: 'ENVIRONMENT_RECLASSIFIED',
      triggeredBy: 'SYSTEM',
    });
    expect((await renewLease(testDb, l)).status).toBe('STOP_PENDING');
    await classifyEnvironment(testDb, {
      targetId: world.targetId,
      actingUserId: world.userId,
      classification: 'STAGING',
    });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
  });

  it('revoking a grant stops it in the same transaction', async () => {
    const { revokeAuthorization } = await import('../../src/services/authorization/revoke.js');
    const world = await makeWorld('ks-revoke@example.com');
    const l = await lease(world, 'exec-rev');
    await revokeAuthorization(testDb, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    expect(await stopRow('GRANT', world.grantId)).toMatchObject({
      state: 'REQUESTED',
      reason: 'AUTHORIZATION_REVOKED',
    });
    expect((await renewLease(testDb, l)).status).toBe('STOP_PENDING');
    // idempotent: revoking again changes nothing
    await revokeAuthorization(testDb, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    expect(await auditTypes({ eventType: 'STOP_REQUESTED' })).toHaveLength(1);
  });
});

describe('DEC-049 STOPPED is never premature', () => {
  it('cannot skip ACKNOWLEDGED and cannot be recorded while a live lease remains', async () => {
    const world = await makeWorld('ks-premature@example.com');
    const l = await lease(world, 'exec-p');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    const input = { executionId: 'exec-p', scope: 'GRANT', scopeId: world.grantId } as const;
    expect(await recordStopped(testDb, input)).toMatchObject({
      changed: false,
      reason: 'NOT_ACKNOWLEDGED',
    });
    await acknowledgeStop(testDb, input);
    expect(await recordStopped(testDb, input)).toMatchObject({
      changed: false,
      reason: 'LIVE_LEASE',
    });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('ACKNOWLEDGED');
    await releaseLeaseByToken(testDb, l);
    expect((await recordStopped(testDb, input)).changed).toBe(true);
    expect(await recordStopped(testDb, input)).toMatchObject({ changed: false, state: 'STOPPED' });
    expect(await auditTypes({ eventType: 'STOPPED' })).toHaveLength(1);
  });

  it('escalation is recorded once, distinct from the stop request', async () => {
    const world = await makeWorld('ks-esc@example.com');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    const input = { executionId: 'e', scope: 'GRANT', scopeId: world.grantId } as const;
    expect(await markEscalated(testDb, input)).toBe(true);
    expect(await markEscalated(testDb, input)).toBe(false);
    expect((await stopRow('GRANT', world.grantId))?.escalatedAt).not.toBeNull();
    expect(await auditTypes({ eventType: 'ESCALATED' })).toHaveLength(1);
  });
});

describe('DEC-048 reconciler', () => {
  it('advances a stranded stop with no live lease: ACK on one pass, STOPPED on the next, never both', async () => {
    const world = await makeWorld('rec1@example.com');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    const first = await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    expect(first).toMatchObject({ acknowledged: 1, stopped: 0 });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('ACKNOWLEDGED');
    const second = await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    expect(second).toMatchObject({ acknowledged: 0, stopped: 1 });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('STOPPED');
    expect(await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 })).toMatchObject({
      acknowledged: 0,
      stopped: 0,
    });
    expect(await auditTypes({ eventType: 'STOP_ACKNOWLEDGED' })).toHaveLength(1);
    expect(await auditTypes({ eventType: 'STOPPED' })).toHaveLength(1);
  });

  it('respects the acknowledgement grace window', async () => {
    const world = await makeWorld('rec-grace@example.com');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    expect(await reconcileStrandedStops(testDb, { ackGraceSeconds: 600 })).toMatchObject({
      acknowledged: 0,
    });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
  });

  it('never advances while a live in-scope lease remains, at any scope', async () => {
    const world = await makeWorld('rec-live@example.com');
    const operator = await makeUser('op-rec@example.com', { operator: true });
    await lease(world, 'exec-live');
    for (const [scope, scopeId] of [
      ['EXECUTION', 'exec-live'],
      ['GRANT', world.grantId],
      ['TARGET', world.targetId],
      ['TENANT', world.userId],
      ['PLATFORM', 'platform'],
    ] as const) {
      await triggerStop(testDb, {
        scope,
        scopeId,
        triggeredBy: operator,
        reason: 'OPERATOR_EMERGENCY_STOP',
      });
    }
    for (let i = 0; i < 3; i += 1) await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    const states = await testDb.killSwitchState.findMany({ select: { state: true } });
    expect(states).toHaveLength(5);
    expect(states.every((s) => s.state === 'REQUESTED')).toBe(true);
  });

  it("a stop at an unrelated scope is not blocked by another tenant's live lease", async () => {
    const a = await makeWorld('rec-a@example.com');
    const b = await makeWorld('rec-b@example.com');
    await lease(b, 'exec-b-live');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: a.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    expect((await stopRow('GRANT', a.grantId))?.state).toBe('STOPPED');
  });

  it("finalizer acknowledgement by authority moves only the unit's own row, once", async () => {
    const world = await makeWorld('rec-final@example.com');
    await lease(world, 'exec-f');
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'exec-f',
      triggeredBy: world.userId,
      reason: 'USER_CANCELLATION',
    });
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    expect(await acknowledgeStopByAuthority(testDb, 'exec-f')).toBe(true);
    expect(await acknowledgeStopByAuthority(testDb, 'exec-f')).toBe(false);
    expect((await stopRow('EXECUTION', 'exec-f'))?.state).toBe('ACKNOWLEDGED');
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
  });

  it('finalization (release + acknowledgement) in one transaction commits or rolls back together', async () => {
    const world = await makeWorld('rec-atomic@example.com');
    await lease(world, 'exec-at');
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'exec-at',
      triggeredBy: world.userId,
      reason: 'USER_CANCELLATION',
    });
    await testDb
      .$transaction(async (tx) => {
        expect(await releaseLeasesByExecution(tx, 'exec-at')).toBe(1);
        await acknowledgeStopByAuthority(tx, 'exec-at');
        throw new Error('finalize crashed before commit');
      })
      .catch(() => undefined);
    expect(await liveLeaseCount(world.grantId)).toBe(1);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(1);
    expect((await stopRow('EXECUTION', 'exec-at'))?.state).toBe('REQUESTED');
    await testDb.$transaction(async (tx) => {
      await releaseLeasesByExecution(tx, 'exec-at');
      await acknowledgeStopByAuthority(tx, 'exec-at');
    });
    expect(await liveLeaseCount(world.grantId)).toBe(0);
    expect((await stopRow('EXECUTION', 'exec-at'))?.state).toBe('ACKNOWLEDGED');
  });

  it('two concurrent reconcilers produce each transition exactly once', async () => {
    const world = await makeWorld('rec-conc@example.com');
    const operator = await makeUser('op-conc@example.com', { operator: true });
    for (let i = 0; i < 6; i += 1) {
      await triggerStop(testDb, {
        scope: 'EXECUTION',
        scopeId: `exec-c${String(i)}`,
        triggeredBy: operator,
        reason: 'OPERATOR_EMERGENCY_STOP',
      });
    }
    void world;
    await Promise.all([
      reconcileStrandedStops(testDb, { ackGraceSeconds: 0 }),
      reconcileStrandedStops(testDb, { ackGraceSeconds: 0 }),
      reconcileStrandedStops(testDb, { ackGraceSeconds: 0 }),
    ]);
    await Promise.all([
      reconcileStrandedStops(testDb, { ackGraceSeconds: 0 }),
      reconcileStrandedStops(testDb, { ackGraceSeconds: 0 }),
    ]);
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    const rows = await testDb.killSwitchState.findMany();
    expect(rows.every((r) => r.state === 'STOPPED')).toBe(true);
    expect(await auditTypes({ eventType: 'STOP_ACKNOWLEDGED' })).toHaveLength(6);
    expect(await auditTypes({ eventType: 'STOPPED' })).toHaveLength(6);
  });
});

describe('DEC-063 lease reclaim', () => {
  it('reclaims only expired leases, never a live one, and corrects the counter', async () => {
    const world = await makeWorld('rc1@example.com', { concurrencyBudget: 4 });
    const dead = await lease(world, 'exec-dead');
    await lease(world, 'exec-alive');
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '5 seconds' WHERE id = ${dead.leaseId}`;
    const r = await reclaimExpiredLeases(testDb);
    expect(r.reclaimed).toBe(1);
    expect(await liveLeaseCount(world.grantId)).toBe(1);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(1);
    expect(await reclaimExpiredLeases(testDb)).toMatchObject({ reclaimed: 0 });
    expect(await auditTypes({ eventType: 'BUDGET_RELEASED' })).toHaveLength(1);
  });

  it('a released lease is never reclaimed (no double release)', async () => {
    const world = await makeWorld('rc2@example.com');
    const l = await lease(world, 'exec-rel');
    await releaseLeaseByToken(testDb, l);
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '5 seconds'`;
    expect((await reclaimExpiredLeases(testDb)).reclaimed).toBe(0);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(0);
  });

  it('concurrent reclaimers never double-release', async () => {
    const world = await makeWorld('rc3@example.com', { concurrencyBudget: 10 });
    for (let i = 0; i < 8; i += 1) await lease(world, `exec-x${String(i)}`);
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '5 seconds'`;
    const results = await Promise.all(
      Array.from({ length: 4 }, () => reclaimExpiredLeases(testDb)),
    );
    expect(results.reduce((n, r) => n + r.reclaimed, 0)).toBe(8);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(0);
    expect(await testDb.admissionLease.count({ where: { reclaimedAt: { not: null } } })).toBe(8);
  });

  it('corrects counter drift left by a crash', async () => {
    const world = await makeWorld('rc4@example.com');
    await lease(world, 'exec-drift');
    await testDb.$executeRaw`UPDATE "BudgetCounter" SET "activeConcurrency" = 4`;
    const r = await reclaimExpiredLeases(testDb);
    expect(r.driftCorrected).toBe(1);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(1);
  });

  it('a reclaimed slot is immediately admissible again', async () => {
    const world = await makeWorld('rc5@example.com', { concurrencyBudget: 1 });
    const dead = await lease(world, 'exec-d1');
    expect(await requestAdmission(testDb, admissionRequest(world))).toMatchObject({
      reason: 'BUDGET_EXHAUSTED_CONCURRENCY',
    });
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE id = ${dead.leaseId}`;
    await reclaimExpiredLeases(testDb);
    expect((await requestAdmission(testDb, admissionRequest(world))).outcome).toBe('GRANTED');
  });
});

describe('DEC-050 lock order: stop vs admission', () => {
  it('an admission that waits behind an uncommitted stop is refused once the stop commits', async () => {
    const world = await makeWorld('lo1@example.com');
    let commit: () => void = () => undefined;
    const gate = new Promise<void>((r) => (commit = r));
    const stopping = testDb.$transaction(
      async (tx) => {
        await triggerStop(tx, {
          scope: 'GRANT',
          scopeId: world.grantId,
          triggeredBy: 'SYSTEM',
          reason: 'SYSTEM_SAFETY_POLICY',
        });
        await gate;
      },
      { timeout: 30_000 },
    );
    await new Promise((r) => setTimeout(r, 400));
    const admitting = requestAdmission(testDb, admissionRequest(world));
    await new Promise((r) => setTimeout(r, 400));
    commit();
    await stopping;
    expect(await admitting).toMatchObject({
      outcome: 'REFUSED',
      reason: 'KILL_SWITCH_PENDING',
      scope: 'GRANT',
    });
    expect(await testDb.admissionLease.count()).toBe(0);
  }, 30_000);

  it('a stop that waits behind an uncommitted admission lands after it; the lease is then subject to the stop', async () => {
    const world = await makeWorld('lo2@example.com');
    let commit: () => void = () => undefined;
    const gate = new Promise<void>((r) => (commit = r));
    let leaseInfo: { leaseId: string; holderToken: string } | undefined;
    const admitting = testDb.$transaction(
      async (tx) => {
        const r = await requestAdmission(tx, admissionRequest(world));
        if (r.outcome === 'GRANTED' && r.leaseId && r.holderToken)
          leaseInfo = { leaseId: r.leaseId, holderToken: r.holderToken };
        await gate;
      },
      { timeout: 30_000 },
    );
    await new Promise((r) => setTimeout(r, 400));
    const stopping = triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await new Promise((r) => setTimeout(r, 400));
    commit();
    await Promise.all([admitting, stopping]);
    if (leaseInfo === undefined) throw new Error('lease');
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
    expect((await renewLease(testDb, leaseInfo)).status).toBe('STOP_PENDING');
    // the reconciler must not stop it while the lease is live
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
  }, 30_000);

  it('mixed concurrent admit/release/renew/stop/reclaim/reconcile never deadlocks, errors or over-subscribes', async () => {
    const worlds = await Promise.all([
      makeWorld('mx1@example.com', { concurrencyBudget: 3 }),
      makeWorld('mx2@example.com', { concurrencyBudget: 3 }),
    ]);
    const failures: unknown[] = [];
    const track = <T>(p: Promise<T>): Promise<T | undefined> =>
      p.catch((e: unknown) => {
        failures.push(e);
        return undefined;
      });
    const ops: Array<Promise<unknown>> = [];
    for (let round = 0; round < 6; round += 1) {
      for (const [i, w] of worlds.entries()) {
        const exec = `mx-${String(i)}-${String(round)}`;
        ops.push(
          track(
            (async () => {
              const r = await requestAdmission(
                testDb,
                admissionRequest(w, { executionId: exec, idempotencyKey: exec }),
              );
              if (r.outcome === 'GRANTED' && r.leaseId && r.holderToken) {
                await renewLease(testDb, { leaseId: r.leaseId, holderToken: r.holderToken });
                if (round % 2 === 0)
                  await releaseLeaseByToken(testDb, {
                    leaseId: r.leaseId,
                    holderToken: r.holderToken,
                  });
              }
            })(),
          ),
          track(releaseLeasesByExecution(testDb, exec)),
          track(reclaimExpiredLeases(testDb)),
          track(reconcileStrandedStops(testDb, { ackGraceSeconds: 0 })),
        );
        if (round === 3)
          ops.push(
            track(
              triggerStop(testDb, {
                scope: 'GRANT',
                scopeId: w.grantId,
                triggeredBy: 'SYSTEM',
                reason: 'SYSTEM_SAFETY_POLICY',
              }),
            ),
          );
      }
    }
    await Promise.all(ops);
    expect(failures).toEqual([]);
    for (const w of worlds) {
      const live = await liveLeaseCount(w.grantId);
      expect(live).toBeLessThanOrEqual(3);
      await reclaimExpiredLeases(testDb);
      expect((await counterOf(w.grantId))?.activeConcurrency).toBe(await liveLeaseCount(w.grantId));
    }
  }, 60_000);
});

describe('structural invariants enforced by the database itself', () => {
  it('the kill-switch edges in the database match the TypeScript table (plus the new-incident reset)', async () => {
    const { STOP_LIFECYCLE_STATES, isAllowedStopTransition } =
      await import('../../src/services/safety/stop-lifecycle.js');
    const world = await makeWorld('parity@example.com');
    for (const from of STOP_LIFECYCLE_STATES) {
      for (const to of STOP_LIFECYCLE_STATES) {
        await testDb.$executeRawUnsafe(`DELETE FROM "KillSwitchState"`);
        await testDb.$executeRawUnsafe(
          `INSERT INTO "KillSwitchState" (id,scope,"scopeId",state,"triggeredBy",reason) VALUES ('p1','GRANT','${world.grantId}','${from}','SYSTEM','SYSTEM_SAFETY_POLICY')`,
        );
        const outcome = await testDb
          .$executeRawUnsafe(`UPDATE "KillSwitchState" SET state = '${to}' WHERE id = 'p1'`)
          .then(
            () => 'allowed',
            () => 'refused',
          );
        const expected =
          from === to ||
          isAllowedStopTransition(from, to) ||
          (from === 'STOPPED' && to === 'REQUESTED')
            ? 'allowed'
            : 'refused';
        expect(outcome, `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it('REQUESTED cannot be forced to STOPPED even by a direct superuser write', async () => {
    const world = await makeWorld('force@example.com');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await expect(
      testDb.$executeRawUnsafe(
        `UPDATE "KillSwitchState" SET state = 'STOPPED' WHERE "scopeId" = '${world.grantId}'`,
      ),
    ).rejects.toThrow();
    expect((await stopRow('GRANT', world.grantId))?.state).toBe('REQUESTED');
  });

  it('execution audit events are append-only: a direct update is refused', async () => {
    const world = await makeWorld('immut@example.com');
    await requestAdmission(testDb, admissionRequest(world));
    await expect(
      testDb.$executeRawUnsafe(`UPDATE "ExecutionAuditEvent" SET outcome = 'forged'`),
    ).rejects.toThrow();
    expect(await testDb.executionAuditEvent.count({ where: { outcome: 'forged' } })).toBe(0);
  });

  it('counter and kill-switch CHECK constraints reject impossible values', async () => {
    const world = await makeWorld('check@example.com');
    await requestAdmission(testDb, admissionRequest(world));
    await expect(
      testDb.$executeRawUnsafe(`UPDATE "BudgetCounter" SET "activeConcurrency" = -1`),
    ).rejects.toThrow();
    await expect(
      testDb.$executeRawUnsafe(
        `INSERT INTO "KillSwitchState" (id,scope,"scopeId",state,"triggeredBy",reason) VALUES ('x','PLATFORM','not-platform','REQUESTED','SYSTEM','SYSTEM_SAFETY_POLICY')`,
      ),
    ).rejects.toThrow();
  });
});

describe('cross-tenant identifier abuse (caller-supplied scan and execution ids)', () => {
  const newScan = (userId: string, targetId: string) =>
    testDb.scan.create({
      data: {
        userId,
        targetId,
        requestedModules: ['PERFORMANCE'],
        capabilitySnapshot: {},
        quotedCredits: 0,
      },
    });

  it("a lease cannot be tagged with another tenant's scan; the owner's own scan is accepted", async () => {
    const a = await makeWorld('xt-a@example.com');
    const b = await makeWorld('xt-b@example.com');
    const bScan = await newScan(b.userId, b.targetId);
    const aScan = await newScan(a.userId, a.targetId);
    const foreign = await requestAdmission(testDb, admissionRequest(a, { scanId: bScan.id }));
    expect(foreign).toMatchObject({ outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' });
    expect(await testDb.admissionLease.count()).toBe(0);
    const own = await requestAdmission(testDb, admissionRequest(a, { scanId: aScan.id }));
    expect(own.outcome).toBe('GRANTED');
    // and B's scan-scope stop is therefore never blocked by A's lease
    await triggerStop(testDb, {
      scope: 'SCAN',
      scopeId: bScan.id,
      triggeredBy: b.userId,
      reason: 'USER_CANCELLATION',
    });
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    await reconcileStrandedStops(testDb, { ackGraceSeconds: 0 });
    expect((await stopRow('SCAN', bScan.id))?.state).toBe('STOPPED');
  });

  it("an execution id already used by another tenant is refused, so one tenant cannot be stopped through another's id", async () => {
    const a = await makeWorld('xt-ea@example.com');
    const b = await makeWorld('xt-eb@example.com');
    await lease(b, 'shared-exec-id');
    const clash = await requestAdmission(
      testDb,
      admissionRequest(a, { executionId: 'shared-exec-id' }),
    );
    expect(clash).toMatchObject({ outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' });
    // even if a foreign lease somehow existed, a user stop would not reach across tenants
    await testDb.$executeRaw`INSERT INTO "AdmissionLease" (id,"targetAuthorizationId","userId","executionId","idempotencyKey","holderToken","expiresAt") VALUES ('forced-a',${a.grantId},${a.userId},'shared-exec-id','forced','tok', now() + interval '30 seconds')`;
    await expect(
      triggerStop(testDb, {
        scope: 'EXECUTION',
        scopeId: 'shared-exec-id',
        triggeredBy: a.userId,
        reason: 'USER_CANCELLATION',
      }),
    ).rejects.toBeInstanceOf(SafetyForbiddenError);
    expect(await stopRow('EXECUTION', 'shared-exec-id')).toBeNull();
  });
});
