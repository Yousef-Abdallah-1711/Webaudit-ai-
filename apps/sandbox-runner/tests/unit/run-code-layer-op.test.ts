/**
 * T253 — `RUN_CODE_LAYER` is the sandbox operation apps/worker dispatches an
 * installed capability's real code-layer work through during a real scan.
 * Before this test, nothing exercised `runCodeLayerOp` at all — it was
 * implemented (T220) but never called by anything.
 *
 * `canRun` is folded into this same dispatch (one process fork per call, not
 * two) — this test is the proof that folding happened correctly: a declining
 * capability's `runCodeLayer` must never be reached at all.
 */
import { describe, expect, it } from 'vitest';
import { loadCapabilityFromBundle } from '../../src/child-harness/load.js';
import { runCodeLayerOp } from '../../src/child-harness/harness.js';
import type { SandboxRequest } from '../../src/protocol.js';

const DECLINING_BUNDLE = `({
  id: 'declines',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => false,
  runCodeLayer: async () => {
    throw new Error('runCodeLayer must never be called when canRun returned false');
  },
})`;

const APPLICABLE_BUNDLE = `({
  id: 'applies',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => [{
    checkId: 'x', fingerprintParts: ['x'], severity: 'LOW',
    title: 'x', description: 'x', evidence: {}, fixable: false,
  }],
})`;

function baseRequest(bundle: string): SandboxRequest {
  return {
    requestId: 'r1',
    capabilityBundle: new TextEncoder().encode(bundle),
    operation: 'RUN_CODE_LAYER',
    input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
    limits: { wallClockMs: 5_000, memoryMb: 64 },
  };
}

describe('runCodeLayerOp', () => {
  it('calls canRun first; when it declines, returns applicable:false with no findings and never calls runCodeLayer', async () => {
    const loaded = loadCapabilityFromBundle(new TextEncoder().encode(DECLINING_BUNDLE));
    const response = await runCodeLayerOp(loaded, baseRequest(DECLINING_BUNDLE), Date.now());
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('unreachable');
    expect(response.applicable).toBe(false);
    expect(response.findings).toEqual([]);
  });

  it('runs runCodeLayer and reports applicable:true when canRun accepts', async () => {
    const loaded = loadCapabilityFromBundle(new TextEncoder().encode(APPLICABLE_BUNDLE));
    const response = await runCodeLayerOp(loaded, baseRequest(APPLICABLE_BUNDLE), Date.now());
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('unreachable');
    expect(response.applicable).toBe(true);
    expect(response.findings).toHaveLength(1);
  });
});
