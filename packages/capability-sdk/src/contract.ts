/**
 * T063 — the capability contract, per
 * [contracts/capability-contract.md](../../../specs/001-webaudit-mvp-baseline/contracts/capability-contract.md).
 *
 * Constitution Principle I: this file is the *only* coupling point between core
 * and any audit capability. Core code depends on it; it never depends on a
 * concrete capability. If adding an audit capability requires editing core, the
 * contract is wrong — fix the contract, not the core.
 *
 * `CapabilityFinding` is imported from `@webaudit/types`, not declared here.
 * `packages/redaction` already produces findings (T062) and must not depend on
 * this SDK, so the finding type lives one level down where both can reach it.
 *
 * Three things a capability deliberately cannot do, each enforced by a type
 * rather than by a rule in a document:
 *
 *   - **Set its own attribution.** `CapabilityFinding` has no `attribution`
 *     field. The runner assigns MEASURED to code-layer findings and AI_JUDGMENT
 *     to AI-layer ones, so a guess cannot pose as a measurement (FR-032, SC-006).
 *   - **Declare itself trusted.** Trust is not on the manifest — see
 *     `manifest.ts`. It comes from the discovery root (R10, FR-027).
 *   - **Reach the network, the disk, or a provider.** Everything a capability
 *     may do to the outside world is on `CodeLayerContext`, and nothing on it
 *     is a raw client.
 */

import type {
  CapabilityFinding,
  CapabilityLayer,
  ControlLevel,
  ModuleState,
  ModuleType,
  Severity,
} from '@webaudit/types';

// ─── Input ───────────────────────────────────────────────────────────────────

/** A file in the scan workspace. Paths are workspace-relative, always. */
export interface CodeFile {
  /** Relative to the workspace root. Never absolute, never containing `..`. */
  readonly path: string;
  readonly sizeBytes: number;
}

/**
 * The attached source, if any.
 *
 * A listing rather than contents: a capability reads what it needs through
 * `ctx.readFile`, which is confined to the workspace. Handing over a map of
 * every file's contents would mean holding an entire repository in memory per
 * capability, and would make FR-090's destruction guarantee harder to keep.
 */
export interface CodeTree {
  readonly files: readonly CodeFile[];
  /** Detected stack, for `canRun`. Advisory — never a reason to fail. */
  readonly frameworks: readonly string[];
}

/** A stored image. The bytes live in object storage, not in the input. */
export interface ImageRef {
  readonly key: string;
  readonly width: number;
  readonly height: number;
}

/** What the user said they were building, from the questionnaire (US6). */
export interface DesignIntent {
  readonly audience?: string;
  readonly tone?: string;
  readonly brandColors?: readonly string[];
  readonly notes?: string;
}

/** What another area concluded. Enough to correlate, not enough to mutate. */
export interface ModuleSummary {
  readonly state: ModuleState;
  /** Null when the area did not complete. Never coerced to zero (FR-053). */
  readonly score: number | null;
  readonly findingCount: number;
  readonly worstSeverity: Severity | null;
}

export interface CapabilityInput {
  readonly targetUrl?: string;
  /** Present only when source is attached. */
  readonly code?: CodeTree;
  readonly screenshot?: ImageRef;
  readonly screenshotMobile?: ImageRef;
  readonly designIntent?: DesignIntent;
  /**
   * Frozen at runtime as well as readonly at compile time. A capability that
   * mutated another area's result could make a security finding disappear from
   * the report it is supposed to appear in.
   */
  readonly priorModuleResults: Readonly<Partial<Record<ModuleType, ModuleSummary>>>;
  readonly controlLevel: ControlLevel;
}

// ─── Context: the capability's only door to the outside ──────────────────────

/** Passed through to `safeFetch`; no field of it can weaken the SSRF guard. */
export interface SafeFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly signal?: AbortSignal;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export interface SafeResponse {
  readonly url: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly redirects: readonly string[];
  bytes(): Uint8Array;
  text(): string;
}

/**
 * The browser surface a capability gets. Deliberately not Playwright's `Page`.
 *
 * A real `Page` carries `context()`, and from there `newCDPSession()`,
 * `route()`, `addInitScript()`, and `storageState()` — enough to intercept the
 * pool's traffic, script every other page in the browser, or read another
 * scan's cookies. Narrowing to the methods a measurement actually needs is what
 * makes "the auditing browser is isolated from platform credentials" (R6) a
 * property of the interface rather than a promise about behaviour.
 *
 * Widening this is a security change. Add a method only with a reason.
 */
export interface AuditPage {
  goto(
    url: string,
    options?: { readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' },
  ): Promise<void>;
  content(): Promise<string>;
  title(): Promise<string>;
  /** Serialisable results only. No handles escape the page. */
  evaluate<T>(script: string): Promise<T>;
  screenshot(options?: { readonly fullPage?: boolean }): Promise<Uint8Array>;
  /** Requests the page made, for measuring what a visitor actually loads. */
  requests(): Promise<
    readonly { readonly url: string; readonly status: number; readonly sizeBytes: number }[]
  >;
}

/**
 * A redacted sink. Every line passes through `@webaudit/redaction` before it is
 * written, so a capability that logs a response body cannot put a credential in
 * the platform's logs (FR-091, SC-016).
 */
export interface Logger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface CodeLayerContext {
  /** SSRF-guarded. Every redirect re-validated (R6). No raw client exists. */
  fetch(url: string, init?: SafeFetchInit): Promise<SafeResponse>;
  /** A page in the probe pool. Never in the API process. */
  withPage<T>(fn: (page: AuditPage) => Promise<T>): Promise<T>;
  /** Read-only and confined to this scan's workspace. Escapes are rejected. */
  readFile(relPath: string): Promise<Buffer>;
  glob(pattern: string): Promise<readonly string[]>;
  logger: Logger;
  /** Cancellation and timeout. Honouring it is a contract obligation. */
  signal: AbortSignal;
}

// ─── Re-verification ─────────────────────────────────────────────────────────

export interface ReverifyRequest {
  readonly checkId: string;
  readonly location?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

/**
 * Note there is no `{ outcome: 'PASSED' }` carrying a user-supplied claim.
 * PASSED is returned by the check itself, having looked. This is SC-007's shape:
 * green means verified, and no user action can write it.
 */
export type ReverifyResult =
  | { readonly outcome: 'PASSED' }
  /** FR-061: evidence is mandatory on failure, so a user can see what we saw. */
  | { readonly outcome: 'FAILED'; readonly evidence: Readonly<Record<string, unknown>> }
  /** FR-063: the check could not be run, which is not the same as passing. */
  | { readonly outcome: 'UNVERIFIABLE'; readonly reason: string };

// ─── The capability ──────────────────────────────────────────────────────────

export interface AuditCapability {
  readonly id: string;
  readonly module: ModuleType;
  readonly layer: CapabilityLayer;

  /**
   * Preconditions. False means skipped and reported NOT_APPLICABLE, never
   * failed (FR-021). Synchronous and side-effect free — the conformance suite
   * asserts the second part.
   */
  canRun(input: CapabilityInput): boolean;

  /**
   * The code layer. MUST NOT call an LLM, and costs zero tokens
   * (Principle III, FR-030). Anything measurable is measured here; the AI layer
   * only explains what this found.
   */
  runCodeLayer?(input: CapabilityInput, ctx: CodeLayerContext): Promise<CapabilityFinding[]>;

  /** Contributes to a prompt. MUST NOT call a provider (Principle IV). */
  getSystemPromptAddition?(): string;
  getContextData?(codeFindings: readonly CapabilityFinding[], input: CapabilityInput): string;

  /**
   * Re-checks one issue. Absent means issues from this capability are
   * UNVERIFIABLE (FR-063) — which is an honest answer, and better than a
   * capability that guesses.
   */
  reverify?(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult>;
}

export type { CapabilityFinding };
