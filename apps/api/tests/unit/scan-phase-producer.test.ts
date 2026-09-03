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
