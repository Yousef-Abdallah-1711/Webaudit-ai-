import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';
import { topologicalOrder } from '../apps/api/src/services/planning/graph.js';
import { passiveBaselineRegistry, resolvePlan } from '../apps/api/src/services/planning/index.js';
import {
  createMemoryArtifactStore,
  recordEvidence,
} from '../apps/api/src/services/evidence/index.js';
import {
  expirePlanUnits,
  finalizeExecutionUnit,
} from '../apps/api/src/services/execution-runtime/index.js';
import {
  createExecQueues,
  createExecWorkers,
  enqueueExecutionUnit,
} from '../apps/worker/src/execution-runtime/queues.js';
import { assertIsolatedTestDatabaseUrl } from '../apps/api/tests/helpers/isolated-database.js';

const nodeCount = 1_000;
const runCount = 100;
const units = Array.from({ length: nodeCount }, (_, i) => ({
  id: `unit-${String(i).padStart(4, '0')}`,
  executionUnitClass: 'PASSIVE_HTTP' as const,
}));
const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
  unitId: units[i + 1]!.id,
  dependsOnUnitId: units[i]!.id,
}));

const samples: number[] = [];
for (let i = 0; i < runCount; i += 1) {
  const start = performance.now();
  const ordered = topologicalOrder(units, edges);
  if (ordered.length !== nodeCount) throw new Error('topological order lost nodes');
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);

const databaseUrl = process.env['TEST_DATABASE_URL'];
let planResolution: Record<string, number | string> | null = null;
let evidenceMetrics: Record<string, number | string> | null = null;
let artifactMetrics: Record<string, number | string> | null = null;
let finalizationMetrics: Record<string, number | string> | null = null;
let sweepMetrics: Record<string, number | string> | null = null;
let queueBurstMetrics: Record<string, number | string> | null = null;
if (databaseUrl !== undefined) {
  const isolatedDatabaseUrl = assertIsolatedTestDatabaseUrl(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: isolatedDatabaseUrl } } });
  const suffix = randomUUID();
  let userId: string | undefined;
  let targetId: string | undefined;
  const scanIds: string[] = [];
  const unitIds: string[] = [];
  try {
    const user = await prisma.user.create({
      data: { email: `spec009-perf-${suffix}@example.invalid` },
    });
    userId = user.id;
    const target = await prisma.target.create({
      data: {
        userId,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: `spec009-perf-${suffix}`,
      },
    });
    targetId = target.id;
    for (let i = 0; i < runCount; i += 1) {
      const scan = await prisma.scan.create({
        data: {
          userId,
          targetId,
          requestedModules: ['SECURITY'],
          capabilitySnapshot: {},
          quotedCredits: 10,
          chargedCredits: 10,
          state: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      scanIds.push(scan.id);
    }
    const dbSamples: number[] = [];
    for (const scanId of scanIds) {
      const start = performance.now();
      const result = await resolvePlan(
        {
          db: prisma as never,
          registry: passiveBaselineRegistry(),
          isAuthorized: async () => {
            throw new Error('passive plan unexpectedly requested authorization');
          },
        },
        { targetId, profile: { kind: 'CUSTOM', domains: ['UI'] } },
        'INITIAL',
        new Date(),
        { scanId },
      );
      if (result.state !== 'RESOLVED')
        throw new Error(`passive plan refused: ${result.refusalReason}`);
      unitIds.push(result.units[0]!.id);
      dbSamples.push(performance.now() - start);
    }
    dbSamples.sort((a, b) => a - b);
    planResolution = {
      benchmark: 'spec009-passive-plan-resolution-postgres',
      plans: dbSamples.length,
      unitsPerPlan: 1,
      p50_ms: dbSamples[Math.floor(dbSamples.length * 0.5)]!,
      p95_ms: dbSamples[Math.floor(dbSamples.length * 0.95)]!,
      min_ms: dbSamples[0]!,
      max_ms: dbSamples.at(-1)!,
      database: new URL(isolatedDatabaseUrl).pathname.slice(1),
    };

    const store = createMemoryArtifactStore();
    const inlineSamples: number[] = [];
    for (let i = 0; i < unitIds.length; i += 1) {
      const start = performance.now();
      await recordEvidence(prisma as never, store, {
        executionUnitId: unitIds[i]!,
        userId,
        kind: 'HTTP_TRANSACTION',
        payload: { status: 200, sample: i, note: 'inline-evidence-benchmark' },
      });
      inlineSamples.push(performance.now() - start);
    }
    inlineSamples.sort((a, b) => a - b);
    evidenceMetrics = {
      benchmark: 'spec009-inline-evidence-postgres',
      rows: inlineSamples.length,
      p50_ms: inlineSamples[Math.floor(inlineSamples.length * 0.5)]!,
      p95_ms: inlineSamples[Math.floor(inlineSamples.length * 0.95)]!,
      min_ms: inlineSamples[0]!,
      max_ms: inlineSamples.at(-1)!,
    };

    const artifactSamples: number[] = [];
    const largePayload = { body: 'x'.repeat(20 * 1024) };
    for (let i = 0; i < unitIds.length; i += 1) {
      const start = performance.now();
      const result = await recordEvidence(prisma as never, store, {
        executionUnitId: unitIds[i]!,
        userId,
        kind: 'HTTP_TRANSACTION',
        payload: largePayload,
      });
      if (result.artifactId === null) throw new Error('large evidence did not create an artifact');
      artifactSamples.push(performance.now() - start);
    }
    artifactSamples.sort((a, b) => a - b);
    artifactMetrics = {
      benchmark: 'spec009-artifact-metadata-with-memory-store',
      rows: artifactSamples.length,
      objectBytes: Buffer.byteLength(JSON.stringify(largePayload), 'utf8'),
      p50_ms: artifactSamples[Math.floor(artifactSamples.length * 0.5)]!,
      p95_ms: artifactSamples[Math.floor(artifactSamples.length * 0.95)]!,
      min_ms: artifactSamples[0]!,
      max_ms: artifactSamples.at(-1)!,
      storedObjects: store.objects.size,
    };

    const finalizationSamples: number[] = [];
    const finalizationUnits = await prisma.executionUnit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, idempotencyKey: true },
    });
    if (finalizationUnits.length !== unitIds.length)
      throw new Error('benchmark finalization fixture count mismatch');
    const finalizationStart = performance.now();
    for (const unit of finalizationUnits) {
      const start = performance.now();
      const outcome = await finalizeExecutionUnit(prisma as never, unit.id, unit.idempotencyKey, {
        kind: 'REFUSED',
        reason: 'PERFORMANCE_BENCHMARK',
      });
      if (outcome.replayed || outcome.status !== 'REFUSED')
        throw new Error(`benchmark finalization did not commit for ${unit.id}`);
      finalizationSamples.push(performance.now() - start);
    }
    finalizationSamples.sort((a, b) => a - b);
    const finalizationTotalMs = performance.now() - finalizationStart;
    finalizationMetrics = {
      benchmark: 'spec009-planned-unit-refused-finalization-postgres',
      units: finalizationSamples.length,
      total_ms: finalizationTotalMs,
      units_per_second: finalizationSamples.length / (finalizationTotalMs / 1000),
      p50_ms: finalizationSamples[Math.floor(finalizationSamples.length * 0.5)]!,
      p95_ms: finalizationSamples[Math.floor(finalizationSamples.length * 0.95)]!,
      min_ms: finalizationSamples[0]!,
      max_ms: finalizationSamples.at(-1)!,
    };

    const sweepPlanIds: string[] = [];
    for (let i = 0; i < runCount; i += 1) {
      const scan = await prisma.scan.create({
        data: {
          userId,
          targetId,
          requestedModules: ['SECURITY'],
          capabilitySnapshot: {},
          quotedCredits: 10,
          chargedCredits: 10,
          state: 'FAILED',
          completedAt: new Date(),
        },
      });
      scanIds.push(scan.id);
      const result = await resolvePlan(
        {
          db: prisma as never,
          registry: passiveBaselineRegistry(),
          isAuthorized: async () => {
            throw new Error('passive plan unexpectedly requested authorization');
          },
        },
        { targetId, profile: { kind: 'CUSTOM', domains: ['UI'] } },
        'INITIAL',
        new Date(),
        { scanId: scan.id },
      );
      if (result.state !== 'RESOLVED')
        throw new Error(`failed-scan sweep fixture plan refused: ${result.refusalReason}`);
      sweepPlanIds.push(result.planId);
    }
    const sweepSamples: number[] = [];
    for (const scanPlanId of sweepPlanIds) {
      const start = performance.now();
      const outcome = await expirePlanUnits(prisma as never, scanPlanId);
      if (outcome.finalized.length !== 1 || outcome.untouched.length !== 0)
        throw new Error(`benchmark sweep finalized ${outcome.finalized.length} units`);
      sweepSamples.push(performance.now() - start);
    }
    sweepSamples.sort((a, b) => a - b);
    sweepMetrics = {
      benchmark: 'spec009-expire-plan-units-failed-scan-postgres',
      plans: sweepSamples.length,
      p50_ms: sweepSamples[Math.floor(sweepSamples.length * 0.5)]!,
      p95_ms: sweepSamples[Math.floor(sweepSamples.length * 0.95)]!,
      min_ms: sweepSamples[0]!,
      max_ms: sweepSamples.at(-1)!,
    };
  } finally {
    if (scanIds.length > 0) {
      await prisma.evidence.deleteMany({
        where: { executionUnit: { scanPlan: { scanId: { in: scanIds } } } },
      });
      await prisma.artifact.deleteMany({ where: { scanId: { in: scanIds } } });
      await prisma.executionDependency.deleteMany({
        where: { executionUnit: { scanPlan: { scanId: { in: scanIds } } } },
      });
      await prisma.executionUnit.deleteMany({ where: { scanPlan: { scanId: { in: scanIds } } } });
      await prisma.scanPlan.deleteMany({ where: { scanId: { in: scanIds } } });
      await prisma.scan.deleteMany({ where: { id: { in: scanIds } } });
    }
    if (targetId !== undefined) await prisma.target.deleteMany({ where: { id: targetId } });
    if (userId !== undefined) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
}

const redisUrl = process.env['TEST_REDIS_URL'];
let queueLatency: Record<string, number | string> | null = null;
if (redisUrl !== undefined) {
  const redis = new URL(redisUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(redis.hostname))
    throw new Error('TEST_REDIS_URL must point to an isolated local Redis endpoint');
  const connection = {
    host: redis.hostname,
    port: Number(redis.port || 6379),
    ...(redis.password === '' ? {} : { password: decodeURIComponent(redis.password) }),
    ...(redis.username === '' ? {} : { username: decodeURIComponent(redis.username) }),
    ...(redis.pathname.length <= 1 ? {} : { db: Number(redis.pathname.slice(1)) }),
    maxRetriesPerRequest: null,
  };
  const prefix = `spec009-perf-${process.pid}-${Date.now()}`;
  const queues = createExecQueues(connection, prefix);
  const enqueuedAt = new Map<string, number>();
  const latencies: number[] = [];
  const burstLatencies: number[] = [];
  let handled = 0;
  const workers = createExecWorkers({
    connection,
    prefix,
    classes: ['BROWSER'],
    concurrency: 4,
    handle: async ({ executionUnitId }) => {
      const started = performance.now();
      const queued = enqueuedAt.get(executionUnitId);
      if (queued !== undefined) {
        (executionUnitId.startsWith('burst-') ? burstLatencies : latencies).push(started - queued);
      }
      handled += 1;
    },
  });
  try {
    await Promise.all([...queues.queues.values()].map((queue) => queue.waitUntilReady()));
    await Promise.all(workers.workers.map((worker) => worker.waitUntilReady()));
    for (let i = 0; i < runCount; i += 1) {
      const id = `job-${i}`;
      const addedAt = performance.now();
      enqueuedAt.set(id, addedAt);
      await enqueueExecutionUnit(queues, {
        id,
        executionUnitClass: 'BROWSER',
        attempt: 1,
      });
      const handlerDeadline = Date.now() + 30_000;
      while (handled < i + 1) {
        if (Date.now() >= handlerDeadline) throw new Error(`queue handler timed out for ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }
    latencies.sort((a, b) => a - b);
    queueLatency = {
      benchmark: 'spec009-bullmq-enqueue-to-adapter-handler-start',
      jobs: runCount,
      p50_ms: latencies[Math.floor(runCount * 0.5)]!,
      p95_ms: latencies[Math.floor(runCount * 0.95)]!,
      min_ms: latencies[0]!,
      max_ms: latencies.at(-1)!,
      redis: `${redis.hostname}:${redis.port || '6379'}`,
    };

    const burstJobs = 500;
    const burstStartHandled = handled;
    const burstStart = performance.now();
    await Promise.all(
      Array.from({ length: burstJobs }, async (_, i) => {
        const id = `burst-${i}`;
        enqueuedAt.set(id, performance.now());
        await enqueueExecutionUnit(queues, { id, executionUnitClass: 'BROWSER', attempt: 1 });
      }),
    );
    const burstDeadline = Date.now() + 60_000;
    while (handled < burstStartHandled + burstJobs) {
      if (Date.now() >= burstDeadline) throw new Error('burst queue handler timed out');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const burstElapsedMs = performance.now() - burstStart;
    burstLatencies.sort((a, b) => a - b);
    queueBurstMetrics = {
      benchmark: 'spec009-bullmq-500-job-burst-throughput',
      jobs: burstJobs,
      workerConcurrency: 4,
      elapsed_ms: burstElapsedMs,
      jobs_per_second: burstJobs / (burstElapsedMs / 1000),
      enqueue_to_handler_p50_ms: burstLatencies[Math.floor(burstJobs * 0.5)]!,
      enqueue_to_handler_p95_ms: burstLatencies[Math.floor(burstJobs * 0.95)]!,
      redis: `${redis.hostname}:${redis.port || '6379'}`,
    };
  } finally {
    await workers.close();
    await Promise.all(
      [...queues.queues.values()].map((queue) => queue.obliterate({ force: true })),
    );
    await queues.close();
  }
}

console.log(
  JSON.stringify(
    {
      benchmark: 'spec009-performance-smoke',
      nodes: nodeCount,
      edges: edges.length,
      runs: runCount,
      p50_ms: samples[Math.floor(runCount * 0.5)],
      p95_ms: samples[Math.floor(runCount * 0.95)],
      min_ms: samples[0],
      max_ms: samples.at(-1),
      runtime: process.version,
      platform: process.platform,
      arch: process.arch,
      containerized: false,
      planResolution,
      evidenceMetrics,
      artifactMetrics,
      finalizationMetrics,
      sweepMetrics,
      queueLatency,
      queueBurstMetrics,
    },
    null,
    2,
  ),
);
