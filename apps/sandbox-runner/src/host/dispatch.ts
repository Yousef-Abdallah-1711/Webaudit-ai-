/**
 * T253 — the host-side client `apps/worker` calls to dispatch an installed
 * capability's `canRun`/`runCodeLayer` into the real sandbox during a real
 * scan, mirroring `conformance.ts`'s pattern for the exact same reason that
 * file documents: a base URL, not a live `SandboxHost` object, because the
 * caller is a different process (potentially a different machine) from the
 * sandbox-runner deployment.
 *
 * **`trustedFetch` is captured here, at module load, not read from
 * `globalThis.fetch` lazily inside `runCodeLayerCheck`.**
 * `apps/worker/src/module-runner/code-layer.ts` globally poisons
 * `globalThis.fetch` for the duration of every code-layer execution window,
 * to catch a capability reaching the network outside its `ctx` — and this
 * function is called *from inside* that exact window, dispatching the
 * installed capability's own code-layer work. Reading `globalThis.fetch`
 * at call time would read the poison and get misattributed to the
 * capability whose work this dispatch is actually carrying out. Capturing
 * the reference once, at import time — which happens when
 * `capability-loader.ts` first loads, long before any scan's poison window
 * opens — sidesteps the swap entirely.
 */
import type { CapabilityFinding } from '@webaudit/types';
import type { CapabilityInput } from '@webaudit/capability-sdk';
import type { SandboxFailure, SandboxLimits } from '../protocol.js';

const trustedFetch = globalThis.fetch;

export interface RunCodeLayerInput {
  readonly requestId: string;
  readonly capabilityBundle: Uint8Array;
  readonly input: CapabilityInput;
  readonly limits: SandboxLimits;
}

export type RunCodeLayerOutcome =
  | {
      readonly ok: true;
      readonly findings: readonly CapabilityFinding[];
      readonly applicable: boolean;
    }
  | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

export async function runCodeLayerCheck(
  baseUrl: string,
  input: RunCodeLayerInput,
): Promise<RunCodeLayerOutcome> {
  const res = await trustedFetch(`${baseUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      capabilityBundle: Buffer.from(input.capabilityBundle).toString('base64'),
      operation: 'RUN_CODE_LAYER',
      input: input.input,
      limits: input.limits,
    }),
  });

  const body = (await res.json()) as
    | {
        readonly ok: true;
        readonly findings: readonly CapabilityFinding[];
        readonly applicable?: boolean;
      }
    | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

  if (!body.ok) {
    return {
      ok: false,
      reason: body.reason,
      ...(body.detail === undefined ? {} : { detail: body.detail }),
    };
  }
  return { ok: true, findings: body.findings, applicable: body.applicable ?? true };
}
