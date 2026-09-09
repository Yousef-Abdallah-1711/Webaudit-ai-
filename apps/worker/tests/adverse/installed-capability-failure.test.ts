/**
 * T253 — "fail that one capability closed, module continues" (the design
 * decision this session confirmed for an installed capability whose
 * sandbox dispatch cannot complete). No new production code exists for
 * this: `code-layer.ts`'s existing `containCapabilityCall` wrapper
 * (T086/FR-022, exercised by the sibling `capability-failure.test.ts` for
 * an in-process `thrower`/`rejecter`) already treats a throwing
 * `runCodeLayer` as one failed capability, never a failed module — and
 * `capability-loader.ts`'s `makeSandboxedCapability` (T253, Task 4) throws
 * from `runCodeLayer` whenever `runCodeLayerCheck` comes back `!ok`. This
 * test proves those two pre-existing mechanisms compose correctly for a
 * REAL unreachable sandbox — a real TCP connection refusal, not a mock —
 * rather than asserting a new code path.
 *
 * Deliberately at the same `runModule` level as `capability-failure.test.ts`,
 * not a full DB-backed integration test (that is `installed-capability-
 * dispatch.test.ts`'s job): this suite only needs to prove the failure
 * shape, and staying at this level keeps it fast and DB-free.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CapabilityFinding } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, fixtureProvider } from '@webaudit/ai-executor';
import { runModule } from '../../src/module-runner/index.js';
import { refusingContext } from '../helpers/stub-registry.js';

const AI_REPLY = JSON.stringify({ summary: 'Interpretation.', insights: [], priorityOrder: [] });

function workingExecutor() {
  return createExecutor({
    chain: [
      fixtureProvider({ vendor: 'vendor-a', model: 'm1', reply: AI_REPLY }),
      fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply: AI_REPLY }),
    ],
    timeoutMs: 1000,
  });
}

function finding(id: string): CapabilityFinding {
  return {
    checkId: `${id}.check`,
    fingerprintParts: [id],
    severity: 'HIGH',
    title: `From ${id}`,
    description: 'Measured.',
    fixable: true,
  };
}

function good(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () => Promise.resolve([finding(id)]),
  };
}

const INSTALLED_ID = 'unreachable-installed';
const INSTALLED_BUNDLE = `({
  id: '${INSTALLED_ID}',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => { throw new Error('must never actually run — the sandbox is unreachable'); },
})`;

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

function writeInstalledCapability(root: string): void {
  const dir = path.join(root, INSTALLED_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'bundle.js'), INSTALLED_BUNDLE);
  writeFileSync(
    path.join(dir, 'capability.manifest.json'),
    JSON.stringify({
      id: INSTALLED_ID,
      name: 'Unreachable installed',
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

async function freshLoader(): Promise<{
  loadCapabilities: (module: 'SECURITY') => Promise<readonly AuditCapability[]>;
}> {
  const { vi } = await import('vitest');
  vi.resetModules();
  return import('../../src/orchestrator/capability-loader.js');
}

describe('T253 — an installed capability whose sandbox dispatch cannot complete fails closed', () => {
  it('degrades the area instead of failing it, and the other capability still delivers', async () => {
    const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-unreachable-'));
    writeInstalledCapability(installedRoot);
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    // A real port nothing listens on — a genuine, real connection refusal
    // through the real `runCodeLayerCheck` HTTP client, not a mock.
    process.env['SANDBOX_RUNNER_URL'] = 'http://127.0.0.1:1';

    const { loadCapabilities } = await freshLoader();
    const loaded = await loadCapabilities('SECURITY');
    const installed = loaded.find((c) => c.id === INSTALLED_ID);
    expect(installed, 'the installed capability must still be discovered and loaded').toBeDefined();

    const result = await runModule({
      module: 'SECURITY',
      capabilities: [good('ok'), installed!],
      input: { priorModuleResults: {}, targetUrl: 'https://example.com' },
      targetControlLevel: 'NONE',
      executor: workingExecutor(),
      makeContext: refusingContext,
      timeoutMs: 2000,
    });

    expect(result.state).toBe('DEGRADED');
    expect(result.findings.map((f) => f.checkId)).toEqual(['ok.check']);

    const failed = result.executions.find((e) => e.capabilityId === INSTALLED_ID);
    expect(failed?.succeeded).toBe(false);
    expect(failed?.findingCount).toBe(0);
    // The real, un-mocked failure reason a refused TCP connection produces.
    expect(failed?.errorMessage).toMatch(/fetch failed/i);

    const worked = result.executions.find((e) => e.capabilityId === 'ok');
    expect(worked?.succeeded).toBe(true);
    expect(worked?.findingCount).toBe(1);
  });
});
