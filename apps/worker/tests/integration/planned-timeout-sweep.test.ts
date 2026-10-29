/**
 * SPEC 009 U-1 (T-U1-6/7/8) against real PostgreSQL: the planned pass, the self-healing pass and the plan-unit
 * barrier. Legacy behaviour for scans without a plan is asserted alongside, because FR-040 says it must not move.
 */

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { debit } from '@webaudit/api/credits';
import {
  continueScanIfPlanTerminal,
  finalizeUnitAndContinue,
  type ModuleResultFinalizer,
} from '@webaudit/api/execution-runtime';
import {
  createTimeoutSweepHandler,
  scheduleTimeoutSweep,
} from '../../src/orchestrator/timeout-scheduler.js';

const noopPublisher = { publish: () => Promise.resolve(1) };
const MIN = 60_000;
let seq = 0;

async function world(
  opts: { state?: string; startedAgoMs?: number | null; modules?: string[] } = {},
) {
  const user = await db.user.create({
    data: {
      email: `u${String(++seq)}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  await db.creditLot.create({
    data: {
      userId: user.id,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      amountGranted: 100,
      amountRemaining: 100,
      expiresAt: null,
    },
  });
  const target = await db.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://example.com',
      displayName: 'x',
      controlLevel: 'NONE',
    },
  });
  const agoMs = opts.startedAgoMs === undefined ? 30 * MIN : opts.startedAgoMs;
  const scan = await db.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: (opts.modules ?? ['SECURITY', 'SEO']) as never,
      capabilitySnapshot: {},
      quotedCredits: 30,
      chargedCredits: 30,
      state: (opts.state ?? 'RUNNING_PHASE_1') as never,
      ...(agoMs === null ? {} : { startedAt: new Date(Date.now() - agoMs) }),
    },
  });
  await debit(db, { userId: user.id, amount: 30, reason: 'scan:create', scanId: scan.id });
  return { user, target, scan };
}

async function plan(
  w: Awaited<ReturnType<typeof world>>,
  deadlineMs: number,
  kind: 'INITIAL' | 'REVERIFY' = 'INITIAL',
) {
  return db.scanPlan.create({
    data:
      kind === 'INITIAL'
        ? { kind, userId: w.user.id, scanId: w.scan.id, state: 'RESOLVED', deadlineMs }
        : {
            kind,
            userId: w.user.id,
            reverifyIssueId: `issue-${String(++seq)}`,
            state: 'RESOLVED',
            deadlineMs,
            resolvedAt: new Date(Date.now() - deadlineMs - 5 * MIN),
          },
  });
}

async function unit(planId: string, userId: string, targetId: string, status = 'PLANNED') {
  const id = `unit-${String(++seq)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status)
     VALUES ($1,$2,$3,$4,'PASSIVE_HTTP','e','{}'::jsonb,0,1000,'{}'::jsonb,false,$5,$6::"ExecutionUnitStatus")`,
    id,
    planId,
    userId,
    targetId,
    `${id}:1`,
    status,
  );
  return { id, key: `${id}:1` };
}

const statusOf = async (id: string) =>
  (
    await db.$queryRawUnsafe<Array<{ s: string }>>(
      `SELECT status::text AS s FROM "ExecutionUnit" WHERE id=$1`,
      id,
    )
  )[0]!.s;
const run = () => createTimeoutSweepHandler({ db, publisher: noopPublisher })();
const refunds = async (scanId: string) =>
  db.creditTransaction.count({ where: { scanId, type: 'REFUND' } });

describe('planned timeout sweep (U-1 T-U1-6/7)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });
  afterAll(closeDb);

  it('leaves legacy behaviour unchanged: no plan, 30 min old -> TIMED_OUT and refunded', async () => {
    const w = await world();
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SECURITY', state: 'COMPLETE', score: 90 },
    });
    await run();
    expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe('TIMED_OUT');
    expect(await refunds(w.scan.id)).toBe(1);
  });

  it('does not time out a planned scan at the legacy 15 minutes; the plan deadline governs', async () => {
    const w = await world({ startedAgoMs: 30 * MIN });
    const p = await plan(w, 120 * MIN);
    const u = await unit(p.id, w.user.id, w.target.id, 'RUNNING');
    await run();
    expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe(
      'RUNNING_PHASE_1',
    );
    expect(await statusOf(u.id)).toBe('RUNNING');
    expect(await refunds(w.scan.id)).toBe(0);
  });

  it('after the plan deadline: expires every unit, then times out the scan and refunds only the undelivered share', async () => {
    const w = await world({ startedAgoMs: 130 * MIN });
    const p = await plan(w, 120 * MIN);
    const planned = await unit(p.id, w.user.id, w.target.id, 'PLANNED');
    const running = await unit(p.id, w.user.id, w.target.id, 'RUNNING');
    const dependent = await unit(p.id, w.user.id, w.target.id, 'PLANNED');
    await db.executionDependency.create({
      data: { executionUnitId: dependent.id, dependsOnExecutionUnitId: running.id },
    });
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SECURITY', state: 'COMPLETE', score: 90 },
    });

    await run();

    expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe('TIMED_OUT');
    expect(await statusOf(planned.id)).toBe('REFUSED');
    expect(await statusOf(running.id)).toBe('FAILED');
    // The dependent of an expired predecessor is BLOCKED, never REFUSED (topological order).
    expect(await statusOf(dependent.id)).toBe('BLOCKED');
    expect(await refunds(w.scan.id)).toBe(1);
    const refund = await db.creditTransaction.findFirst({
      where: { scanId: w.scan.id, type: 'REFUND' },
    });
    expect(refund!.amount).toBe(15); // SEO undelivered: half of 30, SECURITY delivered and charged

    await run();
    expect(await refunds(w.scan.id)).toBe(1); // a second sweep never refunds twice
  });

  it('races deadline expiry against unit completion without resuming the scan or refunding twice', async () => {
    const w = await world({ state: 'RUNNING_PHASE_3', startedAgoMs: 10 * MIN });
    const p = await plan(w, MIN);
    const running = await unit(p.id, w.user.id, w.target.id, 'RUNNING');
    let masterEnqueues = 0;

    await Promise.all([
      run(),
      finalizeUnitAndContinue(
        db,
        running.id,
        running.key,
        {
          kind: 'FAILED',
          failureClass: 'TIMEOUT',
          detail: 'SCAN_DEADLINE',
        },
        { enqueueMaster: () => (masterEnqueues++, Promise.resolve()) },
      ),
    ]);

    expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe('TIMED_OUT');
    expect(await statusOf(running.id)).toBe('FAILED');
    expect(await refunds(w.scan.id)).toBe(1);
    expect(masterEnqueues).toBe(0);
    await run();
    expect(await refunds(w.scan.id)).toBe(1);
  });

  it('self-heals units that outlived a cancelled scan or an expired REVERIFY plan', async () => {
    const cancelled = await world({ state: 'CANCELLED', startedAgoMs: 1 * MIN });
    const p1 = await plan(cancelled, 120 * MIN);
    const stuck = await unit(p1.id, cancelled.user.id, cancelled.target.id, 'PLANNED');

    const reverify = await world({ startedAgoMs: 1 * MIN });
    const p2 = await plan(reverify, 10 * MIN, 'REVERIFY');
    const old = await unit(p2.id, reverify.user.id, reverify.target.id, 'PLANNED');

    await run();
    expect(await statusOf(stuck.id)).toBe('REFUSED');
    expect(await statusOf(old.id)).toBe('REFUSED');
    expect((await db.scan.findUniqueOrThrow({ where: { id: reverify.scan.id } })).state).toBe(
      'RUNNING_PHASE_1',
    );
  });

  it('self-heals a terminal scan unit within one live repeat-scheduler interval', async () => {
    const redisAddress = process.env['EXEC_TEST_REDIS'] ?? '127.0.0.1:6399';
    const [host, port] = redisAddress.split(':');
    const connection = { host: host ?? '127.0.0.1', port: Number(port ?? 6399) };
    const prefix = `timeout-cadence-${Math.random().toString(36).slice(2, 8)}`;
    const queueName = 'webaudit-maintenance';
    const queue = new Queue(queueName, { connection, prefix });
    const publisher = new Redis(connection);
    const previousInterval = process.env['TIMEOUT_SWEEP_INTERVAL_MS'];
    process.env['TIMEOUT_SWEEP_INTERVAL_MS'] = '5000';
    const worker = new Worker(
      queueName,
      createTimeoutSweepHandler({ db: db as never, publisher }),
      { connection, prefix, concurrency: 1 },
    );
    let completedSweeps = 0;
    worker.on('completed', () => {
      completedSweeps += 1;
    });

    const sweepIntervalMs = 5_000;
    const hostLoopBoundMs = 5_000;
    try {
      await scheduleTimeoutSweep(queue);
      const startupDeadline = performance.now() + 10_000;
      while (completedSweeps === 0 && performance.now() < startupDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(completedSweeps).toBeGreaterThan(0);

      // Create the terminal scan only after one empty sweep completed, so this
      // measures the wait for the next scheduled invocation.
      const w = await world({ state: 'CANCELLED', startedAgoMs: 1_000 });
      const p = await plan(w, 120 * MIN);
      const pending = await unit(p.id, w.user.id, w.target.id);
      const startedAt = performance.now();
      const deadline = startedAt + sweepIntervalMs + hostLoopBoundMs;
      let status = await statusOf(pending.id);
      while (status === 'PLANNED' && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        status = await statusOf(pending.id);
      }

      expect(status).toBe('REFUSED');
      expect(performance.now() - startedAt).toBeLessThanOrEqual(sweepIntervalMs + hostLoopBoundMs);
      expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe(
        'CANCELLED',
      );
    } finally {
      await worker.close(true);
      await queue.obliterate({ force: true });
      await queue.close();
      await publisher.quit();
      if (previousInterval === undefined) delete process.env['TIMEOUT_SWEEP_INTERVAL_MS'];
      else process.env['TIMEOUT_SWEEP_INTERVAL_MS'] = previousInterval;
    }
  }, 25_000);

  it('keeps a RUNNING non-passive unit non-terminal inside the hard-stop margin, then fails it TERMINATION_UNCONFIRMED', async () => {
    const w = await world({ startedAgoMs: 120 * MIN + 20_000 });
    const p = await plan(w, 120 * MIN);
    await db.$executeRawUnsafe(
      `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status)
       VALUES ('browser-u',$1,$2,$3,'BROWSER','e','{}'::jsonb,0,1000,'{}'::jsonb,true,'browser-u:1','RUNNING')`,
      p.id,
      w.user.id,
      w.target.id,
    );
    await run();
    // No termination hook is registered for BROWSER here, so the unit is "not confirmed gone": it stays RUNNING while
    // the deadline passed less than the 60 s margin ago. The scan itself still ends TIMED_OUT (the sweep's guarded move).
    expect(await statusOf('browser-u')).toBe('RUNNING');
    expect((await db.scan.findUniqueOrThrow({ where: { id: w.scan.id } })).state).toBe('TIMED_OUT');
    // Once the margin has elapsed the self-healing pass finalizes it.
    await db.$executeRawUnsafe(
      `UPDATE "Scan" SET "startedAt" = "startedAt" - interval '5 minutes' WHERE id = $1`,
      w.scan.id,
    );
    await run();
    expect(await statusOf('browser-u')).toBe('FAILED');
  });
});

describe('plan-unit barrier (T-U1-8)', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });

  const enqueued = () => {
    let n = 0;
    return {
      get count() {
        return n;
      },
      enqueueMaster: () => ((n += 1), Promise.resolve()),
    };
  };

  async function atBarrier(startedAgoMs = 1 * MIN, deadlineMs = 60 * MIN) {
    const w = await world({ state: 'RUNNING_PHASE_3', startedAgoMs });
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SEO', state: 'DEGRADED', score: 50 },
    });
    const p = await plan(w, deadlineMs);
    return { w, p };
  }

  it("answers 'no-plan' for a legacy scan so the orchestrator's own continuation runs unchanged", async () => {
    const w = await world({ state: 'RUNNING_PHASE_3' });
    const e = enqueued();
    expect(await continueScanIfPlanTerminal(db, w.scan.id, e)).toBe('no-plan');
    expect(e.count).toBe(0);
  });

  it('waits while any unit is non-terminal and continues exactly when the last one finalizes', async () => {
    const { w, p } = await atBarrier();
    const a = await unit(p.id, w.user.id, w.target.id, 'RUNNING');
    const b = await unit(p.id, w.user.id, w.target.id, 'PLANNED');
    const e = enqueued();
    expect(await continueScanIfPlanTerminal(db, w.scan.id, e)).toBe('not-ready');
    const first = await finalizeUnitAndContinue(db, a.id, a.key, { kind: 'COMPLETED' }, e);
    expect(first.gate).toBe('not-ready');
    const last = await finalizeUnitAndContinue(
      db,
      b.id,
      b.key,
      { kind: 'REFUSED', reason: 'X' },
      e,
    );
    expect(last.gate).toBe('continued');
    expect(e.count).toBe(1);
  });

  it('is not ready before the barrier state or while legacy modules are still running', async () => {
    const early = await world({ state: 'RUNNING_PHASE_1' });
    await plan(early, 60 * MIN);
    expect(await continueScanIfPlanTerminal(db, early.scan.id, enqueued())).toBe('not-ready');

    const w = await world({ state: 'RUNNING_PHASE_3' });
    await plan(w, 60 * MIN);
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SECURITY', state: 'RUNNING' },
    });
    expect(await continueScanIfPlanTerminal(db, w.scan.id, enqueued())).toBe('not-ready');
  });

  it('refuses to continue after the plan deadline: only the sweep may end the scan', async () => {
    const { w } = await atBarrier(90 * MIN, 60 * MIN);
    const e = enqueued();
    expect(await continueScanIfPlanTerminal(db, w.scan.id, e)).toBe('deadline-passed');
    expect(e.count).toBe(0);
  });

  it('runs registered module-result finalizers first and treats the modules they own as theirs to write', async () => {
    const w = await world({
      state: 'RUNNING_PHASE_3',
      startedAgoMs: MIN,
      modules: ['SECURITY', 'TESTING'],
    });
    await db.moduleResult.create({
      data: { scanId: w.scan.id, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    const p = await plan(w, 60 * MIN);
    const calls: string[] = [];
    const owner: ModuleResultFinalizer = {
      ownedModules: ['TESTING'],
      finalizeModuleResults: (id) => (calls.push(id), Promise.resolve()),
    };
    const e = enqueued();
    expect(await continueScanIfPlanTerminal(db, w.scan.id, { ...e, finalizers: [owner] })).toBe(
      'continued',
    );
    expect(calls).toEqual([p.id]);
    // Without the finalizer owning TESTING, its missing ModuleResult row means the scan is not ready.
    expect(await continueScanIfPlanTerminal(db, w.scan.id, enqueued())).toBe('not-ready');
  });
});
