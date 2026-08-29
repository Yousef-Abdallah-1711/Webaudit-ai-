/**
 * R4 — "never block on human input", and the race that falls out of it.
 *
 * CLAUDE.md lists this as one of the things that is easy to get wrong: "Never
 * block a worker on human input. The questionnaire persists state and releases
 * the slot." And it names the architecture document as wrong on exactly this
 * point — that sketch awaits the answer inside the job for up to ten minutes,
 * which at four phase workers means four idle users stop every paid audit on the
 * platform.
 *
 * So this suite asserts two things that are easy to lose in a refactor:
 *
 *   1. **`awaitQuestionnaire` returns.** Not quickly — *returns*, with nothing
 *      pending on a human. The test asserts it resolves without the answer ever
 *      arriving, which no amount of "it has a timeout" satisfies.
 *   2. **Exactly one side of the race wins.** The user's answer and the delayed
 *      deadline job both try to resume. One enqueues phase 2; the other is a
 *      no-op, not an error. A second phase-2 job would run the design area twice
 *      and charge twice.
 */

import { describe, expect, it } from 'vitest';
import type { ModuleType, ScanState } from '@webaudit/types';
import {
  awaitQuestionnaire,
  resumeAfterQuestionnaire,
  skipQuestionnaire,
  type EnqueueContext,
} from '../../src/orchestrator/phases.js';
import { createScanEmitter } from '../../src/orchestrator/emit.js';

const MODULES: readonly ModuleType[] = ['UI'];

/** A scan store with one row, guarded exactly as Prisma's `updateMany` is. */
function store(initial: ScanState) {
  const row: { state: ScanState; extra: Record<string, unknown> } = { state: initial, extra: {} };
  let updateCalls = 0;

  return {
    row,
    get updateCalls() {
      return updateCalls;
    },
    db: {
      scan: {
        updateMany: (args: {
          where: { id: string; state: ScanState };
          data: Record<string, unknown>;
        }) => {
          updateCalls += 1;
          // The guard: matches only if the state is still what the caller expects.
          if (row.state !== args.where.state) return Promise.resolve({ count: 0 });
          const { state, ...rest } = args.data;
          row.state = state as ScanState;
          row.extra = { ...row.extra, ...rest };
          return Promise.resolve({ count: 1 });
        },
        findUnique: () => Promise.resolve({ state: row.state }),
      },
    },
  };
}

/** Queues that record rather than connect. */
function queues() {
  const phase: { name: string; data: unknown; opts: unknown }[] = [];
  const maintenance: { name: string; data: unknown; opts: unknown }[] = [];
  return {
    phase,
    maintenance,
    scanPhaseQueue: {
      add: (name: string, data: unknown, opts: unknown) => {
        phase.push({ name, data, opts });
        return Promise.resolve({ id: 'j' });
      },
    },
    maintenanceQueue: {
      add: (name: string, data: unknown, opts: unknown) => {
        maintenance.push({ name, data, opts });
        return Promise.resolve({ id: 'j' });
      },
    },
  };
}

function context(scanId: string, initial: ScanState) {
  const s = store(initial);
  const q = queues();
  const published: unknown[] = [];
  const emitter = createScanEmitter(scanId, {
    publisher: {
      publish: (_channel, message) => {
        published.push(JSON.parse(message));
        return Promise.resolve(1);
      },
    },
  });

  const ctx = {
    scanPhaseQueue: q.scanPhaseQueue,
    maintenanceQueue: q.maintenanceQueue,
    db: s.db,
    emitter,
    planQueuePriority: 20,
  } as unknown as EnqueueContext;

  return { ctx, store: s, queues: q, published };
}

const QUESTIONS = [{ id: 'audience', prompt: 'Who is this for?', kind: 'text' as const }] as const;

describe('R4 - the questionnaire pause never blocks a worker', () => {
  it('returns without the answer ever arriving', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'RUNNING_PHASE_1');

    // No answer is ever supplied. If this awaited human input it would hang and
    // the test would time out rather than fail — which is itself the signal.
    const result = await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      waitMs: 600_000,
      modules: MODULES,
    });

    expect(result.paused).toBe(true);
    expect(s.row.state).toBe('AWAITING_QUESTIONNAIRE');
    // The wait is a row plus a delayed job, not a promise.
    expect(s.row.extra['questionnaireDeadline']).toBeInstanceOf(Date);
    expect(q.maintenance).toHaveLength(1);
    expect((q.maintenance[0]?.opts as { delay: number }).delay).toBe(600_000);
  });

  it('returns fast, because there is nothing to wait for', async () => {
    const { ctx } = context('scan_1', 'RUNNING_PHASE_1');
    const started = Date.now();
    await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      // A ten-minute wait. The call must not take ten minutes.
      waitMs: 600_000,
      modules: MODULES,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('enqueues no phase job while paused', async () => {
    // FR-043: nothing else is waiting on the design area, and nothing has been
    // scheduled to run while the user is deciding.
    const { ctx, queues: q } = context('scan_1', 'RUNNING_PHASE_1');
    await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      waitMs: 1000,
      modules: MODULES,
    });
    expect(q.phase).toHaveLength(0);
  });

  it('schedules the deadline job with a deterministic id, so re-entry does not double it', async () => {
    const { ctx, queues: q } = context('scan_1', 'RUNNING_PHASE_1');
    await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      waitMs: 1000,
      modules: MODULES,
    });
    // No colon: BullMQ throws "Custom Id cannot contain :" for a custom id
    // that contains one and does not split into exactly three segments — see
    // `phases.ts` and `questionnaire-jobid.test.ts` for the real-queue proof.
    expect((q.maintenance[0]?.opts as { jobId: string }).jobId).toBe(
      'questionnaire-deadline_scan_1',
    );
  });

  it('announces the pause with a deadline the client can count down to', async () => {
    const { ctx, published } = context('scan_1', 'RUNNING_PHASE_1');
    await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      waitMs: 1000,
      modules: MODULES,
    });

    const types = (published as { event: { type: string } }[]).map((p) => p.event.type);
    // State first, then the prompt: a client that sees the prompt must already
    // be able to fetch a state that explains it (FR-047).
    expect(types).toEqual(['scan:state', 'questionnaire:needed']);

    const prompt = (published[1] as { event: { deadline: string; questions: unknown[] } }).event;
    expect(new Date(prompt.deadline).getTime()).toBeGreaterThan(Date.now());
    expect(prompt.questions).toHaveLength(1);
  });

  it('does not pause a scan that is no longer in phase 1', async () => {
    // Cancelled while the design area was deciding it needed intent.
    const { ctx, store: s, queues: q } = context('scan_1', 'CANCELLED');
    const result = await awaitQuestionnaire(ctx, {
      scanId: 'scan_1',
      questions: [...QUESTIONS],
      waitMs: 1000,
      modules: MODULES,
    });

    expect(result.paused).toBe(false);
    expect(s.row.state).toBe('CANCELLED');
    expect(q.maintenance).toHaveLength(0);
  });
});

describe('R4 - exactly one side of the race resumes the scan', () => {
  it('lets the answer win and makes the deadline a no-op', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'AWAITING_QUESTIONNAIRE');

    const answered = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'ANSWERED',
      modules: MODULES,
    });
    const deadline = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'DEADLINE',
      modules: MODULES,
    });

    expect(answered.resumed).toBe(true);
    expect(deadline.resumed).toBe(false);
    expect(s.row.state).toBe('RUNNING_PHASE_2');
    // One phase-2 job. Two would run the design area twice and charge twice.
    expect(q.phase).toHaveLength(1);
  });

  it('lets the deadline win and makes a late answer a no-op', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'AWAITING_QUESTIONNAIRE');

    const deadline = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'DEADLINE',
      modules: MODULES,
    });
    const late = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'ANSWERED',
      modules: MODULES,
    });

    expect(deadline.resumed).toBe(true);
    expect(late.resumed).toBe(false);
    expect(s.row.state).toBe('RUNNING_PHASE_2');
    expect(q.phase).toHaveLength(1);
  });

  it('survives both arriving at once', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'AWAITING_QUESTIONNAIRE');

    const [a, b] = await Promise.all([
      resumeAfterQuestionnaire(ctx, { scanId: 'scan_1', reason: 'ANSWERED', modules: MODULES }),
      resumeAfterQuestionnaire(ctx, { scanId: 'scan_1', reason: 'DEADLINE', modules: MODULES }),
    ]);

    // Exactly one, whichever it was.
    expect([a.resumed, b.resumed].filter(Boolean)).toHaveLength(1);
    expect(s.row.state).toBe('RUNNING_PHASE_2');
    expect(q.phase).toHaveLength(1);
  });

  it('loses the race without raising, because losing is not a fault', async () => {
    // A user answering two seconds before the deadline is not an error, and
    // neither is a timeout firing while an answer is in flight.
    const { ctx } = context('scan_1', 'RUNNING_PHASE_2');
    await expect(
      resumeAfterQuestionnaire(ctx, { scanId: 'scan_1', reason: 'DEADLINE', modules: MODULES }),
    ).resolves.toMatchObject({ resumed: false });
  });

  it('refuses to resume a cancelled scan', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'CANCELLED');
    const result = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'ANSWERED',
      modules: MODULES,
    });

    expect(result.resumed).toBe(false);
    expect(s.row.state).toBe('CANCELLED');
    expect(q.phase).toHaveLength(0);
  });

  it('treats a skip as an answer, sharing the same guarded path (FR-042)', async () => {
    const { ctx, store: s, queues: q } = context('scan_1', 'AWAITING_QUESTIONNAIRE');
    const skipped = await skipQuestionnaire(ctx, { scanId: 'scan_1', modules: MODULES });

    expect(skipped.resumed).toBe(true);
    expect(skipped.reason).toBe('SKIPPED');
    expect(s.row.state).toBe('RUNNING_PHASE_2');
    expect(q.phase).toHaveLength(1);

    // And the deadline job that is still pending does nothing when it fires.
    const late = await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'DEADLINE',
      modules: MODULES,
    });
    expect(late.resumed).toBe(false);
    expect(q.phase).toHaveLength(1);
  });

  it('clears the deadline when it resumes, so nothing looks still-pending', async () => {
    const { ctx, store: s } = context('scan_1', 'AWAITING_QUESTIONNAIRE');
    await resumeAfterQuestionnaire(ctx, {
      scanId: 'scan_1',
      reason: 'ANSWERED',
      modules: MODULES,
    });
    expect(s.row.extra['questionnaireDeadline']).toBeNull();
  });
});

describe('an emitter is bound to its scan', () => {
  it('refuses an event for a different scan', async () => {
    // A phase job holding two ids could otherwise publish progress into a room
    // its owner cannot see.
    const emitter = createScanEmitter('scan_1', {
      publisher: { publish: () => Promise.resolve(1) },
    });

    await expect(
      emitter.emit(
        { type: 'scan:state', scanId: 'scan_2', state: 'RUNNING_PHASE_1', progressPercent: 15 },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow(/bound to scan scan_1/);
  });
});
