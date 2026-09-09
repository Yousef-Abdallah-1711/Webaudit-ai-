/**
 * T220-T224 — the wire protocol between the platform and `sandbox-runner`,
 * per `specs/001-webaudit-mvp-baseline/contracts/realtime-and-internal.md`
 * §3. Mirrors that contract's TypeScript block exactly — this file is the
 * one place it becomes real types rather than prose in a doc.
 *
 * `SerializedCapabilityInput` is documented there as "plain data only — no
 * handles, no callbacks", which the contract types loosely; this file
 * resolves that loose end the concrete way the child harness needs to:
 * `input`'s real shape depends on `operation`, since `CONFORMANCE`/
 * `RUN_CODE_LAYER` need `CapabilityInput` (`@webaudit/capability-sdk`) but
 * `REVERIFY` needs a `ReverifyRequest` — two different, incompatible
 * shapes the underlying `AuditCapability` contract itself already defines
 * for its two different methods (`runCodeLayer(input, ctx)` vs.
 * `reverify(issue, ctx)`). `child-harness/harness.ts` validates the shape
 * actually present against the declared `operation` at runtime.
 */
import type { CapabilityFinding } from '@webaudit/types';
import type { CapabilityInput, ReverifyRequest } from '@webaudit/capability-sdk';

export type SandboxOperation = 'CONFORMANCE' | 'RUN_CODE_LAYER' | 'REVERIFY';

export interface SandboxLimits {
  readonly wallClockMs: number;
  readonly memoryMb: number;
}

/**
 * T251 — the operator-supplied half of an uploaded capability's manifest.
 * `id`/`module`/`layer` come from the loaded capability's own code object
 * (read after it runs, inside the sandbox — trustworthy the same way any
 * self-declaration is), but a bundle is UTF-8 JS source with no second file
 * to carry `name`/`version`; those have no other source than the operator
 * who uploaded it. `entrypoint` is not here: the bundle IS its own entry
 * module, so `@webaudit/capability-sdk`'s `manifestSchema` requirement for
 * one is satisfied with a fixed sentinel inside the sandbox, not a real path.
 */
export interface UploadedCapabilityManifest {
  readonly name: string;
  readonly version: string;
}

export interface SandboxRequest {
  readonly requestId: string;
  /** The uploaded capability, content-addressed. See child-harness/load.ts for the bundle format this session defines. */
  readonly capabilityBundle: Uint8Array;
  readonly operation: SandboxOperation;
  /** A `CapabilityInput` for CONFORMANCE/RUN_CODE_LAYER, a `ReverifyRequest` for REVERIFY. */
  readonly input: CapabilityInput | ReverifyRequest;
  readonly limits: SandboxLimits;
  /** CONFORMANCE only — see `UploadedCapabilityManifest`. Absent for RUN_CODE_LAYER/REVERIFY. */
  readonly manifest?: UploadedCapabilityManifest;
}

export type SandboxFailure =
  | 'TIMEOUT'
  | 'MEMORY_EXCEEDED'
  | 'CRASHED'
  | 'CONTRACT_VIOLATION'
  | 'FORBIDDEN_ACCESS'
  | 'BUNDLE_INVALID';

export interface SandboxSuccess {
  readonly requestId: string;
  readonly ok: true;
  readonly findings: readonly CapabilityFinding[];
  readonly durationMs: number;
}

export interface SandboxErrorResult {
  readonly requestId: string;
  readonly ok: false;
  readonly reason: SandboxFailure;
  readonly detail?: string;
}

export type SandboxResponse = SandboxSuccess | SandboxErrorResult;

/** The one message shape the parent<->child IPC channel carries, in either direction. */
export interface ChildRequestMessage {
  readonly kind: 'execute';
  readonly request: SandboxRequest;
}

export type ChildResponseMessage =
  | { readonly kind: 'result'; readonly response: SandboxResponse }
  /** A structured-cloneable log line, already redacted by the child before it is sent. */
  | { readonly kind: 'log'; readonly level: 'debug' | 'info' | 'warn' | 'error'; readonly message: string };
