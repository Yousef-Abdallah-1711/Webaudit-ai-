/**
 * P0-CANCEL-1 — "a debit that already committed must not become a persisted,
 * charged result for a check the user was already told is undelivered."
 *
 * Reproduces the exact race the full-workflow review found
 * (docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md, Section
 * 6): a capability is still running inside `runModule` when the scan is
 * cancelled. Before this fix, the capability finished, `persistModuleResult`
 * ran regardless, and a real `ModuleResult`/`CapabilityExecution` row landed
 * on a scan the user had already been refunded for. This test drives a real
 * `db.scan.update` to `CANCELLED` (the same write `apps/api`'s cancel route
 * performs) and a real cancellation-source notification *while the capability
 * is deterministically still in flight* — synchronized via promises, not
 * timing guesses — then asserts nothing is ever persisted for that module.
 *
 * `loadCapabilities` is mocked so this suite controls exactly when the one
 * capability under test starts and finishes, without depending on a real
 * vendored capability's own timing.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityFinding, ModuleType } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, type Provider } from '@webaudit/ai-executor';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';
import { createFakeCancellationSource } from '../helpers/fake-cancellation-source.js';

/** Deterministic synchronization: the test controls exactly when the
 *  capability starts (so it can cancel mid-flight, not before or after) and
 *  exactly when it finishes (so the assertions run after persistence would
 *  have happened, if the checkpoint guard did not exist). */
let capabilityStarted: () => void = () => undefined;
const startedPromise = new Promise<void>((resolve) => {
  capabilityStarted = resolve;
});
let releaseCapability: () => void = () => undefined;
const releasePromise = new Promise<void>((resolve) => {
  releaseCapability = resolve;
});

const DELAYED_CAPABILITY_ID = 'test-delayed-capability';

function delayedCapability(): AuditCapability {
  return {
    id: DELAYED_CAPABILITY_ID,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: async (): Promise<CapabilityFinding[]> => {
      capabilityStarted();
      await releasePromise;
      return [
        {
          checkId: `${DELAYED_CAPABILITY_ID}.check`,
          fingerprintParts: [DELAYED_CAPABILITY_ID],
          severity: 'MEDIUM',
          title: 'Should never be persisted',
          description: 'This finding must not survive a mid-flight cancellation.',
          fixable: true,
        },
      ];
    },
  };
}

vi.mock('../../src/orchestrator/capability-loader.js', () => ({
  loadCapabilities: (_module: ModuleType) => Promise.resolve([delayedCapability()]),
}));

function stubProvider(vendor: string): Provider {
  return {
    vendor,
    model: `${vendor}-stub`,
    pricing: { inputMicrosPerMillion: 1, outputMicrosPerMillion: 1 },
    generate: () => Promise.reject(new Error(`${vendor} must not be invoked by this suite`)),
  };
}

const executor = createExecutor({
  chain: [stubProvider('a'), stubProvider('b')],
  timeoutMs: 5_000,
});

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };

async function makeUser(email: string): Promise<string> {
  const user = await db.user.create({
    data: { email, passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  return user.id;
}

async function makeTarget(userId: string): Promise<string> {
  const target = await db.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: 'https://cancel-mid-flight.example.com',
      displayName: 'cancel-mid-flight',
      controlLevel: 'NONE',
    },
  });
  return target.id;
}

async function seedCapabilityRow(): Promise<void> {
  await db.capability.create({
    data: {
      id: DELAYED_CAPABILITY_ID,
      name: DELAYED_CAPABILITY_ID,
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      trust: 'VENDORED',
      requiredControlLevel: 'NONE',
      isEnabled: true,
    },
  });
}

async function makeScan(userId: string, targetId: string): Promise<string> {
  const scan = await db.scan.create({
    data: {
      userId,
      targetId,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 10,
      chargedCredits: 10,
      state: 'QUEUED',
    },
  });
  return scan.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('P0-CANCEL-1 — a scan cancelled mid-flight persists nothing and charges nothing for the in-flight check', () => {
  it('never writes ModuleResult/Issue/CapabilityExecution for a capability still running when cancellation is discovered', async () => {
    const userId = await makeUser('cancel-mid-flight@example.com');
    const targetId = await makeTarget(userId);
    await seedCapabilityRow();
    const scanId = await makeScan(userId, targetId);

    const fakeCancellation = createFakeCancellationSource();
    const options: OrchestratorOptions = {
      db,
      queues: {
        scanPhase: { add: () => Promise.resolve({ id: 'stub-job' }) } as never,
        maintenance: { add: () => Promise.resolve({ id: 'stub-job' }) } as never,
      },
      publisher: { publish: () => Promise.resolve(1) },
      executor,
      cancellation: fakeCancellation,
      moduleTimeoutMs: 15_000,
    };

    const handlePhase = createPhaseHandler(options);
    const handlePromise = handlePhase(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    // Wait until the capability has genuinely started — cancelling before
    // this point would only prove Checkpoint A (skip-before-start), not the
    // harder, more important Checkpoint B (skip-before-persist).
    await startedPromise;

    // The same write apps/api's cancel route performs, simulated directly —
    // this test exercises the worker-side checkpoint guard in isolation from
    // the HTTP layer, matching this repo's existing orchestrator-test style
    // (`orchestrator-control-gate.test.ts` does the same).
    await db.scan.update({
      where: { id: scanId },
      data: { state: 'CANCELLED', completedAt: new Date() },
    });
    fakeCancellation.cancel(scanId);

    // Now let the capability actually finish — if the checkpoint guard did
    // not exist, this is the moment persistModuleResult would have run.
    releaseCapability();
    await handlePromise;

    const moduleResult = await db.moduleResult.findUnique({
      where: { scanId_module: { scanId, module: 'SECURITY' } },
    });
    expect(moduleResult).toBeNull();

    const issues = await db.issue.findMany({ where: { scanId } });
    expect(issues).toHaveLength(0);

    const executions = await db.capabilityExecution.findMany({ where: { scanId } });
    expect(executions).toHaveLength(0);

    const aiInvocations = await db.aiInvocation.findMany({ where: { scanId } });
    expect(aiInvocations).toHaveLength(0);

    // The scan is exactly as the cancel route left it — CANCELLED, and the
    // phase walk-forward never advanced it anywhere else.
    const scan = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan.state).toBe('CANCELLED');
  });
});
