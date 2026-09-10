/**
 * T253 — end to end proof that an operator-installed capability really runs
 * during a real scan. Tasks 1-4 built discovery, the sandbox `RUN_CODE_LAYER`
 * dispatch, and the host-side client; Task 5 made a passing upload write a
 * real `Capability` row. Nothing before this test ever ran all of it
 * together against a real `sandbox-runner` and a real orchestrator phase —
 * this proves the finding an installed capability produces lands as a real,
 * persisted `Issue`, not just a conformance-check artifact.
 *
 * Modelled on `orchestrator-capability-enabled.test.ts` (same real-DB,
 * real-orchestrator pattern); adds a real `createSandboxHost` and a real
 * on-disk installed capability, since this suite's whole point is that both
 * of those are genuine, not mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import { createSandboxHost, type SandboxHost } from '@webaudit/sandbox-runner';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
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

const CAPABILITY_ID = 't253-installed-e2e';
const REAL_FINDING_TITLE = 'installed capability really ran inside sandbox-runner';

// The same expression-only bundle shape `run-code-layer-op.test.ts` and the
// upload contract tests already use: a JS source file whose completion
// value is the AuditCapability-shaped object literal, wrapped in parens
// because a bare object literal is statement-ambiguous to the parser.
const INSTALLED_BUNDLE = `({
  id: '${CAPABILITY_ID}',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => ([{
    checkId: '${CAPABILITY_ID}',
    fingerprintParts: ['${CAPABILITY_ID}'],
    severity: 'LOW',
    title: '${REAL_FINDING_TITLE}',
    description: 'real end-to-end proof, not a mock',
    evidence: {},
    fixable: false,
  }]),
})`;

function writeInstalledCapability(root: string): void {
  const dir = path.join(root, CAPABILITY_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'bundle.js'), INSTALLED_BUNDLE);
  writeFileSync(
    path.join(dir, 'capability.manifest.json'),
    JSON.stringify({
      id: CAPABILITY_ID,
      name: 'T253 installed e2e',
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      entrypoint: 'bundle.js',
      requiresCode: false,
      requiresScreenshot: false,
      requiredControlLevel: 'NONE',
      estimatedTokens: 0,
    }),
  );
}

async function scanFor(modules: readonly ('SECURITY' | 'SEO')[]): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `installed-e2e-${Date.now()}@x.com`,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
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

describe('an installed capability really dispatches through sandbox-runner during a real scan', () => {
  let sandboxHost: SandboxHost;
  let installedRoot: string;

  beforeAll(async () => {
    sandboxHost = await createSandboxHost({ port: 0 });
    process.env['SANDBOX_RUNNER_URL'] = `http://127.0.0.1:${String(sandboxHost.port)}`;
    installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-e2e-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    writeInstalledCapability(installedRoot);
  });

  afterAll(async () => {
    delete process.env['SANDBOX_RUNNER_URL'];
    delete process.env['INSTALLED_CAPABILITIES_ROOT'];
    await sandboxHost.close();
    await closeDb();
  });

  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    await reconcileCapabilitiesAtBoot(db);
  });

  it('a real scan phase gets a real, persisted Issue from a real installed capability, never import()d in this process', async () => {
    const installed = await db.capability.findUnique({ where: { id: CAPABILITY_ID } });
    expect(installed?.trust).toBe('INSTALLED');
    expect(installed?.isEnabled).toBe(true);

    const scanId = await scanFor(['SECURITY']);
    await createPhaseHandler(options())(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    const exec = await db.capabilityExecution.findFirst({
      where: { scanId, capabilityId: CAPABILITY_ID },
    });
    expect(exec).not.toBeNull();
    expect(exec?.succeeded).toBe(true);

    const moduleResult = await db.moduleResult.findUniqueOrThrow({
      where: { scanId_module: { scanId, module: 'SECURITY' } },
    });
    const issues = await db.issue.findMany({ where: { moduleResultId: moduleResult.id } });
    const ours = issues.find((i) => i.title === REAL_FINDING_TITLE);
    expect(ours).toBeDefined();
    // FR-032/SC-006 — a code-layer finding is MEASURED, assigned by the
    // runner, never by the capability (which never even mentions attribution).
    expect(ours?.attribution).toBe('MEASURED');
  });

  // T255 — every other test in this file proves an enabled installed
  // capability really dispatches; `capability-loader.ts`'s `enabledIds`
  // filter (the same mechanism `orchestrator-capability-enabled.test.ts`
  // proves for a vendored capability) had never been exercised for the
  // INSTALLED path specifically before this.
  it('does not dispatch to the sandbox once an operator disables the installed capability', async () => {
    await db.capability.update({
      where: { id: CAPABILITY_ID },
      data: { isEnabled: false },
    });

    const scanId = await scanFor(['SECURITY']);
    await createPhaseHandler(options())(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    const exec = await db.capabilityExecution.findFirst({
      where: { scanId, capabilityId: CAPABILITY_ID },
    });
    expect(exec, 'a disabled installed capability must not dispatch to the sandbox').toBeNull();
  });
});
