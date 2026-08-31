/**
 * T158 — FR-067: "audit every area fresh during a readiness pass, and MUST NOT
 * reuse earlier results."
 *
 * That guarantee is kept by construction — a `READINESS` scan runs the same
 * orchestrator pipeline as an `INITIAL` one, and `persistModuleResult` writes
 * against the readiness scan's own id — so the observable claim to pin is:
 * after the readiness pass finalizes, its verdict is computed from the
 * readiness scan's *own* `ModuleResult` rows, and the baseline's rows are
 * neither read for scoring nor mutated.
 *
 * This drives the real `RUNNING_DOCS` phase handler (which calls
 * `finalizeReadiness`) with both scans' results hand-seeded, so it is
 * deterministic and needs no network — the fresh audit itself (which the
 * orchestrator does area-by-area) is covered by the Phase 3 orchestrator
 * suites.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import type { ScanState } from '@webaudit/types';
import { createPhaseHandler, type OrchestratorOptions } from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };
const fakeQueue = (): Queue => ({ add: () => Promise.resolve({ id: 's' }) }) as unknown as Queue;

function makeOptions(): OrchestratorOptions {
  return {
    db,
    queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
    publisher: { publish: () => Promise.resolve(1) },
    executor: createExecutorFromEnv(),
    moduleTimeoutMs: 20_000,
  };
}

const ALL: ReadonlyArray<'PERFORMANCE' | 'SECURITY' | 'UI' | 'TESTING' | 'SEO'> = [
  'PERFORMANCE',
  'SECURITY',
  'UI',
  'TESTING',
  'SEO',
];

async function seedCompletedScan(
  userId: string,
  targetId: string,
  kind: 'INITIAL' | 'READINESS',
  scores: Readonly<Record<string, number>>,
  opts: { baselineScanId?: string; state?: ScanState; overallScore?: number } = {},
): Promise<string> {
  const scan = await db.scan.create({
    data: {
      user: { connect: { id: userId } },
      target: { connect: { id: targetId } },
      kind,
      requestedModules: [...ALL],
      capabilitySnapshot: {},
      quotedCredits: kind === 'READINESS' ? 60 : 95,
      chargedCredits: kind === 'READINESS' ? 60 : 95,
      state: opts.state ?? 'COMPLETED',
      overallScore: opts.overallScore ?? null,
      ...(opts.baselineScanId === undefined
        ? {}
        : { baseline: { connect: { id: opts.baselineScanId } } }),
    },
  });
  for (const module of ALL) {
    await db.moduleResult.create({
      data: {
        scanId: scan.id,
        module,
        state: 'COMPLETE',
        score: scores[module] ?? 90,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }
  return scan.id;
}

describe('FR-067 — a readiness pass audits every area fresh', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    await reconcileCapabilitiesAtBoot(db);
  });
  afterAll(closeDb);

  it('computes the verdict from the readiness scan\'s own results and leaves the baseline untouched', async () => {
    const user = await db.user.create({
      data: { email: 'fresh@example.com', emailVerifiedAt: new Date() },
    });
    const target = await db.target.create({
      data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://fresh.example.com', displayName: 'fresh' },
    });

    // Baseline scored low; readiness scan (fresh) scored high.
    const baselineId = await seedCompletedScan(
      user.id,
      target.id,
      'INITIAL',
      { PERFORMANCE: 40, SECURITY: 40, UI: 40, TESTING: 40, SEO: 40 },
      { overallScore: 40 },
    );
    const baselineRows = await db.moduleResult.findMany({
      where: { scanId: baselineId },
      orderBy: { module: 'asc' },
    });

    const readinessId = await seedCompletedScan(
      user.id,
      target.id,
      'READINESS',
      { PERFORMANCE: 95, SECURITY: 95, UI: 95, TESTING: 95, SEO: 95 },
      { baselineScanId: baselineId, state: 'RUNNING_MASTER' },
    );

    const handle = createPhaseHandler(makeOptions());
    await handle({ scanId: readinessId, phase: 'RUNNING_DOCS', modules: [...ALL], attempt: 1 }, FAKE_JOB);

    const readinessScan = await db.scan.findUniqueOrThrow({ where: { id: readinessId } });
    expect(readinessScan.state).toBe('COMPLETED');

    const verdict = await db.readinessVerdict.findUniqueOrThrow({ where: { scanId: readinessId } });
    // Scored from the FRESH 95s, not the baseline 40s.
    expect(verdict.overallScore).toBe(95);
    expect(verdict.baselineScore).toBe(40);
    expect(verdict.isReady).toBe(true);

    // The baseline's ModuleResult rows are byte-identical — not read for the
    // score, not copied, not mutated.
    const baselineAfter = await db.moduleResult.findMany({
      where: { scanId: baselineId },
      orderBy: { module: 'asc' },
    });
    expect(baselineAfter).toEqual(baselineRows);

    // The readiness scan has its own distinct set of result rows.
    const readinessRows = await db.moduleResult.findMany({ where: { scanId: readinessId } });
    expect(readinessRows).toHaveLength(5);
    const baselineIds = new Set(baselineRows.map((r) => r.id));
    expect(readinessRows.every((r) => !baselineIds.has(r.id))).toBe(true);
  });
});
