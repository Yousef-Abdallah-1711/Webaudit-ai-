/**
 * Engineering-review finding / open decision #13 — `capability-loader.ts` was a
 * static import table that ignored the registry's `isEnabled` flag entirely, so
 * an operator who disabled a capability saw it keep running until the next
 * deploy (SC-011 says "disabling any capability leaves audits completable — the
 * area reports it unavailable").
 *
 * The orchestrator now reads `isEnabled: true` per module and threads the set
 * into `loadCapabilities`. This proves: a disabled capability does not execute,
 * and a module with every capability disabled resolves NOT_APPLICABLE rather
 * than running them anyway.
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

const FAKE_JOB: JobRef = { id: 'j', name: 'phase', queueName: 'scan-phase', data: {} };
const fakeQueue = () => ({ add: () => Promise.resolve({ id: 's' }) }) as unknown as Queue;

function options(): OrchestratorOptions {
  return {
    db,
    queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
    publisher: { publish: () => Promise.resolve(1) },
    executor: createExecutorFromEnv(),
    moduleTimeoutMs: 20_000,
  };
}

async function scanFor(modules: readonly ('SECURITY' | 'SEO')[]): Promise<string> {
  const user = await db.user.create({
    data: { email: `enable-${Date.now()}@x.com`, passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  const target = await db.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://example.com',
      displayName: 'x',
      controlLevel: 'NONE',
    },
  });
  const scan = await db.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: [...modules],
      capabilitySnapshot: {},
      quotedCredits: 30,
      chargedCredits: 30,
      state: 'QUEUED',
      startedAt: new Date(),
    },
  });
  return scan.id;
}

describe('the orchestrator honours the registry isEnabled flag', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    await reconcileCapabilitiesAtBoot(db);
  });
  afterAll(closeDb);

  it('does not execute a capability an operator disabled', async () => {
    await db.capability.update({
      where: { id: 'headers-checker' },
      data: { isEnabled: false },
    });

    const scanId = await scanFor(['SECURITY']);
    await createPhaseHandler(options())(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    const execs = await db.capabilityExecution.findMany({
      where: { scanId, module: 'SECURITY' },
      select: { capabilityId: true },
    });
    const ids = execs.map((e) => e.capabilityId);
    expect(ids, 'the disabled capability must not have an execution row').not.toContain(
      'headers-checker',
    );
    // The others still ran.
    expect(ids).toContain('ssl-analyzer');
  });

  it('resolves a module NOT_APPLICABLE when every capability is disabled', async () => {
    await db.capability.updateMany({ where: { module: 'SEO' }, data: { isEnabled: false } });

    const scanId = await scanFor(['SEO']);
    await createPhaseHandler(options())(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SEO'], attempt: 1 },
      FAKE_JOB,
    );

    const seo = await db.moduleResult.findUnique({
      where: { scanId_module: { scanId, module: 'SEO' } },
    });
    expect(seo?.state).toBe('NOT_APPLICABLE');
    const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(after.state).not.toBe('FAILED');
  });
});
