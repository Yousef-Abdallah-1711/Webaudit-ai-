/**
 * T154 — the second job `apps/api` enqueues in production: a targeted
 * re-verification, when a user asserts an issue is fixed.
 *
 * Same shape as `scan-phase-producer.ts` (T111) and the same reasons: a raw
 * BullMQ `Queue`, not `@webaudit/worker`'s helpers, so production `apps/api`
 * never depends on `@webaudit/worker` (that dependency is test-only). Names,
 * priorities and job-option defaults come from `@webaudit/config`, which both
 * apps already depend on.
 *
 * Re-verification jobs get `PRIORITY.REVERIFICATION` — ahead of every audit,
 * because a user who just pressed "I fixed this" is watching (`queues.ts`'s
 * own note) — and `REVERIFY_JOB_OPTIONS` (3 attempts, exponential backoff):
 * the check is idempotent by construction (R14), so a transient network blip
 * is worth one more try rather than an `UNVERIFIABLE` the user must re-trigger.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import { PRIORITY, QUEUE_NAMES, REVERIFY_JOB_OPTIONS } from '@webaudit/config';

export interface ReverifyProducer {
  enqueueReverify(input: {
    readonly issueId: string;
    /** The DEBIT for this re-check, so a non-delivered verdict refunds the exact lot. */
    readonly debitTransactionId?: string;
    readonly creditsCharged: number;
  }): Promise<{ readonly jobId: string }>;
  close(): Promise<void>;
}

/** `REDIS_URL` with the same local-dev fallback `scan-phase-producer.ts` uses. */
function connectionFromEnv(): ConnectionOptions {
  return {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
    maxRetriesPerRequest: null,
  };
}

export function createReverifyProducer(
  connection: ConnectionOptions = connectionFromEnv(),
): ReverifyProducer {
  const queue = new Queue(QUEUE_NAMES.reverify, {
    connection,
    defaultJobOptions: REVERIFY_JOB_OPTIONS,
  });

  return {
    async enqueueReverify(input): Promise<{ readonly jobId: string }> {
      // Not keyed only on the issue id: an issue can be re-checked many times
      // over its life (FAILED → OPEN → asserted again), and a bare `reverify:
      // <issueId>` id would collide with an earlier, already-removed job.
      const jobId = `reverify:${input.issueId}:${String(Date.now())}`;
      await queue.add(
        'reverify',
        {
          issueId: input.issueId,
          creditsCharged: input.creditsCharged,
          ...(input.debitTransactionId === undefined
            ? {}
            : { debitTransactionId: input.debitTransactionId }),
        },
        { jobId, priority: PRIORITY.REVERIFICATION },
      );
      return { jobId };
    },
    close: () => queue.close(),
  };
}
