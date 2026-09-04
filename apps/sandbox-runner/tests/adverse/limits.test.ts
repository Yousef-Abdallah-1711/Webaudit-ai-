/**
 * T219 — FR-028: "bounded wall clock" and "bounded memory," both enforced
 * from OUTSIDE the sandboxed process, never relying on the capability's own
 * cooperation. Drives the real sandbox host over real HTTP (T223), which
 * spawns a real child process per request (T220) — not a mocked timer.
 *
 * "Unstarvable by the child" (research.md's own words) is the property
 * under test in the timeout case: a capability in a tight, synchronous,
 * never-yielding loop cannot prevent the PARENT's timer from firing, because
 * the parent is a separate OS process with its own event loop.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSandboxHost, type SandboxHost } from '../../src/host/server.js';
import type { SandboxResponse } from '../../src/protocol.js';

let host: SandboxHost;
let baseUrl: string;

beforeAll(async () => {
  host = await createSandboxHost({ port: 0 });
  baseUrl = `http://127.0.0.1:${String(host.port)}`;
});

afterAll(async () => {
  await host.close();
});

function encodeBundle(source: string): string {
  return Buffer.from(source, 'utf8').toString('base64');
}

async function execute(
  source: string,
  limits: { readonly wallClockMs: number; readonly memoryMb: number },
): Promise<SandboxResponse> {
  const requestId = `req-${Math.random().toString(36).slice(2)}`;
  const res = await fetch(`${baseUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      capabilityBundle: encodeBundle(source),
      operation: 'RUN_CODE_LAYER',
      input: { priorModuleResults: {}, controlLevel: 'NONE' },
      limits,
    }),
  });
  return (await res.json()) as SandboxResponse;
}

/** Never yields, never returns — nothing the child can do stops this on its own. */
const TIGHT_LOOP_SOURCE = `({
  id: 'tight-loop',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => {
    while (true) { /* deliberately never yields */ }
  },
})`;

/** A modest, one-time allocation, well under any limit below — proves the
 * memory ceiling doesn't kill ordinary, legitimate work. */
const SMALL_ALLOCATION_SOURCE = `({
  id: 'small-allocation',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => {
    const bytes = new Array(1000).fill('x').join('').length;
    return [{
      checkId: 'small-allocation',
      fingerprintParts: ['small-allocation'],
      severity: 'INFO',
      title: 'allocated ' + String(bytes) + ' chars, well under the limit',
      description: 'ok',
      fixable: false,
    }];
  },
})`;

describe('FR-028 — wall-clock bound, enforced by the parent, not the child', () => {
  it('kills a tight, never-yielding loop with TIMEOUT close to the configured deadline', async () => {
    const startedAt = Date.now();
    const response = await execute(TIGHT_LOOP_SOURCE, { wallClockMs: 800, memoryMb: 128 });
    const elapsedMs = Date.now() - startedAt;

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toBe('TIMEOUT');
    // Generous upper bound — proves the deadline is actually the ~800ms
    // configured, not some unrelated, much longer default silently in effect.
    expect(elapsedMs).toBeLessThan(5_000);
  });

  it('does not kill a capability that finishes well inside its deadline', async () => {
    const response = await execute(SMALL_ALLOCATION_SOURCE, { wallClockMs: 5_000, memoryMb: 64 });
    expect(response.ok).toBe(true);
  });
});

describe('FR-028 — memory bound, enforced at the process level', () => {
  it('does not kill a small, legitimate allocation under a generous limit', async () => {
    const response = await execute(SMALL_ALLOCATION_SOURCE, { wallClockMs: 5_000, memoryMb: 128 });
    expect(response.ok).toBe(true);
  });

  it('reports MEMORY_EXCEEDED, not TIMEOUT, when an allocation exceeds a tight limit well before the deadline', async () => {
    const startedAt = Date.now();
    const response = await execute(
      `({
        id: 'bomb-tight-limit',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
        runCodeLayer: async () => {
          const bomb = [];
          while (true) { bomb.push(new Array(1e6).fill('x')); }
        },
      })`,
      { wallClockMs: 15_000, memoryMb: 48 },
    );
    const elapsedMs = Date.now() - startedAt;

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toBe('MEMORY_EXCEEDED');
    // Must be caught by the memory ceiling well before the generous 15s
    // wall-clock deadline — proves it's the memory bound doing the work,
    // not the timeout arriving first and being misreported.
    expect(elapsedMs).toBeLessThan(10_000);
  });
});
