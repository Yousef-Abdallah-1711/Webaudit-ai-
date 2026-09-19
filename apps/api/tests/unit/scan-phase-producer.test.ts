/**
 * The payloads `apps/api` actually puts on the phase queue.
 *
 * `scan-phase-producer.ts`'s module note has always claimed its duplicated
 * job-id shape was "covered by this file's own test". It was not — no such
 * file existed, and the two suites that exercise these methods
 * (`questionnaire.test.ts`, `readiness.premature.test.ts`) both substitute a
 * fake producer, so nothing ever asserted what the real one emits.
 *
 * That gap is what let the Phase 8 questionnaire regression hide on this side
 * of the race. `enqueuePhaseTwo` is called only after
 * `questionnaire.service.ts`'s `resume()` has already performed
 * `AWAITING_QUESTIONNAIRE -> RUNNING_PHASE_2`, so the job it writes MUST carry
 * `alreadyTransitioned: true` — otherwise the worker's `handlePhase` opens by
 * attempting that same transition again, which is the self-edge
 * `RUNNING_PHASE_2 -> RUNNING_PHASE_2` that `state-machine.ts`'s `ALLOWED`
 * table refuses for every state, and the job returns having audited nothing.
 *
 * `enqueueFirstPhase` must NOT carry it: a first-phase job does its own entry
 * transition (`QUEUED -> RUNNING_PHASE_1`), and that transition is also what
 * stops a redelivered job from re-running a whole phase's modules.
 *
 * Against real Redis (the same instance every integration suite here uses),
 * reading the job back off the queue rather than spying on `Queue.add` — the
 * payload has been through JSON by the time a worker sees it, and that is the
 * shape under test. Each job is removed again so the queue is left as found.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { Queue, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@webaudit/config';
import { createScanPhaseProducer } from '../../src/services/queue/scan-phase-producer.js';

const connection: ConnectionOptions = {
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
  maxRetriesPerRequest: null,
};

const producer = createScanPhaseProducer(connection);
const queue = new Queue(QUEUE_NAMES.scanPhase, { connection });

afterAll(async () => {
  await producer.close();
  await queue.close();
});

/** Enqueue, read the real payload back, then remove the job. */
async function payloadOf(jobId: string): Promise<Record<string, unknown>> {
  const job = await queue.getJob(jobId);
  expect(job, `job ${jobId} must exist on ${QUEUE_NAMES.scanPhase}`).toBeDefined();
  const data = job?.data as Record<string, unknown>;
  await job?.remove();
  return data;
}

describe('ScanPhaseProducer — the payloads apps/api puts on the phase queue', () => {
  it('enqueueFirstPhase writes a phase-1 job that does its own entry transition', async () => {
    const scanId = `producer-first-${String(Date.now())}`;
    const { jobId } = await producer.enqueueFirstPhase({
      scanId,
      modules: ['SECURITY', 'SEO'],
      planQueuePriority: 40,
    });
    expect(jobId).toBe(`${scanId}:RUNNING_PHASE_1:1`);

    const data = await payloadOf(jobId);
    expect(data).toEqual({
      scanId,
      phase: 'RUNNING_PHASE_1',
      modules: ['SECURITY', 'SEO'],
      attempt: 1,
    });
    // Absent, not false — and absent is what the worker's `.strict()` schema
    // treats as "transition normally".
    expect(data).not.toHaveProperty('alreadyTransitioned');
  });

  it('enqueuePhaseTwo writes a phase-2 job flagged as already transitioned', async () => {
    const scanId = `producer-second-${String(Date.now())}`;
    const { jobId } = await producer.enqueuePhaseTwo({
      scanId,
      modules: ['UI'],
      planQueuePriority: 40,
    });
    expect(jobId).toBe(`${scanId}:RUNNING_PHASE_2:1`);

    const data = await payloadOf(jobId);
    expect(data).toEqual({
      scanId,
      phase: 'RUNNING_PHASE_2',
      modules: ['UI'],
      attempt: 1,
      // Without this the resumed job audits nothing at all. See the module note.
      alreadyTransitioned: true,
    });
  });
});

/**
 * A real bug, found directly against real Redis, not assumed from the code:
 * every real job this producer enqueues carries an explicit `priority`
 * (`priorityForPlan` is called at both call sites above), so BullMQ 6.x
 * always places it in the separate `prioritized` state, never `wait`.
 * `getWaitingCount()`/`getQueuePosition()` originally queried only `wait`
 * (`queue.getWaitingCount()`, `queue.getJobs(['waiting'])`) — meaning, for
 * every job this producer has ever actually enqueued, both always behaved as
 * if the queue were empty. FR-B01/B02's capacity refusal could never trigger
 * in production, and T030's queue-position display could never show a real
 * number. `readiness.premature.test.ts`/`questionnaire.test.ts` never caught
 * this because both substitute a fake producer for these two methods (the
 * same gap this file's own header note already flagged for the payload
 * shape), and `queue-backpressure.test.ts` also uses a fully fake producer
 * (`getWaitingCount: async () => 1`) rather than a real queue.
 */
describe('ScanPhaseProducer — getWaitingCount/getQueuePosition against real prioritized jobs', () => {
  it('getWaitingCount counts real prioritized jobs, not just the (always-empty, for this producer) plain wait list', async () => {
    const scanId = `producer-count-${String(Date.now())}`;
    const before = await producer.getWaitingCount!();
    const { jobId } = await producer.enqueueFirstPhase({
      scanId,
      modules: ['SECURITY'],
      planQueuePriority: 40,
    });
    try {
      const after = await producer.getWaitingCount!();
      expect(after).toBe(before + 1);
    } finally {
      await (await queue.getJob(jobId))?.remove();
    }
  });

  it('getQueuePosition ranks a higher-priority job ahead of one enqueued earlier at a lower priority', async () => {
    const stamp = String(Date.now());
    const freeScanId = `producer-pos-free-${stamp}`;
    const businessScanId = `producer-pos-business-${stamp}`;
    const jobIds: string[] = [];
    try {
      // FREE (lower priority number wins) enqueued first...
      jobIds.push(
        (
          await producer.enqueueFirstPhase({
            scanId: freeScanId,
            modules: ['SECURITY'],
            planQueuePriority: 40,
          })
        ).jobId,
      );
      // ...BUSINESS enqueued after it must still be reported ahead of it.
      jobIds.push(
        (
          await producer.enqueueFirstPhase({
            scanId: businessScanId,
            modules: ['SECURITY'],
            planQueuePriority: 10,
          })
        ).jobId,
      );

      const freePos = await producer.getQueuePosition!(freeScanId);
      const businessPos = await producer.getQueuePosition!(businessScanId);
      expect(freePos).not.toBeNull();
      expect(businessPos).not.toBeNull();
      // The exact relationship this task's manual step names: a priority-tier
      // request submitted mid-burst still lands ahead of an already-queued
      // free-tier one — proven against a real BullMQ ordering call, not
      // asserted from the code alone (a naive `getJobs(['waiting'])` /
      // `getJobs(['prioritized'])` without `asc: true` reports the opposite
      // of real processing order — confirmed directly before this fix).
      expect(businessPos!).toBeLessThan(freePos!);
    } finally {
      for (const jobId of jobIds) {
        await (await queue.getJob(jobId))?.remove();
      }
    }
  });

  it('getQueuePosition returns null for a scan with no matching job on the queue', async () => {
    await expect(producer.getQueuePosition!('no-such-scan-anywhere')).resolves.toBeNull();
  });
});
