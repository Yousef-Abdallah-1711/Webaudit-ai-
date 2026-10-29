/**
 * SPEC 009 execution runtime — failure classification, host claim, status CAS, effect ledger and plan-unit expiry,
 * against real PostgreSQL and the real SPEC 008 functions (admission, kill switch, lease release).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import { admissionRequest, counterOf, liveLeaseCount } from '../../helpers/safety-fixtures.js';
import {
  addEdge,
  makeRuntimeWorld,
  makeUnit,
  reasonOf,
  setScan,
  statusOf,
  uid,
  type RuntimeWorld,
} from '../../helpers/runtime-fixtures.js';
import { requestAdmission, triggerStop } from '../../../src/services/safety/index.js';
import {
  authorizeEffect,
  casHostTransition,
  claimUnitHost,
  classifyFailure,
  classifyPreRunCause,
  confirmEffect,
  expirePlanUnits,
  finalizeExecutionUnit,
  generateClaimToken,
  hashClaimToken,
  isRetryEligible,
  NEVER_AUTO_RETRIED,
  type UnitObservation,
} from '../../../src/services/execution-runtime/index.js';

let op = '';
beforeAll(async () => {
  await resetDb();
  op = (
    await testDb.user.create({
      data: { email: 'operator-rt@example.com', emailVerifiedAt: new Date(), isOperator: true },
    })
  ).id;
});
afterAll(async () => {
  await closeDb();
});

const HOUR = 3_600_000;

async function claim(w: RuntimeWorld, unitId: string, host = 'host-1') {
  const t = generateClaimToken();
  const r = await claimUnitHost(
    testDb,
    { executionUnitId: unitId, userId: w.userId, hostInstanceId: host },
    t.tokenHash,
  );
  return { ...t, r, host };
}

const cas = (
  w: RuntimeWorld,
  id: string,
  c: { token: string; host: string },
  edge: 'PLANNED>ADMITTED' | 'ADMITTED>DISPATCHED' | 'DISPATCHED>RUNNING',
  leaseClass: 'L' | 'N' = 'N',
  attempt = 1,
) =>
  casHostTransition(testDb, {
    executionUnitId: id,
    userId: w.userId,
    hostInstanceId: c.host,
    attempt,
    claimToken: c.token,
    edge,
    leaseClass,
  });

/** A unit driven to RUNNING with a claim, as a host would. */
async function runningUnit(w: RuntimeWorld, leaseClass: 'L' | 'N' = 'N') {
  const u = await makeUnit(w);
  const c = await claim(w, u.id);
  if (leaseClass === 'L') {
    const g = await requestAdmission(testDb, admissionRequest(w, { executionId: u.id }));
    expect(g.outcome).toBe('GRANTED');
  }
  for (const edge of ['PLANNED>ADMITTED', 'ADMITTED>DISPATCHED', 'DISPATCHED>RUNNING'] as const) {
    expect(await cas(w, u.id, c, edge, leaseClass)).toBe('OK');
  }
  return { u, c };
}

describe('failure classification (FR-023, R9/R9a)', () => {
  const TABLE: Array<[UnitObservation, string]> = [
    [{ source: 'ENGINE_RESULT' }, 'COMPLETED'],
    [{ source: 'CUSTOMER_CODE_EXIT', exitCode: 0 }, 'COMPLETED'],
    [{ source: 'CUSTOMER_CODE_EXIT', exitCode: 1 }, 'CUSTOMER_CODE_FAILURE'],
    [{ source: 'CUSTOMER_CODE_EXIT', exitCode: Number.NaN }, 'CUSTOMER_CODE_FAILURE'],
    [{ source: 'ENGINE_EXCEPTION' }, 'ENGINE_DEFECT'],
    [{ source: 'HARD_STOP_DEADLINE' }, 'TIMEOUT'],
    [{ source: 'F07_STOP' }, 'SAFETY_REFUSED'],
    [{ source: 'INFRASTRUCTURE_ERROR' }, 'TRANSIENT_INFRASTRUCTURE'],
    [{ source: 'TARGET_UNREACHABLE' }, 'TARGET_UNAVAILABLE'],
    [{ source: 'INVALID_CONFIGURATION' }, 'INVALID_CONFIGURATION'],
    [{ source: 'EXTERNAL_DEPENDENCY_ERROR' }, 'EXTERNAL_DEPENDENCY_FAILURE'],
  ];

  it.each(TABLE)('maps %j to %s', (obs, expected) => {
    const c = classifyFailure(obs);
    expect(c.outcome === 'COMPLETED' ? 'COMPLETED' : c.failureClass).toBe(expected);
  });

  it('never stores DETERMINISTIC_FINDING and fails closed on an unknown observation', () => {
    const c = classifyFailure({ source: 'NOPE' } as unknown as UnitObservation);
    expect(c).toEqual({ outcome: 'FAILED', failureClass: 'ENGINE_DEFECT' });
    for (const [obs] of TABLE) {
      const r = classifyFailure(obs);
      if (r.outcome === 'FAILED') expect(r.failureClass).not.toBe('DETERMINISTIC_FINDING');
    }
  });

  it('retries only a listed, retryable class with an attempt left; never-retry classes stay refused whatever the policy says', () => {
    const all = [
      'TRANSIENT_INFRASTRUCTURE',
      'TARGET_UNAVAILABLE',
      'SAFETY_REFUSED',
      'TIMEOUT',
      'ENGINE_DEFECT',
      'INVALID_CONFIGURATION',
      'CUSTOMER_CODE_FAILURE',
      'EXTERNAL_DEPENDENCY_FAILURE',
      'DETERMINISTIC_FINDING',
    ] as const;
    const policy = { maxAttempts: 3, eligibleFailureClasses: all };
    for (const fc of all) {
      const expected = !NEVER_AUTO_RETRIED.has(fc);
      expect(isRetryEligible(fc, policy, 1)).toBe(expected);
      expect(isRetryEligible(fc, policy, 3)).toBe(false);
      expect(isRetryEligible(fc, { maxAttempts: 3, eligibleFailureClasses: [] }, 1)).toBe(false);
    }
    expect(
      isRetryEligible('TIMEOUT', { maxAttempts: 1, eligibleFailureClasses: ['TIMEOUT'] }, 1),
    ).toBe(false);
    expect(
      isRetryEligible('TIMEOUT', { maxAttempts: 2, eligibleFailureClasses: ['TIMEOUT'] }, 0),
    ).toBe(false);
    expect(
      isRetryEligible('TIMEOUT', { maxAttempts: 0, eligibleFailureClasses: ['TIMEOUT'] }, 1),
    ).toBe(false);
  });
});

describe('claimUnitHost', () => {
  it('claims once; a second host and a replay are ALREADY_CLAIMED; the token is stored only as a hash', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const first = await claim(w, u.id, 'h1');
    expect(first.r).toMatchObject({ result: 'CLAIMED', attempt: 1 });
    expect((await claim(w, u.id, 'h2')).r).toEqual({ result: 'ALREADY_CLAIMED' });
    expect((await claim(w, u.id, 'h1')).r).toEqual({ result: 'ALREADY_CLAIMED' });
    const row = (await testDb.executionUnitHostClaim.findFirst({
      where: { executionUnitId: u.id },
    }))!;
    expect(row.claimTokenHash).toBe(hashClaimToken(first.token));
    expect(row.claimTokenHash).not.toContain(first.token);
    expect(first.token).toHaveLength(64);
  });

  it('lets exactly one of many concurrent hosts win', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claim(w, u.id, `h${String(i)}`)),
    );
    expect(results.filter((r) => r.r.result === 'CLAIMED')).toHaveLength(1);
    expect(results.filter((r) => r.r.result === 'ALREADY_CLAIMED')).toHaveLength(7);
    expect(await testDb.executionUnitHostClaim.count({ where: { executionUnitId: u.id } })).toBe(1);
  });

  it('treats another tenant, an unknown unit, a bad hash and a non-PLANNED unit as not claimable (uniformly)', async () => {
    const w = await makeRuntimeWorld();
    const other = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const t = generateClaimToken();
    expect(
      await claimUnitHost(
        testDb,
        { executionUnitId: u.id, userId: other.userId, hostInstanceId: 'h' },
        t.tokenHash,
      ),
    ).toEqual({ result: 'NOT_CLAIMABLE', reason: 'NOT_FOUND' });
    expect(
      await claimUnitHost(
        testDb,
        { executionUnitId: 'ghost', userId: w.userId, hostInstanceId: 'h' },
        t.tokenHash,
      ),
    ).toEqual({ result: 'NOT_CLAIMABLE', reason: 'NOT_FOUND' });
    expect(
      await claimUnitHost(
        testDb,
        { executionUnitId: u.id, userId: w.userId, hostInstanceId: 'h' },
        'not-a-hash',
      ),
    ).toMatchObject({ result: 'NOT_CLAIMABLE' });
    expect(
      await claimUnitHost(
        testDb,
        { executionUnitId: u.id, userId: w.userId, hostInstanceId: '' },
        t.tokenHash,
      ),
    ).toMatchObject({ result: 'NOT_CLAIMABLE' });
    const running = await makeUnit(w, { status: 'RUNNING' });
    expect(
      await claimUnitHost(
        testDb,
        { executionUnitId: running.id, userId: w.userId, hostInstanceId: 'h' },
        t.tokenHash,
      ),
    ).toEqual({ result: 'NOT_CLAIMABLE', reason: 'STATUS_RUNNING' });
    expect(await testDb.executionUnitHostClaim.count({ where: { userId: other.userId } })).toBe(0);
  });

  it('refuses with the scan-side reason when the scan ended or the deadline cannot be met (no claim row written)', async () => {
    const cases: Array<[string, Parameters<typeof makeRuntimeWorld>[0], string]> = [
      ['cancelled', { scanState: 'CANCELLED' }, 'SCAN_CANCELLED'],
      ['failed', { scanState: 'FAILED' }, 'SCAN_FAILED'],
      ['timed out', { scanState: 'TIMED_OUT' }, 'SCAN_DEADLINE_EXPIRED'],
      ['deadline passed', { startedAgoMs: HOUR + 1000, deadlineMs: HOUR }, 'SCAN_DEADLINE_EXPIRED'],
      [
        'too little time',
        { startedAgoMs: HOUR - 100_000, deadlineMs: HOUR },
        'SCAN_DEADLINE_INSUFFICIENT',
      ],
    ];
    for (const [, opts, reason] of cases) {
      const w = await makeRuntimeWorld(opts);
      const u = await makeUnit(w, { timeoutPolicyMs: 300_000 });
      expect((await claim(w, u.id)).r).toEqual({ result: 'REFUSE', reason });
      expect(await testDb.executionUnitHostClaim.count({ where: { executionUnitId: u.id } })).toBe(
        0,
      );
      expect(await statusOf(u.id)).toBe('PLANNED');
    }
  });

  it('does not claim before the scan has started (contract: no dispatch without an anchor)', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: null, scanState: 'QUEUED' });
    const u = await makeUnit(w);
    expect((await claim(w, u.id)).r).toEqual({
      result: 'NOT_CLAIMABLE',
      reason: 'SCAN_NOT_STARTED',
    });
  });

  it('refuses an unresolved plan, and still claims under a pending stop so F07 can refuse with the stop reason (v6 §3)', async () => {
    const w = await makeRuntimeWorld();
    const refusedPlan = await testDb.scanPlan.create({
      data: {
        kind: 'REVERIFY',
        userId: w.userId,
        reverifyIssueId: uid('i'),
        state: 'REFUSED',
        refusalReason: 'x',
      },
    });
    const orphan = await makeUnit(w);
    await testDb.$executeRawUnsafe(`ALTER TABLE "ExecutionUnit" DISABLE TRIGGER USER`);
    try {
      await testDb.$executeRawUnsafe(
        `UPDATE "ExecutionUnit" SET "scanPlanId"=$1 WHERE id=$2`,
        refusedPlan.id,
        orphan.id,
      );
    } finally {
      await testDb.$executeRawUnsafe(`ALTER TABLE "ExecutionUnit" ENABLE TRIGGER USER`);
    }
    expect((await claim(w, orphan.id)).r).toEqual({
      result: 'NOT_CLAIMABLE',
      reason: 'PLAN_NOT_RESOLVED',
    });

    const w2 = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w2);
    await triggerStop(testDb, {
      scope: 'SCAN',
      scopeId: w2.scanId,
      triggeredBy: w2.userId,
      reason: 'USER_CANCELLATION',
    });
    // Deadline already passed AND a stop is pending: the stop wins the precedence, so the claim is not refused with a deadline reason.
    const cause = await classifyPreRunCause(
      testDb,
      { ...(await rowFor(u.id)) },
      { phase: 'PRE_RUN' },
    );
    expect(cause.cause).toBe('KILL_SWITCH_PENDING');
    expect((await claim(w2, u.id)).r).toMatchObject({ result: 'CLAIMED' });
  });
});

async function rowFor(id: string) {
  const r = await testDb.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT id,"userId",status::text AS status,"targetId","targetAuthorizationId","scanPlanId","timeoutPolicyMs" FROM "ExecutionUnit" WHERE id=$1`,
    id,
  );
  return r[0] as never as Parameters<typeof classifyPreRunCause>[1];
}

describe('classifyPreRunCause precedence (v6 §6)', () => {
  it('orders terminal > stop > scan ended > deadline > insufficient', async () => {
    const w = await makeRuntimeWorld({
      startedAgoMs: HOUR + 5000,
      deadlineMs: HOUR,
      scanState: 'CANCELLED',
    });
    const u = await makeUnit(w);
    const at = async () =>
      (await classifyPreRunCause(testDb, await rowFor(u.id), { phase: 'PRE_RUN' })).cause;
    expect(await at()).toBe('SCAN_CANCELLED'); // scan ended beats the deadline
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: w.grantId,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await at()).toBe('KILL_SWITCH_PENDING'); // a stop beats the scan-ended cause
    const done = await makeUnit(w, { status: 'COMPLETED' });
    expect(
      (await classifyPreRunCause(testDb, await rowFor(done.id), { phase: 'PRE_RUN' })).cause,
    ).toBe('TERMINAL');
  });

  it('applies the time-left threshold only before the run', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR - 50_000, deadlineMs: HOUR });
    const u = await makeUnit(w, { timeoutPolicyMs: 300_000 });
    expect(
      (await classifyPreRunCause(testDb, await rowFor(u.id), { phase: 'PRE_RUN' })).cause,
    ).toBe('SCAN_DEADLINE_INSUFFICIENT');
    expect(
      (await classifyPreRunCause(testDb, await rowFor(u.id), { phase: 'RUNNING' })).cause,
    ).toBe('NONE');
  });

  it('uses the database clock, not the worker clock', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    // Skew the worker clock 10 h ahead; the unit has ample time on the database clock, so nothing may change.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 10 * HOUR });
    try {
      expect(
        (await classifyPreRunCause(testDb, await rowFor(u.id), { phase: 'PRE_RUN' })).cause,
      ).toBe('NONE');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('casHostTransition', () => {
  it('walks PLANNED -> ADMITTED -> DISPATCHED -> RUNNING for the claim holder and stamps the times', async () => {
    const w = await makeRuntimeWorld();
    const { u } = await runningUnit(w);
    const row = (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!;
    expect(row.status).toBe('RUNNING');
    expect(row.dispatchedAt).not.toBeNull();
    expect(row.startedAt).not.toBeNull();
  });

  it('loses for the wrong token, wrong host, wrong attempt, a skipped edge and a replay', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const c = await claim(w, u.id);
    expect(
      await cas(w, u.id, { token: generateClaimToken().token, host: c.host }, 'PLANNED>ADMITTED'),
    ).toBe('LOST');
    expect(await cas(w, u.id, { token: c.token, host: 'other-host' }, 'PLANNED>ADMITTED')).toBe(
      'LOST',
    );
    expect(await cas(w, u.id, c, 'PLANNED>ADMITTED', 'N', 2)).toBe('LOST');
    expect(await cas(w, u.id, c, 'ADMITTED>DISPATCHED')).toBe('LOST');
    expect(await cas(w, u.id, c, 'PLANNED>ADMITTED')).toBe('OK');
    expect(await cas(w, u.id, c, 'PLANNED>ADMITTED')).toBe('LOST');
    expect(await statusOf(u.id)).toBe('ADMITTED');
  });

  it('refuses another tenant even with the right token', async () => {
    const w = await makeRuntimeWorld();
    const stranger = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const c = await claim(w, u.id);
    expect(
      await casHostTransition(testDb, {
        executionUnitId: u.id,
        userId: stranger.userId,
        hostInstanceId: c.host,
        attempt: 1,
        claimToken: c.token,
        edge: 'PLANNED>ADMITTED',
        leaseClass: 'N',
      }),
    ).toBe('LOST');
  });

  it('class L needs the live lease; a lost lease rolls the whole edge back', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const c = await claim(w, u.id);
    expect(await cas(w, u.id, c, 'PLANNED>ADMITTED', 'L')).toBe('LEASE_LOST');
    expect(await statusOf(u.id)).toBe('PLANNED');
    expect(
      (await requestAdmission(testDb, admissionRequest(w, { executionId: u.id }))).outcome,
    ).toBe('GRANTED');
    expect(await cas(w, u.id, c, 'PLANNED>ADMITTED', 'L')).toBe('OK');
    await testDb.$executeRawUnsafe(`SELECT public.f07_release_leases_by_execution($1)`, u.id);
    expect(await cas(w, u.id, c, 'ADMITTED>DISPATCHED', 'L')).toBe('LEASE_LOST');
    expect(await statusOf(u.id)).toBe('ADMITTED');
  });

  it('lets exactly one of a finalizer and a host win the same unit', async () => {
    for (let i = 0; i < 6; i++) {
      const w = await makeRuntimeWorld();
      const u = await makeUnit(w);
      const c = await claim(w, u.id);
      const [hostResult, fin] = await Promise.all([
        cas(w, u.id, c, 'PLANNED>ADMITTED'),
        finalizeExecutionUnit(testDb, u.id, u.key, {
          kind: 'REFUSED',
          reason: 'SCAN_DEADLINE_EXPIRED',
        }),
      ]);
      const status = await statusOf(u.id);
      // Either the host's CAS committed first (then finalization refuses from ADMITTED) or finalization did (CAS lost).
      expect(['ADMITTED', 'REFUSED']).toContain(status);
      if (status === 'ADMITTED') expect(hostResult).toBe('OK');
      if (status === 'REFUSED') expect(hostResult === 'LOST' || hostResult === 'OK').toBe(true);
      expect(fin.status).toBe('REFUSED');
    }
  });
});

describe('authorizeEffect (DEC-051 A)', () => {
  const effect = (
    w: RuntimeWorld,
    id: string,
    c: { token: string; host: string },
    ordinal = 1,
    leaseClass: 'L' | 'N' = 'N',
    kind = 'REQUEST',
  ) =>
    authorizeEffect(testDb, {
      executionUnitId: id,
      userId: w.userId,
      hostInstanceId: c.host,
      attempt: 1,
      claimToken: c.token,
      kind,
      ordinal,
      leaseClass,
    });

  it('authorizes once per (kind, ordinal), idempotently, and confirms', async () => {
    const w = await makeRuntimeWorld();
    const { u, c } = await runningUnit(w);
    expect(await effect(w, u.id, c)).toEqual({ result: 'AUTHORIZED', replayed: false });
    expect(await effect(w, u.id, c)).toEqual({ result: 'AUTHORIZED', replayed: true });
    expect(await effect(w, u.id, c, 2)).toEqual({ result: 'AUTHORIZED', replayed: false });
    expect(
      await confirmEffect(testDb, {
        executionUnitId: u.id,
        attempt: 1,
        kind: 'REQUEST',
        ordinal: 1,
      }),
    ).toBe(true);
    expect(
      await confirmEffect(testDb, {
        executionUnitId: u.id,
        attempt: 1,
        kind: 'REQUEST',
        ordinal: 1,
      }),
    ).toBe(false);
  });

  it('refuses before RUNNING, for the wrong claim, an invalid effect, another tenant, and a stale attempt', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w);
    const c = await claim(w, u.id);
    expect(await effect(w, u.id, c)).toEqual({ result: 'REFUSED', reason: 'STATUS_PLANNED' });
    const run = await runningUnit(w);
    expect(
      await effect(w, run.u.id, { token: generateClaimToken().token, host: run.c.host }),
    ).toEqual({ result: 'REFUSED', reason: 'CLAIM_MISMATCH' });
    expect(await effect(w, run.u.id, run.c, 1, 'N', '')).toEqual({
      result: 'REFUSED',
      reason: 'INVALID_EFFECT',
    });
    expect(await effect(w, run.u.id, run.c, -1)).toEqual({
      result: 'REFUSED',
      reason: 'INVALID_EFFECT',
    });
    const stranger = await makeRuntimeWorld();
    expect(
      await authorizeEffect(testDb, {
        executionUnitId: run.u.id,
        userId: stranger.userId,
        hostInstanceId: run.c.host,
        attempt: 1,
        claimToken: run.c.token,
        kind: 'REQUEST',
        ordinal: 1,
        leaseClass: 'N',
      }),
    ).toEqual({ result: 'REFUSED', reason: 'NOT_FOUND' });
    expect(
      await authorizeEffect(testDb, {
        executionUnitId: run.u.id,
        userId: w.userId,
        hostInstanceId: run.c.host,
        attempt: 7,
        claimToken: run.c.token,
        kind: 'REQUEST',
        ordinal: 1,
        leaseClass: 'N',
      }),
    ).toEqual({ result: 'REFUSED', reason: 'STALE_ATTEMPT' });
    expect(await testDb.effectAuthorization.count({ where: { executionUnitId: run.u.id } })).toBe(
      0,
    );
  });

  it('refuses on a pending stop, a cancelled scan, an expired deadline and a lost lease', async () => {
    const stop = await makeRuntimeWorld();
    const a = await runningUnit(stop);
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: a.u.id,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await effect(stop, a.u.id, a.c)).toEqual({
      result: 'REFUSED',
      reason: 'KILL_SWITCH_PENDING',
    });

    const cancelled = await makeRuntimeWorld();
    const b = await runningUnit(cancelled);
    await setScan(cancelled.scanId, { state: 'CANCELLED' });
    expect(await effect(cancelled, b.u.id, b.c)).toEqual({
      result: 'REFUSED',
      reason: 'SCAN_CANCELLED',
    });

    const late = await makeRuntimeWorld({ deadlineMs: HOUR });
    const d = await runningUnit(late);
    await setScan(late.scanId, { startedAt: new Date(Date.now() - HOUR - 5000) });
    expect(await effect(late, d.u.id, d.c)).toEqual({
      result: 'REFUSED',
      reason: 'SCAN_DEADLINE_EXPIRED',
    });

    const lease = await makeRuntimeWorld();
    const l = await runningUnit(lease, 'L');
    expect(await effect(lease, l.u.id, l.c, 1, 'L')).toMatchObject({ result: 'AUTHORIZED' });
    await testDb.$executeRawUnsafe(`SELECT public.f07_release_leases_by_execution($1)`, l.u.id);
    expect(await effect(lease, l.u.id, l.c, 2, 'L')).toEqual({
      result: 'REFUSED',
      reason: 'LEASE_LOST',
    });
  });

  it('never authorizes after terminalization, even when racing the finalizer', async () => {
    const w = await makeRuntimeWorld();
    const { u, c } = await runningUnit(w);
    const authorizations = await Promise.all([
      ...Array.from({ length: 12 }, (_, i) => effect(w, u.id, c, i)),
      finalizeExecutionUnit(testDb, u.id, u.key, { kind: 'COMPLETED' }),
    ]);
    const fin = authorizations.at(-1);
    expect(fin).toMatchObject({ status: 'COMPLETED' });
    const grants = (authorizations.slice(0, 12) as Array<{ result: string }>).filter(
      (r) => r.result === 'AUTHORIZED',
    ).length;
    const rows = await testDb.effectAuthorization.findMany({ where: { executionUnitId: u.id } });
    // Every row the host was told "AUTHORIZED" for exists; the finalizer then abandoned all of them (none left dangling).
    expect(rows).toHaveLength(grants);
    expect(rows.every((r) => r.state === 'ABANDONED')).toBe(true);
    // After the commit, no new authorization can ever succeed.
    expect(await effect(w, u.id, c, 99)).toEqual({ result: 'REFUSED', reason: 'STATUS_COMPLETED' });
    expect(
      await testDb.effectAuthorization.count({
        where: { executionUnitId: u.id, state: 'AUTHORIZED' },
      }),
    ).toBe(0);
  });
});

describe('finalizeExecutionUnit through the TypeScript face', () => {
  it('releases the lease, records the reason and propagates BLOCKED', async () => {
    const w = await makeRuntimeWorld();
    const { u } = await runningUnit(w, 'L');
    const dep = await makeUnit(w);
    await addEdge(dep.id, u.id);
    expect(await liveLeaseCount(w.grantId)).toBe(1);
    const r = await finalizeExecutionUnit(testDb, u.id, u.key, {
      kind: 'KILLED',
      f07Reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(r).toMatchObject({ status: 'KILLED', replayed: false, blocked: [dep.id] });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect((await counterOf(w.grantId))!.activeConcurrency).toBe(0);
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'KILLED',
      terminalReason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await reasonOf(dep.id)).toMatchObject({ status: 'BLOCKED', blockedBy: u.id });
    expect(await finalizeExecutionUnit(testDb, u.id, u.key, { kind: 'COMPLETED' })).toMatchObject({
      replayed: true,
      outcomeMatches: false,
    });
  });
});

describe('expirePlanUnits — status-by-cause matrix', () => {
  type Pre = 'PLANNED' | 'ADMITTED' | 'DISPATCHED';
  const PRE: Pre[] = ['PLANNED', 'ADMITTED', 'DISPATCHED'];

  const worlds = {
    deadline: () => makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR }),
    cancelled: () => makeRuntimeWorld({ scanState: 'CANCELLED' }),
    failed: () => makeRuntimeWorld({ scanState: 'FAILED' }),
    timedOut: () => makeRuntimeWorld({ scanState: 'TIMED_OUT' }),
  };

  it.each(
    PRE.flatMap((s) =>
      (['deadline', 'cancelled', 'failed', 'timedOut'] as const).map((c) => [s, c] as const),
    ),
  )('pre-run %s unit, scan cause %s -> REFUSED with the scan reason', async (status, cause) => {
    const w = await worlds[cause]();
    const u = await makeUnit(w, { status });
    const summary = await expirePlanUnits(testDb, w.planId);
    const reason = {
      deadline: 'SCAN_DEADLINE_EXPIRED',
      cancelled: 'SCAN_CANCELLED',
      failed: 'SCAN_FAILED',
      timedOut: 'SCAN_DEADLINE_EXPIRED',
    }[cause];
    expect(summary.finalized).toContain(u.id);
    expect(await reasonOf(u.id)).toMatchObject({ status: 'REFUSED', terminalReason: reason });
  });

  it.each([
    ['deadline', 'FAILED', 'TIMEOUT', 'SCAN_DEADLINE'],
    ['cancelled', 'CANCELLED', null, null],
    ['failed', 'FAILED', 'TRANSIENT_INFRASTRUCTURE', null],
  ] as const)('RUNNING unit, scan cause %s -> %s', async (cause, status, failureClass, detail) => {
    const w = await worlds[cause]();
    const u = await makeUnit(w, { status: 'RUNNING', cls: 'PASSIVE_HTTP' });
    await expirePlanUnits(testDb, w.planId);
    expect(await reasonOf(u.id)).toMatchObject({ status, failureClass, terminalReason: detail });
  });

  it('a stop beats the deadline in every column', async () => {
    for (const status of [...PRE, 'RUNNING'] as const) {
      const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
      const u = await makeUnit(w, {
        status,
        cls: status === 'RUNNING' ? 'PASSIVE_HTTP' : 'BROWSER',
      });
      await triggerStop(testDb, {
        scope: 'SCAN',
        scopeId: w.scanId,
        triggeredBy: op,
        reason: 'OPERATOR_EMERGENCY_STOP',
      });
      await expirePlanUnits(testDb, w.planId);
      const r = await reasonOf(u.id);
      if (status === 'RUNNING')
        expect(r).toMatchObject({ status: 'KILLED', terminalReason: 'OPERATOR_EMERGENCY_STOP' });
      else expect(r).toMatchObject({ status: 'REFUSED', terminalReason: 'KILL_SWITCH_PENDING' });
    }
  });

  it('maps a user-cancellation stop on a RUNNING unit to CANCELLED, not KILLED', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w, { status: 'RUNNING', cls: 'PASSIVE_HTTP' });
    await triggerStop(testDb, {
      scope: 'SCAN',
      scopeId: w.scanId,
      triggeredBy: w.userId,
      reason: 'USER_CANCELLATION',
    });
    await expirePlanUnits(testDb, w.planId);
    expect((await reasonOf(u.id)).status).toBe('CANCELLED');
  });

  it('never touches a live plan, and is idempotent', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w, { status: 'RUNNING' });
    const s = await expirePlanUnits(testDb, w.planId);
    expect(s.untouched).toContain(u.id);
    expect(await statusOf(u.id)).toBe('RUNNING');

    const dead = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const p = await makeUnit(dead);
    await expirePlanUnits(testDb, dead.planId);
    const again = await expirePlanUnits(testDb, dead.planId);
    expect(again.finalized).toEqual([]);
    expect(await statusOf(p.id)).toBe('REFUSED');
  });

  it('processes predecessors first so a dependent ends BLOCKED, never REFUSED', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const a = await makeUnit(w);
    const b = await makeUnit(w);
    const c = await makeUnit(w);
    await addEdge(b.id, a.id);
    await addEdge(c.id, b.id);
    await expirePlanUnits(testDb, w.planId);
    expect(await reasonOf(a.id)).toMatchObject({ status: 'REFUSED' });
    expect(await reasonOf(b.id)).toMatchObject({ status: 'BLOCKED', blockedBy: a.id });
    expect(await reasonOf(c.id)).toMatchObject({ status: 'BLOCKED', blockedBy: b.id });
  });

  it('keeps a RUNNING non-passive unit non-terminal until the engine confirms, then fails it TERMINATION_UNCONFIRMED after the margin', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w, { status: 'RUNNING' });
    const pending = await expirePlanUnits(testDb, w.planId, {
      onUnitExpired: () => Promise.resolve('PENDING'),
    });
    expect(pending.pending).toEqual([u.id]);
    expect(await statusOf(u.id)).toBe('RUNNING');
    const noHook = await expirePlanUnits(testDb, w.planId);
    expect(noHook.pending).toEqual([u.id]);

    const late = await makeRuntimeWorld({ startedAgoMs: HOUR + 120_000, deadlineMs: HOUR });
    const v = await makeUnit(late, { status: 'RUNNING' });
    await expirePlanUnits(testDb, late.planId, {
      onUnitExpired: () => Promise.resolve('PENDING'),
      hardStopMarginMs: 60_000,
    });
    expect(await reasonOf(v.id)).toMatchObject({
      status: 'FAILED',
      failureClass: 'TRANSIENT_INFRASTRUCTURE',
      terminalReason: 'TERMINATION_UNCONFIRMED',
    });

    const ok = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const x = await makeUnit(ok, { status: 'RUNNING' });
    await expirePlanUnits(testDb, ok.planId, {
      onUnitExpired: () => Promise.resolve('TERMINATED'),
    });
    expect(await reasonOf(x.id)).toMatchObject({ status: 'FAILED', failureClass: 'TIMEOUT' });
  });

  it('treats an authorized-but-unconfirmed effect as "not confirmed gone"', async () => {
    const w = await makeRuntimeWorld({ deadlineMs: HOUR });
    const { u, c } = await runningUnit(w);
    expect(
      await authorizeEffect(testDb, {
        executionUnitId: u.id,
        userId: w.userId,
        hostInstanceId: c.host,
        attempt: 1,
        claimToken: c.token,
        kind: 'PROVISION',
        ordinal: 1,
        leaseClass: 'N',
      }),
    ).toMatchObject({ result: 'AUTHORIZED' });
    await setScan(w.scanId, { startedAt: new Date(Date.now() - HOUR - 5000) });
    const s = await expirePlanUnits(testDb, w.planId, {
      onUnitExpired: () => Promise.resolve('TERMINATED'),
    });
    expect(s.pending).toEqual([u.id]);
    expect(await statusOf(u.id)).toBe('RUNNING');
    await confirmEffect(testDb, {
      executionUnitId: u.id,
      attempt: 1,
      kind: 'PROVISION',
      ordinal: 1,
    });
    await expirePlanUnits(testDb, w.planId, { onUnitExpired: () => Promise.resolve('TERMINATED') });
    expect(await statusOf(u.id)).toBe('FAILED');
  });

  it('is safe to run concurrently and releases each lease exactly once', async () => {
    const w = await makeRuntimeWorld({ startedAgoMs: HOUR + 5000, deadlineMs: HOUR });
    const u = await makeUnit(w, { status: 'ADMITTED' });
    await requestAdmission(testDb, admissionRequest(w, { executionId: u.id }));
    expect(await liveLeaseCount(w.grantId)).toBe(1);
    await Promise.all(Array.from({ length: 6 }, () => expirePlanUnits(testDb, w.planId)));
    expect(await reasonOf(u.id)).toMatchObject({
      status: 'REFUSED',
      terminalReason: 'SCAN_DEADLINE_EXPIRED',
    });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect((await counterOf(w.grantId))!.activeConcurrency).toBe(0);
    expect(uid('x')).toBeTruthy();
  });
});
