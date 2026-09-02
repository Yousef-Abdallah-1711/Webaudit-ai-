/**
 * `createTeardownProducer` throws against a real queue. It never has, in a
 * test.
 *
 * This is the same class of bug `apps/worker/tests/adverse/
 * questionnaire-jobid.test.ts` already documents and fixed once: BullMQ's own
 * `Job` class validates a custom `jobId` synchronously, inside `queue.add`,
 * before any Redis round trip — a colon-bearing id must split into exactly
 * three segments (a legacy carve-out for repeatable-job ids shaped
 * `name:hash:timestamp`), or `add` throws `Custom Id cannot contain :`.
 *
 * `enqueueTeardown` built `` `workspace-teardown:${scanId}` `` — two
 * segments — which threw on every single call. `apps/api/src/routes/
 * scans.routes.ts`'s cancel handler wraps the call in a fire-and-forget
 * `try/catch` that only logs, so every production cancellation silently
 * failed to schedule its workspace teardown, and no test caught it because
 * `scans.cancel-refund.test.ts` never asserts on the enqueue at all. Fixed
 * by hyphenating the id (zero colons is always accepted); this test exercises
 * BullMQ's real validation directly, the way a hand-written fake cannot.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { Queue, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@webaudit/config';
import { createTeardownProducer } from '../../src/services/queue/teardown-producer.js';

const connection: ConnectionOptions = {
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
  maxRetriesPerRequest: null,
};

describe('createTeardownProducer against a real queue', () => {
  // A dedicated queue instance under the real production name, exactly as
  // the producer constructs it — the point is to exercise BullMQ's own
  // validation, not a stand-in for it.
  const inspectionQueue = new Queue(QUEUE_NAMES.maintenance, { connection });
  const producer = createTeardownProducer(connection);

  afterAll(async () => {
    await inspectionQueue.obliterate({ force: true });
    await inspectionQueue.close();
    await producer.close();
  });

  it('does not throw enqueuing a teardown job', async () => {
    // The single most important assertion here. A throw here means every
    // production cancellation of a source-bearing scan silently never
    // schedules its workspace teardown (the cancel route's try/catch only
    // logs) — the source stays on disk indefinitely, since nothing else
    // sweeps it (`sweepOrphanedWorkspaces` is not wired into production).
    await expect(
      producer.enqueueTeardown({ scanId: 'scan_realteardown_1' }),
    ).resolves.toMatchObject({ jobId: expect.any(String) });
  });

  it('actually enqueues a findable job carrying the scan id', async () => {
    const { jobId } = await producer.enqueueTeardown({ scanId: 'scan_realteardown_2' });

    const job = await inspectionQueue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.data).toMatchObject({ scanId: 'scan_realteardown_2' });
    expect(job?.name).toBe('workspace-teardown');
  });
});
