/**
 * T220 — the child-process entry point. This file's own module (not the
 * capability it loads) is the only trusted code running inside the child;
 * `host/server.ts` `fork()`s exactly this module as the whole content of a
 * fresh, short-lived process, under `--permission` with no `--allow-fs-*`,
 * `--allow-child-process`, or `--allow-worker`, an empty environment, and a
 * `--max-old-space-size` ceiling (`limits/memory.ts` computes the
 * `execArgv`).
 *
 * Receives exactly one `ChildRequestMessage` over the built-in `fork()` IPC
 * channel, sends back exactly one `ChildResponseMessage` of kind `result`,
 * then lets the process exit naturally — one execution per process,
 * matching research.md's "fresh child process per execution... no shared
 * heap with platform code".
 *
 * **Every value that reaches the capability is built inside its own
 * realm — never a host-realm object.** `load.ts`'s `context` is that
 * realm; `cloneIntoContext` re-parses `request.input` through it, and
 * `context.ts`'s `buildSandboxedContext`/`buildSandboxedCanRunTrap` build
 * the `CodeLayerContext`/conformance trap the identical way. This is not
 * decoration — an adversarial review of this task found that a host-realm
 * argument (a plain `CapabilityInput` object literal, or a `ctx.fetch`
 * function, or `console` itself) each independently hand a hostile
 * capability's `this.constructor.constructor('return process')()` a live
 * path back to the real host `process`, regardless of the vm context's own
 * global object being locked down. See `load.ts` and `context.ts`'s own
 * module notes for the full account, including the live reproduction that
 * found it (a real PID, a real `fetch` attempt, and — the confirmation
 * this was not cosmetic — `process.kill(process.ppid, ...)` terminating
 * the sandbox host's own parent process on demand).
 *
 * **Why a thrown `ReferenceError` naming a forbidden global is classified
 * as `FORBIDDEN_ACCESS`, not `CONTRACT_VIOLATION`.** With every argument
 * now genuinely realm-native, a capability reaching for `require`/
 * `process`/`fetch`/`module`/`__dirname`/`__filename` — as a bare
 * identifier, or via any object this file ever hands it — has nothing to
 * find at all; this is that ReferenceError. A genuine capability bug (a
 * typo'd local variable, say) also throws `ReferenceError`, but never
 * naming one of these specific identifiers — the pattern match is narrow
 * on purpose, so an ordinary bug is still reported as `CONTRACT_VIOLATION`
 * (an honest "this capability is broken"), not conflated with an escape
 * attempt. `ERR_ACCESS_DENIED` (the `--permission` model's own error code)
 * is classified the same way — the second, independent backstop firing if
 * the language boundary is somehow defeated by a vector not yet found.
 *
 * **Why every operation still runs inside `containCapabilityCall`.** Its
 * own in-process timer cannot save us from a capability that blocks the
 * event loop with a tight synchronous loop — nothing running inside that
 * same event loop can (`limits/timeout.ts`'s parent-armed `SIGKILL` is the
 * only thing that can, and does). What it *does* catch gracefully, without
 * needing the parent's hard kill at all: a capability that `await`s a
 * promise that never resolves without ever blocking the loop. Set a touch
 * short of the full wall-clock budget so a graceful `TIMEOUT` response has
 * a real chance to beat the parent's `SIGKILL` when the child is not, in
 * fact, wedged.
 */
import {
  containCapabilityCall,
  describeThrown,
  runConformanceSuite,
  type CapabilityInput,
  type ReverifyRequest,
} from '@webaudit/capability-sdk';
import { buildSandboxedCanRunTrap, buildSandboxedContext } from './context.js';
import { BundleInvalidError, cloneIntoContext, loadCapabilityFromBundle, type LoadedCapability } from './load.js';
import type {
  ChildRequestMessage,
  ChildResponseMessage,
  SandboxFailure,
  SandboxRequest,
  SandboxResponse,
} from '../protocol.js';

const FORBIDDEN_GLOBAL_PATTERN = /\b(require|process|fetch|module|__dirname|__filename)\b/;

/** Grace so a graceful in-child TIMEOUT has a real chance to beat the parent's SIGKILL. */
const IN_CHILD_TIMEOUT_SLACK_MS = 200;
const MIN_IN_CHILD_TIMEOUT_MS = 100;

/**
 * Deliberately NOT `error instanceof ReferenceError`. The hostile
 * capability's error is constructed inside `load.ts`'s `vm.Context` — a
 * separate JS realm with its own `Error`/`ReferenceError` constructors —
 * so a real `ReferenceError` thrown there fails an `instanceof` check
 * against the *host* realm's `ReferenceError` even though it is
 * structurally identical (confirmed the hard way: this session's own first
 * attempt used `instanceof` and every escape attempt silently fell through
 * to `CONTRACT_VIOLATION` instead of `FORBIDDEN_ACCESS`, despite the
 * fixture genuinely being blocked). `.name`/`.constructor.name` are plain
 * strings, unaffected by which realm produced the error object.
 */
function classifyEscapeAttempt(error: unknown): SandboxFailure | null {
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: unknown; constructor?: { name?: unknown } }).name;
    const ctorName = (error as { constructor?: { name?: unknown } }).constructor?.name;
    const message = (error as { message?: unknown }).message;
    const isReferenceError = name === 'ReferenceError' || ctorName === 'ReferenceError';
    if (isReferenceError && typeof message === 'string' && FORBIDDEN_GLOBAL_PATTERN.test(message)) {
      return 'FORBIDDEN_ACCESS';
    }
    if ((error as { code?: unknown }).code === 'ERR_ACCESS_DENIED') {
      return 'FORBIDDEN_ACCESS';
    }
  }
  return null;
}

function send(message: ChildResponseMessage): void {
  process.send?.(message);
}

function inChildTimeoutMs(wallClockMs: number): number {
  return Math.max(MIN_IN_CHILD_TIMEOUT_MS, wallClockMs - IN_CHILD_TIMEOUT_SLACK_MS);
}

function isReverifyRequestShaped(input: unknown): input is { readonly checkId: string; readonly location?: string } {
  return typeof input === 'object' && input !== null && typeof (input as { checkId?: unknown }).checkId === 'string';
}

/**
 * A bundle IS its own entry module — there is no second file for a relative
 * `entrypoint` to point at, the way a vendored capability's manifest points
 * at its own `src/index.ts`. `manifestSchema.entrypoint` still requires a
 * syntactically valid relative path (T251), so this is a fixed, documented
 * sentinel rather than a claim about real file structure the sandbox could
 * ever check.
 */
const UPLOADED_BUNDLE_ENTRYPOINT = 'bundle.js';

async function runConformance(
  loaded: LoadedCapability,
  request: SandboxRequest,
  startedAt: number,
): Promise<SandboxResponse> {
  const { capability, context } = loaded;

  // T251 — `manifest-valid` needs `name`/`version`, and only the operator
  // who uploaded this bundle can supply them; a request missing this is a
  // caller bug (this platform's own code builds every `SandboxRequest`),
  // not an attacker-controlled input, so it is reported plainly rather than
  // guessed past with a placeholder.
  if (request.manifest === undefined) {
    return {
      requestId: request.requestId,
      ok: false,
      reason: 'BUNDLE_INVALID',
      detail: 'CONFORMANCE requires manifest metadata (name, version); none was supplied',
    };
  }

  const nativeInput = cloneIntoContext(context, request.input);

  const report = await runConformanceSuite(capability, {
    makeContext: () => buildSandboxedContext(context),
    input: nativeInput as CapabilityInput,
    rawManifest: {
      id: capability.id,
      module: capability.module,
      layer: capability.layer,
      name: request.manifest.name,
      version: request.manifest.version,
      entrypoint: UPLOADED_BUNDLE_ENTRYPOINT,
    },
    timeoutMs: inChildTimeoutMs(request.limits.wallClockMs),
    buildCanRunTrap: () => buildSandboxedCanRunTrap(context),
    buildReverifyProbe: (location) =>
      cloneIntoContext(context, {
        checkId: 'conformance-probe',
        ...(location === undefined ? {} : { location }),
      }) as ReverifyRequest,
  });

  return {
    requestId: request.requestId,
    ok: true,
    findings: [
      {
        checkId: 'conformance',
        fingerprintParts: ['conformance', capability.id],
        severity: report.passed ? 'INFO' : 'HIGH',
        title: report.passed ? `${capability.id}: conformance passed` : `${capability.id}: conformance failed`,
        description: report.results.map((r) => `${r.check}: ${r.passed ? 'pass' : 'FAIL'} (${r.detail})`).join('; '),
        evidence: { report },
        fixable: false,
      },
    ],
    durationMs: Date.now() - startedAt,
  };
}

export async function runCodeLayerOp(
  loaded: LoadedCapability,
  request: SandboxRequest,
  startedAt: number,
): Promise<SandboxResponse> {
  const { capability, context } = loaded;
  if (typeof capability.runCodeLayer !== 'function') {
    return {
      requestId: request.requestId,
      ok: false,
      reason: 'CONTRACT_VIOLATION',
      detail: 'capability has no runCodeLayer',
    };
  }
  const nativeInput = cloneIntoContext(context, request.input);

  // T253: canRun runs inside this same sandbox dispatch, not a separate
  // one — one process fork per installed-capability call, not two. A
  // capability that declines is reported applicable:false with no
  // findings, and runCodeLayer is never invoked for it.
  const canRunOutcome = await containCapabilityCall(
    () => Promise.resolve(capability.canRun(nativeInput as CapabilityInput)),
    { timeoutMs: inChildTimeoutMs(request.limits.wallClockMs) },
  );
  if (canRunOutcome.kind === 'timeout') {
    return { requestId: request.requestId, ok: false, reason: 'TIMEOUT' };
  }
  if (canRunOutcome.kind === 'rejected') {
    const escape = classifyEscapeAttempt(canRunOutcome.error);
    return {
      requestId: request.requestId,
      ok: false,
      reason: escape ?? 'CONTRACT_VIOLATION',
      detail: describeThrown(canRunOutcome.error),
    };
  }
  if (canRunOutcome.value !== true) {
    return {
      requestId: request.requestId,
      ok: true,
      findings: [],
      durationMs: Date.now() - startedAt,
      applicable: false,
    };
  }

  const ctx = buildSandboxedContext(context);
  const outcome = await containCapabilityCall(
    () => capability.runCodeLayer!(nativeInput as CapabilityInput, ctx),
    { timeoutMs: inChildTimeoutMs(request.limits.wallClockMs) },
  );

  if (outcome.kind === 'timeout') {
    return { requestId: request.requestId, ok: false, reason: 'TIMEOUT' };
  }
  if (outcome.kind === 'rejected') {
    const escape = classifyEscapeAttempt(outcome.error);
    return {
      requestId: request.requestId,
      ok: false,
      reason: escape ?? 'CONTRACT_VIOLATION',
      detail: describeThrown(outcome.error),
    };
  }
  if (!Array.isArray(outcome.value)) {
    return {
      requestId: request.requestId,
      ok: false,
      reason: 'CONTRACT_VIOLATION',
      detail: 'runCodeLayer did not resolve with an array of findings',
    };
  }
  return {
    requestId: request.requestId,
    ok: true,
    findings: outcome.value,
    durationMs: Date.now() - startedAt,
    applicable: true,
  };
}

async function runReverifyOp(
  loaded: LoadedCapability,
  request: SandboxRequest,
  startedAt: number,
): Promise<SandboxResponse> {
  const { capability, context } = loaded;
  if (typeof capability.reverify !== 'function') {
    return { requestId: request.requestId, ok: false, reason: 'CONTRACT_VIOLATION', detail: 'capability has no reverify' };
  }
  if (!isReverifyRequestShaped(request.input)) {
    return { requestId: request.requestId, ok: false, reason: 'CONTRACT_VIOLATION', detail: 'input is not a ReverifyRequest' };
  }
  const checkId = request.input.checkId;
  const nativeInput = cloneIntoContext(context, request.input) as ReverifyRequest;
  const ctx = buildSandboxedContext(context);

  const outcome = await containCapabilityCall(() => capability.reverify!(nativeInput, ctx), {
    timeoutMs: inChildTimeoutMs(request.limits.wallClockMs),
  });

  if (outcome.kind === 'timeout') {
    return { requestId: request.requestId, ok: false, reason: 'TIMEOUT' };
  }
  if (outcome.kind === 'rejected') {
    const escape = classifyEscapeAttempt(outcome.error);
    return {
      requestId: request.requestId,
      ok: false,
      reason: escape ?? 'CONTRACT_VIOLATION',
      detail: describeThrown(outcome.error),
    };
  }
  // Reverify findings are not the returned CapabilityFinding[] shape — wrap
  // the ReverifyResult as a single finding's evidence so the wire shape
  // (`SandboxSuccess.findings`) stays uniform across every operation.
  return {
    requestId: request.requestId,
    ok: true,
    findings: [
      {
        checkId,
        fingerprintParts: ['reverify', checkId],
        severity: 'INFO',
        title: `reverify: ${outcome.value.outcome}`,
        description: outcome.value.outcome,
        evidence: { result: outcome.value },
        fixable: false,
      },
    ],
    durationMs: Date.now() - startedAt,
  };
}

async function handleExecute(request: SandboxRequest): Promise<void> {
  const startedAt = Date.now();

  let loaded: LoadedCapability;
  try {
    loaded = loadCapabilityFromBundle(request.capabilityBundle);
  } catch (error) {
    const reason: SandboxFailure = error instanceof BundleInvalidError ? 'BUNDLE_INVALID' : 'CRASHED';
    send({ kind: 'result', response: { requestId: request.requestId, ok: false, reason, detail: describeThrown(error) } });
    return;
  }

  let response: SandboxResponse;
  try {
    if (request.operation === 'CONFORMANCE') {
      response = await runConformance(loaded, request, startedAt);
    } else if (request.operation === 'RUN_CODE_LAYER') {
      response = await runCodeLayerOp(loaded, request, startedAt);
    } else {
      response = await runReverifyOp(loaded, request, startedAt);
    }
  } catch (error) {
    // Should be unreachable — every path above is itself wrapped in
    // containCapabilityCall or a try/catch — but a harness that could
    // itself crash the child on an unexpected exception would defeat the
    // one guarantee this file exists to keep.
    const escape = classifyEscapeAttempt(error);
    response = {
      requestId: request.requestId,
      ok: false,
      reason: escape ?? 'CRASHED',
      detail: describeThrown(error),
    };
  }

  send({ kind: 'result', response });
}

process.on('message', (message: ChildRequestMessage) => {
  if (message.kind === 'execute') void handleExecute(message.request);
});
