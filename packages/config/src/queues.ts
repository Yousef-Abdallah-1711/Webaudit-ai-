/**
 * Queue names, priorities, and job-option defaults shared between `apps/worker`
 * (which consumes them) and `apps/api` (which only ever produces a `scanPhase`
 * job, to start a scan it just created — T111).
 *
 * Moved out of `apps/worker/src/queue/queues.ts` for exactly that reason: a
 * producer-only need in `apps/api` must not import `@webaudit/worker`, since
 * that dependency is test-only (see `apps/api/tests/integration/
 * progress-streaming.test.ts`'s own module note) — the five deployable units
 * stay five deployments. `apps/worker/src/queue/queues.ts` re-exports every
 * name below unchanged, so nothing inside `apps/worker` needed to change its
 * imports.
 *
 * `createQueues`/`createWorkers`/`CONCURRENCY`/`QueueSet` stay in
 * `apps/worker` — only the worker ever builds a `Worker`, and only `apps/api`
 * and `apps/worker` together need to agree on names, priorities and defaults.
 */

import { type ConnectionOptions, type JobsOptions } from 'bullmq';

/**
 * Lower runs sooner, matching `Plan.queuePriority`'s comment and BullMQ's own
 * convention. Six distinct levels; the middle four are the plan tiers.
 */
export const PRIORITY = {
  /** FR-059's narrow check. A human is watching. */
  REVERIFICATION: 5,
  BUSINESS: 10,
  PRO: 20,
  STARTER: 30,
  FREE: 40,
  /** Timeout sweeps, cleanup. Nothing is waiting on these. */
  MAINTENANCE: 50,
} as const;

export type PriorityLevel = (typeof PRIORITY)[keyof typeof PRIORITY];

/**
 * A plan's `queuePriority`, clamped into the band the plan tiers occupy.
 *
 * Clamped rather than trusted: `queuePriority` is an operator-editable column,
 * and a plan row set to 1 would let a customer outrank re-verification —
 * quietly making every fix loop in the system slower. A plan set to 999 would
 * fall behind maintenance and never run at all.
 *
 * `NaN` is checked explicitly because `Math.min`/`Math.max` do not clamp it —
 * either propagates it, so the "hostile value" this function defends against
 * included every out-of-range number except the one JavaScript arithmetic
 * itself can produce. Unguarded, that reached a real BullMQ `Queue.add`
 * downstream, which throws at the Lua-script layer ("must not be NaN or Inf")
 * rather than failing here where the actual bad input is visible. `Infinity`
 * needs no separate guard: `Math.trunc` leaves it as `Infinity`/`-Infinity`,
 * and `Math.min`/`Math.max` clamp either correctly against a finite bound.
 */
export function priorityForPlan(queuePriority: number): number {
  if (Number.isNaN(queuePriority)) return PRIORITY.FREE;
  return Math.min(PRIORITY.FREE, Math.max(PRIORITY.BUSINESS, Math.trunc(queuePriority)));
}

/**
 * Hyphenated, not colon-namespaced.
 *
 * BullMQ 6.2.0 rejects a queue name containing `:` outright: `QueueBase`'s
 * constructor throws before a single Redis command is sent.
 */
export const QUEUE_NAMES = {
  /** One job per audit phase. R4's resumable unit. */
  scanPhase: 'webaudit-scan-phase',
  /** FR-059. Its own queue so an audit backlog cannot starve it. */
  reverify: 'webaudit-reverify',
  /** FR-038's sweep and other housekeeping. */
  maintenance: 'webaudit-maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Defaults every job inherits.
 *
 * `attempts: 1` on the phase queue is deliberate: the phase has already
 * charged credits, already written `ModuleResult` rows, and may already have
 * paid a provider. A blind retry double-charges and double-writes. A phase
 * that fails is a scan that failed, refunded per FR-075 — recovery is a
 * decision, not a default.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { count: 1_000, age: 24 * 60 * 60 },
  removeOnFail: { count: 5_000, age: 7 * 24 * 60 * 60 },
};

/**
 * Re-verification may retry, unlike a phase — it is idempotent by
 * construction (R14), so a transient network failure is worth one more
 * attempt rather than an UNVERIFIABLE the user has to trigger again.
 */
export const REVERIFY_JOB_OPTIONS: JobsOptions = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
};

export function redisConnection(url = process.env['REDIS_URL']): ConnectionOptions {
  if (url === undefined || url === '') {
    throw new Error(
      'REDIS_URL is not set. Nothing can reach the queue without it, and starting ' +
        'without one would look healthy while accepting no work.',
    );
  }
  return {
    url,
    // BullMQ requires this: with a retry limit, a blocking command that fails
    // during a Redis restart kills the connection instead of reconnecting.
    maxRetriesPerRequest: null,
  };
}
