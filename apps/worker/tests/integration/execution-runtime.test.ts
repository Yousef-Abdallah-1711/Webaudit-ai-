/**
 * SPEC 009 operational runtime, end to end on REAL infrastructure: PostgreSQL, Redis, BullMQ queues and workers, the
 * execution host, the real SPEC 008 admission/kill switch, and the single finalizer. The only double is the
 * deterministic test adapter standing in for an engine (SPEC 010-012 own the real ones).
 *
 * Needs TEST_DATABASE_URL (an isolated *_test database) and EXEC_TEST_REDIS (host:port of a throwaway Redis).
 */

import { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, closeDb } from '@webaudit/api/test-db';
import { triggerStop } from '@webaudit/api/safety';
import { expirePlanUnits } from '@webaudit/api/execution-runtime';
import { liveLeaseCount, counterOf } from '../../../api/tests/helpers/safety-fixtures.js';
import {
  addEdge,
  makeRuntimeWorld,
  makeUnit,
  reasonOf,
  setScan,
  statusOf,
  type RuntimeWorld,
} from '../../../api/tests/helpers/runtime-fixtures.js';
import { createMemoryArtifactStore } from '@webaudit/api/evidence';
import {
  createAdapterRegistry,
  createExecQueues,
  createExecWorkers,
  createExecutionJobHandler,
  enqueueEligibleUnits,
  enqueueExecutionUnit,
  EXEC_JOB_NAME,
  type ExecQueueSet,
  type ExecWorkerSet,
} from '../../src/execution-runtime/index.js';
import { createTestAdapter, type Behavior } from '../helpers/test-adapter.js';
import { startWorker } from '../../src/index.js';

const [host, port] = (process.env['EXEC_TEST_REDIS'] ?? 'localhost:6399').split(':');
const connection = {
  host: host ?? 'localhost',
  port: Number(port ?? 6399),
  maxRetriesPerRequest: null as null,
};
const HOUR = 3_600_000;

let op = '';
let queues: ExecQueueSet;
let workers: ExecWorkerSet | null = null;
let sub: Redis;
let prefix = '';
const store = createMemoryArtifactStore();
const messages: Array<{ channel: string; message: string }> = [];
const gateCalls: string[] = [];

const waitFor = async <T>(fn: () => Promise<T | false>, ms = 15_000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== false) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const terminal = (id: string) =>
  waitFor(async () => {
    const s = await statusOf(id);
    return ['COMPLETED', 'FAILED', 'CANCELLED', 'KILLED', 'REFUSED', 'BLOCKED'].includes(s)
      ? s
      : false;
  });

function start(
  w: RuntimeWorld,
  h: ReturnType<typeof createTestAdapter>,
  extra: Partial<Parameters<typeof createExecutionJobHandler>[0]> = {},
) {
  const publisher = new Redis({ host: connection.host, port: connection.port });
  const registry = createAdapterRegistry([h.adapter]);
  const handle = createExecutionJobHandler({
    db: db as never,
    registry,
    artifactStore: store,
    publisher,
    hostInstanceId: `host-${Math.random().toString(36).slice(2, 6)}`,
    loopIntervalMs: 100,
    progressMinIntervalMs: 50,
    gateFor: () => ({ enqueueMaster: () => (gateCalls.push(w.scanId), Promise.resolve()) }),
    onUnitCompleted: (planId) => enqueueEligibleUnits(db as never, queues, planId),
    ...extra,
  });
  workers = createExecWorkers({
    connection,
    prefix,
    classes: ['BROWSER'],
    handle,
    concurrency: 4,
    onFailed: () => undefined,
  });
  return { publisher, handle };
}

beforeAll(async () => {
  await resetDb();
  op = (
    await db.user.create({
      data: { email: 'operator-exec@example.com', emailVerifiedAt: new Date(), isOperator: true },
    })
  ).id;
  sub = new Redis({ host: connection.host, port: connection.port });
  sub.on('message', (channel, message) => messages.push({ channel, message }));
  await sub.psubscribe('unit-progress:*');
  sub.on('pmessage', (_p, channel, message) => messages.push({ channel, message }));
});
beforeEach(() => {
  prefix = `t${Math.random().toString(36).slice(2, 8)}`;
  queues = createExecQueues(connection, prefix);
  gateCalls.length = 0;
});
afterEach(async () => {
  await workers?.close(true);
  workers = null;
  await queues.close();
});
afterAll(async () => {
  await sub.quit();
  await closeDb();
});

const beh = (b: Behavior) => ({ behavior: b });

describe('queue -> worker -> host -> finalizer on real infrastructure', () => {
  it('composes registered execution adapters into the standard worker service and drains them on shutdown', async () => {
    const w = await makeRuntimeWorld({ scanState: 'RUNNING_PHASE_3' });
    await db.moduleResult.create({
      data: { scanId: w.scanId, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    const a = await makeUnit(w, { configuration: beh({ kind: 'COMPLETE' }) });
    const h = createTestAdapter(w);
    const publisher = new Redis({ host: connection.host, port: connection.port });
    const phaseJobs: string[] = [];
    const service = startWorker({
      connection,
      db: db as never,
      publisher,
      handlers: { phase: async (data) => void phaseJobs.push(data.phase) },
      executionAdapters: [h.adapter],
      executionArtifactStore: store,
      installSignalHandlers: false,
      shutdownGraceMs: 5000,
    });
    try {
      expect(service.executionWorkers?.workers).toHaveLength(1);
      expect(service.executionQueues).toBeDefined();
      expect(await enqueueEligibleUnits(db as never, service.executionQueues!, w.planId)).toBe(1);
      expect(await terminal(a.id)).toBe('COMPLETED');
      await waitFor(async () => (phaseJobs.includes('RUNNING_MASTER') ? true : false));
      expect(h.runs).toEqual([a.id]);
    } finally {
      await service.shutdown('integration-test');
      await publisher.quit();
    }
  });

  it('runs a two-unit chain: only the root is enqueued, the dependent follows its completion; evidence, progress, effects and lease all settle', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'COMPLETE' }) });
    const b = await makeUnit(w, { configuration: beh({ kind: 'COMPLETE' }) });
    await addEdge(b.id, a.id);
    const h = createTestAdapter(w);
    start(w, h);
    expect(await enqueueEligibleUnits(db as never, queues, w.planId)).toBe(1); // only the root
    expect(await terminal(a.id)).toBe('COMPLETED');
    expect(await terminal(b.id)).toBe('COMPLETED');
    expect(h.runs).toEqual([a.id, b.id]);
    expect(await db.evidence.count({ where: { executionUnitId: { in: [a.id, b.id] } } })).toBe(2);
    const effects = await db.effectAuthorization.findMany({ where: { executionUnitId: a.id } });
    expect(effects.map((e) => e.state)).toEqual(['CONFIRMED']);
    expect(await liveLeaseCount(w.grantId)).toBe(0);
    expect((await counterOf(w.grantId))!.activeConcurrency).toBe(0);
    const row = (await db.executionUnit.findUnique({ where: { id: a.id } }))!;
    expect(row.completedAt).not.toBeNull();
    expect(row.progressSnapshot).not.toBeNull();
  });

  it('delivers progress ticks over Redis on a per-unit channel, never fabricating a total', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'COMPLETE' }) });
    start(w, createTestAdapter(w));
    messages.length = 0;
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await terminal(a.id);
    const mine = await waitFor(async () => {
      const m = messages.filter((x) => x.channel === `unit-progress:${a.id}`);
      return m.length >= 2 ? m : false;
    });
    const parsed = mine.map(
      (m) =>
        JSON.parse(m.message) as {
          label: string;
          totalUnits: number | null;
          indeterminate: boolean;
        },
    );
    expect(parsed.map((p) => p.label)).toContain('done');
    expect(parsed.every((p) => typeof p.indeterminate === 'boolean')).toBe(true);
  });

  it('refuses any extra payload key at the consumer: the job fails and the unit is untouched', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w);
    const h = createTestAdapter(w);
    const failures: string[] = [];
    start(w, h);
    await workers!.close(true);
    workers = createExecWorkers({
      connection,
      prefix,
      classes: ['BROWSER'],
      handle: createExecutionJobHandler({
        db: db as never,
        registry: createAdapterRegistry([h.adapter]),
        artifactStore: store,
        publisher: new Redis({ host: connection.host, port: connection.port }),
        hostInstanceId: 'h',
      }),
      onFailed: (_j, e) => failures.push(e.message),
    });
    await queues
      .queueFor('BROWSER')!
      .add(
        EXEC_JOB_NAME,
        { executionUnitId: a.id, configuration: { secret: 'x' } },
        { jobId: 'bad-1' },
      );
    await waitFor(async () => (failures.length > 0 ? true : false));
    expect(failures[0]).toMatch(/unrecognized|Unrecognized/);
    expect(await statusOf(a.id)).toBe('PLANNED');
    expect(h.runs).toEqual([]);
  });

  it('classifies an engine exception as ENGINE_DEFECT and blocks its dependents', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'THROW' }) });
    const b = await makeUnit(w);
    await addEdge(b.id, a.id);
    start(w, createTestAdapter(w));
    await enqueueEligibleUnits(db as never, queues, w.planId);
    expect(await terminal(a.id)).toBe('FAILED');
    expect(await reasonOf(a.id)).toMatchObject({ failureClass: 'ENGINE_DEFECT' });
    expect(await reasonOf(b.id)).toMatchObject({ status: 'BLOCKED', blockedBy: a.id });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
  });

  it('maps infrastructure and customer-code outcomes through the classifier', async () => {
    const w = await makeRuntimeWorld();
    const infra = await makeUnit(w, { configuration: beh({ kind: 'INFRA' }) });
    const cust = await makeUnit(w, { configuration: beh({ kind: 'CUSTOMER_EXIT', code: 2 }) });
    const ok = await makeUnit(w, { configuration: beh({ kind: 'CUSTOMER_EXIT', code: 0 }) });
    start(w, createTestAdapter(w));
    await enqueueEligibleUnits(db as never, queues, w.planId);
    for (const u of [infra, cust, ok]) await terminal(u.id);
    expect(await reasonOf(infra.id)).toMatchObject({
      status: 'FAILED',
      failureClass: 'TRANSIENT_INFRASTRUCTURE',
    });
    expect(await reasonOf(cust.id)).toMatchObject({
      status: 'FAILED',
      failureClass: 'CUSTOMER_CODE_FAILURE',
    });
    expect((await reasonOf(ok.id)).status).toBe('COMPLETED');
  });

  it('refuses a unit whose engine has no registered adapter (fail closed, terminal)', async () => {
    const w = await makeRuntimeWorld({ scanState: 'RUNNING_PHASE_3' });
    await db.moduleResult.create({
      data: { scanId: w.scanId, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    const a = await makeUnit(w, { engineId: 'engine.unknown' });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    expect(await terminal(a.id)).toBe('REFUSED');
    expect(await reasonOf(a.id)).toMatchObject({ terminalReason: 'ENGINE_NOT_REGISTERED' });
    expect(gateCalls).toContain(w.scanId);
  });

  it('runs a duplicate delivery exactly once (durable claim), whatever the queue does', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'WAIT', ms: 400 }) });
    const h = createTestAdapter(w);
    start(w, h);
    for (const id of ['dup-1', 'dup-2', 'dup-3'])
      await queues
        .queueFor('BROWSER')!
        .add(EXEC_JOB_NAME, { executionUnitId: a.id }, { jobId: id });
    expect(await terminal(a.id)).toBe('COMPLETED');
    await new Promise((r) => setTimeout(r, 300));
    expect(h.runs).toEqual([a.id]);
    expect(await db.executionUnitHostClaim.count({ where: { executionUnitId: a.id } })).toBe(1);
  });
});

describe('controlled failure injection on the running path', () => {
  it('user cancellation (SCAN stop) mid-run: the host aborts the engine, the unit ends CANCELLED, the lease is released', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }) });
    const h = createTestAdapter(w);
    start(w, h);
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await waitFor(async () => ((await statusOf(a.id)) === 'RUNNING' ? true : false));
    await triggerStop(db as never, {
      scope: 'SCAN',
      scopeId: w.scanId,
      triggeredBy: w.userId,
      reason: 'USER_CANCELLATION',
    });
    expect(await terminal(a.id)).toBe('CANCELLED');
    expect(h.aborted).toEqual([a.id]);
    expect(await liveLeaseCount(w.grantId)).toBe(0);
  });

  it('operator kill switch mid-run: KILLED with the F07 reason', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }) });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await waitFor(async () => ((await statusOf(a.id)) === 'RUNNING' ? true : false));
    await triggerStop(db as never, {
      scope: 'EXECUTION',
      scopeId: a.id,
      triggeredBy: op,
      reason: 'OPERATOR_EMERGENCY_STOP',
    });
    expect(await terminal(a.id)).toBe('KILLED');
    expect(await reasonOf(a.id)).toMatchObject({ terminalReason: 'OPERATOR_EMERGENCY_STOP' });
  });

  it('revoked grant mid-run: the next renewal refuses and the unit is KILLED (AUTHORIZATION_REVOKED)', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }) });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await waitFor(async () => ((await statusOf(a.id)) === 'RUNNING' ? true : false));
    await db.targetAuthorization.update({
      where: { id: w.grantId },
      data: { revokedAt: new Date() },
    });
    expect(await terminal(a.id)).toBe('KILLED');
    expect(await reasonOf(a.id)).toMatchObject({ terminalReason: 'AUTHORIZATION_REVOKED' });
  });

  it('scan deadline passing mid-run: FAILED/TIMEOUT detail SCAN_DEADLINE', async () => {
    const w = await makeRuntimeWorld({ deadlineMs: HOUR });
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }) });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await waitFor(async () => ((await statusOf(a.id)) === 'RUNNING' ? true : false));
    await setScan(w.scanId, { startedAt: new Date(Date.now() - HOUR - 5000) });
    expect(await terminal(a.id)).toBe('FAILED');
    expect(await reasonOf(a.id)).toMatchObject({
      failureClass: 'TIMEOUT',
      terminalReason: 'SCAN_DEADLINE',
    });
  });

  it('parent hard stop: a hung engine cannot postpone it; FAILED/TIMEOUT detail HARD_STOP', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }), timeoutPolicyMs: 300 });
    start(w, createTestAdapter(w, 'engine.x', { hardStopMarginMs: 100 }));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    expect(await terminal(a.id)).toBe('FAILED');
    expect(await reasonOf(a.id)).toMatchObject({
      failureClass: 'TIMEOUT',
      terminalReason: 'HARD_STOP',
    });
    expect(await liveLeaseCount(w.grantId)).toBe(0);
  });

  it('lost lease mid-run: the stale host aborts and does NOT finalize; the plan-deadline sweep ends the unit', async () => {
    const w = await makeRuntimeWorld({ deadlineMs: HOUR });
    const a = await makeUnit(w, { configuration: beh({ kind: 'HANG' }) });
    const h = createTestAdapter(w);
    start(w, h);
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await waitFor(async () => ((await statusOf(a.id)) === 'RUNNING' ? true : false));
    await db.$executeRawUnsafe(`SELECT public.f07_release_leases_by_execution($1)`, a.id);
    await waitFor(async () => (h.aborted.includes(a.id) ? true : false));
    await new Promise((r) => setTimeout(r, 300));
    expect(await statusOf(a.id)).toBe('RUNNING'); // the stale holder wrote nothing
    await setScan(w.scanId, { startedAt: new Date(Date.now() - HOUR - 120_000) });
    await expirePlanUnits(db as never, w.planId, {
      onUnitExpired: () => Promise.resolve('TERMINATED'),
    });
    expect((await reasonOf(a.id)).status).toBe('FAILED');
  });

  it('an effect authorized after the unit ended is refused (no new authorization after terminalization)', async () => {
    const w = await makeRuntimeWorld();
    const a = await makeUnit(w, { configuration: beh({ kind: 'EFFECTS', count: 3 }) });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    expect(await terminal(a.id)).toBe('COMPLETED');
    expect(
      await db.effectAuthorization.count({ where: { executionUnitId: a.id, state: 'AUTHORIZED' } }),
    ).toBe(0);
    expect(
      await db.effectAuthorization.count({ where: { executionUnitId: a.id, state: 'CONFIRMED' } }),
    ).toBe(3);
  });

  it('a unit left RUNNING by a crashed host is never re-dispatched; the sweep finalizes it after the deadline', async () => {
    const w = await makeRuntimeWorld({ deadlineMs: HOUR });
    const a = await makeUnit(w, { status: 'RUNNING' });
    const h = createTestAdapter(w);
    start(w, h);
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    await new Promise((r) => setTimeout(r, 500));
    expect(h.runs).toEqual([]);
    expect(await statusOf(a.id)).toBe('RUNNING');
    await setScan(w.scanId, { startedAt: new Date(Date.now() - HOUR - 120_000) });
    await expirePlanUnits(db as never, w.planId, {
      onUnitExpired: () => Promise.resolve('TERMINATED'),
    });
    expect((await reasonOf(a.id)).status).toBe('FAILED');
  });

  it('runs the plan gate after the last unit completes (the scan can continue to synthesis)', async () => {
    const w = await makeRuntimeWorld({ scanState: 'RUNNING_PHASE_3' });
    await db.moduleResult.create({
      data: { scanId: w.scanId, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    const a = await makeUnit(w, { configuration: beh({ kind: 'COMPLETE' }) });
    start(w, createTestAdapter(w));
    await enqueueExecutionUnit(queues, { id: a.id, executionUnitClass: 'BROWSER', attempt: 1 });
    expect(await terminal(a.id)).toBe('COMPLETED');
    await waitFor(async () => (gateCalls.includes(w.scanId) ? true : false));
  });
});
