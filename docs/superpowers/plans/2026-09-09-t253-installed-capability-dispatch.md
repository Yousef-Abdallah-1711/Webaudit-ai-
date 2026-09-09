# T253 — Wire Installed-Capability Dispatch Into a Real Scan (Phase 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator-uploaded capability that passes `CONFORMANCE` becomes a real `Capability` row a
real scan can dispatch — running its code exclusively inside `sandbox-runner`, never in-process in
`apps/worker`, and never through a code path a real scan could execute the same bundle unsandboxed.

**Architecture:** Reuse the existing vendored-capability pipeline end to end rather than inventing a
parallel one. On a passing conformance check, `capability-upload.service.ts` writes the bundle plus a
synthesized `capability.manifest.json` to `installedRoot/<id>/` — the exact directory shape
`discoverManifestsInRoot` already expects — then calls the registry's existing reconciliation function
on demand (today it only runs at API boot) so the `Capability` row exists immediately. On the worker
side, `capability-loader.ts` gains a second root walk (`installedRoot`, mirroring the API's own
dual-root `discover.ts`) — but for anything found there, the code is never `import()`'d. Instead a thin
wrapper object is built whose `canRun`/`runCodeLayer` methods proxy to `sandbox-runner` over HTTP. Since
`resolve.ts` already does `Promise.resolve(capability.canRun(...))`, this wrapper is a transparent
drop-in: `resolve.ts` and `code-layer.ts` need zero changes to their actual dispatch call sites.

**Two confirmed design decisions** (asked and answered before this plan was written):
1. `canRun` for an installed capability is folded into the *same* sandboxed `RUN_CODE_LAYER` dispatch
   (one process fork, not two) — the sandbox checks `canRun` first and returns `applicable: false` with
   empty findings if it declines. This makes a legitimately-declined installed capability
   indistinguishable, in that one capability's own internal accounting, from one that ran and found
   nothing — module-level score/state is unaffected either way, since both read as "this capability
   contributed zero findings."
2. If `sandbox-runner` is unreachable when an installed capability's `runCodeLayer` is invoked mid-scan,
   that one capability fails closed (an outcome with zero findings and an error message) while the rest
   of the module completes normally — the same SC-011 pattern every other capability failure already
   follows. No new code is needed for this: `containCapabilityCall`'s existing timeout/rejection
   handling in `code-layer.ts` already produces exactly this outcome for any capability whose call
   throws or rejects, and the wrapper's `runCodeLayer` rejecting on a network failure is all that's
   required to reach it.

**Tech Stack:** TypeScript 5.6, Node 22, Prisma/PostgreSQL, existing `@webaudit/capability-sdk` /
`@webaudit/sandbox-runner` packages. No new dependencies beyond `apps/worker` gaining a real
`@webaudit/sandbox-runner` workspace dependency (it has none today) and a new `SANDBOX_RUNNER_URL`
environment variable it must read.

**Spec:** `specs/001-webaudit-mvp-baseline/tasks.md`'s Phase 13 (T253), FR-029, and
`PROGRESS.md`'s Open Decision #20's still-open half ("uploading a capability produces a verdict, not
an installed capability").

## Global Constraints

- **Non-Negotiable #5 (constitution): untrusted code runs in `sandbox-runner` only, no exceptions.**
  An installed capability's bundle is never `import()`'d, `eval`'d, or otherwise executed in
  `apps/worker`'s own process at any point in this plan. If a step's code would do that, the step is
  wrong — stop and reconsider, don't add a "just this once" exception.
- **If the sandbox is unreachable, the affected path returns/fails closed — never falls back to
  unsandboxed execution.** Already true for the upload path (T216); this plan extends the same rule to
  real-scan dispatch (Design Decision 2 above).
- `apps/worker` has no `config/env.ts`-equivalent validated config module (confirmed: every file reads
  `process.env` inline). Match that existing convention — don't introduce a new shared config layer as
  a side effect of this task.
- Every new/changed function gets a real test proving the specific behavior it exists for, per this
  project's Iron Law (TDD skill) — no step ships code before its test exists and has been watched to
  fail for the right reason.
- `apps/sandbox-runner`'s package exports only `.` and `./conformance` today; a new `./dispatch`
  subpath follows the same pattern exactly.

---

### Task 1: Widen `canRun`'s type so an async (sandbox-backed) implementation is legal

**Files:**
- Modify: `packages/capability-sdk/src/contract.ts` (the `canRun` signature)
- Test: `apps/worker/tests/unit/resolve.test.ts` (already exists — add one case)

**Interfaces:**
- Produces: `AuditCapability.canRun(input: CapabilityInput): boolean | Promise<boolean>` — every later
  task's sandboxed wrapper capability relies on being allowed to return a Promise here.

`resolve.ts:97-98` already does `Promise.resolve(capability.canRun(options.input))` — `Promise.resolve`
of an already-pending promise just returns an equivalent promise, so this call site has always tolerated
an async `canRun` at runtime. Only the *type* says otherwise. This step makes the type honest.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/tests/unit/resolve.test.ts — new case, alongside the existing ones
it('awaits an async canRun exactly the same way it awaits a sync one', async () => {
  const capability: AuditCapability = {
    id: 'async-canrun-capability',
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => new Promise((resolve) => setTimeout(() => resolve(true), 5)),
    runCodeLayer: async () => [],
  };

  const { applicable, skipped } = await resolveApplicable({
    capabilities: [capability],
    input: SAMPLE_INPUT,
    targetControlLevel: 'NONE',
  });

  expect(skipped).toEqual([]);
  expect(applicable).toHaveLength(1);
  expect(applicable[0]?.capability.id).toBe('async-canrun-capability');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/worker/tests/unit/resolve.test.ts`
Expected: **TypeScript compile error** (not a runtime failure) — `canRun: () => Promise<boolean>` does
not satisfy `canRun(input: CapabilityInput): boolean`. This is the correct RED for a type-widening task:
the test fails to even compile until the contract changes.

- [ ] **Step 3: Widen the contract**

In `packages/capability-sdk/src/contract.ts`, change:
```typescript
canRun(input: CapabilityInput): boolean;
```
to:
```typescript
/**
 * Preconditions. False means skipped and reported NOT_APPLICABLE, never
 * failed (FR-021). Side-effect free always; synchronous for a normal
 * in-process capability, but MAY return a Promise — an installed capability
 * dispatched through sandbox-runner (T253) has no way to answer this
 * without a network round trip, and `resolve.ts`'s own call site has always
 * tolerated either shape via `Promise.resolve(...)`. The conformance
 * suite's side-effect-free assertion applies to both forms identically.
 */
canRun(input: CapabilityInput): boolean | Promise<boolean>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS. Also re-run the full existing `resolve.test.ts` file to confirm every capability that
returns a plain `boolean` still type-checks and passes unchanged (widening a union is backward
compatible by construction, but confirm it).

- [ ] **Step 5: Commit**

```bash
git add packages/capability-sdk/src/contract.ts apps/worker/tests/unit/resolve.test.ts
git commit -m "feat(capability-sdk): allow canRun to return a Promise, for sandbox-backed capabilities"
```

---

### Task 2: Fold `canRun` into the sandbox's `RUN_CODE_LAYER` handler

**Files:**
- Modify: `apps/sandbox-runner/src/protocol.ts` (`SandboxSuccess` gains `applicable?: boolean`)
- Modify: `apps/sandbox-runner/src/child-harness/harness.ts` (`runCodeLayerOp`)
- Test: a new file, `apps/sandbox-runner/tests/unit/run-code-layer-op.test.ts` (no existing test
  exercises `runCodeLayerOp` at all today per the research — `RUN_CODE_LAYER` is currently dead code)

**Interfaces:**
- Consumes: `LoadedCapability` (from `./load.ts`, already used elsewhere in `harness.ts`),
  `containCapabilityCall` (from `@webaudit/capability-sdk`, signature: `containCapabilityCall<T>(work:
  () => Promise<T>, options: {timeoutMs: number}): Promise<Contained<T>>` where `Contained<T>` is
  `{kind:'resolved',value:T,durationMs} | {kind:'rejected',error:unknown,durationMs} |
  {kind:'timeout',durationMs}`).
- Produces: `SandboxSuccess.applicable?: boolean` — Task 4's worker-side wrapper reads this field to
  decide whether to report the capability as applicable-with-zero-findings vs applicable-with-findings.
  Absent (as for every existing `CONFORMANCE`/`REVERIFY` response) means `true` — backward compatible.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/sandbox-runner/tests/unit/run-code-layer-op.test.ts
import { describe, expect, it } from 'vitest';
import { loadCapabilityFromBundle } from '../../src/child-harness/load.js';
import type { SandboxRequest } from '../../src/protocol.js';

// Import the not-yet-exported-for-testing internal — see Step 3, which also
// exports `runCodeLayerOp` from harness.ts so this test can reach it directly
// rather than going through the full `handleExecute` IPC plumbing.
import { runCodeLayerOp } from '../../src/child-harness/harness.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/sandbox-runner/tests/unit/run-code-layer-op.test.ts`
Expected: FAIL — `runCodeLayerOp` is not exported from `harness.ts` yet, and `SandboxSuccess` has no
`applicable` field yet.

- [ ] **Step 3: Implement**

In `apps/sandbox-runner/src/protocol.ts`, change `SandboxSuccess` to:
```typescript
export interface SandboxSuccess {
  readonly requestId: string;
  readonly ok: true;
  readonly findings: readonly CapabilityFinding[];
  readonly durationMs: number;
  /**
   * RUN_CODE_LAYER only — whether the capability's own `canRun` accepted
   * this input before `runCodeLayer` ran. Absent (CONFORMANCE, REVERIFY,
   * and every response before this field existed) means true. `false`
   * means `runCodeLayer` was never called and `findings` is always `[]`.
   */
  readonly applicable?: boolean;
}
```

In `apps/sandbox-runner/src/child-harness/harness.ts`, change `runCodeLayerOp` (currently exported? —
confirm; export it if not) to call `canRun` first:
```typescript
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

  // T253: canRun runs inside the same sandbox dispatch as runCodeLayer —
  // one process fork per installed-capability call, not two. A capability
  // that declines is reported applicable:false with no findings, and
  // runCodeLayer is never invoked for it.
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
```
(This replaces the existing `runCodeLayerOp` body entirely — same function name/signature, so
`handleExecute`'s existing call to it needs no change. Add `export` to the function if it was not
already exported.)

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS, both cases.
Also run the full `apps/sandbox-runner` suite (`npx vitest run --project unit apps/sandbox-runner` and
`npx vitest run --project adverse apps/sandbox-runner`) to confirm the existing `CONFORMANCE`/escape
tests are unaffected — `runConformance` (a separate function) is untouched by this step.

- [ ] **Step 5: Commit**

```bash
git add apps/sandbox-runner/src/protocol.ts apps/sandbox-runner/src/child-harness/harness.ts apps/sandbox-runner/tests/unit/run-code-layer-op.test.ts
git commit -m "feat(sandbox-runner): fold canRun into the RUN_CODE_LAYER dispatch, one round trip per call"
```

---

### Task 3: A host-side dispatch client that survives `code-layer.ts`'s fetch-poisoning

**Files:**
- Create: `apps/sandbox-runner/src/host/dispatch.ts`
- Modify: `apps/sandbox-runner/package.json` (new `./dispatch` export)
- Test: `apps/sandbox-runner/tests/unit/dispatch.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface RunCodeLayerInput {
    readonly requestId: string;
    readonly capabilityBundle: Uint8Array;
    readonly input: CapabilityInput;
    readonly limits: SandboxLimits;
  }
  export type RunCodeLayerOutcome =
    | { readonly ok: true; readonly findings: readonly CapabilityFinding[]; readonly applicable: boolean }
    | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };
  export function runCodeLayerCheck(baseUrl: string, input: RunCodeLayerInput): Promise<RunCodeLayerOutcome>;
  ```
  Task 4's worker-side wrapper capability calls this directly.

**Why this needs its own file, not a reuse of `conformance.ts`'s `fetch`:** `apps/worker/src/module-
runner/code-layer.ts` globally reassigns `globalThis.fetch` to a poisoned stub for the duration of every
code-layer execution window (to catch a capability reaching the network outside its `ctx`). A dispatch
call made through `globalThis.fetch` *during* that window — which is exactly when this function is
called, since it's called *from inside* a code-layer run — would be caught by the same poison and
misattributed as an egress violation by the very capability whose real code-layer work this dispatch is
carrying out. The fix: capture the real `fetch` once, at this module's own top-level scope, which
evaluates at import time — long before the worker's first scan ever installs the poison.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/sandbox-runner/tests/unit/dispatch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCodeLayerCheck } from '../../src/host/dispatch.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('runCodeLayerCheck', () => {
  it('POSTs a RUN_CODE_LAYER request and unwraps a successful response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, findings: [{ checkId: 'x' }], durationMs: 5, applicable: true }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

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
    // Simulates code-layer.ts's poison: fetch is swapped out for a stub AFTER
    // dispatch.ts (this test file's import above) has already captured its own
    // reference. If dispatch.ts read `globalThis.fetch` lazily instead of
    // capturing it at import time, this test would call the poison instead.
    const poisoned = vi.fn().mockRejectedValue(new Error('poisoned fetch called — this is the bug'));
    const real = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, findings: [], durationMs: 1, applicable: true }), { status: 200 }),
    );
    globalThis.fetch = real as unknown as typeof fetch;
    // Re-capture is not possible from the test — that's the point: dispatch.ts
    // must have already captured `real` at its own module load time, before
    // this test ever ran. Now poison it and confirm dispatch.ts is unaffected.
    globalThis.fetch = poisoned as unknown as typeof fetch;

    const outcome = await runCodeLayerCheck('http://sandbox.local', {
      requestId: 'r2',
      capabilityBundle: new Uint8Array([]),
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      limits: { wallClockMs: 5_000, memoryMb: 64 },
    });

    expect(poisoned).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/sandbox-runner/tests/unit/dispatch.test.ts`
Expected: FAIL — `../../src/host/dispatch.js` does not exist.

- [ ] **Step 3: Implement**

```typescript
// apps/sandbox-runner/src/host/dispatch.ts
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
  | { readonly ok: true; readonly findings: readonly CapabilityFinding[]; readonly applicable: boolean }
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
    | { readonly ok: true; readonly findings: readonly CapabilityFinding[]; readonly applicable?: boolean }
    | { readonly ok: false; readonly reason: SandboxFailure; readonly detail?: string };

  if (!body.ok) {
    return { ok: false, reason: body.reason, ...(body.detail === undefined ? {} : { detail: body.detail }) };
  }
  return { ok: true, findings: body.findings, applicable: body.applicable ?? true };
}
```

Add to `apps/sandbox-runner/package.json`'s `exports`:
```json
"./dispatch": "./src/host/dispatch.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add apps/sandbox-runner/src/host/dispatch.ts apps/sandbox-runner/package.json apps/sandbox-runner/tests/unit/dispatch.test.ts
git commit -m "feat(sandbox-runner): add the host-side RUN_CODE_LAYER dispatch client, poison-proof by construction"
```

---

### Task 4: `apps/worker` discovers installed capabilities and wraps them for sandboxed dispatch

**Files:**
- Modify: `apps/worker/package.json` (add `@webaudit/sandbox-runner: workspace:*`)
- Create: `apps/worker/src/orchestrator/sandbox-config.ts`
- Modify: `apps/worker/src/orchestrator/capability-loader.ts`
- Test: `apps/worker/tests/unit/capability-loader.test.ts` (already exists — extend it)

**Interfaces:**
- Consumes: `runCodeLayerCheck` (Task 3), `discoverManifestsInRoot` (already used), `SANDBOX_LIMITS`
  (from `@webaudit/config`, already used by `capability-upload.service.ts` — reuse the same constant
  rather than inventing worker-local limits).
- Produces: `loadCapabilities(module, enabledIds?)` now also returns wrapper `AuditCapability` objects
  for installed capabilities, indistinguishable in *type* from a vendored one to every existing caller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/tests/unit/capability-loader.test.ts — new describe block
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

// Mocked before importing capability-loader, so its own module-level
// `runCodeLayerCheck` import is the mock, not the real HTTP client.
vi.mock('@webaudit/sandbox-runner/dispatch', () => ({
  runCodeLayerCheck: vi.fn(),
}));

describe('loadCapabilities — installed capabilities', () => {
  it('never imports/evaluates the installed bundle in-process', async () => {
    const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-'));
    const dir = path.join(installedRoot, 'landmine');
    mkdirSync(dir);
    // If this file is ever `import()`'d, the process-wide flag flips —
    // proving in-process execution never happens is the whole point of
    // this test, not just that the returned object "looks right".
    writeFileSync(
      path.join(dir, 'index.js'),
      `globalThis.__LANDMINE_TRIGGERED__ = true;\nexport default { id: 'landmine', module: 'SECURITY', layer: 'CODE', canRun: () => true, runCodeLayer: async () => [] };\n`,
    );
    writeFileSync(
      path.join(dir, 'capability.manifest.json'),
      JSON.stringify({
        id: 'landmine', name: 'Landmine', version: '1.0.0', module: 'SECURITY', layer: 'CODE',
        entrypoint: 'index.js', requiresCode: false, requiresScreenshot: false,
        requiredControlLevel: 'NONE', estimatedTokens: 0,
      }),
    );

    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    process.env['SANDBOX_RUNNER_URL'] = 'http://sandbox.local';
    const { loadCapabilities } = await import('../../src/orchestrator/capability-loader.js');

    const capabilities = await loadCapabilities('SECURITY');
    const installed = capabilities.find((c) => c.id === 'landmine');

    expect(installed).toBeDefined();
    expect((globalThis as Record<string, unknown>)['__LANDMINE_TRIGGERED__']).toBeUndefined();
  });

  it("an installed capability's canRun/runCodeLayer dispatch through sandbox-runner, not in-process", async () => {
    const { runCodeLayerCheck } = await import('@webaudit/sandbox-runner/dispatch');
    vi.mocked(runCodeLayerCheck).mockResolvedValue({
      ok: true,
      applicable: true,
      findings: [{ checkId: 'x', fingerprintParts: ['x'], severity: 'LOW', title: 'x', description: 'x', evidence: {}, fixable: false }],
    });

    const { loadCapabilities } = await import('../../src/orchestrator/capability-loader.js');
    const capabilities = await loadCapabilities('SECURITY');
    const installed = capabilities.find((c) => c.id === 'landmine')!;

    const applies = await installed.canRun({ targetUrl: 'https://example.com/', priorModuleResults: {} });
    expect(applies).toBe(true);
    const findings = await installed.runCodeLayer!(
      { targetUrl: 'https://example.com/', priorModuleResults: {} },
      {} as never,
    );
    expect(findings).toHaveLength(1);
    expect(vi.mocked(runCodeLayerCheck)).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/worker/tests/unit/capability-loader.test.ts`
Expected: FAIL — `capability-loader.ts` does not discover `installedRoot` yet, `landmine` is never
returned, and `@webaudit/sandbox-runner/dispatch` is not yet a resolvable subpath from `apps/worker`
until the Task 3 export + this task's dependency addition both land.

- [ ] **Step 3: Implement**

`apps/worker/src/orchestrator/sandbox-config.ts` (new — worker's own copy, matching this codebase's
established convention of each app reading its own env directly rather than sharing a config module):
```typescript
/**
 * T253 — where to find `apps/sandbox-runner`, from `apps/worker`'s side.
 * Mirrors `apps/api/src/config/sandbox.ts`'s `getSandboxRunnerUrl` exactly;
 * not shared, because this codebase does not centralize env reading across
 * apps (`apps/worker` has no `config/env.ts`-equivalent at all — confirmed
 * by reading every file that touches `process.env` in this package).
 *
 * Read lazily, at the point an installed capability is actually about to be
 * dispatched — not at worker boot. A worker with zero installed capabilities
 * discovered must not refuse to start over a variable it will never need.
 */
export class SandboxRunnerNotConfiguredError extends Error {
  override readonly name = 'SandboxRunnerNotConfiguredError';
}

export function getSandboxRunnerUrl(): string {
  const raw = process.env['SANDBOX_RUNNER_URL'];
  if (raw === undefined || raw === '') {
    throw new SandboxRunnerNotConfiguredError(
      'SANDBOX_RUNNER_URL is not set. An installed capability cannot be dispatched without it.',
    );
  }
  return raw;
}
```

In `apps/worker/src/orchestrator/capability-loader.ts`, add installed-root discovery and a sandboxed
wrapper builder. Full replacement of the file's body below the imports:
```typescript
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { discoverManifestsInRoot, type DiscoveredManifest } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { runCodeLayerCheck } from '@webaudit/sandbox-runner/dispatch';
import { SANDBOX_LIMITS } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';
import { getSandboxRunnerUrl } from './sandbox-config.js';

/** `packages/capabilities-vendored/`, resolved relative to this file. */
function vendoredRoot(): string {
  return fileURLToPath(new URL('../../../../packages/capabilities-vendored', import.meta.url));
}

/**
 * The same directory `apps/api`'s registry writes uploaded bundles into
 * (T253) — `INSTALLED_CAPABILITIES_ROOT` env var, or the repo-relative
 * default `apps/api/src/services/registry/boot.ts`'s `defaultInstalledRoot`
 * already uses. Duplicated rather than imported: `apps/worker` does not
 * depend on `apps/api`'s registry module (only its generated Prisma
 * client, per Open Decision #10), and this is a five-line function, not
 * shared logic worth a new package subpath.
 */
function installedRoot(): string {
  return (
    process.env['INSTALLED_CAPABILITIES_ROOT'] ??
    fileURLToPath(new URL('../../../../var/capabilities-installed', import.meta.url))
  );
}

let vendoredDiscoveryCache: Promise<readonly DiscoveredManifest[]> | undefined;
let installedDiscoveryCache: Promise<readonly DiscoveredManifest[]> | undefined;

function discoverVendored(): Promise<readonly DiscoveredManifest[]> {
  vendoredDiscoveryCache ??= discoverManifestsInRoot(vendoredRoot()).then((result) => {
    for (const rejected of result.rejected) {
      console.error(`[capability-loader] rejected ${rejected.id}: ${rejected.reason}`);
    }
    return result.found;
  });
  return vendoredDiscoveryCache;
}

/**
 * T253. A separate root walk from `discoverVendored` — never merged into
 * one list — because what happens next diverges completely: a vendored
 * manifest's entrypoint gets `import()`'d into this process; an installed
 * manifest's never does. Keeping two lists makes that divergence a fact
 * about the code, not something a shared code path could accidentally
 * blur later.
 */
function discoverInstalled(): Promise<readonly DiscoveredManifest[]> {
  installedDiscoveryCache ??= discoverManifestsInRoot(installedRoot()).then((result) => {
    for (const rejected of result.rejected) {
      console.error(`[capability-loader] rejected installed ${rejected.id}: ${rejected.reason}`);
    }
    return result.found;
  });
  return installedDiscoveryCache;
}

/**
 * A capability whose `canRun`/`runCodeLayer` never execute in this
 * process — every call is a real HTTP dispatch to `sandbox-runner`,
 * carrying the on-disk bundle bytes read once at construction (not
 * re-read per call; the bundle does not change while a worker runs, the
 * same assumption `discoverVendored`'s cache already makes about the
 * vendored tree).
 *
 * **This is the one and only place in `apps/worker` an installed
 * capability's bytes are read from disk, and they are never passed to
 * `import()`, `eval`, `new Function`, or anything else that would execute
 * them in this process.** They are base64-encoded and sent as the body of
 * an HTTP request — inert data, not code, from this process's point of
 * view.
 */
function makeSandboxedCapability(manifest: DiscoveredManifest, bundle: Uint8Array): AuditCapability {
  const { id, module, layer } = manifest.manifest;

  async function dispatch(input: CapabilityInput) {
    const outcome = await runCodeLayerCheck(getSandboxRunnerUrl(), {
      requestId: randomUUID(),
      capabilityBundle: bundle,
      input,
      limits: SANDBOX_LIMITS,
    });
    if (!outcome.ok) {
      throw new Error(`sandbox dispatch failed for installed capability ${id}: ${outcome.reason}`);
    }
    return outcome;
  }

  return {
    id,
    module,
    layer,
    // Real decision happens inside the one sandbox dispatch runCodeLayer
    // makes (Task 2's `applicable` field) — this always optimistically
    // returns true so `resolve.ts` adds it to `applicable` and reaches
    // `runCodeLayer`, which is where the real answer actually comes from.
    // See this plan's own "Design Decision 1": one round trip, not two.
    canRun: () => true,
    runCodeLayer: async (input) => {
      const outcome = await dispatch(input);
      return outcome.applicable ? outcome.findings : [];
    },
  };
}

const importCacheByModule = new Map<ModuleType, Promise<readonly AuditCapability[]>>();

async function loadModuleCapabilities(module: ModuleType): Promise<readonly AuditCapability[]> {
  let cached = importCacheByModule.get(module);
  if (cached === undefined) {
    cached = (async () => {
      const [vendoredManifests, installedManifests] = await Promise.all([
        discoverVendored(),
        discoverInstalled(),
      ]);

      const vendoredForModule = vendoredManifests.filter((m) => m.manifest.module === module);
      const loadedVendored = await Promise.all(
        vendoredForModule.map(async (m): Promise<AuditCapability | null> => {
          try {
            const imported = (await import(pathToFileURL(m.entrypointPath).href)) as {
              default?: AuditCapability;
            };
            const capability = imported.default;
            if (capability === undefined) {
              console.error(`[capability-loader] ${m.id} has no default export`);
              return null;
            }
            if (capability.module !== module) {
              console.error(
                `[capability-loader] ${m.id} declares module ${capability.module} in code but ` +
                  `${module} in its manifest; skipped`,
              );
              return null;
            }
            return capability;
          } catch (error) {
            console.error(`[capability-loader] failed to load a ${module} capability (${m.id})`, error);
            return null;
          }
        }),
      );

      const installedForModule = installedManifests.filter((m) => m.manifest.module === module);
      const loadedInstalled = await Promise.all(
        installedForModule.map(async (m): Promise<AuditCapability | null> => {
          try {
            const { readFile } = await import('node:fs/promises');
            const bundle = await readFile(m.entrypointPath);
            return makeSandboxedCapability(m, bundle);
          } catch (error) {
            console.error(`[capability-loader] failed to read an installed ${module} capability (${m.id})`, error);
            return null;
          }
        }),
      );

      return [...loadedVendored, ...loadedInstalled].filter(
        (capability): capability is AuditCapability => capability !== null,
      );
    })();
    importCacheByModule.set(module, cached);
  }
  return cached;
}

export async function loadCapabilities(
  module: ModuleType,
  enabledIds?: ReadonlySet<string>,
): Promise<readonly AuditCapability[]> {
  const capabilities = await loadModuleCapabilities(module);
  if (enabledIds === undefined) return capabilities;
  return capabilities.filter((capability) => enabledIds.has(capability.id));
}
```

Add `"@webaudit/sandbox-runner": "workspace:*"` to `apps/worker/package.json`'s `dependencies`.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS, both cases. Then run the full existing
`capability-loader.test.ts` file (T249's original tests) to confirm vendored-capability loading is
unaffected, and `apps/worker`'s full unit suite.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/package.json apps/worker/src/orchestrator/sandbox-config.ts apps/worker/src/orchestrator/capability-loader.ts apps/worker/tests/unit/capability-loader.test.ts
git commit -m "feat(worker): discover installed capabilities and dispatch them through sandbox-runner, never in-process"
```

---

### Task 5: Upload writes the bundle to disk on a passing verdict, and reconciles immediately

**Files:**
- Modify: `apps/api/src/services/registry/boot.ts` (extract an on-demand-callable reconciliation step)
- Modify: `apps/api/src/services/admin/capability-upload.service.ts`
- Test: `apps/api/tests/contract/admin.capabilities.test.ts` (extend the existing "T226 — real dispatch"
  area with a new block)

**Interfaces:**
- Produces: `reconcileInstalledCapability(db, options)` — a focused on-demand reconcile entry point
  `capability-upload.service.ts` calls after writing to disk, distinct from
  `reconcileCapabilitiesAtBoot` (which still runs at boot, unchanged) but sharing the same
  `discoverCapabilities`/`reconcileCapabilities` machinery underneath.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/tests/contract/admin.capabilities.test.ts — new block, alongside "T226 — real dispatch"
describe('T253 — a passing upload becomes a real, dispatchable Capability row', () => {
  it('writes the bundle to installedRoot and creates a Capability row with trust INSTALLED', async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'installed-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = tmpRoot;

    const bundle = Buffer.from(`({
      id: 't253-real-upload',
      module: 'SEO',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => [],
    })`);

    const result = await uploadCapability(testDb, {
      operatorId: operator.id,
      bundle,
      manifest: { name: 'T253 real upload', version: '1.0.0' },
    });
    expect(result.passed).toBe(true);

    const manifestPath = path.join(tmpRoot, 't253-real-upload', 'capability.manifest.json');
    expect(existsSync(manifestPath)).toBe(true);

    const row = await testDb.capability.findUnique({ where: { id: 't253-real-upload' } });
    expect(row?.trust).toBe('INSTALLED');
    expect(row?.isEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/api/tests/contract/admin.capabilities.test.ts`
Expected: FAIL — no `Capability` row is created and nothing is written to `tmpRoot`, since
`uploadCapability` today stops after the conformance check.

- [ ] **Step 3: Implement**

In `apps/api/src/services/registry/boot.ts`, extract the reconciliation body so it is callable outside
`reconcileCapabilitiesAtBoot` too (both now call the same helper):
```typescript
// New, exported alongside reconcileCapabilitiesAtBoot:
export async function reconcileNow(
  db: Pick<PrismaClient, 'capability'>,
  options: ReconcileAtBootOptions = {},
): Promise<void> {
  let discovery;
  try {
    discovery = await discoverCapabilities({
      vendoredRoot: options.vendoredRoot ?? defaultVendoredRoot(),
      installedRoot: options.installedRoot ?? defaultInstalledRoot(),
    });
  } catch (error) {
    console.error(
      `[registry] capability discovery failed; capabilities from a previous reconcile (if any) ` +
        `are still served: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (options.assertLocal ?? true) {
    await assertCapabilitiesAreLocal(discovery.capabilities);
  }
  await reconcileCapabilities(db, discovery);
}
```
Then have `reconcileCapabilitiesAtBoot`'s body call `reconcileNow` for the discovery+reconcile portion
(keeping `ensurePlatformCapabilities` and the boot-specific logging exactly as today) rather than
duplicating the logic.

Also export `defaultInstalledRoot`/`defaultVendoredRoot` from `boot.ts` (add `export` to both) so
`capability-upload.service.ts` can resolve the same real directory without hardcoding a second copy.

In `apps/api/src/services/admin/capability-upload.service.ts`, after the existing
`recordAuditLog` call and before `return`:
```typescript
if (outcome.report.passed) {
  await writeInstalledCapabilityToDisk(input.bundle, {
    id: outcome.report.capabilityId,
    module: /* read from outcome.report — confirm exact field name against ConformanceReport's real shape before finalizing this step; capability-sdk's runConformanceSuite already knows module/layer from rawManifest */,
    layer: /* same */,
    name: input.manifest.name,
    version: input.manifest.version,
  });
  await reconcileNow(db);
}
```
Add the disk-write helper:
```typescript
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultInstalledRoot, reconcileNow } from '../registry/boot.js';

interface InstalledCapabilityMetadata {
  readonly id: string;
  readonly module: string;
  readonly layer: string;
  readonly name: string;
  readonly version: string;
}

/**
 * Writes exactly the directory shape `discoverManifestsInRoot` requires:
 * `<installedRoot>/<id>/index.js` (the bundle, UTF-8 JS source — the same
 * "completion value is the AuditCapability object" format the sandbox
 * already evaluates it as) plus a real `capability.manifest.json` whose
 * `entrypoint` genuinely points at that file, unlike the sandbox's fixed
 * `bundle.js` sentinel (which exists only to satisfy the schema *inside*
 * the ephemeral sandbox evaluation — this is the real, persistent copy a
 * later `import()`-free `readFile` in `apps/worker` reads back).
 */
async function writeInstalledCapabilityToDisk(
  bundle: Buffer,
  metadata: InstalledCapabilityMetadata,
): Promise<void> {
  const dir = path.join(defaultInstalledRoot(), metadata.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.js'), bundle);
  await writeFile(
    path.join(dir, 'capability.manifest.json'),
    JSON.stringify(
      {
        id: metadata.id,
        name: metadata.name,
        version: metadata.version,
        module: metadata.module,
        layer: metadata.layer,
        entrypoint: 'index.js',
        requiresCode: false,
        requiresScreenshot: false,
        requiredControlLevel: 'NONE',
        estimatedTokens: 0,
      },
      null,
      2,
    ),
  );
}
```
**Before finalizing this step**: confirm `ConformanceReport`'s real field names for module/layer
(`packages/capability-sdk/src/conformance/suite.ts`) — the plan's placeholder comment above must be
resolved to real field access, not left as a comment, per this project's own "no placeholders" rule.
Read that file first.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.
Also re-run the full `apps/api` contract suite to confirm `reconcileCapabilitiesAtBoot`'s own existing
tests (boot-time reconciliation) still pass unchanged after the extraction in Step 3.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/registry/boot.ts apps/api/src/services/admin/capability-upload.service.ts apps/api/tests/contract/admin.capabilities.test.ts
git commit -m "feat(api): a passing capability upload now writes to disk and reconciles immediately"
```

---

### Task 6: Real end-to-end proof — upload, discover, dispatch, real finding

**Files:**
- Create: `apps/worker/tests/integration/installed-capability-dispatch.test.ts`

**Interfaces:**
- Consumes: `createSandboxHost` (`@webaudit/sandbox-runner`), `loadCapabilities` (Task 4),
  `resolveApplicable` (existing), `runCodeLayer` (existing, `code-layer.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/tests/integration/installed-capability-dispatch.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSandboxHost, type SandboxHost } from '@webaudit/sandbox-runner';
import { resolveApplicable } from '../../src/module-runner/resolve.js';
import { runCodeLayer } from '../../src/module-runner/code-layer.js';

let host: SandboxHost;

beforeAll(async () => {
  const installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-e2e-'));
  const dir = path.join(installedRoot, 'e2e-installed');
  mkdirSync(dir);
  writeFileSync(
    path.join(dir, 'index.js'),
    `({
      id: 'e2e-installed', module: 'SEO', layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => [{
        checkId: 'e2e', fingerprintParts: ['e2e'], severity: 'LOW',
        title: 'real dispatch works', description: 'dispatched through sandbox-runner during a real scan',
        evidence: {}, fixable: false,
      }],
    })`,
  );
  writeFileSync(
    path.join(dir, 'capability.manifest.json'),
    JSON.stringify({
      id: 'e2e-installed', name: 'E2E Installed', version: '1.0.0', module: 'SEO', layer: 'CODE',
      entrypoint: 'index.js', requiresCode: false, requiresScreenshot: false,
      requiredControlLevel: 'NONE', estimatedTokens: 0,
    }),
  );
  process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;

  host = await createSandboxHost({ port: 0 });
  process.env['SANDBOX_RUNNER_URL'] = `http://127.0.0.1:${String(host.port)}`;
});

afterAll(async () => {
  await host.close();
});

describe('a real scan dispatches an installed capability through sandbox-runner', () => {
  it('produces a real finding, end to end', async () => {
    const { loadCapabilities } = await import('../../src/orchestrator/capability-loader.js');
    const capabilities = await loadCapabilities('SEO');
    const installed = capabilities.find((c) => c.id === 'e2e-installed');
    expect(installed).toBeDefined();

    const { applicable, skipped } = await resolveApplicable({
      capabilities: [installed!],
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      targetControlLevel: 'NONE',
    });
    expect(skipped).toEqual([]);
    expect(applicable).toHaveLength(1);

    const outcomes = await runCodeLayer({
      applicable,
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      makeContext: () => ({}) as never,
      timeoutMs: 10_000,
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.succeeded).toBe(true);
    expect(outcomes[0]?.findings).toHaveLength(1);
    expect(outcomes[0]?.findings[0]?.checkId).toBe('e2e');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit apps/worker/tests/integration/installed-capability-dispatch.test.ts`
Expected: FAIL (or errors) until Tasks 1-4 are all in place — this test is the integration proof that
ties them together, so it should only be run after Tasks 1-4 are individually green. Watch it fail for
a reason consistent with "not wired yet" (e.g. `installed` is `undefined`) before those tasks land, and
confirm it starts passing once they do — this task's own step 2/4 split is really "run it after Task 4
lands and confirm every prior task's own unit-level claim holds up under a real, multi-package
integration."

- [ ] **Step 3: (No new production code — this task is the integration proof)**

If this test fails after Tasks 1-4 are all committed, that is a real signal one of those tasks' unit
tests missed an integration-level gap — fix the specific gap found, in the task where it actually
belongs, rather than patching around it here.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/tests/integration/installed-capability-dispatch.test.ts
git commit -m "test(worker): prove an installed capability dispatches through sandbox-runner end to end in a real scan"
```

---

### Task 7: Failure-mode coverage — sandbox unreachable mid-scan degrades, doesn't block

**Files:**
- Create: `apps/worker/tests/adverse/installed-capability-failure.test.ts`

**Interfaces:** Consumes the same pieces as Task 6, but with `SANDBOX_RUNNER_URL` pointed at nothing.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/worker/tests/adverse/installed-capability-failure.test.ts
import { describe, expect, it } from 'vitest';
import { resolveApplicable } from '../../src/module-runner/resolve.js';
import { runCodeLayer } from '../../src/module-runner/code-layer.js';
import type { AuditCapability } from '@webaudit/capability-sdk';

describe('an installed capability whose sandbox is unreachable fails closed, not open', () => {
  it('the one capability fails with zero findings; the module-level call does not throw', async () => {
    process.env['SANDBOX_RUNNER_URL'] = 'http://127.0.0.1:1'; // nothing listens here

    const { makeSandboxedCapability } = await import('../../src/orchestrator/capability-loader.js');
    // If makeSandboxedCapability is not exported for testing, construct the
    // equivalent inline here instead — the point is exercising the same
    // runCodeLayer implementation Task 4 wrote, not importing a private symbol.

    const capability: AuditCapability = {
      id: 'unreachable-sandbox',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => {
        const { runCodeLayerCheck } = await import('@webaudit/sandbox-runner/dispatch');
        const outcome = await runCodeLayerCheck('http://127.0.0.1:1', {
          requestId: 'r', capabilityBundle: new Uint8Array(), input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
          limits: { wallClockMs: 1_000, memoryMb: 32 },
        }).catch((error: unknown) => {
          throw error instanceof Error ? error : new Error(String(error));
        });
        if (!outcome.ok) throw new Error(`sandbox unreachable: ${outcome.reason}`);
        return outcome.findings;
      },
    };

    const { applicable } = await resolveApplicable({
      capabilities: [capability],
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      targetControlLevel: 'NONE',
    });

    const outcomes = await runCodeLayer({
      applicable,
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      makeContext: () => ({}) as never,
      timeoutMs: 2_000,
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.succeeded).toBe(false);
    expect(outcomes[0]?.findings).toEqual([]);
    expect(outcomes[0]?.errorMessage).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project adverse apps/worker/tests/adverse/installed-capability-failure.test.ts`
Expected: this SHOULD already pass once Tasks 1-4 land, since `containCapabilityCall` in `code-layer.ts`
already turns any rejection into exactly this outcome shape for every capability, installed or not — no
special-casing was added for this failure mode anywhere in this plan, by design (Design Decision 2).
If it fails, that means something in Task 4's wrapper swallows the error instead of letting it reject —
fix Task 4's `runCodeLayer` implementation so the sandbox failure genuinely propagates as a rejection.

- [ ] **Step 3: (Likely no new production code; fix Task 4 if this step's expectation is wrong)**

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2. Expected: PASS, proving no new code was needed — the existing
containment mechanism already covers this case correctly, which is itself worth having asserted rather
than assumed.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/tests/adverse/installed-capability-failure.test.ts
git commit -m "test(worker): prove sandbox-unreachable fails one installed capability closed, never the module"
```

---

### Task 8: Close out the task and its documentation

**Files:**
- Modify: `specs/001-webaudit-mvp-baseline/tasks.md` (mark T253 `[X]` with the real account)
- Modify: `PROGRESS.md` (Open Decision #20's still-open half, resolved)

- [ ] **Step 1: Run the full regression**

```bash
pnpm test
pnpm test:adverse
```
Expected: every existing suite still green, plus every new test from Tasks 1-7.

- [ ] **Step 2: Update tasks.md**

Change T253's `- [ ]` to `- [X]` and append a real, honest account of what was built — matching every
other closed task's own style in this file (concrete file names, what tests prove it, what tradeoffs
were made explicit, e.g. the canRun-folding decision and the fetch-poison mitigation).

- [ ] **Step 3: Update PROGRESS.md**

Resolve the still-open half of Open Decision #20 with a dated entry describing what was built, cross-
referencing the new tests as the proof, matching this file's own established citation style (test file
names + pass counts).

- [ ] **Step 4: Commit**

```bash
git add specs/001-webaudit-mvp-baseline/tasks.md PROGRESS.md
git commit -m "docs: close out T253 — installed capabilities now dispatch through sandbox-runner in a real scan"
```

---

## Self-Review Notes

- **Spec coverage:** every clause of T253's own text is covered — a `Capability` row is written
  (Task 5), the worker's filesystem-driven loader finds the installed root (Task 4), and INSTALLED-trust
  capabilities dispatch through `sandbox-runner` during a real scan rather than only at upload-time
  conformance (Tasks 2-4, proven end to end by Task 6).
- **Placeholder scan:** one real placeholder remains, flagged explicitly in Task 5 Step 3 (the exact
  `ConformanceReport` field names for module/layer) — the step says plainly to read
  `conformance/suite.ts` first and resolve it before writing the code, rather than guessing. This is the
  one piece of research the two research passes behind this plan did not directly capture.
- **Type consistency:** `AuditCapability` (Task 1's widened `canRun`) is the same interface every later
  task's wrapper implements; `SandboxSuccess.applicable` (Task 2) is the exact field Task 3's
  `RunCodeLayerOutcome` and Task 4's `makeSandboxedCapability` both read; `getSandboxRunnerUrl` (Task 4)
  matches the naming of `apps/api`'s own, deliberately not shared per the Global Constraints section.
