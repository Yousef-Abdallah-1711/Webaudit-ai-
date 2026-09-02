/**
 * T104a — the consuming half of the queue.
 *
 * `queues.ts` builds producers. Until this file existed there was no `Worker`
 * anywhere in the repository, which means every job `phases.ts` enqueues — a
 * phase, a questionnaire deadline — landed in Redis and stayed there. The
 * orchestrator, the state machine and the timeout sweep were all built, tested,
 * and unreachable: nothing ever called them, because nothing ever pulled a job.
 *
 * **This file deliberately does not run an audit.** The orchestrator run loop is
 * T113, in Phase 3, and writing it here would be building ahead of the task list.
 * What this file provides is the boundary that loop drops into: the process that
 * connects to Redis, the concurrency budget per queue, the payload validation,
 * and the shutdown that lets in-flight work finish.
 *
 * **The placeholder throws, and that is the point.** The obvious shortcut — a
 * processor that logs "TODO" and resolves — is worse than having no consumer at
 * all, and the difference is not stylistic. BullMQ treats a resolved processor as
 * a completed job: it is removed, it will not be retried, and the scan that was
 * waiting on it has been told the phase finished. Credits were already debited
 * before the job was enqueued (Principle VI charges before work), so the user has
 * paid for an audit that measured nothing and will never be re-run. A job that
 * sits unconsumed costs time and is obviously broken. A job that lies costs money
 * and looks healthy. So the placeholder fails, by name, saying which task
 * replaces it.
 *
 * **Payloads are validated before the handler, not inside it.** CLAUDE.md:
 * "Validate at every boundary with Zod — HTTP input, capability output, AI
 * responses, queue payloads." A queue is a real boundary here and not a formality
 * — during a rolling deploy last release's producer is still writing jobs that
 * this release's consumer picks up, and a job payload has been through JSON, so
 * every type guarantee the producer had is gone by the time it arrives. Parsing
 * here means T113's loop receives a `PhaseJobData` it can trust, and a shape
 * mismatch fails with the payload's reason rather than deep inside the audit.
 *
 * **An unrecognised job name fails rather than being ignored.** The reverify queue
 * has no producer yet (FR-059 lands in Phase 4), so there is no shape to validate
 * and no handler to run. Skipping such a job silently would make the eventual
 * Phase 4 wiring mistake — a name typo between producer and consumer —
 * indistinguishable from success. Refusing it makes the gap visible on the first
 * job, which is the only time anybody is looking.
 */

import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { z } from 'zod';
import { MODULE_TYPES, SCAN_STATES } from '@webaudit/types';
import { CONCURRENCY, QUEUE_NAMES } from './queues.js';
import type { PhaseJobData, QuestionnaireTimeoutJobData } from '../orchestrator/phases.js';
import type { ReverifyJobData } from '../reverify/runner.js';

/**
 * The job names the producers in this repository actually use.
 *
 * Kept as a table rather than as inline strings so the producer/consumer pair is
 * one edit apart. `phases.ts` writes `add('phase', …)` and
 * `add('questionnaire-deadline', …)`; a name that appears here and nowhere else
 * is a consumer waiting for a producer, which is what the reverify queue is.
 */
export const JOB_NAMES = {
  /** `phases.ts` → `scanPhaseQueue.add('phase', …)`. One job per audit phase. */
  phase: 'phase',
  /** `phases.ts` → `maintenanceQueue.add('questionnaire-deadline', …)`, delayed. */
  questionnaireDeadline: 'questionnaire-deadline',
  /** `timeout-scheduler.ts` → `maintenanceQueue.add('timeout-sweep', …, { repeat })`. */
  timeoutSweep: 'timeout-sweep',
  /** `apps/api`'s `reverify-producer.ts` → `reverifyQueue.add('reverify', …)` (T154). */
  reverify: 'reverify',
  /** `billing-sweeps.ts` → `maintenanceQueue.add('billing-sweep', …, { repeat })` (T188/T189). */
  billingSweep: 'billing-sweep',
} as const;

export type KnownJobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * `PhaseJobData`, as it arrives rather than as it was written.
 *
 * `.strict()` rather than the default strip. An unexpected key means the producer
 * and the consumer disagree about the payload, and the two ways that happens are
 * both worth stopping for: a rolling deploy mid-flight, or somebody putting
 * something in a job that does not belong in one. The specific thing that must
 * never appear here is prompt text — R8's `RedactedPrompt` cannot survive a queue,
 * so a payload that carries prompt-shaped fields is a design error being smuggled
 * through a serialiser, and stripping it quietly would hide that.
 *
 * `phase` is validated against the whole `ScanState` enum rather than the running
 * subset, because that is what `PhaseJobData` declares. Narrowing here would
 * reject a payload the producer's own type permits, which puts the disagreement
 * in the wrong place — if only the running states are legal, the fix is to narrow
 * the type in `phases.ts` and let this follow.
 */
export const phaseJobSchema = z
  .object({
    scanId: z.string().min(1).max(64),
    phase: z.enum(SCAN_STATES),
    // At least one: a phase with no areas would run, cost a slot, measure
    // nothing, and complete — a silent no-op audit phase.
    modules: z.array(z.enum(MODULE_TYPES)).min(1),
    attempt: z.number().int().positive(),
  })
  .strict();

/**
 * The delayed job that fires at the questionnaire deadline.
 *
 * `expectedState` is not decoration — it is the guard that stops a stale delayed
 * job from moving a scan that already resumed, so a payload that lost it is not
 * runnable and must not be treated as one.
 */
export const questionnaireTimeoutJobSchema = z
  .object({
    scanId: z.string().min(1).max(64),
    kind: z.literal('questionnaire-deadline'),
    expectedState: z.literal('AWAITING_QUESTIONNAIRE'),
  })
  .strict();

/** The repeatable FR-038 sweep carries no per-run data. */
export const timeoutSweepJobSchema = z.object({ kind: z.literal('timeout-sweep') }).strict();

/** The repeatable billing sweep (renewals, renewal warnings, retention) carries no per-run data. */
export const billingSweepJobSchema = z.object({ kind: z.literal('billing-sweep') }).strict();

/**
 * A targeted re-verification (T154). `.strict()` for the same reason as the
 * phase schema — the one field that must never appear is prompt text, and a
 * re-verification never assembles one.
 */
export const reverifyJobSchema = z
  .object({
    issueId: z.string().min(1).max(64),
    creditsCharged: z.number().int().nonnegative(),
    debitTransactionId: z.string().min(1).max(64).optional(),
  })
  .strict();

/**
 * Proof the schemas still describe the producers' types.
 *
 * A compile-time check only, and a weak one — it says the parsed output is
 * assignable, not that a real payload parses. `workers.test.ts` asserts the
 * second half against the literal shapes `phases.ts` emits.
 */
const _phaseShape: PhaseJobData = {} as z.infer<typeof phaseJobSchema>;
const _deadlineShape: QuestionnaireTimeoutJobData = {} as z.infer<
  typeof questionnaireTimeoutJobSchema
>;
const _reverifyShape: ReverifyJobData = {} as z.infer<typeof reverifyJobSchema>;
void _phaseShape;
void _deadlineShape;
void _reverifyShape;

/**
 * The subset of a BullMQ `Job` this module reads.
 *
 * Structural, so `dispatch` is testable without a Redis connection and a real
 * job. That matters more than it looks: the assertions that make this file worth
 * having are about refusal, and a suite that needs a live queue to check "the
 * placeholder never reports success" would not be run often enough to catch a
 * regression.
 */
export interface JobRef {
  readonly id?: string | undefined;
  readonly name: string;
  readonly queueName: string;
  readonly data: unknown;
}

/**
 * Where T113 plugs in.
 *
 * Keyed by job name rather than by queue, because the maintenance queue already
 * carries more than one kind of job and routing on the queue would need a second
 * switch inside the handler.
 */
export interface JobHandlers {
  readonly phase?: (data: PhaseJobData, job: JobRef) => Promise<void>;
  readonly questionnaireDeadline?: (
    data: QuestionnaireTimeoutJobData,
    job: JobRef,
  ) => Promise<void>;
  /** The repeatable FR-038 sweep. Carries no data. */
  readonly timeoutSweep?: () => Promise<void>;
  /** The repeatable billing sweep (T188/T189). Carries no data. */
  readonly billingSweep?: () => Promise<void>;
  /** A targeted re-verification (T150). */
  readonly reverify?: (data: ReverifyJobData, job: JobRef) => Promise<void>;
}

/**
 * Thrown by the placeholder. A distinct type so a test can assert the difference
 * between "this job is not runnable yet" and "this payload is wrong", which are
 * different problems for different people.
 */
export class JobNotImplementedError extends Error {
  readonly queueName: string;
  readonly jobName: string;
  /** The task that replaces the placeholder. */
  readonly owningTask: string;

  constructor(job: JobRef, owningTask: string, what: string) {
    super(
      `No processor is wired for "${job.name}" on ${job.queueName}. ` +
        `${what} is implemented by ${owningTask}. ` +
        'Failing the job deliberately: reporting success would mark this work done ' +
        'when nothing ran, and the credits for it are already spent.',
    );
    this.name = 'JobNotImplementedError';
    this.queueName = job.queueName;
    this.jobName = job.name;
    this.owningTask = owningTask;
  }
}

/** A job whose name no consumer in this build recognises. */
export class UnknownJobError extends Error {
  constructor(job: JobRef) {
    super(
      `Unrecognised job "${job.name}" on ${job.queueName}. ` +
        `Known names: ${Object.values(JOB_NAMES).join(', ')}. ` +
        'A job nobody claims is refused rather than dropped, so a producer/consumer ' +
        'name mismatch fails on the first job instead of looking like success.',
    );
    this.name = 'UnknownJobError';
  }
}

/**
 * Validate, route, run. The whole consumer boundary in one function.
 *
 * Validation happens before the handler lookup so an invalid payload fails with
 * the payload's reason even while the handler is still a placeholder. The
 * alternative ordering — refuse first, parse later — would report "not
 * implemented" for a malformed job and send whoever reads that failure to the
 * wrong file.
 */
export async function dispatch(job: JobRef, handlers: JobHandlers = {}): Promise<void> {
  switch (job.name) {
    case JOB_NAMES.phase: {
      const data = phaseJobSchema.parse(job.data) as PhaseJobData;
      const handler = handlers.phase;
      if (handler === undefined) {
        throw new JobNotImplementedError(job, 'T113', 'The orchestrator run loop');
      }
      await handler(data, job);
      return;
    }

    case JOB_NAMES.timeoutSweep: {
      timeoutSweepJobSchema.parse(job.data);
      const handler = handlers.timeoutSweep;
      if (handler === undefined) {
        throw new JobNotImplementedError(job, 'T101', 'The FR-038 scan timeout sweep');
      }
      await handler();
      return;
    }

    case JOB_NAMES.billingSweep: {
      billingSweepJobSchema.parse(job.data);
      const handler = handlers.billingSweep;
      if (handler === undefined) {
        throw new JobNotImplementedError(job, 'T188', 'The billing sweep (renewals, warnings, retention)');
      }
      await handler();
      return;
    }

    case JOB_NAMES.reverify: {
      const data = reverifyJobSchema.parse(job.data) as ReverifyJobData;
      const handler = handlers.reverify;
      if (handler === undefined) {
        throw new JobNotImplementedError(job, 'T150', 'The targeted re-verification runner');
      }
      await handler(data, job);
      return;
    }

    case JOB_NAMES.questionnaireDeadline: {
      const data = questionnaireTimeoutJobSchema.parse(job.data) as QuestionnaireTimeoutJobData;
      const handler = handlers.questionnaireDeadline;
      if (handler === undefined) {
        // `resumeAfterQuestionnaire` in phases.ts is the body of this handler and
        // already exists; what is missing is the run loop that owns the module
        // list to resume with. Hence T113 rather than the questionnaire phase.
        throw new JobNotImplementedError(
          job,
          'T113',
          'Resuming a scan at the questionnaire deadline (phases.resumeAfterQuestionnaire)',
        );
      }
      await handler(data, job);
      return;
    }

    default:
      throw new UnknownJobError(job);
  }
}

export interface WorkerSetOptions {
  readonly connection: ConnectionOptions;
  /** Omit for the placeholders. T113 passes the real ones. */
  readonly handlers?: JobHandlers;
  /**
   * Where a failed job is reported. Defaults to `console.error`. Not optional in
   * practice: a BullMQ `Worker` is an EventEmitter, and an unheard `error` event
   * takes the process down.
   */
  readonly onFailed?: (job: Job | undefined, error: Error) => void;
  /** Reported separately: a worker-level fault is not one job's failure. */
  readonly onError?: (error: Error) => void;
}

export interface WorkerSet {
  readonly scanPhase: Worker;
  readonly reverify: Worker;
  readonly maintenance: Worker;
  /**
   * @param force skip waiting for in-flight jobs. Only for a shutdown that has
   *   already exceeded its grace period — a forced close leaves the job stalled
   *   for another worker to reclaim rather than completing it.
   */
  close(force?: boolean): Promise<void>;
}

/**
 * One `Worker` per queue, each with its own concurrency budget.
 *
 * Three workers rather than one is the same decision `queues.ts` documents for
 * having three queues: `reverify` needs an allowance a backlog of free-tier
 * audits cannot consume, and a shared pool would make its priority number
 * meaningless. `CONCURRENCY` is the authority for the numbers.
 */
export function createWorkers(options: WorkerSetOptions): WorkerSet {
  const handlers = options.handlers ?? {};

  const reportFailed =
    options.onFailed ??
    ((job: Job | undefined, error: Error): void => {
      console.error(
        `[worker] job failed: ${job?.queueName ?? 'unknown'}/${job?.name ?? 'unknown'} ` +
          `id=${job?.id ?? '-'}: ${error.message}`,
      );
    });

  const reportError =
    options.onError ??
    ((error: Error): void => {
      // Distinct prefix from the above on purpose: this is the worker itself in
      // trouble (usually the Redis connection), not one job failing, and the two
      // want different alerts.
      console.error(`[worker] worker error: ${error.message}`);
    });

  const build = (queueName: string, concurrency: number): Worker => {
    const worker = new Worker(
      queueName,
      (job: Job) =>
        dispatch(
          { id: job.id, name: job.name, queueName: job.queueName, data: job.data },
          handlers,
        ),
      { connection: options.connection, concurrency },
    );
    worker.on('failed', (job, error) => reportFailed(job, error));
    // Required, not defensive: without a listener an EventEmitter rethrows the
    // error as an uncaught exception and a transient Redis blip kills the process.
    worker.on('error', reportError);
    return worker;
  };

  const scanPhase = build(QUEUE_NAMES.scanPhase, CONCURRENCY.scanPhase);
  const reverify = build(QUEUE_NAMES.reverify, CONCURRENCY.reverify);
  const maintenance = build(QUEUE_NAMES.maintenance, CONCURRENCY.maintenance);

  return {
    scanPhase,
    reverify,
    maintenance,
    async close(force = false): Promise<void> {
      // In parallel: they share nothing, and serialising them would multiply the
      // shutdown window by three for no benefit while the platform's SIGKILL
      // timer runs.
      await Promise.all([scanPhase.close(force), reverify.close(force), maintenance.close(force)]);
    },
  };
}
