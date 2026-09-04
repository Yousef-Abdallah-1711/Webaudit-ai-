/**
 * T224 — FR-029: "verify that a newly installed capability satisfies the
 * capability contract before its first use... under the same restriction."
 *
 * The verification itself is not reimplemented here — `@webaudit/
 * capability-sdk`'s `runConformanceSuite` (T065) already is that suite, and
 * `child-harness/harness.ts`'s `CONFORMANCE` branch already runs it inside
 * the sandboxed `vm.Context`, satisfying "under the same restriction" by
 * construction: it is the identical code path `RUN_CODE_LAYER` uses, not a
 * parallel one. This file is the host-side convenience wrapper an eventual
 * upload endpoint (Session 8, T226) calls: build the `SandboxRequest`,
 * unwrap the `ConformanceReport` the harness packed into the response's
 * one finding, and hand back a typed result instead of a raw
 * `SandboxResponse` its caller would otherwise have to unpack by hand.
 */
import type { ConformanceReport } from '@webaudit/capability-sdk';
import type { CapabilityInput } from '@webaudit/capability-sdk';
import type { SandboxHost } from './server.js';
import type { SandboxFailure } from '../protocol.js';

export type ConformanceOutcome =
  | { readonly ok: true; readonly report: ConformanceReport }
  | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

export interface RunConformanceInput {
  readonly requestId: string;
  readonly capabilityBundle: Uint8Array;
  readonly sampleInput: CapabilityInput;
  readonly limits: { readonly wallClockMs: number; readonly memoryMb: number };
}

export async function runConformanceCheck(
  host: SandboxHost,
  input: RunConformanceInput,
): Promise<ConformanceOutcome> {
  const res = await fetch(`http://127.0.0.1:${String(host.port)}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      capabilityBundle: Buffer.from(input.capabilityBundle).toString('base64'),
      operation: 'CONFORMANCE',
      input: input.sampleInput,
      limits: input.limits,
    }),
  });

  const body = (await res.json()) as
    | { readonly ok: true; readonly findings: readonly { readonly evidence?: { readonly report?: unknown } }[] }
    | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

  if (!body.ok) {
    return { ok: false, reason: body.reason, ...(body.detail === undefined ? {} : { detail: body.detail }) };
  }

  const report = body.findings[0]?.evidence?.report;
  if (report === undefined) {
    return { ok: false, reason: 'CONTRACT_VIOLATION', detail: 'no conformance report in the sandbox response' };
  }
  return { ok: true, report: report as ConformanceReport };
}
