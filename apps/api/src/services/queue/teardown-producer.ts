/**
 * The third job `apps/api` enqueues in production: tearing down a cancelled
 * scan's workspace out-of-band, since `/scans/:id/cancel` writes CANCELLED
 * directly and never goes through `apps/worker`'s `transition()` (T104's
 * documented gap; 2026-09-02 review, Finding 10).
 *
 * Same shape as `scan-phase-producer.ts` / `reverify-producer.ts`: a raw
 * BullMQ `Queue` on the maintenance queue, not `@webaudit/worker`'s helpers.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from '@webaudit/config';

export interface TeardownProducer {
  enqueueTeardown(input: { readonly scanId: string }): Promise<{ readonly jobId: string }>;
  close(): Promise<void>;
}

function connectionFromEnv(): ConnectionOptions {
  return { url: process.env['REDIS_URL'] ?? 'redis://localhost:6389', maxRetriesPerRequest: null };
}

export function createTeardownProducer(
  connection: ConnectionOptions = connectionFromEnv(),
): TeardownProducer {
  const queue = new Queue(QUEUE_NAMES.maintenance, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  return {
    async enqueueTeardown(input): Promise<{ readonly jobId: string }> {
      // BullMQ 6.2.0 rejects a colon-bearing custom jobId unless it splits into
      // exactly 3 segments (a legacy repeatable-job carve-out) -- see
      // packages/config/src/queues.ts's own note on QUEUE_NAMES. Hyphenated,
      // not colon-namespaced, for the same reason.
      const jobId = `workspace-teardown-${input.scanId}`;
      await queue.add('workspace-teardown', { scanId: input.scanId }, { jobId });
      return { jobId };
    },
    close: () => queue.close(),
  };
}
