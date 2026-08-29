/**
 * T065 — the shared conformance suite (FR-029).
 *
 * "System MUST verify that a newly installed capability satisfies the capability
 * contract before its first use, and MUST perform that verification under the
 * same restriction." That second clause is why this is a plain async function in
 * `src/` and not a vitest file: an installed capability runs this suite **inside
 * `sandbox-runner`** (R1), where there is no test runner, no network, and no
 * database. It takes a capability, returns a report, and throws nothing.
 *
 * The seven checks are the contract's own list. Two deserve explanation because
 * what they can and cannot prove is easy to overstate.
 *
 * **`no-llm-from-code-layer`** installs a poisoned `globalThis.fetch` for the
 * duration of the code-layer call and fails if it is touched. That catches a
 * capability reaching the network outside `ctx` — the realistic version of this
 * mistake, and a FR-025 violation regardless of whether a provider is on the
 * other end. What it cannot catch is a capability that statically imports a
 * provider SDK and calls it through a socket it opened itself. That is covered
 * one layer out, by the `no-restricted-imports` rule already in
 * `eslint.config.js` for `packages/capabilities-vendored/**`, and one layer
 * further by the sandbox having no egress at all (R1). Three independent
 * mechanisms, and this is the cheapest of them — not the only one.
 *
 * **`throwing-is-contained`** looks like it tests the runner rather than the
 * capability, and in a sense it does. The contract's guarantee is that "a
 * rejection or timeout is contained: the module continues and the capability is
 * recorded failed" (FR-022, SC-011). What a capability must do to make that
 * possible is *reject* — return a failed promise — rather than take the process
 * down. So this check runs the capability inside the same containment wrapper
 * the runner will use, and asserts the wrapper always returns. A capability that
 * throws synchronously, rejects, or hangs past its deadline all pass; one that
 * calls `process.exit` does not.
 *
 * **What this check cannot see, stated precisely because the difference is
 * easy to miss.** "Unhandled rejection" here means the promise `runCodeLayer`
 * returns is left unhandled by the *capability's own code* before it gets back
 * to us — that case is contained, like any other rejection. It does not mean a
 * rejection or throw from a callback the capability scheduled and then detached
 * from that promise: `setTimeout`, a fire-and-forget async IIFE, an event
 * listener. That fires after this check has already recorded `passed: true`,
 * becomes a real Node `uncaughtException`/`unhandledRejection`, and — absent
 * the process-level backstop this repository now installs
 * (`apps/worker/src/process-guards.ts`) — crashes the host outright. No check
 * that runs synchronously against a bounded call can observe a callback that
 * fires after the call returns; closing that gap needed a different mechanism,
 * not a stricter version of this one.
 */

import type { CapabilityFinding } from '@webaudit/types';
import { fingerprintOf } from '@webaudit/scoring';
import type { AuditCapability, CapabilityInput, CodeLayerContext } from '../contract.js';
import { parseManifest, type CapabilityManifest } from '../manifest.js';
import { containCapabilityCall, describeThrown } from '../contain.js';

export const CONFORMANCE_CHECKS = [
  'contract-shape',
  'manifest-valid',
  'can-run-has-no-side-effects',
  'throwing-is-contained',
  'no-llm-from-code-layer',
  'fingerprint-stable',
  'reverify-reports-failure-with-evidence',
  'abort-honoured',
] as const;

export type ConformanceCheck = (typeof CONFORMANCE_CHECKS)[number];

export interface CheckResult {
  readonly check: ConformanceCheck;
  readonly passed: boolean;
  /** Why it failed, or why it was not applicable. */
  readonly detail: string;
  /** A check that does not apply to this capability's shape. Not a failure. */
  readonly skipped: boolean;
}

export interface ConformanceReport {
  readonly capabilityId: string;
  readonly passed: boolean;
  readonly results: readonly CheckResult[];
}

export interface ConformanceDeps {
  /**
   * A fresh context per invocation. Fresh matters: several checks run the
   * capability twice and compare, and a shared context would let the first run
   * change what the second one sees.
   */
  readonly makeContext: (signal: AbortSignal) => CodeLayerContext;
  readonly input: CapabilityInput;
  /** Raw manifest as read from disk, before parsing. */
  readonly rawManifest: unknown;
  /** How long a capability may take before the harness stops waiting. */
  readonly timeoutMs?: number;
  /** Grace period after abort within which the capability must settle. */
  readonly abortGraceMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ABORT_GRACE_MS = 2_000;

function pass(check: ConformanceCheck, detail = 'ok'): CheckResult {
  return { check, passed: true, detail, skipped: false };
}
function fail(check: ConformanceCheck, detail: string): CheckResult {
  return { check, passed: false, detail, skipped: false };
}
function skip(check: ConformanceCheck, detail: string): CheckResult {
  return { check, passed: true, detail, skipped: true };
}

function checkContractShape(capability: AuditCapability): CheckResult {
  const problems: string[] = [];
  if (typeof capability.id !== 'string' || capability.id === '') problems.push('id is required');
  if (typeof capability.module !== 'string') problems.push('module is required');
  if (typeof capability.layer !== 'string') problems.push('layer is required');
  if (typeof capability.canRun !== 'function') problems.push('canRun must be a function');

  const hasCode = typeof capability.runCodeLayer === 'function';
  const hasAi =
    typeof capability.getSystemPromptAddition === 'function' ||
    typeof capability.getContextData === 'function';

  // A capability that implements neither layer cannot produce a finding, and
  // would register as a check that silently never runs — worse than absent,
  // because the report implies it looked.
  if (!hasCode && !hasAi) problems.push('implements neither a code layer nor an AI layer');
  if (capability.layer === 'CODE' && !hasCode)
    problems.push('declares layer CODE with no runCodeLayer');
  if (capability.layer === 'AI' && !hasAi)
    problems.push('declares layer AI with no AI-layer method');
  if (capability.layer === 'BOTH' && !(hasCode && hasAi)) {
    problems.push('declares layer BOTH but implements only one');
  }

  return problems.length === 0
    ? pass('contract-shape')
    : fail('contract-shape', problems.join('; '));
}

function checkManifest(capability: AuditCapability, raw: unknown): CheckResult {
  const parsed = parseManifest(raw);
  if (!parsed.ok) {
    return fail('manifest-valid', parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; '));
  }
  const manifest: CapabilityManifest = parsed.manifest;

  // The manifest and the module must agree. A capability whose code says
  // SECURITY and whose manifest says SEO gets registered under one and reports
  // under the other, and the mismatch surfaces as findings in the wrong area.
  const problems: string[] = [];
  if (manifest.id !== capability.id) {
    problems.push(`manifest id "${manifest.id}" does not match capability id "${capability.id}"`);
  }
  if (manifest.module !== capability.module) {
    problems.push(`manifest module "${manifest.module}" does not match "${capability.module}"`);
  }
  if (manifest.layer !== capability.layer) {
    problems.push(`manifest layer "${manifest.layer}" does not match "${capability.layer}"`);
  }
  return problems.length === 0
    ? pass('manifest-valid')
    : fail('manifest-valid', problems.join('; '));
}

/**
 * `canRun` false must mean zero side effects (FR-021).
 *
 * Enforced by handing it a context whose every door records being opened, and
 * failing if any was. `canRun` is a synchronous precondition test; a `canRun`
 * that fetches is also a `canRun` that can fail, and a precondition check that
 * can fail is not one.
 */
function checkCanRunPure(capability: AuditCapability, input: CapabilityInput): CheckResult {
  const touched: string[] = [];
  const controller = new AbortController();
  const trap = new Proxy(
    {},
    {
      get(_target, property) {
        touched.push(String(property));
        return () => {
          throw new Error(`canRun must not use ctx.${String(property)}`);
        };
      },
    },
  );

  let threw: unknown;
  let result: unknown;
  try {
    // Invoked as a method on the capability, never as a detached function: a
    // capability written as a class would otherwise lose `this` here and fail
    // conformance for a reason that is our bug, not its.
    //
    // The trap is passed where no second argument belongs. If `canRun` ever grows
    // one and starts using it, this catches that too.
    result = (capability as unknown as { canRun(i: CapabilityInput, c?: unknown): unknown }).canRun(
      input,
      trap,
    );
  } catch (error) {
    threw = error;
  }
  controller.abort();

  if (threw !== undefined) {
    return fail('can-run-has-no-side-effects', `canRun threw: ${describeThrown(threw)}`);
  }
  if (typeof result !== 'boolean') {
    return fail('can-run-has-no-side-effects', 'canRun must return a boolean');
  }
  if (touched.length > 0) {
    return fail('can-run-has-no-side-effects', `canRun reached for ${touched.join(', ')}`);
  }
  return pass('can-run-has-no-side-effects', `returned ${String(result)}`);
}

async function checkContained(
  capability: AuditCapability,
  deps: ConformanceDeps,
  timeoutMs: number,
): Promise<CheckResult> {
  if (typeof capability.runCodeLayer !== 'function') {
    return skip('throwing-is-contained', 'no code layer');
  }
  const controller = new AbortController();
  const outcome = await containCapabilityCall(
    () => capability.runCodeLayer!(deps.input, deps.makeContext(controller.signal)),
    { timeoutMs },
  );

  // Every outcome is acceptable; not returning is not. Resolved means it worked,
  // rejected means the module degrades, timeout means the runner reclaims the
  // slot. All three keep the audit alive, which is the guarantee.
  if (outcome.kind === 'resolved' && !Array.isArray(outcome.value)) {
    return fail(
      'throwing-is-contained',
      'runCodeLayer resolved with something other than an array',
    );
  }
  return pass('throwing-is-contained', outcome.kind);
}

/**
 * Principle III: the code layer costs zero tokens.
 *
 * See the module note for what this proves and what it does not.
 */
async function checkNoLlm(
  capability: AuditCapability,
  deps: ConformanceDeps,
  timeoutMs: number,
): Promise<CheckResult> {
  if (typeof capability.runCodeLayer !== 'function') {
    return skip('no-llm-from-code-layer', 'no code layer');
  }

  const violations: string[] = [];
  const realFetch = globalThis.fetch;
  const poisoned = ((...args: unknown[]): never => {
    violations.push(describeThrown(args[0] ?? 'unknown'));
    throw new Error('the code layer must reach the network only through ctx.fetch (FR-025)');
  }) as unknown as typeof globalThis.fetch;

  globalThis.fetch = poisoned;
  try {
    const controller = new AbortController();
    await containCapabilityCall(
      () => capability.runCodeLayer!(deps.input, deps.makeContext(controller.signal)),
      { timeoutMs },
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  return violations.length === 0
    ? pass('no-llm-from-code-layer')
    : fail('no-llm-from-code-layer', `called global fetch for ${violations.join(', ')}`);
}

/**
 * R3: the same input twice must produce the same identity.
 *
 * Compares full fingerprints rather than raw `fingerprintParts`, because the
 * fingerprint is what the database stores and what FR-064's recurrence detection
 * compares. A capability whose parts differ in a way the hash absorbs is fine;
 * one whose hash moves has broken re-verification.
 */
async function checkFingerprintStable(
  capability: AuditCapability,
  deps: ConformanceDeps,
  timeoutMs: number,
): Promise<CheckResult> {
  if (typeof capability.runCodeLayer !== 'function') {
    return skip('fingerprint-stable', 'no code layer');
  }

  const run = async (): Promise<readonly CapabilityFinding[] | null> => {
    const controller = new AbortController();
    const outcome = await containCapabilityCall(
      () => capability.runCodeLayer!(deps.input, deps.makeContext(controller.signal)),
      { timeoutMs },
    );
    // Array-ness is checked here as well as in `throwing-is-contained`: this
    // check indexes into the result, and a capability that resolves with a
    // string would otherwise take the harness down instead of being reported.
    return outcome.kind === 'resolved' && Array.isArray(outcome.value) ? outcome.value : null;
  };

  const first = await run();
  const second = await run();
  if (first === null || second === null) {
    return fail(
      'fingerprint-stable',
      'the code layer did not return an array of findings twice over identical input',
    );
  }
  if (first.length === 0 && second.length === 0) {
    return skip('fingerprint-stable', 'produced no findings for the conformance input');
  }

  const idsOf = (findings: readonly CapabilityFinding[]): string[] =>
    findings
      .map((finding) =>
        fingerprintOf({
          targetId: 'conformance',
          module: capability.module,
          checkId: finding.checkId,
          parts: [...finding.fingerprintParts],
        }),
      )
      .sort();

  const a = idsOf(first);
  const b = idsOf(second);
  if (a.length !== b.length) {
    return fail(
      'fingerprint-stable',
      `produced ${String(a.length)} findings then ${String(b.length)}`,
    );
  }
  const drifted = a.filter((id, index) => id !== b[index]);
  return drifted.length === 0
    ? pass('fingerprint-stable', `${String(a.length)} stable`)
    : fail('fingerprint-stable', `${String(drifted.length)} fingerprint(s) changed between runs`);
}

/**
 * FR-061: a failing re-verification must carry evidence.
 *
 * A `reverify` that returns PASSED against an unchanged failing target is the
 * SC-007 failure — green that nothing verified. So the check demands FAILED with
 * evidence, or an honest UNVERIFIABLE with a reason. PASSED is the one answer
 * that is wrong here, because the harness has not fixed anything.
 */
async function checkReverify(
  capability: AuditCapability,
  deps: ConformanceDeps,
  timeoutMs: number,
): Promise<CheckResult> {
  if (typeof capability.reverify !== 'function') {
    // Absent is legal: issues from this capability are UNVERIFIABLE (FR-063).
    return skip(
      'reverify-reports-failure-with-evidence',
      'no reverify; issues will be UNVERIFIABLE',
    );
  }

  const controller = new AbortController();
  const outcome = await containCapabilityCall(
    () =>
      capability.reverify!(
        {
          checkId: 'conformance-probe',
          // Conditional rather than `location: deps.input.targetUrl`: under
          // exactOptionalPropertyTypes an explicit `undefined` is not the same
          // as an absent optional property.
          ...(deps.input.targetUrl === undefined ? {} : { location: deps.input.targetUrl }),
        },
        deps.makeContext(controller.signal),
      ),
    { timeoutMs },
  );

  if (outcome.kind !== 'resolved') {
    return fail(
      'reverify-reports-failure-with-evidence',
      `reverify did not complete (${outcome.kind})`,
    );
  }
  const result = outcome.value;
  if (result.outcome === 'PASSED') {
    return fail(
      'reverify-reports-failure-with-evidence',
      'returned PASSED for a check that was never fixed (SC-007)',
    );
  }
  if (result.outcome === 'FAILED') {
    return Object.keys(result.evidence).length > 0
      ? pass('reverify-reports-failure-with-evidence', 'FAILED with evidence')
      : fail('reverify-reports-failure-with-evidence', 'FAILED with empty evidence (FR-061)');
  }
  return result.reason.trim() === ''
    ? fail('reverify-reports-failure-with-evidence', 'UNVERIFIABLE with no reason (FR-063)')
    : pass('reverify-reports-failure-with-evidence', 'UNVERIFIABLE with a reason');
}

/** Obligation 5: "Honour `ctx.signal`. Work continuing past abort is a defect." */
async function checkAbort(
  capability: AuditCapability,
  deps: ConformanceDeps,
  graceMs: number,
): Promise<CheckResult> {
  if (typeof capability.runCodeLayer !== 'function') {
    return skip('abort-honoured', 'no code layer');
  }

  const controller = new AbortController();
  const context = deps.makeContext(controller.signal);

  // Started inside a try, because `runCodeLayer` may throw synchronously rather
  // than returning a rejected promise — and a containment harness that itself
  // throws has failed at the one thing it exists to do.
  let started: Promise<unknown>;
  try {
    started = capability.runCodeLayer(deps.input, context);
  } catch (error) {
    // Threw before it could observe the signal. Contained, and honest about why.
    return pass('abort-honoured', `threw synchronously: ${String(error)}`);
  }

  // Abort on the next tick, so the capability has begun but cannot have finished
  // by luck — a capability that returns synchronously would otherwise "pass"
  // without ever reading the signal.
  await Promise.resolve();
  controller.abort();

  const outcome = await containCapabilityCall(async () => started, { timeoutMs: graceMs });
  if (outcome.kind === 'timeout') {
    return fail('abort-honoured', `still running ${String(graceMs)}ms after abort`);
  }
  return pass('abort-honoured', outcome.kind);
}

/**
 * Run every check. Never throws — a report is the output even for a capability
 * that is entirely broken, because the caller needs to record *why* it was
 * refused (FR-029) rather than catch an exception.
 */
export async function runConformanceSuite(
  capability: AuditCapability,
  deps: ConformanceDeps,
): Promise<ConformanceReport> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const graceMs = deps.abortGraceMs ?? DEFAULT_ABORT_GRACE_MS;

  const results: CheckResult[] = [];
  const shape = checkContractShape(capability);
  results.push(shape);
  results.push(checkManifest(capability, deps.rawManifest));

  if (shape.passed) {
    results.push(checkCanRunPure(capability, deps.input));
    results.push(await checkContained(capability, deps, timeoutMs));
    results.push(await checkNoLlm(capability, deps, timeoutMs));
    results.push(await checkFingerprintStable(capability, deps, timeoutMs));
    results.push(await checkReverify(capability, deps, timeoutMs));
    results.push(await checkAbort(capability, deps, graceMs));
  } else {
    // Running behavioural checks against a capability that is not shaped like
    // one produces noise, not information.
    for (const check of CONFORMANCE_CHECKS.slice(2)) {
      results.push(skip(check, 'contract shape failed; behavioural checks not attempted'));
    }
  }

  return {
    capabilityId: typeof capability.id === 'string' ? capability.id : '(unknown)',
    passed: results.every((r) => r.passed),
    results,
  };
}
