/**
 * BullMQ producers and consumers for the per-class execution queues (FR-017/018).
 *
 * The job payload is ONLY `{ executionUnitId }` (strict schema; nothing else may ride a queue). The job id is
 * `<unitId>-<attempt>`, so an accidental double enqueue is one job; the real once-only guarantee is the durable claim.
 * Only classes with a registered adapter get a consumer, so a deployment with no engines opens no extra connections.
 */

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { z } from 'zod';
import {
  EXEC_QUEUE_NAMES,
  QUEUE_LOCK_DURATION_MS,
  QUEUE_STALLED_INTERVAL_MS,
  queueNameForUnitClass,
  type ExecQueueName,
} from '@webaudit/config';
import { isTerminalUnitStatus, type ExecutionUnitStatus } from '@webaudit/api/planning';
import type { PrismaClient } from '@webaudit/api/prisma-client';

export const EXEC_JOB_NAME = 'execute-unit';

export const execJobSchema = z.object({ executionUnitId: z.string().min(1).max(128) }).strict();
export type ExecJobData = z.infer<typeof execJobSchema>;

/** Execution jobs are not retried by BullMQ: retry policy is the unit's own (FR-023/024), decided by the finalizer. */
export const EXEC_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600, count: 1000 },
} as const;

export interface ExecQueueSet {
  queueFor(unitClass: string): Queue | null;
  readonly queues: ReadonlyMap<ExecQueueName, Queue>;
  close(): Promise<void>;
}

export function createExecQueues(connection: ConnectionOptions, prefix?: string): ExecQueueSet {
  const queues = new Map<ExecQueueName, Queue>();
  for (const name of Object.values(EXEC_QUEUE_NAMES)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: EXEC_JOB_OPTIONS,
        ...(prefix === undefined ? {} : { prefix }),
      }),
    );
  }
  return {
    queues,
    queueFor(unitClass) {
      const name = queueNameForUnitClass(unitClass);
      return name !== null && queues.has(name as ExecQueueName)
        ? (queues.get(name as ExecQueueName) ?? null)
        : null;
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
  };
}

export const execJobId = (executionUnitId: string, attempt: number): string =>
  `${executionUnitId}-${String(attempt)}`;

/** Enqueue one unit (payload = id only). Returns false for a class that has no execution queue (passive / TELEMETRY). */
export async function enqueueExecutionUnit(
  queues: ExecQueueSet,
  unit: { id: string; executionUnitClass: string; attempt: number },
): Promise<boolean> {
  const queue = queues.queueFor(unit.executionUnitClass);
  if (queue === null) return false;
  await queue.add(EXEC_JOB_NAME, { executionUnitId: unit.id } satisfies ExecJobData, {
    jobId: execJobId(unit.id, unit.attempt),
  });
  return true;
}

/**
 * Enqueue every unit of a plan that is eligible: PLANNED, non-passive, all predecessors COMPLETED (FR-010/018). Reads
 * durable state only. Called after a plan is resolved and after each unit completes; safe to call repeatedly.
 */
export async function enqueueEligibleUnits(
  db: PrismaClient,
  queues: ExecQueueSet,
  scanPlanId: string,
): Promise<number> {
  const units = await db.executionUnit.findMany({
    where: { scanPlanId, status: 'PLANNED' },
    select: {
      id: true,
      executionUnitClass: true,
      attempt: true, // Prisma relation naming is inverted from intuition: `dependents` holds the edges where THIS unit is the dependent,
      // i.e. its prerequisites (`dependsOnUnit`).
      dependents: { select: { dependsOnUnit: { select: { status: true } } } },
    },
  });
  let n = 0;
  for (const u of units) {
    if (u.dependents.some((d) => d.dependsOnUnit.status !== 'COMPLETED')) continue;
    if (await enqueueExecutionUnit(queues, u)) n += 1;
  }
  return n;
}

export { isTerminalUnitStatus };
export type { ExecutionUnitStatus };

export interface ExecWorkerOptions {
  readonly connection: ConnectionOptions;
  /** Which queues to consume: only classes with an adapter. */
  readonly classes: readonly string[];
  readonly handle: (data: ExecJobData) => Promise<unknown>;
  readonly concurrency?: number;
  /** BullMQ key prefix; tests use one so they never share keys with another run. */
  readonly prefix?: string;
  readonly onFailed?: (job: Job | undefined, error: Error) => void;
  readonly onError?: (error: Error) => void;
}

export interface ExecWorkerSet {
  close(force?: boolean): Promise<void>;
  readonly workers: readonly Worker[];
}

export function createExecWorkers(options: ExecWorkerOptions): ExecWorkerSet {
  const names = new Set<string>();
  for (const cls of options.classes) {
    const q = queueNameForUnitClass(cls);
    if (q !== null && (Object.values(EXEC_QUEUE_NAMES) as string[]).includes(q)) names.add(q);
  }
  const workers = [...names].map((queueName) => {
    const w = new Worker(
      queueName,
      (job: Job) => {
        // Strict parse: an unexpected key means producer and consumer disagree about the payload.
        if (job.name !== EXEC_JOB_NAME) throw new Error(`unknown execution job name ${job.name}`);
        return options.handle(execJobSchema.parse(job.data));
      },
      {
        connection: options.connection,
        ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
        concurrency: options.concurrency ?? 2,
        lockDuration: QUEUE_LOCK_DURATION_MS,
        stalledInterval: QUEUE_STALLED_INTERVAL_MS,
        maxStalledCount: 0,
      },
    );
    w.on('failed', (job, error) =>
      (
        options.onFailed ??
        ((j, e) =>
          console.error(`[exec-worker] ${j?.queueName ?? '?'} ${j?.id ?? '-'}: ${e.message}`))
      )(job, error),
    );
    w.on('error', options.onError ?? ((e) => console.error(`[exec-worker] ${e.message}`)));
    return w;
  });
  return {
    workers,
    async close(force = false) {
      await Promise.all(workers.map((w) => w.close(force)));
    },
  };
}
