/**
 * Engineering-review finding C1 — a scan that includes the UI/Design area
 * fails at persist on an unreconciled foreign key.
 *
 * `persistModuleResult` writes the module's AI-execution row keyed
 * `module-ai:<module>` (`persist.ts`), but `CapabilityExecution.capabilityId`
 * is a required FK to `Capability.id` and nothing ever created those synthetic
 * rows — `reconcileCapabilitiesAtBoot` only reconciles the 13 discoverable
 * capability directories. Any module whose AI layer emits an invocation (UI,
 * via `impeccable`) therefore throws `CapabilityExecution_capabilityId_fkey`
 * out of persist, the phase job's catch calls `failScan`, and the whole scan
 * goes FAILED.
 *
 * This is also review finding M9: no end-to-end test covered a UI-area scan
 * through the real orchestrator + real DB (T109 e2e is SECURITY + SEO only),
 * which is why C1 shipped.
 *
 * RED before the fix: the phase handler catches the FK error and moves the
 * scan to FAILED. GREEN after: `ensurePlatformCapabilities` (called from
 * `reconcileCapabilitiesAtBoot` and here) has created the sentinel rows, the
 * UI module persists, and the scan completes.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import { createPhaseHandler, type OrchestratorOptions } from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };

function fakeQueue(): Queue {
  return { add: () => Promise.resolve({ id: 'stub-job' }) } as unknown as Queue;
}

function makeOptions(): OrchestratorOptions {
  return {
    db,
    queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
    publisher: { publish: () => Promise.resolve(1) },
    executor: createExecutorFromEnv(),
    moduleTimeoutMs: 20_000,
  };
}

describe('C1 — a UI-area scan completes through the real orchestrator', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    // The production boot path. Reconciles the 13 real capabilities AND the
    // module-ai:<module> platform sentinels.
    await reconcileCapabilitiesAtBoot(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('persists the UI module and does not fail the scan on the AI-execution FK', async () => {
    const user = await db.user.create({
      data: { email: 'c1@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    const target = await db.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'https://example.com',
        controlLevel: 'NONE',
      },
    });
    const scan = await db.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['UI'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'RUNNING_PHASE_1',
      },
    });

    const handle = createPhaseHandler(makeOptions());
    await handle({ scanId: scan.id, phase: 'RUNNING_PHASE_2', modules: ['UI'], attempt: 1 }, FAKE_JOB);

    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.state).not.toBe('FAILED');

    const uiResult = await db.moduleResult.findUnique({
      where: { scanId_module: { scanId: scan.id, module: 'UI' } },
    });
    expect(uiResult, 'the UI ModuleResult must be persisted').not.toBeNull();

    // The AI-execution row is written against a real Capability row now.
    const aiExec = await db.capabilityExecution.findFirst({
      where: { scanId: scan.id, capabilityId: 'module-ai:ui' },
    });
    expect(aiExec, 'the module-ai:ui execution row must persist').not.toBeNull();
  });
});
