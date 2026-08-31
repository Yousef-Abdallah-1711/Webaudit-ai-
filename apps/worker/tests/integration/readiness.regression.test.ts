/**
 * T159 — FR-069: "identify and name any area or issue that has become worse
 * since the original audit" — a *named* regression, not merely a lower score.
 *
 * Drives the real `RUNNING_DOCS` handler (`finalizeReadiness`) with a baseline
 * and a deliberately-worse fresh scan, then reads the persisted
 * `ReadinessVerdict`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import type { ModuleState, ModuleType, ScanState } from '@webaudit/types';
import { createPhaseHandler, type OrchestratorOptions } from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'j', name: 'phase', queueName: 'scan-phase', data: {} };
const fakeQueue = (): Queue => ({ add: () => Promise.resolve({ id: 's' }) }) as unknown as Queue;
const opts = (): OrchestratorOptions => ({
  db,
  queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
  publisher: { publish: () => Promise.resolve(1) },
  executor: createExecutorFromEnv(),
  moduleTimeoutMs: 20_000,
});

const ALL = ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'] as const;

async function scanWithAreas(
  userId: string,
  targetId: string,
  kind: 'INITIAL' | 'READINESS',
  areas: ReadonlyArray<{
    module: ModuleType;
    state: ModuleState;
    score: number | null;
    degradedReason?: string;
  }>,
  o: { baselineScanId?: string; state?: ScanState; overallScore?: number } = {},
): Promise<string> {
  const scan = await db.scan.create({
    data: {
      user: { connect: { id: userId } },
      target: { connect: { id: targetId } },
      kind,
      requestedModules: [...ALL],
      capabilitySnapshot: {},
      quotedCredits: 60,
      chargedCredits: 60,
      state: o.state ?? 'COMPLETED',
      overallScore: o.overallScore ?? null,
      ...(o.baselineScanId === undefined
        ? {}
        : { baseline: { connect: { id: o.baselineScanId } } }),
    },
  });
  for (const a of areas) {
    await db.moduleResult.create({
      data: {
        scanId: scan.id,
        module: a.module,
        state: a.state,
        score: a.score,
        degradedReason: a.degradedReason ?? null,
        completedAt: new Date(),
      },
    });
  }
  return scan.id;
}

describe('FR-069 — regressions are named, not merely a lower number', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    await reconcileCapabilitiesAtBoot(db);
  });
  afterAll(closeDb);

  it('names an area whose score fell and a fix that came back; verdict is no-go with those blockers', async () => {
    const user = await db.user.create({ data: { email: 'reg@example.com', emailVerifiedAt: new Date() } });
    const target = await db.target.create({
      data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://reg.example.com', displayName: 'reg' },
    });

    const baselineId = await scanWithAreas(
      user.id,
      target.id,
      'INITIAL',
      ALL.map((m) => ({ module: m, state: 'COMPLETE', score: 90 })),
      { overallScore: 90 },
    );
    // A HIGH issue verified fixed in the baseline.
    const baseMr = await db.moduleResult.findFirstOrThrow({ where: { scanId: baselineId, module: 'SECURITY' } });
    await db.issue.create({
      data: {
        scanId: baselineId,
        moduleResultId: baseMr.id,
        fingerprint: 'fp-hsts',
        checkId: 'ssl.hsts-missing',
        severity: 'HIGH',
        title: 'Missing HSTS header',
        explanation: 'x',
        consequence: 'y',
        attribution: 'MEASURED',
        fixPrompt: 'z',
        state: 'RESOLVED',
        resolvedAt: new Date(),
        previouslyResolved: true,
      },
    });

    // Fresh: SECURITY score collapsed; the HSTS issue is back.
    const readinessId = await scanWithAreas(
      user.id,
      target.id,
      'READINESS',
      [
        { module: 'PERFORMANCE', state: 'COMPLETE', score: 90 },
        { module: 'SECURITY', state: 'COMPLETE', score: 45 },
        { module: 'UI', state: 'COMPLETE', score: 90 },
        { module: 'TESTING', state: 'COMPLETE', score: 90 },
        { module: 'SEO', state: 'COMPLETE', score: 90 },
      ],
      { baselineScanId: baselineId, state: 'RUNNING_MASTER' },
    );
    const freshMr = await db.moduleResult.findFirstOrThrow({
      where: { scanId: readinessId, module: 'SECURITY' },
    });
    await db.issue.create({
      data: {
        scanId: readinessId,
        moduleResultId: freshMr.id,
        fingerprint: 'fp-hsts',
        checkId: 'ssl.hsts-missing',
        severity: 'HIGH',
        title: 'Missing HSTS header',
        explanation: 'x',
        consequence: 'y',
        attribution: 'MEASURED',
        fixPrompt: 'z',
        state: 'OPEN',
      },
    });

    await createPhaseHandler(opts())(
      { scanId: readinessId, phase: 'RUNNING_DOCS', modules: [...ALL], attempt: 1 },
      FAKE_JOB,
    );

    const verdict = await db.readinessVerdict.findUniqueOrThrow({ where: { scanId: readinessId } });
    expect(verdict.isReady).toBe(false);

    const regressionNames = (verdict.regressions as { name: string }[]).map((r) => r.name);
    expect(regressionNames).toContain('Security regressed: score fell from 90 to 45');
    expect(regressionNames).toContain(
      'Regressed: "Missing HSTS header" was verified fixed and has returned',
    );

    // The named regressions are also in the blockers list (FR-070).
    for (const name of regressionNames) {
      expect(verdict.blockers).toContain(name);
    }
  });

  it('a COMPLETE → DEGRADED area is a named regression even at the same score', async () => {
    const user = await db.user.create({ data: { email: 'deg@example.com', emailVerifiedAt: new Date() } });
    const target = await db.target.create({
      data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://deg.example.com', displayName: 'deg' },
    });
    const baselineId = await scanWithAreas(
      user.id,
      target.id,
      'INITIAL',
      ALL.map((m) => ({ module: m, state: 'COMPLETE', score: 90 })),
      { overallScore: 90 },
    );
    const readinessId = await scanWithAreas(
      user.id,
      target.id,
      'READINESS',
      [
        { module: 'PERFORMANCE', state: 'COMPLETE', score: 90 },
        { module: 'SECURITY', state: 'COMPLETE', score: 90 },
        { module: 'UI', state: 'COMPLETE', score: 90 },
        { module: 'TESTING', state: 'DEGRADED', score: 90, degradedReason: 'the AI provider chain was exhausted' },
        { module: 'SEO', state: 'COMPLETE', score: 90 },
      ],
      { baselineScanId: baselineId, state: 'RUNNING_MASTER' },
    );

    await createPhaseHandler(opts())(
      { scanId: readinessId, phase: 'RUNNING_DOCS', modules: [...ALL], attempt: 1 },
      FAKE_JOB,
    );

    const verdict = await db.readinessVerdict.findUniqueOrThrow({ where: { scanId: readinessId } });
    const names = (verdict.regressions as { name: string }[]).map((r) => r.name);
    expect(names.some((n) => n.startsWith('Testing regressed') && n.includes('exhausted'))).toBe(true);
    expect(verdict.isReady).toBe(false);
  });
});
