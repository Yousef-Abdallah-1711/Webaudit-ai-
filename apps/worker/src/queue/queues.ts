/**
 * T094 — BullMQ queues and the six priority levels.
 *
 * Four levels come from the plan tiers (`Plan.queuePriority`, seeded 40/30/20/10
 * — "lower value = sooner"). The other two are not plan-derived and exist because
 * not every job is an audit:
 *
 *   **Re-verification runs ahead of every audit.** A user who has just fixed
 *   something and pressed "I fixed this" is watching. The check is small and
 *   narrow by construction (FR-059: "re-run only the narrow check"), so putting it
 *   in front of a queue of full audits costs almost nothing and is the difference
 *   between the fix loop feeling instant and feeling broken. That loop is the
 *   product (US2).
 *
 *   **Maintenance runs behind everything.** Timeout sweeps and cleanup are not
 *   waiting on a human, and a sweep that displaces a paid audit has inverted its
 *   own purpose.
 *
 * **Why one queue per job kind rather than one queue with priorities.** BullMQ
 * priority orders within a queue, so a single queue would make a free-tier audit
 * and a re-verification compete for the same concurrency budget — and the
 * concurrency limit is what protects the probe pool. Separate queues let
 * re-verification have its own small worker pool that a backlog of free audits
 * cannot starve, which is the whole point of putting it first.
 *
 * **`AWAITING_QUESTIONNAIRE` is not a queue state.** R4: the phase job returns
 * and releases its slot. Nothing sits in a queue waiting for a human — the wait
 * is a database row plus a delayed job, and `phases.ts` is where that happens.
 *
 * **Names, priorities and job-option defaults live in `@webaudit/config`
 * now** (`packages/config/src/queues.ts`), re-exported below unchanged, so
 * every existing import of this module keeps working. They moved because
 * `apps/api` needs `QUEUE_NAMES.scanPhase` and `redisConnection` too, to
 * enqueue the first phase job when it creates a scan (T111) — and `apps/api`
 * must not depend on `@webaudit/worker` to get them (that dependency is
 * test-only; see `apps/api/tests/integration/progress-streaming.test.ts`'s
 * module note). `Queue`/`Worker` instances themselves stay app-local: only
 * this package ever constructs one.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import {
  DEFAULT_JOB_OPTIONS,
  PRIORITY,
  QUEUE_NAMES,
  REVERIFY_JOB_OPTIONS,
  priorityForPlan,
  redisConnection,
  type PriorityLevel,
  type QueueName,
} from '@webaudit/config';

export {
  DEFAULT_JOB_OPTIONS,
  PRIORITY,
  QUEUE_NAMES,
  REVERIFY_JOB_OPTIONS,
  priorityForPlan,
  redisConnection,
};
export type { PriorityLevel, QueueName };

export interface QueueSet {
  readonly scanPhase: Queue;
  readonly reverify: Queue;
  readonly maintenance: Queue;
  close(): Promise<void>;
}

export function createQueues(connection: ConnectionOptions): QueueSet {
  const scanPhase = new Queue(QUEUE_NAMES.scanPhase, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  const reverify = new Queue(QUEUE_NAMES.reverify, {
    connection,
    defaultJobOptions: REVERIFY_JOB_OPTIONS,
  });
  const maintenance = new Queue(QUEUE_NAMES.maintenance, {
    connection,
    defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, priority: PRIORITY.MAINTENANCE },
  });

  return {
    scanPhase,
    reverify,
    maintenance,
    async close(): Promise<void> {
      await Promise.all([scanPhase.close(), reverify.close(), maintenance.close()]);
    },
  };
}

/**
 * Concurrency per queue, from the deployment's worker count.
 *
 * `reverify` gets its own allowance rather than a share of one pool. That is the
 * mechanism behind the priority decision above: a priority number cannot help a
 * re-verification if every worker slot is already inside a long audit.
 */
export const CONCURRENCY = {
  scanPhase: 4,
  reverify: 8,
  maintenance: 1,
} as const;
