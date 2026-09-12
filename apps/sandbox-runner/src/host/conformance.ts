/**
 * T224 — FR-029: "verify that a newly installed capability satisfies the
 * capability contract before its first use... under the same restriction."
 *
 * The verification itself is not reimplemented here — `@webaudit/
 * capability-sdk`'s `runConformanceSuite` (T065) already is that suite, and
 * `child-harness/harness.ts`'s `CONFORMANCE` branch already runs it inside
 * the sandboxed `vm.Context`, satisfying "under the same restriction" by
 * construction: it is the identical code path `RUN_CODE_LAYER` uses, not a
 * parallel one. This file is the host-side convenience wrapper the upload
 * endpoint (`apps/api/src/services/admin/capability-upload.service.ts`,
 * T226) calls: build the `SandboxRequest`, unwrap the `ConformanceReport`
 * the harness packed into the response's one finding, and hand back a typed
 * result instead of a raw `SandboxResponse` its caller would otherwise have
 * to unpack by hand.
 *
 * **`baseUrl: string`, not `host: SandboxHost` — a T226 fix to T224's own
 * original signature, not a stylistic preference.** T224 took a live
 * `SandboxHost` object because every caller that existed at the time was a
 * test in this same process, holding the object `createSandboxHost` had just
 * returned. Session 8 (T225) made `sandbox-runner` a genuinely separate
 * deployment — its whole point — and a real caller now lives in
 * `apps/api`, in a different process, possibly on a different machine, with
 * no way to be handed a live in-process object across that boundary at all.
 * The original signature could therefore never actually be satisfied by the
 * one caller Session 8 exists to enable; that only became visible once
 * building that caller was attempted, which is why the fix lands here,
 * mid-T226, rather than having been written correctly the first time. Every
 * existing test call site was already using nothing more than `host.port`
 * to build the same URL this function now takes directly.
 */
import type { ConformanceReport } from '@webaudit/capability-sdk';
import type { CapabilityInput } from '@webaudit/capability-sdk';
import type { SandboxFailure } from '../protocol.js';

export type ConformanceOutcome =
  | { readonly ok: true; readonly report: ConformanceReport }
  | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

export interface RunConformanceInput {
  readonly requestId: string;
  readonly capabilityBundle: Uint8Array;
  readonly sampleInput: CapabilityInput;
  readonly limits: { readonly wallClockMs: number; readonly memoryMb: number };
  /** T251 — `name`/`version` for `manifest-valid`; see `UploadedCapabilityManifest`. */
  readonly manifest: { readonly name: string; readonly version: string };
}

export async function runConformanceCheck(
  baseUrl: string,
  input: RunConformanceInput,
): Promise<ConformanceOutcome> {
  const res = await fetch(`${baseUrl}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      capabilityBundle: Buffer.from(input.capabilityBundle).toString('base64'),
      operation: 'CONFORMANCE',
      input: input.sampleInput,
      limits: input.limits,
      manifest: input.manifest,
    }),
  });

  const body = (await res.json()) as
    | {
        readonly ok: true;
        readonly findings: readonly { readonly evidence?: { readonly report?: unknown } }[];
      }
    | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

  if (!body.ok) {
    return {
      ok: false,
      reason: body.reason,
      ...(body.detail === undefined ? {} : { detail: body.detail }),
    };
  }

  const report = body.findings[0]?.evidence?.report;
  if (report === undefined) {
    return {
      ok: false,
      reason: 'CONTRACT_VIOLATION',
      detail: 'no conformance report in the sandbox response',
    };
  }
  return { ok: true, report: report as ConformanceReport };
}
