/**
 * SPEC 009 dispatch sequence (U-1b v6 §2) and the host-loop decision (§7), against real PostgreSQL and the real SPEC 008
 * admission / kill switch / lease functions. Only the engine hooks (capacity, proofs, fork) are test doubles.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXEC_QUEUE_NAMES, QUEUE_NAMES, queueNameForUnitClass } from '@webaudit/config';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import { admissionRequest, counterOf, liveLeaseCount } from '../../helpers/safety-fixtures.js';
import {
  addEdge,
  makeRuntimeWorld,
  makeUnit,
  reasonOf,
  setScan,
  statusOf,
  type RuntimeWorld,
} from '../../helpers/runtime-fixtures.js';
import {
  releaseLeasesByExecution,
  renewLease,
  requestAdmission,
  triggerStop,
  type AdmissionResult,
} from '../../../src/services/safety/index.js';
import {
  dispatchExecutionUnit,
  expirePlanUnits,
  finalizeExecutionUnit,
  hostLoopDecision,
  type DispatchHooks,
  type DispatchUnit,
  type LeaseRenewal,
} from '../../../src/services/execution-runtime/index.js';

let op = '';
beforeAll(async () => {
  await resetDb();
  op = (
    await testDb.user.create({
      data: {
        email: 'operator-dispatch@example.com',
        emailVerifiedAt: new Date(),
        isOperator: true,
      },
    })
  ).id;
});
afterAll(async () => {
  await closeDb();
});

const HOUR = 3_600_000;

function hooks(w: RuntimeWorld, over: Partial<DispatchHooks> = {}, lease: 'L' | 'N' = 'L') {
  const calls: string[] = [];
  const admissions: AdmissionResult[] = [];
  const child = { terminate: vi.fn(() => Promise.resolve()) };
  const h: DispatchHooks = {
    admissionRequestFor: (u: DispatchUnit) =>
      admissionRequest(w, {
        executionId: u.id,
        idempotencyKey: u.idempotencyKey,
        consumes: { request: true, concurrency: lease === 'L' },
      }),
    leaseClass: () => lease,
    hasCapacity: () => (calls.push('capacity'), Promise.resolve(true)),
    proofs: () => (calls.push('proofs'), Promise.resolve(null)),
    forkInertChild: () => (calls.push('fork'), Promise.resolve(child)),
    requestAdmission: async (r) => {
      calls.push('f07');
      const res = await requestAdmission(testDb, r);
      admissions.push(res);
      return res;
    },
    releaseLeases: (id) => releaseLeasesByExecution(testDb, id),
    ...over,
  };
  return { h, calls, admissions, child };
}

const run = (w: RuntimeWorld, id: string, h: DispatchHooks, host = 'host-1') =>
  dispatchExecutionUnit(testDb, h, { executionUnitId: id, userId: w.userId, hostInstanceId: host });

describe('queue topology (FR-017)', () => {
  it('routes passive classes to the legacy queue, the rest to their own, TELEMETRY nowhere', () => {
    expect(queueNameForUnitClass('PASSIVE_HTTP')).toBe(QUEUE_NAMES.scanPhase);
    expect(queueNameForUnitClass('SOURCE_STATIC')).toBe(QUEUE_NAMES.scanPhase);
    expect(queueNameForUnitClass('TELEMETRY')).toBeNull();
    for (const [cls, name] of Object.entries(EXEC_QUEUE_NAMES))
      expect(queueNameForUnitClass(cls)).toBe(name);
    expect(new Set(Object.values(EXEC_QUEUE_NAMES)).size).toBe(6);
    expect(queueNameForUnitClass('NOPE')).toBeNull();
    expect(queueNameForUnitClass('constructor')).toBeNull();
  });
});

describe('dispatchExecutionUnit', () => {
  it('runs the full v6 sequence in order: capacity, F07, proofs, fork; unit RUNNING, lease held, claim stored', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const { h, calls, child } = hooks(w);
    const r = await run(w, u.id, h);
    expect(r).toMatchObject({ outcome: 'RUNNING', attempt: 1, hostInstanceId: 'host-1' });
    expect(calls).toEqual(['capacity', 'f07', 'proofs', 'fork']);
    expect(await statusOf(u.id)).toBe('RUNNING');
    expect(await liveLeaseCount(w.grantId)).toBe(1);
    expect(await testDb.executionUnitHostClaim.count({ where: { executionUnitId: u.id } })).toBe(1);
    expect(child.terminate).not.toHaveBeenCalled();
    const row = (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!;
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.startedAt).not.toBeNull();
  });

  it('ignores a redelivery and anything that is not a PLANNED non-passive unit of this tenant', async () => {
    const w = await makeRuntimeWorld();
    const stranger = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const first = hooks(w);
    expect((await run(w, u.id, first.h)).outcome).toBe('RUNNING');
    const second = hooks(w);
    expect(await run(w, u.id, second.h, 'host-2')).toEqual({
      outcome: 'IGNORED',
      reason: 'STATUS_RUNNING',
    });
    expect(second.calls).toEqual([]);
    const passive = await makeUnit(w, { cls: 'PASSIVE_HTTP' });
    expect(await run(w, passive.id, second.h)).toEqual({
      outcome: 'IGNORED',
      reason: 'PASSIVE_LEGACY_QUEUE',
    });
    expect(
      await dispatchExecutionUnit(testDb, second.h, {
        executionUnitId: u.id,
        userId: stranger.userId,
        hostInstanceId: 'h',
      }),
    ).toEqual({ outcome: 'IGNORED', reason: 'NOT_FOUND' });
    expect(await run(w, 'ghost', second.h)).toEqual({ outcome: 'IGNORED', reason: 'NOT_FOUND' });
    const done = await makeUnit(w, { status: 'COMPLETED' });
    expect(await run(w, done.id, second.h)).toEqual({
      outcome: 'IGNORED',
      reason: 'STATUS_COMPLETED',
    });
    expect(second.calls).toEqual([]);
  });

  it('step 0: refuses on the scan side BEFORE F07 — no admission call, no lease, no budget', async () => {
    const cases: Array<[Parameters<typeof makeRuntimeWorld>[0], string]> = [
      [{ scanState: 'CANCELLED' }, 'SCAN_CANCELLED'],
      [{ scanState: 'FAILED' }, 'SCAN_FAILED'],
      [{ scanState: 'TIMED_OUT' }, 'SCAN_DEADLINE_EXPIRED'],
      [{ startedAgoMs: HOUR + 5000, deadlineMs: HOUR }, 'SCAN_DEADLINE_EXPIRED'],
      [{ startedAgoMs: HOUR - 100_000, deadlineMs: HOUR }, 'SCAN_DEADLINE_INSUFFICIENT'],
    ];
    for (const [opts, reason] of cases) {
      const w = await makeRuntimeWorld(opts);
      const u = await makeUnit(w, { timeoutPolicyMs: 300_000 });
      const { h, calls } = hooks(w);
      expect(await run(w, u.id, h)).toEqual({ outcome: 'REFUSED', reason });
      expect(calls).not.toContain('f07');
      expect(await liveLeaseCount(w.grantId)).toBe(0);
      expect(await counterOf(w.grantId)).toBeNull();
      expect(await reasonOf(u.id)).toMatchObject({ status: 'REFUSED', terminalReason: reason });
    }
  });

  it('does not apply deadline step 0 to a passive unit on an expired plan', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w, { cls: 'PASSIVE_HTTP', timeoutPolicyMs: 300_000 });
    const { h, calls } = hooks(w);

    expect(await run(w, u.id, h)).toEqual({
      outcome: 'IGNORED',
      reason: 'PASSIVE_LEGACY_QUEUE',
    });
    expect(calls).toEqual([]);
    expect(await statusOf(u.id)).toBe('PLANNED');
    expect(await testDb.executionUnitHostClaim.count({ where: { executionUnitId: u.id } })).toBe(0);
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect(await counterOf(w.grantId)).toBeNull();
  });

  it('expires a DISPATCHED unit before child start, releases its lease and blocks its dependent', async () => {
    const w = await makeRuntimeWorld();
    const dispatched = await makeUnit(w);
    const dependent = await makeUnit(w);
    await addEdge(dependent.id, dispatched.id);
    const context = hooks(w);
    let reachedFork!: () => void;
    let releaseFork!: () => void;
    const forkReached = new Promise<void>((resolve) => {
      reachedFork = resolve;
    });
    const forkBarrier = new Promise<void>((resolve) => {
      releaseFork = resolve;
    });
    context.h.forkInertChild = async () => {
      context.calls.push('fork');
      reachedFork();
      await forkBarrier;
      return context.child;
    };

    const dispatch = run(w, dispatched.id, context.h);
    await forkReached;
    expect(await statusOf(dispatched.id)).toBe('DISPATCHED');
    expect(context.calls).toEqual(['capacity', 'f07', 'proofs', 'fork']);
    expect(await liveLeaseCount(w.grantId)).toBe(1);

    await setScan(w.scanId, { startedAt: new Date(Date.now() - HOUR - 5000) });
    await expirePlanUnits(testDb, w.planId);
    expect(await reasonOf(dispatched.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'SCAN_DEADLINE_EXPIRED',
    });
    expect(await reasonOf(dependent.id)).toMatchObject({
      status: 'BLOCKED',
      blockedBy: dispatched.id,
    });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect(
      await testDb.executionUnitHostClaim.count({ where: { executionUnitId: dispatched.id } }),
    ).toBe(1);
    expect(await testDb.admissionLease.count({ where: { executionId: dispatched.id } })).toBe(1);
    expect(
      await testDb.effectAuthorization.count({ where: { executionUnitId: dispatched.id } }),
    ).toBe(0);

    releaseFork();
    await expect(dispatch).resolves.toEqual({
      outcome: 'IGNORED',
      reason: 'LOST_DISPATCHED_RUNNING',
    });
    expect(context.child.terminate).toHaveBeenCalledOnce();
    expect(context.calls).toEqual(['capacity', 'f07', 'proofs', 'fork']);
    expect(context.admissions).toHaveLength(1);
  });

  it('refuses a later chained unit when its shared plan deadline leaves too little execution time', async () => {
    const w = await makeRuntimeWorld({ deadlineMs: HOUR });
    const first = await makeUnit(w, { status: 'RUNNING' });
    const later = await makeUnit(w, { timeoutPolicyMs: 300_000 });
    await testDb.executionDependency.create({
      data: { executionUnitId: later.id, dependsOnExecutionUnitId: first.id },
    });
    await finalizeExecutionUnit(testDb, first.id, first.key, { kind: 'COMPLETED' });
    await setScan(w.scanId, { startedAt: new Date(Date.now() - (HOUR - 30_000)) });

    const { h, calls } = hooks(w);
    expect(await run(w, later.id, h)).toEqual({
      outcome: 'REFUSED',
      reason: 'SCAN_DEADLINE_INSUFFICIENT',
    });
    expect(calls).not.toContain('f07');
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect(await statusOf(later.id)).toBe('REFUSED');
  });

  it('defers before the scan has started, and when the engine has no capacity (no claim, no F07)', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: null, scanState: 'QUEUED' });
    const u = await makeUnit(w);
    expect(await run(w, u.id, hooks(w).h)).toEqual({
      outcome: 'DEFERRED',
      reason: 'SCAN_NOT_STARTED',
    });
    const w2 = await makeRuntimeWorld();
    const u2 = await makeUnit(w2);
    const full = hooks(w2, { hasCapacity: () => Promise.resolve(false) });
    expect(await run(w2, u2.id, full.h)).toEqual({
      outcome: 'DEFERRED',
      reason: 'ENGINE_CAPACITY',
    });
    expect(full.calls).toEqual([]);
    expect(await statusOf(u2.id)).toBe('PLANNED');
    expect(await testDb.executionUnitHostClaim.count({ where: { executionUnitId: u2.id } })).toBe(
      0,
    );
  });

  it('finalizes REFUSED with the F07 reason when admission refuses (revoked grant), leaving no lease', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    await testDb.targetAuthorization.update({
      where: { id: w.grantId },
      data: { revokedAt: new Date() },
    });
    const { h, calls } = hooks(w);
    expect(await run(w, u.id, h)).toEqual({ outcome: 'REFUSED', reason: 'REVOKED' });
    expect(calls).toEqual(['capacity', 'f07']);
    expect(await reasonOf(u.id)).toMatchObject({ status: 'REFUSED', terminalReason: 'REVOKED' });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
  });

  it('a pending stop wins over an expired deadline: the unit is claimed, F07 refuses with the stop reason', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w);
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: w.grantId,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    const { h, calls } = hooks(w);
    expect(await run(w, u.id, h)).toEqual({ outcome: 'REFUSED', reason: 'KILL_SWITCH_PENDING' });
    expect(calls).toContain('f07');
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'KILL_SWITCH_PENDING',
    });
  });

  it('runs engine guards after the claim and re-reads the world before F07: a scan cancelled meanwhile never reaches admission', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const guarded = hooks(w, { guards: () => Promise.resolve('FEATURE_DISABLED') });
    expect(await run(w, u.id, guarded.h)).toEqual({
      outcome: 'REFUSED',
      reason: 'FEATURE_DISABLED',
    });
    expect(guarded.calls).not.toContain('f07');
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'FEATURE_DISABLED',
    });

    const w2 = await makeRuntimeWorld();
    const u2 = await makeUnit(w2);
    const racing = hooks(w2, {
      guards: async () => {
        await setScan(w2.scanId, { state: 'CANCELLED' });
        return null;
      },
    });
    expect(await run(w2, u2.id, racing.h)).toEqual({
      outcome: 'REFUSED',
      reason: 'SCAN_CANCELLED',
    });
    expect(racing.calls).not.toContain('f07');
    expect(await liveLeaseCount(w2.grantId)).toBe(0);
  });

  it('refuses on an engine proof, releasing the lease through finalization', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const { h, calls } = hooks(w, { proofs: () => Promise.resolve('VAB_NOT_PROVEN') });
    expect(await run(w, u.id, h)).toEqual({ outcome: 'REFUSED', reason: 'VAB_NOT_PROVEN' });
    expect(calls).not.toContain('fork');
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'VAB_NOT_PROVEN',
    });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect((await counterOf(w.grantId))!.activeConcurrency).toBe(0);
  });

  it('lets exactly one of many concurrent hosts dispatch the unit (one lease, one fork)', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const sets = Array.from({ length: 6 }, () => hooks(w));
    const results = await Promise.all(sets.map((s, i) => run(w, u.id, s.h, `host-${String(i)}`)));
    expect(results.filter((r) => r.outcome === 'RUNNING')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'IGNORED')).toHaveLength(5);
    expect(sets.reduce((n, s) => n + s.calls.filter((c) => c === 'fork').length, 0)).toBe(1);
    expect(sets.reduce((n, s) => n + s.calls.filter((c) => c === 'f07').length, 0)).toBe(1);
    expect(await liveLeaseCount(w.grantId)).toBe(1);
  });

  it('frees the lease it just created when a sweep finalized the unit between the claim and F07 (v6 §5.2 residual)', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const { h } = hooks(w, {
      requestAdmission: async (r) => {
        await finalizeExecutionUnit(testDb, u.id, u.key, {
          kind: 'REFUSED',
          reason: 'SCAN_DEADLINE_EXPIRED',
        });
        return requestAdmission(testDb, r); // F07 knows nothing of the unit: it grants a lease for a terminal unit
      },
    });
    expect(await run(w, u.id, h)).toEqual({ outcome: 'IGNORED', reason: 'LOST_PLANNED_ADMITTED' });
    expect(await statusOf(u.id)).toBe('REFUSED');
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect((await counterOf(w.grantId))!.activeConcurrency).toBe(0);
  });

  it('terminates the inert child and writes nothing when DISPATCHED>RUNNING is lost', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const child = { terminate: vi.fn(() => Promise.resolve()) };
    const { h } = hooks(w, {
      forkInertChild: async () => {
        await finalizeExecutionUnit(testDb, u.id, u.key, {
          kind: 'REFUSED',
          reason: 'SCAN_CANCELLED',
        });
        return child;
      },
    });
    expect(await run(w, u.id, h)).toMatchObject({ outcome: 'IGNORED' });
    expect(child.terminate).toHaveBeenCalledTimes(1);
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'SCAN_CANCELLED',
    });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
  });

  it('works for a class that consumes no concurrency lease (class N) and never creates one', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const { h } = hooks(w, {}, 'N');
    expect((await run(w, u.id, h)).outcome).toBe('RUNNING');
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect(await statusOf(u.id)).toBe('RUNNING');
  });
});

describe('hostLoopDecision (v6 §7)', () => {
  async function running(
    lease: 'L' | 'N' = 'L',
    opts: Parameters<typeof makeRuntimeWorld>[0] = {},
  ) {
    const w = await makeRuntimeWorld(opts);
    const u = await makeUnit(w);
    const s = hooks(w, {}, lease);
    expect((await run(w, u.id, s.h)).outcome).toBe('RUNNING');
    const grant = s.admissions[0]!;
    const renew = async (): Promise<LeaseRenewal> => {
      if (
        grant.outcome !== 'GRANTED' ||
        grant.leaseId === undefined ||
        grant.holderToken === undefined
      )
        return 'RENEWED';
      const r = await renewLease(testDb, {
        leaseId: grant.leaseId,
        holderToken: grant.holderToken,
      });
      return r.status === 'GRANT_INVALID'
        ? r.reason === 'EXPIRED'
          ? 'GRANT_INVALID_EXPIRED'
          : 'GRANT_INVALID_REVOKED'
        : r.status;
    };
    const decide = (renewal: () => Promise<LeaseRenewal> = renew) =>
      hostLoopDecision(testDb, { id: u.id, userId: w.userId, leaseClass: lease }, renewal);
    return { w, u, decide };
  }

  it('continues while nothing is wrong and renews the lease', async () => {
    const { decide } = await running();
    expect(await decide()).toEqual({ action: 'CONTINUE' });
  });

  it('stops without writing when the unit is already terminal (terminal beats every other condition)', async () => {
    const { w, u, decide } = await running();
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: u.id,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    await finalizeExecutionUnit(testDb, u.id, u.key, {
      kind: 'KILLED',
      f07Reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await decide()).toEqual({ action: 'STOP_TERMINAL' });
    expect(w.userId).toBeTruthy();
  });

  it('aborts WITHOUT finalizing when the lease is lost, and may only acknowledge a pending stop', async () => {
    const lost = await running();
    await testDb.$executeRawUnsafe(`SELECT public.f07_release_leases_by_execution($1)`, lost.u.id);
    expect(await lost.decide()).toEqual({ action: 'ABORT_LEASE_LOST', acknowledgeStop: false });
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: lost.u.id,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await lost.decide()).toEqual({ action: 'ABORT_LEASE_LOST', acknowledgeStop: true });
    expect(await statusOf(lost.u.id)).toBe('RUNNING');
  });

  it('stops and finalizes on a pending stop with the lease held; scan end and deadline finalize through the owner', async () => {
    const stop = await running();
    await triggerStop(testDb, {
      scope: 'SCAN',
      scopeId: stop.w.scanId,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await stop.decide()).toEqual({
      action: 'STOP_AND_FINALIZE',
      cause: 'KILL_SWITCH_PENDING',
    });

    const cancelled = await running();
    await setScan(cancelled.w.scanId, { state: 'CANCELLED' });
    expect(await cancelled.decide()).toEqual({
      action: 'EXPIRE_AND_FINALIZE',
      cause: 'SCAN_CANCELLED',
    });

    const late = await running('L', { deadlineMs: HOUR });
    await setScan(late.w.scanId, { startedAt: new Date(Date.now() - HOUR - 5000) });
    expect(await late.decide()).toEqual({
      action: 'EXPIRE_AND_FINALIZE',
      cause: 'SCAN_DEADLINE_EXPIRED',
    });
  });

  it('stops the unit when renewal is refused for a revoked grant or F07 state cannot be read (fail closed)', async () => {
    const revoked = await running();
    await testDb.targetAuthorization.update({
      where: { id: revoked.w.grantId },
      data: { revokedAt: new Date() },
    });
    expect(await revoked.decide()).toEqual({ action: 'STOP_AND_FINALIZE', cause: 'GRANT_REVOKED' });
    const unsure = await running();
    expect(await unsure.decide(() => Promise.resolve('UNCERTAIN'))).toEqual({
      action: 'STOP_AND_FINALIZE',
      cause: 'F07_STATE_UNCERTAIN',
    });
    expect(await unsure.decide(() => Promise.resolve('GRANT_INVALID_EXPIRED'))).toEqual({
      action: 'STOP_AND_FINALIZE',
      cause: 'GRANT_EXPIRED',
    });
    expect(await unsure.decide(() => Promise.resolve('STOP_PENDING'))).toEqual({
      action: 'STOP_AND_FINALIZE',
      cause: 'KILL_SWITCH_PENDING',
    });
  });

  it('does not treat "too little time left" as a loop condition once running, and skips renewal for class N', async () => {
    const tight = await running('L', { deadlineMs: HOUR });
    await setScan(tight.w.scanId, { startedAt: new Date(Date.now() - HOUR + 30_000) });
    expect(await tight.decide()).toEqual({ action: 'CONTINUE' });

    const n = await running('N');
    await testDb.$executeRawUnsafe(`SELECT public.f07_release_leases_by_execution($1)`, n.u.id);
    expect(await n.decide()).toEqual({ action: 'CONTINUE' });
  });
});
