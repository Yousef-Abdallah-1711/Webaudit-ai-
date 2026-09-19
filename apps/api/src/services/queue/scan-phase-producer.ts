/**
 * T111 — the one job `apps/api` ever enqueues in production: the first phase
 * of a scan it just created.
 *
 * A raw `Queue`, not `@webaudit/worker`'s `enqueuePhase`. `enqueuePhase`
 * lives in `apps/worker/src/orchestrator/phases.ts` and is wired to that
 * package's own `ScanStateStore`/`ScanEmitter` — reaching it from here would
 * make production `apps/api` code depend on `@webaudit/worker`, which is a
 * test-only dependency (see `apps/api/tests/integration/
 * progress-streaming.test.ts`'s module note): the five deployable units stay
 * five deployments. `QUEUE_NAMES`, `DEFAULT_JOB_OPTIONS` and
 * `priorityForPlan` moved to `@webaudit/config` for exactly this reason —
 * both apps need to agree on them without either depending on the other.
 *
 * Deliberately duplicates `enqueuePhase`'s tiny job-id shape
 * (`${scanId}:${phase}:${attempt}`) rather than importing it: three lines,
 * covered by this file's own test, versus a cross-app production import.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES, priorityForPlan } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';

export interface ScanPhaseProducer {
  getWaitingCount?(): Promise<number>;
  getQueuePosition?(scanId: string): Promise<number | null>;
  enqueueFirstPhase(input: {
    readonly scanId: string;
    readonly modules: readonly ModuleType[];
    readonly planQueuePriority: number;
  }): Promise<{ readonly jobId: string }>;
  /**
   * T199 — the questionnaire routes' side of the same resume the worker's own
   * `resumeAfterQuestionnaire` (`apps/worker/src/orchestrator/phases.ts`)
   * performs when the deadline wins the race instead. Same job id shape
   * (`${scanId}:RUNNING_PHASE_2:1`), same job name, same payload shape, same
   * queue — `apps/api` cannot import `enqueuePhase` from `apps/worker` (see
   * this file's own module note), so this duplicates that tiny shape rather
   * than the cross-app import.
   */
  enqueuePhaseTwo(input: {
    readonly scanId: string;
    readonly modules: readonly ModuleType[];
    readonly planQueuePriority: number;
  }): Promise<{ readonly jobId: string }>;
  close(): Promise<void>;
}

/**
 * `REDIS_URL`, with the same local-dev fallback `apps/api/src/middleware/
 * ratelimit.middleware.ts` and every T107–T109 integration suite already
 * use — `infrastructure/docker-compose.yml` runs Redis on this port
 * alongside the Postgres this process already requires, and nothing in this
 * codebase loads `.env` into `process.env` for a plain `vitest run`, so the
 * fallback is what the 'unit' project actually connects with today. Unlike
 * `@webaudit/config`'s `redisConnection`, this does not throw when unset —
 * a producer that cannot reach Redis should not take the whole API process
 * down at import time.
 */
function connectionFromEnv(): ConnectionOptions {
  return {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
    maxRetriesPerRequest: null,
  };
}

export function createScanPhaseProducer(
  connection: ConnectionOptions = connectionFromEnv(),
): ScanPhaseProducer {
  const queue = new Queue(QUEUE_NAMES.scanPhase, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  return {
    /**
     * Found and fixed as a real bug, not assumed correct from the original
     * implementation: every real job this producer enqueues carries an
     * explicit `priority` (`priorityForPlan`, below), so BullMQ (6.x) always
     * places it in the separate `prioritized` state, never `waiting` — a
     * job with a priority is never counted by `getWaitingCount()`, which
     * only counts the plain `wait` list. Confirmed directly against a real
     * local Redis/BullMQ queue: `getWaitingCount()` returned 0 with real
     * prioritized jobs actually queued. Left as originally written, this
     * would mean FR-B01/B02's capacity refusal (`create-scan.ts`'s
     * `queueDepth >= queueCapacity`) could never trigger in production
     * regardless of real queue depth.
     */
    async getWaitingCount(): Promise<number> {
      return queue.getJobCountByTypes('waiting', 'prioritized');
    },
    /**
     * Same root cause as `getWaitingCount` above, plus a second, independent
     * bug in the original `getJobs(['waiting'])` approach: even filtered to
     * the right state(s), `getJobs()`'s default ordering does not reflect
     * true dequeue order for prioritized jobs — confirmed directly (not
     * assumed) against a real queue that a lower-`priority`-number job
     * enqueued *after* several higher-number ones was listed *last* by a
     * default `getJobs(['prioritized'])` call, while a real `Worker`
     * draining the same queue correctly processed it *first*. The `asc:
     * true` fourth argument is what makes `getJobs()`'s own ordering match
     * real processing order — verified the same way. Real `scanPhase` jobs
     * are never enqueued without a priority (both call sites below always
     * pass one), so only the `prioritized` state is queried.
     */
    async getQueuePosition(scanId: string): Promise<number | null> {
      const jobs = await queue.getJobs(['prioritized'], 0, -1, true);
      const index = jobs.findIndex((job) => job.id?.startsWith(`${scanId}:`));
      return index < 0 ? null : index + 1;
    },
    async enqueueFirstPhase(input): Promise<{ readonly jobId: string }> {
      const jobId = `${input.scanId}:RUNNING_PHASE_1:1`;
      await queue.add(
        'phase',
        { scanId: input.scanId, phase: 'RUNNING_PHASE_1', modules: input.modules, attempt: 1 },
        { jobId, priority: priorityForPlan(input.planQueuePriority) },
      );
      return { jobId };
    },
    async enqueuePhaseTwo(input): Promise<{ readonly jobId: string }> {
      const jobId = `${input.scanId}:RUNNING_PHASE_2:1`;
      await queue.add(
        'phase',
        {
          scanId: input.scanId,
          phase: 'RUNNING_PHASE_2',
          modules: input.modules,
          attempt: 1,
          // Not a parameter, for the same reason `phase` is not one: this
          // method exists only for the questionnaire resume, and that resume
          // always performs `AWAITING_QUESTIONNAIRE -> RUNNING_PHASE_2` before
          // calling it (`questionnaire.service.ts`'s `resume`). The worker's
          // `handlePhase` otherwise opens by transitioning the scan into the
          // phase the job names, which here is the self-edge `RUNNING_PHASE_2
          // -> RUNNING_PHASE_2` — refused by `state-machine.ts`'s table for
          // every state, so the job ran zero modules and the UI area was never
          // audited. Threading it as an argument would let a caller pass
          // `false` and reintroduce that; hardcoding it here cannot.
          // `enqueueFirstPhase` deliberately does NOT set it: a first-phase job
          // does its own entry transition, and the guard it would bypass is
          // what stops a redelivered job re-running a whole phase. See
          // `apps/worker/src/orchestrator/phases.ts`'s
          // `PhaseJobData.alreadyTransitioned`.
          alreadyTransitioned: true,
        },
        { jobId, priority: priorityForPlan(input.planQueuePriority) },
      );
      return { jobId };
    },
    close: () => queue.close(),
  };
}
