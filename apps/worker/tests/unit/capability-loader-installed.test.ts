/**
 * T253 — `loadCapabilities` now also discovers `INSTALLED_CAPABILITIES_ROOT`
 * (the same directory `apps/api`'s upload path writes into), but never
 * `import()`s anything found there — Non-Negotiable #5 (constitution):
 * untrusted code runs in `sandbox-runner` only, no exceptions. Instead it
 * builds a wrapper `AuditCapability` whose `canRun`/`runCodeLayer` dispatch
 * to sandbox-runner over HTTP.
 *
 * Kept in its own file, not added to `capability-loader.test.ts`:
 * `capability-loader.ts`'s discovery/import caches are module-level
 * singletons, and vitest gives each test *file* its own fresh module
 * registry — sharing a file with T249's existing tests (which never set
 * `INSTALLED_CAPABILITIES_ROOT`) would let whichever test runs first
 * permanently cache an empty installed-discovery result for every test
 * after it in that file. `vi.resetModules()` + a dynamic import inside
 * each test here is the same isolation technique, one level further, so
 * even these two tests cannot leak their own caches into each other.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { loadCapabilities as LoadCapabilities } from '../../src/orchestrator/capability-loader.js';

vi.mock('@webaudit/sandbox-runner/dispatch', () => ({
  runCodeLayerCheck: vi.fn(),
}));

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  vi.resetModules();
  vi.clearAllMocks();
});

function writeInstalledCapability(installedRoot: string, id: string): void {
  const dir = path.join(installedRoot, id);
  mkdirSync(dir);
  // If this file is ever `import()`'d, the process-wide flag flips —
  // proving in-process execution never happens is the whole point of this
  // test, not just that the returned object "looks right".
  writeFileSync(
    path.join(dir, 'index.js'),
    `globalThis.__LANDMINE_TRIGGERED__ = true;\n({ id: '${id}', module: 'SECURITY', layer: 'CODE', canRun: () => true, runCodeLayer: async () => [] });\n`,
  );
  writeFileSync(
    path.join(dir, 'capability.manifest.json'),
    JSON.stringify({
      id,
      name: 'Landmine',
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      entrypoint: 'index.js',
      requiresCode: false,
      requiresScreenshot: false,
      requiredControlLevel: 'NONE',
      estimatedTokens: 0,
    }),
  );
}

async function freshLoader(): Promise<{ loadCapabilities: typeof LoadCapabilities }> {
  vi.resetModules();
  return import('../../src/orchestrator/capability-loader.js');
}

describe('loadCapabilities — installed capabilities', () => {
  it('never imports/evaluates the installed bundle in-process', async () => {
    const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-'));
    writeInstalledCapability(installedRoot, 'landmine');
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    process.env['SANDBOX_RUNNER_URL'] = 'http://sandbox.local';

    const { loadCapabilities } = await freshLoader();
    const capabilities = await loadCapabilities('SECURITY');
    const installed = capabilities.find((c) => c.id === 'landmine');

    expect(installed).toBeDefined();
    expect((globalThis as Record<string, unknown>)['__LANDMINE_TRIGGERED__']).toBeUndefined();
  });

  it("an installed capability's canRun/runCodeLayer dispatch through sandbox-runner, not in-process", async () => {
    const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-'));
    writeInstalledCapability(installedRoot, 'dispatches');
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    process.env['SANDBOX_RUNNER_URL'] = 'http://sandbox.local';

    const { runCodeLayerCheck } = await import('@webaudit/sandbox-runner/dispatch');
    vi.mocked(runCodeLayerCheck).mockResolvedValue({
      ok: true,
      applicable: true,
      findings: [
        {
          checkId: 'x',
          fingerprintParts: ['x'],
          severity: 'LOW',
          title: 'x',
          description: 'x',
          evidence: {},
          fixable: false,
        },
      ],
    });

    const { loadCapabilities } = await freshLoader();
    const capabilities = await loadCapabilities('SECURITY');
    const installed = capabilities.find((c) => c.id === 'dispatches')!;

    const applies = await installed.canRun({
      targetUrl: 'https://example.com/',
      priorModuleResults: {},
    });
    expect(applies).toBe(true);
    const findings = await installed.runCodeLayer!(
      { targetUrl: 'https://example.com/', priorModuleResults: {} },
      {} as never,
    );
    expect(findings).toHaveLength(1);
    expect(vi.mocked(runCodeLayerCheck)).toHaveBeenCalled();
  });

  it('vendored capabilities are unaffected — still discovered and loaded exactly as before', async () => {
    const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-empty-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;

    const { loadCapabilities } = await freshLoader();
    const capabilities = await loadCapabilities('SECURITY');
    const ids = capabilities.map((c) => c.id).sort();

    expect(ids).toEqual(
      [
        'data-leak-scanner',
        'dependency-scanner',
        'headers-checker',
        'owasp-checker',
        'ssl-analyzer',
      ].sort(),
    );
  });
});
