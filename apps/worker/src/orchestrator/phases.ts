/**
 * T096 — phase enqueueing that never blocks on human input.
 *
 * This file is R4. The architecture document's sketch awaits the questionnaire
 * answer inside the job for up to ten minutes; R4 rejects that, and the reason is
 * arithmetic rather than taste. At the published concurrency limits — 4 phase
 * workers in `CONCURRENCY` — four pending questionnaires hold every slot, and
 * every paid audit behind them stops. The wait is measured in minutes and the
 * queue is measured in slots, so a handful of users who wandered off take the
 * platform down for everyone. CLAUDE.md lists this as one of the three places the
 * architecture doc is wrong.
 *
 * So the design phase, on needing intent:
 *
 *   1. writes `AWAITING_QUESTIONNAIRE` with a deadline,
 *   2. emits `questionnaire:needed`,
 *   3. **returns** — releasing the worker slot,
 *   4. and schedules a delayed job at the deadline.
 *
 * `awaitQuestionnaire` does exactly those four things and contains no `await` on
 * anything a human does. There is no timer, no polling loop, and no promise held
 * open: the wait is a database row plus a delayed job, which is why it survives a
 * worker restart. That is the "resumable" in R4's title.
 *
 * **The race, and why both sides are safe.** Whichever arrives first — the user's
 * answers or the delayed timeout job — calls `resumeAfterQuestionnaire`, which
 * transitions under the optimistic guard in `state-machine.ts`. The winner
 * enqueues phase 2. The loser gets `moved: false` and returns, having done
 * nothing. Neither path treats losing as an error, because neither is: a user
 * answering two seconds before the deadline is not a fault, and a timeout firing
 * while an answer is in flight is not either.
 */

import type { Queue } from 'bullmq';
import type { ModuleType, ScanState } from '@webaudit/types';
import { priorityForPlan } from '../queue/queues.js';
import { transition, type ScanStateStore, type TransitionOutcome } from './state-machine.js';
import { progressPercentFor } from './state-machine.js';
import type { ScanEmitter } from './emit.js';

/** The payload on the phase queue. Validated on the consuming side. */
export interface PhaseJobData {
  readonly scanId: string;
  readonly phase: ScanState;
  /** Which areas this phase runs. Resolved once at scan start (R10). */
  readonly modules: readonly ModuleType[];
  /**
   * Not the prompt. R8's `RedactedPrompt` cannot survive a queue — registry
   * membership is per-object — so a phase job carries the scan id and the phase
   * assembles its own prompt on the far side.
   */
  readonly attempt: number;
}

/** The delayed job that fires at the questionnaire deadline. */
export interface QuestionnaireTimeoutJobData {
  readonly scanId: string;
  readonly kind: 'questionnaire-deadline';
  /** Guards the transition, so a stale delayed job cannot move a resumed scan. */
  readonly expectedState: 'AWAITING_QUESTIONNAIRE';
}

export interface EnqueueContext {
  readonly scanPhaseQueue: Queue;
  readonly maintenanceQueue: Queue;
  readonly db: ScanStateStore;
  readonly emitter: ScanEmitter;
  /** From `Plan.queuePriority`, clamped by `priorityForPlan`. */
  readonly planQueuePriority: number;
}

function jobIdFor(scanId: string, phase: ScanState, attempt: number): string {
  // Deterministic, so an accidental double-enqueue of the same phase is one job.
  // BullMQ deduplicates on job id, which turns an at-least-once delivery into
  // at-most-once work for a phase that has already been queued.
  return `${scanId}:${phase}:${String(attempt)}`;
}

/**
 * Queue one phase.
 *
 * Deliberately does not transition the scan: the phase job sets its own state
 * when it starts running. Enqueueing and running are different moments, and
 * marking a scan `RUNNING_PHASE_2` while it sits in a queue would make the
 * progress bar claim work that has not begun.
 */
export async function enqueuePhase(
  context: EnqueueContext,
  data: PhaseJobData,
): Promise<{ readonly jobId: string }> {
  const jobId = jobIdFor(data.scanId, data.phase, data.attempt);
  await context.scanPhaseQueue.add('phase', data, {
    jobId,
    priority: priorityForPlan(context.planQueuePriority),
  });
  return { jobId };
}

export interface AwaitQuestionnaireInput {
  readonly scanId: string;
  readonly questions: readonly {
    readonly id: string;
    readonly prompt: string;
    readonly kind: 'text' | 'choice' | 'colors';
    readonly choices?: readonly string[];
  }[];
  /** FR-041's published waiting period. */
  readonly waitMs: number;
  readonly modules: readonly ModuleType[];
}

/**
 * Pause for design intent without holding a worker.
 *
 * Returns as soon as the state is written, the event is out, and the delayed job
 * is scheduled. The caller's job function should return immediately after this —
 * that return is what releases the slot, and it is the entire point.
 */
export async function awaitQuestionnaire(
  context: EnqueueContext,
  input: AwaitQuestionnaireInput,
): Promise<{ readonly paused: boolean; readonly deadline: Date }> {
  const deadline = new Date(Date.now() + input.waitMs);

  // 1 and 2: persist the pause, then announce it. `emit` enforces that order.
  const outcome = await moveAndAnnounce(context, {
    scanId: input.scanId,
    from: 'RUNNING_PHASE_1',
    to: 'AWAITING_QUESTIONNAIRE',
    extra: { questionnaireDeadline: deadline },
  });

  if (!outcome.moved) return { paused: false, deadline };

  await context.emitter.emit(
    {
      type: 'questionnaire:needed',
      scanId: input.scanId,
      questions: input.questions,
      deadline: deadline.toISOString(),
    },
    // Already persisted by the transition above. The deadline *is* the record.
    () => Promise.resolve(),
  );

  // 4: the delayed job. On the maintenance queue, because nothing is waiting on
  // it and it must never displace an audit.
  await context.maintenanceQueue.add(
    'questionnaire-deadline',
    {
      scanId: input.scanId,
      kind: 'questionnaire-deadline',
      expectedState: 'AWAITING_QUESTIONNAIRE',
    } satisfies QuestionnaireTimeoutJobData,
    {
      delay: input.waitMs,
      // Deterministic, so re-entering the pause does not schedule two sweeps.
      //
      // No colon: BullMQ (`Job.create` in `job.js`) throws "Custom Id cannot
      // contain :" for any custom id containing one, unless it splits into
      // exactly three colon-separated segments — a legacy carve-out for
      // repeatable-job ids shaped `name:hash:timestamp`. `jobIdFor` in this
      // same file is three segments and survives by construction; this one was
      // two and threw the instant it ran against a real queue, which no test
      // caught because the suite that proves this function's race safety uses
      // an in-memory queue double that does not replicate BullMQ's own
      // validation. `questionnaire-jobid.test.ts` now runs this against a real
      // one.
      jobId: `questionnaire-deadline_${input.scanId}`,
    },
  );

  // 3: return. No await on anything human. See the module note.
  return { paused: true, deadline };
}

export type ResumeReason = 'ANSWERED' | 'SKIPPED' | 'DEADLINE';

/**
 * Resume phase 2, from whichever side of the race got here first.
 *
 * Both callers — the API when the user answers or skips, and the delayed job at
 * the deadline — go through this. The guard decides; the loser is a no-op.
 */
export async function resumeAfterQuestionnaire(
  context: EnqueueContext,
  input: {
    readonly scanId: string;
    readonly reason: ResumeReason;
    readonly modules: readonly ModuleType[];
  },
): Promise<{ readonly resumed: boolean; readonly reason: ResumeReason }> {
  const outcome = await moveAndAnnounce(context, {
    scanId: input.scanId,
    from: 'AWAITING_QUESTIONNAIRE',
    to: 'RUNNING_PHASE_2',
    // FR-041: the report must record that intent was not supplied.
    extra: { questionnaireDeadline: null },
  });

  if (!outcome.moved) {
    // Lost the race, or the scan was cancelled or timed out while waiting. All
    // three mean somebody else owns what happens next.
    return { resumed: false, reason: input.reason };
  }

  await enqueuePhase(context, {
    scanId: input.scanId,
    phase: 'RUNNING_PHASE_2',
    modules: input.modules,
    attempt: 1,
  });

  return { resumed: true, reason: input.reason };
}

/**
 * FR-042: skip the questionnaire and continue immediately.
 *
 * The same path as answering. A skip is an answer of "use the defaults", and
 * giving it its own transition would double the number of edges out of
 * `AWAITING_QUESTIONNAIRE` for no behavioural difference.
 */
export function skipQuestionnaire(
  context: EnqueueContext,
  input: { readonly scanId: string; readonly modules: readonly ModuleType[] },
): Promise<{ readonly resumed: boolean; readonly reason: ResumeReason }> {
  return resumeAfterQuestionnaire(context, { ...input, reason: 'SKIPPED' });
}

/**
 * FR-043: phase 1's other areas are unaffected by the pause.
 *
 * Nothing to implement — it falls out of the design, and this function exists to
 * say so where someone would look for it. Phase 1 areas have already completed
 * and been emitted by the time the design phase asks for intent; the pause is
 * between phases, so there is nothing running to block.
 */
export function questionnaireBlocksNothingElse(): true {
  return true;
}

/** Transition, then emit `scan:state`. The two always go together. */
async function moveAndAnnounce(
  context: EnqueueContext,
  input: { scanId: string; from: ScanState; to: ScanState; extra?: Record<string, unknown> },
): Promise<TransitionOutcome> {
  const outcome = await transition(context.db, input);
  if (!outcome.moved) return outcome;

  await context.emitter.emit(
    {
      type: 'scan:state',
      scanId: input.scanId,
      state: input.to,
      progressPercent: progressPercentFor(input.to),
    },
    // The transition already wrote it. `emit`'s contract is that the state is
    // durable before the event goes out, and it is.
    () => Promise.resolve(),
  );
  return outcome;
}

export { moveAndAnnounce };
