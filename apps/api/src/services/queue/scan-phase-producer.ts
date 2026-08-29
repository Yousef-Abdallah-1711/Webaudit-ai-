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
  enqueueFirstPhase(input: {
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
    async enqueueFirstPhase(input): Promise<{ readonly jobId: string }> {
      const jobId = `${input.scanId}:RUNNING_PHASE_1:1`;
      await queue.add(
        'phase',
        { scanId: input.scanId, phase: 'RUNNING_PHASE_1', modules: input.modules, attempt: 1 },
        { jobId, priority: priorityForPlan(input.planQueuePriority) },
      );
      return { jobId };
    },
    close: () => queue.close(),
  };
}
