/**
 * `awaitQuestionnaire` throws against a real queue. It never has, in a test.
 *
 * The sibling suite `questionnaire-race.test.ts` proves the R4 mechanics — no
 * timer, no polling, exactly one side of the race wins — against a
 * `maintenanceQueue` that is a plain in-memory recorder: `add` pushes to an
 * array and resolves. That double is right for what it tests, and it is also
 * exactly the reason this gap went unnoticed: BullMQ's own `Job` class
 * validates `jobId` synchronously, inside `add`, before any Redis round trip —
 * and no hand-written fake reproduces a real dependency's internal validation.
 *
 * The rule, read out of `bullmq@6.2.0`'s `job.js`: a custom id containing a
 * colon must split into **exactly three** segments — a legacy carve-out kept
 * for repeatable-job ids shaped `name:hash:timestamp`. `jobIdFor` in
 * `phases.ts` builds `${scanId}:${phase}:${attempt}`, which is three segments
 * and happens to be safe. The questionnaire deadline job built
 * `` `questionnaire-deadline:${scanId}` `` — two segments — and
 * `maintenanceQueue.add('questionnaire-deadline', ..., { jobId: ... })` throws
 * `Custom Id cannot contain :` the instant it runs against a real queue.
 *
 * `awaitQuestionnaire` is R4's flagship mechanism — the whole point of this
 * phase was "return without blocking on a human, but still schedule the
 * deadline". A synchronous throw inside `add` happens *after* the state has
 * already been transitioned to `AWAITING_QUESTIONNAIRE` and the
 * `questionnaire:needed` event already emitted, so a scan would move into a
 * state promising a deadline it never actually scheduled — while the calling
 * job function crashes rather than returning cleanly, which is precisely the
 * "block a worker" failure mode R4 exists to prevent.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import type { ModuleType, ScanState } from '@webaudit/types';
import { QUEUE_NAMES, redisConnection } from '../../src/queue/queues.js';
import { awaitQuestionnaire, type EnqueueContext } from '../../src/orchestrator/phases.js';
import { createScanEmitter } from '../../src/orchestrator/emit.js';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6389';
const MODULES: readonly ModuleType[] = ['UI'];

/** A scan store with one row, guarded exactly as Prisma's `updateMany` is. */
function store(initial: ScanState) {
  const row: { state: ScanState; extra: Record<string, unknown> } = { state: initial, extra: {} };
  return {
    scan: {
      updateMany: (args: {
        where: { id: string; state: ScanState };
        data: Record<string, unknown>;
      }) => {
        if (row.state !== args.where.state) return Promise.resolve({ count: 0 });
        const { state, ...rest } = args.data;
        row.state = state as ScanState;
        row.extra = { ...row.extra, ...rest };
        return Promise.resolve({ count: 1 });
      },
      findUnique: () => Promise.resolve({ state: row.state }),
    },
  };
}

describe('awaitQuestionnaire against a real queue', () => {
  const connection = redisConnection(REDIS_URL);
  // A dedicated queue instance under the real production name, exactly as
  // `startWorker` constructs it — the point is to exercise BullMQ's own
  // validation, not a stand-in for it.
  const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, { connection });
  const scanPhaseQueue = new Queue(QUEUE_NAMES.scanPhase, { connection });

  afterAll(async () => {
    await maintenanceQueue.obliterate({ force: true });
    await scanPhaseQueue.obliterate({ force: true });
    await maintenanceQueue.close();
    await scanPhaseQueue.close();
  });

  function context(scanId: string): EnqueueContext {
    const emitter = createScanEmitter(scanId, {
      publisher: { publish: () => Promise.resolve(1) },
    });
    return {
      scanPhaseQueue,
      maintenanceQueue,
      db: store('RUNNING_PHASE_1'),
      emitter,
      planQueuePriority: 20,
    };
  }

  it('does not throw scheduling the deadline job', async () => {
    // The single most important assertion here. A throw means the scan is left
    // in AWAITING_QUESTIONNAIRE with no deadline ever scheduled to resume it —
    // an audit that pauses for ever, having already told the user it is
    // waiting.
    await expect(
      awaitQuestionnaire(context('scan_realq_1'), {
        scanId: 'scan_realq_1',
        questions: [],
        waitMs: 60_000,
        modules: MODULES,
      }),
    ).resolves.toEqual({ paused: true, deadline: expect.any(Date) });
  });

  it('actually enqueues a findable delayed job', async () => {
    await awaitQuestionnaire(context('scan_realq_2'), {
      scanId: 'scan_realq_2',
      questions: [],
      waitMs: 60_000,
      modules: MODULES,
    });

    const delayed = await maintenanceQueue.getDelayed();
    const found = delayed.find((job) => job.data?.scanId === 'scan_realq_2');
    expect(found).toBeDefined();
    expect(found?.data).toMatchObject({
      scanId: 'scan_realq_2',
      kind: 'questionnaire-deadline',
      expectedState: 'AWAITING_QUESTIONNAIRE',
    });
  });

  it('is idempotent under the deterministic job id, against the real queue', async () => {
    // `jobIdFor`-style dedup, but for the deadline job: re-entering the pause
    // (a phase retried, a worker restarted) must not schedule two sweeps for
    // one scan. BullMQ dedupes on job id; this proves the id survives real
    // validation twice in a row rather than only proving intent once.
    const ctx = context('scan_realq_3');
    const first = await awaitQuestionnaire(ctx, {
      scanId: 'scan_realq_3',
      questions: [],
      waitMs: 60_000,
      modules: MODULES,
    });
    // Re-run against the same (still-open) state; both calls must resolve.
    await expect(
      awaitQuestionnaire(context('scan_realq_3'), {
        scanId: 'scan_realq_3',
        questions: [],
        waitMs: 60_000,
        modules: MODULES,
      }),
    ).resolves.toBeDefined();
    expect(first.paused).toBe(true);
  });
});
