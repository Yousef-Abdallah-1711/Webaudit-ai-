/**
 * T253 — `runCodeLayerCheck` is the host-side client `apps/worker` calls to
 * dispatch an installed capability's real code-layer work into the sandbox
 * during a real scan. See `dispatch.ts`'s own module note for why it
 * captures `fetch` at import time rather than reading `globalThis.fetch`
 * lazily — this file's second test is the direct proof that mitigation
 * works.
 *
 * Each test sets `globalThis.fetch` and THEN dynamically imports
 * `dispatch.ts` fresh (`vi.resetModules()` first) — a plain top-level
 * `import` would only ever capture whatever `fetch` was set at the moment
 * this whole test file first loaded, which is not what any of these tests
 * are actually exercising.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { runCodeLayerCheck as RunCodeLayerCheck } from '../../src/host/dispatch.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.resetModules();
});

async function freshDispatch(): Promise<{ runCodeLayerCheck: typeof RunCodeLayerCheck }> {
  vi.resetModules();
  return import('../../src/host/dispatch.js');
}

describe('runCodeLayerCheck', () => {
  it('POSTs a RUN_CODE_LAYER request and unwraps a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, findings: [{ checkId: 'x' }], durationMs: 5, applicable: true }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const { runCodeLayerCheck } = await freshDispatch();

    const outcome = await runCodeLayerCheck('http://sandbox.local', {
      requestId: 'r1',
      capabilityBundle: new Uint8Array([1, 2, 3]),
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      limits: { wallClockMs: 5_000, memoryMb: 64 },
    });

    expect(outcome).toEqual({ ok: true, findings: [{ checkId: 'x' }], applicable: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://sandbox.local/execute',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('survives globalThis.fetch being reassigned after this module was already imported', async () => {
    // Simulates code-layer.ts's poison: fetch is swapped out for a stub
    // AFTER dispatch.ts has already captured its own reference. If
    // dispatch.ts read `globalThis.fetch` lazily instead of capturing it
    // at import time, this test would call the poison instead.
    const poisoned = vi.fn().mockRejectedValue(new Error('poisoned fetch called — this is the bug'));
    const real = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, findings: [], durationMs: 1, applicable: true }), { status: 200 }),
    );
    globalThis.fetch = real as unknown as typeof fetch;
    const { runCodeLayerCheck } = await freshDispatch();
    // Poison AFTER the module has already captured `real`.
    globalThis.fetch = poisoned as unknown as typeof fetch;

    const outcome = await runCodeLayerCheck('http://sandbox.local', {
      requestId: 'r2',
      capabilityBundle: new Uint8Array([]),
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      limits: { wallClockMs: 5_000, memoryMb: 64 },
    });

    expect(poisoned).not.toHaveBeenCalled();
    expect(real).toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
  });

  it('unwraps a failure response without throwing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, reason: 'TIMEOUT' }), { status: 200 }),
    ) as unknown as typeof fetch;
    const { runCodeLayerCheck } = await freshDispatch();

    const outcome = await runCodeLayerCheck('http://sandbox.local', {
      requestId: 'r3',
      capabilityBundle: new Uint8Array([]),
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      limits: { wallClockMs: 5_000, memoryMb: 64 },
    });

    expect(outcome).toEqual({ ok: false, reason: 'TIMEOUT' });
  });
});
