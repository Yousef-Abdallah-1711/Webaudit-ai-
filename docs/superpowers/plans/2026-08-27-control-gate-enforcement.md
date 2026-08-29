# Control Gate Enforcement (R2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the second blocker-severity finding from the independent T001–T142 review — the target control gate (SC-021) has a genuinely well-tested adversarial suite, but nothing in production actually calls it with real data. Intake defaults `resolveRequiredControlLevel` to `() => 'NONE'`, the orchestrator reads a cached DB column instead of re-confirming live, `runModule` is never given per-capability `requiredControlLevels`, and the published Level-1 rate bound has zero callers.

**Architecture:** Expose `apps/api`'s control-gate service to `apps/worker` via a package-subpath barrel — the exact precedent the credit-refund plan (R1) already established for the credits service. Build one real `resolveRequiredControlLevel` (used at intake) and one real per-phase re-confirmation + per-capability gating step (used at execution), both sourced from the `Capability` table via the shared Prisma client rather than a new registry dependency. Re-confirm live only when it can matter — if every capability in a phase requires no more than `NONE`, skip the network-touching re-confirmation entirely; today that's every phase, so this ships with zero added latency until a capability actually declares `ATTESTED`/`VERIFIED`.

**Tech Stack:** TypeScript 5.9, Prisma/PostgreSQL, Vitest (`--no-file-parallelism`, real DB), pnpm workspaces.

**Spec:** Implements review findings from the WebAudit AI T001–T142 baseline review (R2 in the remediation plan) — "Target control gate: FAIL (as an *enforced* guarantee)." No separate spec.md; the binding authority is CLAUDE.md's non-negotiable #1 (core never names a capability) and #5's sibling principle ("SSRF validation happens at connect time, not resolve time... Resolve-time-only checks are defeated") applied to control level the same way, plus FR-017 as already encoded in `apps/api/tests/adverse/control-gate.test.ts` and `apps/api/tests/contract/scans.refusals.test.ts`.

## Global Constraints

- `apps/worker` may depend on `@webaudit/api` in production only for generated artifacts/service exports via subpath — never routes, Express, or app wiring. Follow the exact shape R1 already established (`@webaudit/api/credits`) for a new `@webaudit/api/control-gate` subpath.
- A capability's manifest is never trusted for its own `requiredControlLevel` at runtime — the value is read from the `Capability` DB table (the reconciled registry's own source), matching this codebase's existing "trust comes from the discovery root/registry, never from a manifest" principle.
- Re-confirmation must not add a network call to every scan when nothing is gated — check the cheap, DB-only "does anything in this phase require more than NONE" question first, and only reconfirm live if the answer is yes.
- `pnpm test` and `pnpm test:adverse` must stay green. Re-run any suite that fails once, alone, before treating it as real — a concurrent session sharing this checkout's test DB has produced false failures before (see the R1 plan's own ledger).
- Do not modify `packages/capabilities-vendored/*/capability.manifest.json` — all 13 currently declare `requiredControlLevel: "NONE"`, which is correct and out of scope; this plan wires the enforcement mechanism, not new gated capabilities.
- Money in integer micros; no floats — inherited project-wide rule, not directly touched by this plan but do not violate it if a fix happens to brush credit code.

---

### Task 1: A single, shared control-level rank helper

**Files:**
- Modify: `packages/types/src/domain.ts`
- Modify: `apps/worker/src/module-runner/resolve.ts`
- Modify: `apps/api/src/services/registry/snapshot.ts`
- Modify: `apps/api/src/services/intake/create-scan.ts`
- Test: `packages/types/tests/control-level-rank.test.ts` (new)

**Interfaces:**
- Produces: `controlLevelRank(level: ControlLevel): number`, exported from `@webaudit/types` alongside the existing `CONTROL_LEVELS` const.
- Consumes: nothing new — `CONTROL_LEVELS` already exists at `packages/types/src/domain.ts:30`.

**Context:** Three independent, identical re-implementations of the same ordering exist today: `resolve.ts`'s local unexported `rank()`, `snapshot.ts`'s local unexported `rank()`, and `create-scan.ts`'s differently-shaped `LEVEL_RANK` literal map. None are shared. This is a real drift risk (a future fourth caller could get the ordering subtly wrong) and this plan is about to add a fourth and fifth caller (Tasks 3 and 4) — collapse to one export first, before adding more copies.

- [ ] **Step 1: Write the failing test**

Create `packages/types/tests/control-level-rank.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { controlLevelRank } from '../src/domain.js';

describe('controlLevelRank', () => {
  it('orders NONE below ATTESTED below VERIFIED', () => {
    expect(controlLevelRank('NONE')).toBeLessThan(controlLevelRank('ATTESTED'));
    expect(controlLevelRank('ATTESTED')).toBeLessThan(controlLevelRank('VERIFIED'));
  });

  it('matches the declared CONTROL_LEVELS order exactly', () => {
    expect(controlLevelRank('NONE')).toBe(0);
    expect(controlLevelRank('ATTESTED')).toBe(1);
    expect(controlLevelRank('VERIFIED')).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/types exec vitest run tests/control-level-rank.test.ts`
Expected: FAIL — `controlLevelRank` does not exist yet.

- [ ] **Step 3: Add the export**

In `packages/types/src/domain.ts`, immediately after the existing `CONTROL_LEVELS`/`ControlLevel` declaration, add:

```ts
/**
 * Where a control level sits in the ordering CONTROL_LEVELS declares.
 * The single implementation every gating check compares against — do not
 * re-derive this locally; a second copy is how the ordering drifts.
 */
export function controlLevelRank(level: ControlLevel): number {
  return CONTROL_LEVELS.indexOf(level);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/types exec vitest run tests/control-level-rank.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Replace the three duplicated implementations**

In `apps/worker/src/module-runner/resolve.ts`: delete the local `function rank(level: ControlLevel): number { return CONTROL_LEVELS.indexOf(level); }` and its call sites' references to `rank(...)`. Add `controlLevelRank` to this file's existing `@webaudit/types` import line, and replace every call site `rank(x)` with `controlLevelRank(x)`.

In `apps/api/src/services/registry/snapshot.ts`: same replacement — delete the local `rank()`, import `controlLevelRank` from `@webaudit/types`, replace call sites.

In `apps/api/src/services/intake/create-scan.ts`: delete the `LEVEL_RANK: Readonly<Record<ControlLevel, number>>` literal map entirely. Replace every place it was indexed (`LEVEL_RANK[x]`) with `controlLevelRank(x)`, imported from `@webaudit/types`.

- [ ] **Step 6: Run the full existing regression suites for the three touched files**

Run: `pnpm test -- apps/worker/tests/unit/resolve.test.ts` (or whatever the real path is — grep `apps/worker/tests` for a file testing `resolveApplicable` first) and the equivalent for `snapshot.ts` and `create-scan.ts`. Use the exact `pnpm test`/root-invocation form, not `pnpm --filter X exec vitest run` directly (that bypasses `vitest.workspace.ts`'s env injection — an R1-plan lesson, still true here).
Expected: PASS, identical behavior — this is a pure refactor, no logic change.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/domain.ts packages/types/tests/control-level-rank.test.ts apps/worker/src/module-runner/resolve.ts apps/api/src/services/registry/snapshot.ts apps/api/src/services/intake/create-scan.ts
git commit -m "refactor(types): export controlLevelRank, remove 3 duplicated implementations"
```

---

### Task 2: Expose the control-gate service to `apps/worker`

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/services/control-gate/index.ts`
- Test: `apps/worker/tests/unit/control-gate-import.test.ts` (new)

**Interfaces:**
- Produces: a new package subpath `@webaudit/api/control-gate`, exporting everything from `reconfirm.ts`, `verify.ts`, `attest.ts`, `rate-bound.ts`.
- Consumed by: Task 4 (`reconfirmControl`, `createSafeNetProbe`) and Task 5 (`level1RateBound`).

This mirrors R1's Task 2 exactly (the credit-refund plan already established this exact pattern for `@webaudit/api/credits`) — same shape, same reasoning: `apps/worker` already has `@webaudit/api` as a real production dependency (for its generated Prisma client and now the credits barrel); a second, narrowly-scoped service subpath is the same kind of extension, not a new kind of coupling.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/unit/control-gate-import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('control-gate import from @webaudit/api', () => {
  it('resolves reconfirmControl, createSafeNetProbe, and level1RateBound', async () => {
    const mod = await import('@webaudit/api/control-gate');
    expect(typeof mod.reconfirmControl).toBe('function');
    expect(typeof mod.createSafeNetProbe).toBe('function');
    expect(typeof mod.assertAttested).toBe('function');
    expect(mod.level1RateBound).toBeDefined();
    expect(typeof mod.level1RateBound.tryAcquire).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/unit/control-gate-import.test.ts`
Expected: FAIL — `Cannot find module '@webaudit/api/control-gate'`.

- [ ] **Step 3: Create the barrel and add the export subpath**

Create `apps/api/src/services/control-gate/index.ts`:

```ts
export * from './reconfirm.js';
export * from './verify.js';
export * from './attest.js';
export * from './rate-bound.js';
```

(Before writing this, grep each of the four files' `^export` lines to confirm there are no naming collisions — if there are, use explicit named exports instead of `export *` for whichever file collides, same rule R1's Task 2 already applied.)

In `apps/api/package.json`'s `"exports"` block, add as a sibling to the existing `"./credits"` and `"./prisma-client"` entries:

```json
"./control-gate": "./src/services/control-gate/index.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/unit/control-gate-import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/services/control-gate/index.ts apps/worker/tests/unit/control-gate-import.test.ts
git commit -m "feat(worker): expose apps/api's control-gate service as an importable subpath"
```

---

### Task 3: A real `resolveRequiredControlLevel`, wired at API boot

**Files:**
- Create: `apps/api/src/services/registry/resolve-required-control-level.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/tests/integration/resolve-required-control-level.test.ts` (new)

**Interfaces:**
- Consumes: the shared Prisma client, `controlLevelRank` from `@webaudit/types` (Task 1).
- Produces: `buildResolveRequiredControlLevel(db: PrismaClient): (moduleType: string) => Promise<ControlLevel>` — note this returns a `Promise`, unlike the existing synchronous stub type in `ScanRoutesDeps`; see Step 3's note on widening that interface.

**Context:** `apps/api/src/routes/scans.routes.ts`'s `ScanRoutesDeps.resolveRequiredControlLevel` seam already exists and is already correctly consumed by `create-scan.ts` (which already calls `reconfirmControl` for the real per-scan check) — the only gap is that `apps/api/src/index.ts` never builds a real implementation and passes it in, so the `() => 'NONE'` default in `scans.routes.ts` always wins in production. The seam's contract (established by the existing test `apps/api/tests/contract/scans.refusals.test.ts`) is one control level per module type: "the level below which nothing in this module can run" — the *minimum* `requiredControlLevel` among that module's enabled capabilities, since if the target's level reaches that minimum, at least one capability in the module unlocks and the module should not be treated as wholly gated out.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/resolve-required-control-level.test.ts`. Read `apps/api/tests/adverse/credits.refund-to-lot.test.ts` first for the exact `testDb`/`resetDb`/`seedPlans` fixture pattern this file should copy.

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { buildResolveRequiredControlLevel } from '../../src/services/registry/resolve-required-control-level.js';

beforeEach(async () => { await resetDb(); await seedPlans(); });
afterAll(closeDb);

describe('buildResolveRequiredControlLevel', () => {
  it('returns NONE for a module whose capabilities all require NONE', async () => {
    await testDb.capability.create({
      data: { id: 'headers-checker', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'NONE', isEnabled: true, isTrusted: true, sourceHash: 'x' },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('NONE');
  });

  it('returns the minimum required level across a module\'s capabilities', async () => {
    await testDb.capability.create({
      data: { id: 'fake-strict', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'VERIFIED', isEnabled: true, isTrusted: true, sourceHash: 'x' },
    });
    await testDb.capability.create({
      data: { id: 'fake-lenient', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'NONE', isEnabled: true, isTrusted: true, sourceHash: 'y' },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    // At least one capability (fake-lenient) needs nothing — the module as a
    // whole is not "fully gated", so the minimum (NONE) is the right answer.
    expect(await resolve('SECURITY')).toBe('NONE');
  });

  it('returns VERIFIED when every capability in the module requires it', async () => {
    await testDb.capability.create({
      data: { id: 'fake-strict-only', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'VERIFIED', isEnabled: true, isTrusted: true, sourceHash: 'x' },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('VERIFIED');
  });

  it('ignores a disabled capability when computing the minimum', async () => {
    await testDb.capability.create({
      data: { id: 'fake-strict-disabled', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'VERIFIED', isEnabled: false, isTrusted: true, sourceHash: 'x' },
    });
    await testDb.capability.create({
      data: { id: 'fake-lenient-2', module: 'SECURITY', layer: 'CODE', requiredControlLevel: 'ATTESTED', isEnabled: true, isTrusted: true, sourceHash: 'y' },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('ATTESTED');
  });

  it('returns NONE for a module with no registered capabilities at all', async () => {
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('TESTING')).toBe('NONE');
  });
});
```

(If the `Capability` model's real field names differ from what's guessed above — `layer`, `isTrusted`, `sourceHash` — read `apps/api/prisma/schema.prisma`'s `Capability` model first and correct the fixture `data:` blocks to match the real required fields exactly before running anything.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/resolve-required-control-level.test.ts --no-file-parallelism`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement it**

Create `apps/api/src/services/registry/resolve-required-control-level.ts`:

```ts
import { controlLevelRank, type ControlLevel } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

/**
 * The level below which nothing in a module can run — the minimum
 * `requiredControlLevel` among that module's enabled capabilities. If the
 * target's level reaches this minimum, at least one capability unlocks, so
 * the module is not wholly gated out (FR-017's whole-scan 403 must not fire
 * for it). A module with no registered capabilities gates nothing.
 */
export function buildResolveRequiredControlLevel(
  db: Pick<PrismaClient, 'capability'>,
): (moduleType: string) => Promise<ControlLevel> {
  return async (moduleType: string): Promise<ControlLevel> => {
    const rows = await db.capability.findMany({
      where: { module: moduleType, isEnabled: true },
      select: { requiredControlLevel: true },
    });
    if (rows.length === 0) return 'NONE';
    let min: ControlLevel = rows[0]!.requiredControlLevel as ControlLevel;
    for (const row of rows) {
      const level = row.requiredControlLevel as ControlLevel;
      if (controlLevelRank(level) < controlLevelRank(min)) min = level;
    }
    return min;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/resolve-required-control-level.test.ts --no-file-parallelism`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Widen `ScanRoutesDeps` to accept an async resolver, and wire it at boot**

`ScanRoutesDeps.resolveRequiredControlLevel` is currently typed synchronous (`(moduleType: string) => 'NONE' | 'ATTESTED' | 'VERIFIED'`), but a real, DB-backed implementation must be `async`. In `apps/api/src/routes/scans.routes.ts`:
1. Widen the type to `(moduleType: string) => ControlLevel | Promise<ControlLevel>`.
2. Find every call site of `resolveRequiredControlLevel(...)` inside this file and `create-scan.ts` and add `await` if not already present (check — if `create-scan.ts` already awaits it defensively, no change needed there; if it doesn't, add `await`).
3. Keep the default `() => 'NONE' as const` — still valid under the widened type, and existing tests that pass a synchronous stub function keep working unchanged (a plain function returning a plain value satisfies `ControlLevel | Promise<ControlLevel>` too).

In `apps/api/src/index.ts`, where `createApp({ db })` is called, change to:

```ts
import { buildResolveRequiredControlLevel } from './services/registry/resolve-required-control-level.js';
...
const app = createApp({
  db,
  scans: { resolveRequiredControlLevel: buildResolveRequiredControlLevel(db) },
});
```

- [ ] **Step 6: Run the existing scans contract/adverse suites for regressions**

Run from repo root: `pnpm test -- apps/api/tests/contract/scans.refusals.test.ts apps/api/tests/contract/scans.quote.test.ts apps/api/tests/integration/gated-check-partial.test.ts` (adjust to the real `pnpm test` invocation form this repo uses for scoping to specific files — check `package.json`'s `test` script first).
Expected: PASS — these tests already pass their own explicit `resolveRequiredControlLevel` stub into `createApp`, so widening the type to accept an async function should not change their behavior (a synchronous function is still valid), and `index.ts`'s own wiring is not exercised by tests that build their own `createApp(...)` directly.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/registry/resolve-required-control-level.ts apps/api/src/routes/scans.routes.ts apps/api/src/index.ts apps/api/tests/integration/resolve-required-control-level.test.ts
git commit -m "feat(api): wire a real resolveRequiredControlLevel at boot, closing the intake-time gate"
```

---

### Task 4: Live re-confirmation and per-capability gating in the orchestrator

**Files:**
- Modify: `apps/worker/src/orchestrator/orchestrator.ts`
- Test: `apps/worker/tests/integration/orchestrator-control-gate.test.ts` (new)

**Interfaces:**
- Consumes: `reconfirmControl`, `createSafeNetProbe` from `@webaudit/api/control-gate` (Task 2); `controlLevelRank` from `@webaudit/types` (Task 1); `RunModuleOptions.requiredControlLevels` (already exists, unused today — see research: `apps/worker/src/module-runner/index.ts`).
- Produces: `createPhaseHandler`'s `handlePhase` now builds a real, live-reconfirmed control level and a real per-capability `requiredControlLevels` map before running each phase's modules.

**Context — read this carefully before writing code, it's the core design decision of this task:** `runAndPersistModule` currently builds `CapabilityInput.controlLevel` from the cached `scan.target.controlLevel` DB column — stale by construction, the exact bug class ("checked at intake, not at the point that matters") the original review flagged. The fix is NOT to call `reconfirmControl` (a network-touching, DNS/HTTP-probing function) on every single phase job unconditionally — that would add real latency and outbound requests to every scan today, for zero behavioral benefit, since all 13 vendored capabilities currently require `NONE` and nothing is actually gated. Instead: compute the phase's `requiredControlLevels` map first (a cheap, DB-only `Capability` table query, no network), and only call `reconfirmControl` if the maximum required rank among this phase's capabilities is greater than `NONE`'s rank (0). If nothing in the phase needs more than `NONE`, skip re-confirmation entirely and use `'NONE'` directly — safe, because a comparison against `NONE` can never gate anything regardless of the target's real level.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/integration/orchestrator-control-gate.test.ts`. Follow the exact real-DB fixture pattern established in the R1 plan's Task 4 (`testDb`/`resetDb`/`seedPlans`/`closeDb` from `@webaudit/api/test-db`, `grantLot`/`debit` from `@webaudit/api/credits` for fixture setup) — read `apps/worker/tests/integration/terminal-refund.test.ts` first to copy its exact fixture shape (target creation fields, scan creation fields) rather than guessing.

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { grantLot, debit } from '@webaudit/api/credits';
import { createPhaseHandler } from '../../src/orchestrator/orchestrator.js';
import { createScanEmitter } from '../../src/orchestrator/emit.js';

beforeEach(async () => { await resetDb(); await seedPlans(); });
afterAll(closeDb);

describe('orchestrator control-level gating', () => {
  it('skips a capability whose requiredControlLevel exceeds the target\'s current level', async () => {
    // Set up: a user, a target at NONE control, a Capability row requiring
    // VERIFIED for SECURITY, a scan requesting SECURITY.
    // Run one phase job through createPhaseHandler's returned handler.
    // Assert: the resulting ModuleResult for SECURITY reflects the capability
    // being skipped for CONTROL_LEVEL (check module-runner's actual skip
    // shape — read apps/worker/src/module-runner/resolve.ts's Resolution
    // type and packages/capability-sdk's conformance suite for what a
    // wholly-skipped module's persisted state looks like), NOT that it ran
    // to COMPLETE.
  });

  it('does not call the live re-confirmation probe when every capability in the phase requires NONE', async () => {
    // Set up a scan/target/capability exactly as today (all NONE). Inject a
    // fake/spy ControlProbe (or a way to detect a network call was
    // attempted) and assert it was never invoked — the cheap DB check alone
    // decided nothing needed reconfirming.
  });

  it('lets a capability run when the target genuinely has the required level', async () => {
    // A VERIFIED-requiring capability, a target with a real, live
    // TargetVerification row (VERIFIED, unrevoked, token still published per
    // a fake ControlProbe that returns true) — assert the capability
    // actually executes (not skipped).
  });
});
```

Fill in the three numbered-comment sketches with real code once you've read the real fixture shapes from `terminal-refund.test.ts` and the real `Resolution`/skip-reason shape from `resolve.ts` and `packages/capability-sdk/src/conformance/suite.ts` — do not guess these; they must match the real types exactly or the test won't compile.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/orchestrator-control-gate.test.ts --no-file-parallelism`
Expected: FAIL — the gating isn't wired yet, so a `VERIFIED`-requiring capability runs anyway (test 1 fails on the assertion that it was skipped).

- [ ] **Step 3: Implement it**

In `apps/worker/src/orchestrator/orchestrator.ts`, add imports:

```ts
import { reconfirmControl, createSafeNetProbe } from '@webaudit/api/control-gate';
import { controlLevelRank, type ControlLevel } from '@webaudit/types';
```

Add a helper function (near `makeContext`):

```ts
/**
 * The per-capability required levels for one module, read from the
 * `Capability` table — the reconciled registry's own source, never a
 * capability's self-declared manifest at runtime.
 */
async function requiredControlLevelsFor(
  db: PrismaClient,
  module: ModuleType,
): Promise<Readonly<Record<string, ControlLevel>>> {
  const rows = await db.capability.findMany({
    where: { module, isEnabled: true },
    select: { id: true, requiredControlLevel: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.requiredControlLevel as ControlLevel]));
}

/**
 * The target's control level, re-confirmed live only if it could matter.
 * A phase whose capabilities all require NONE never touches the network —
 * NONE can never be gated regardless of the target's real level, so the
 * stale cached column is exactly as good as a live check for that case.
 */
async function resolveEffectiveControlLevel(
  db: PrismaClient,
  scan: { userId: string; targetId: string; target: { controlLevel: string } },
  requiredControlLevels: Readonly<Record<string, ControlLevel>>,
): Promise<ControlLevel> {
  const maxRequiredRank = Math.max(0, ...Object.values(requiredControlLevels).map(controlLevelRank));
  if (maxRequiredRank === 0) return 'NONE';
  const result = await reconfirmControl(db, { targetId: scan.targetId, userId: scan.userId }, createSafeNetProbe());
  return result.level;
}
```

Modify `runAndPersistModule`'s signature to accept the pre-computed `requiredControlLevels` and `effectiveControlLevel` (compute these once per phase, in `handlePhase`, not once per module — reconfirming per-module would repeat the same live check redundantly for every module in a multi-module phase):

```ts
async function runAndPersistModule(
  options: OrchestratorOptions,
  scan: { id: string; targetId: string; target: { canonicalValue: string; inputType: string; controlLevel: string } },
  module: ModuleType,
  emitter: ReturnType<typeof createScanEmitter>,
  requiredControlLevels: Readonly<Record<string, ControlLevel>>,
  effectiveControlLevel: ControlLevel,
): Promise<void> {
  await emitter.emit({ type: 'module:started', scanId: scan.id, module }, () => Promise.resolve());

  const input: CapabilityInput = {
    ...(scan.target.inputType === 'URL' ? { targetUrl: scan.target.canonicalValue } : {}),
    priorModuleResults: {},
    controlLevel: effectiveControlLevel,
  };

  const startedAt = new Date();
  const capabilities = await loadCapabilities(module);
  const result = await runModule({
    module,
    capabilities,
    input,
    executor: options.executor,
    makeContext,
    timeoutMs: options.moduleTimeoutMs ?? 60_000,
    scanId: scan.id,
    targetId: scan.targetId,
    requiredControlLevels,
  });
  // ... rest of the function is unchanged (persistModuleResult, the module:complete emit)
}
```

Update `runAndPersistModule`'s call sites (inside `handlePhase`, wherever `Promise.all` maps over the phase's modules) to first compute `requiredControlLevels`/`effectiveControlLevel` ONCE for the whole phase (not once per module — read the current `handlePhase` body to find exactly where the module list for the phase is known, before the `Promise.all`, and insert the two async calls there), then pass both into every `runAndPersistModule(...)` call for that phase:

```ts
// Before the Promise.all over this phase's modules:
const requiredControlLevels = await requiredControlLevelsFor(options.db, /* the module, or merge across all modules in the phase if more than one — check whether requiredControlLevelsFor should be called once per module or once merged for the whole phase; since RunModuleOptions.requiredControlLevels is passed per runModule call which is per-module already, simplest is to call requiredControlLevelsFor once per module inside the loop, but call resolveEffectiveControlLevel's underlying reconfirmControl at most once per phase by computing the phase-wide max first */);
```

**Judgment call needed here, use yours:** `runModule` is called once per module (inside a `Promise.all` over the phase's modules), and `RunModuleOptions.requiredControlLevels` is scoped per-module already (it's `Record<capabilityId, ControlLevel>` for that module's own capabilities). But the network-touching `reconfirmControl` call should happen **at most once per phase job**, not once per module in the phase, since it's the same target being reconfirmed regardless of which module is asking. The cleanest shape: before the `Promise.all`, loop over the phase's modules once to build a `Map<ModuleType, Record<capabilityId, ControlLevel>>` (cheap, DB-only, one `requiredControlLevelsFor` call per module — these are independent DB reads, fine to run in parallel too), compute the phase-wide maximum required rank across ALL modules' maps combined, and call `resolveEffectiveControlLevel`'s live-reconfirm logic (or an equivalent phase-scoped version of it) exactly once using that combined maximum — then pass the SAME `effectiveControlLevel` value into every module's `runAndPersistModule` call, along with that module's own specific `requiredControlLevels` map. Restructure `resolveEffectiveControlLevel` to accept the pre-computed phase-wide maximum rank directly (rather than a single module's map) if that's cleaner than computing it twice.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/orchestrator-control-gate.test.ts --no-file-parallelism`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run the full orchestrator/worker regression suite**

Run: `pnpm test -- apps/worker/tests/unit/orchestrator.test.ts apps/worker/tests/integration/progress-streaming.test.ts apps/worker/tests/integration/terminal-refund.test.ts` (adjust invocation to this repo's real `pnpm test` scoping form) plus the full worker suite.
Expected: PASS — every existing scan in every existing test still has all-`NONE`-requiring capabilities, so `resolveEffectiveControlLevel` should return `'NONE'` immediately without any network call in every one of them, meaning behavior is unchanged for every existing scenario.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/orchestrator/orchestrator.ts apps/worker/tests/integration/orchestrator-control-gate.test.ts
git commit -m "feat(worker): re-confirm control level live and gate per capability, only when it can matter"
```

**Note on `assertLoadGenerationAllowed`:** the control-gate service also exports `assertLoadGenerationAllowed(db, input, probe)`, which throws unless the level is exactly `VERIFIED` — narrower than this task's generic per-capability rank comparison (which correctly handles `ATTESTED`-requiring capabilities too, not just `VERIFIED`-requiring ones). It still has zero production callers after this task, same as before. Judgment call for whoever picks this up: read its own doc comment and the adverse suite's assertions against it — if it's a narrower belt-and-suspenders check meant for a specific load-generating capability that doesn't exist yet, it's fine to leave it as tested-but-uncalled (the same shape `refundForUndelivered` was in before the R1 plan wired it); if it turns out this task's generic mechanism doesn't actually cover something it was meant to, that's worth its own follow-up, not silently ignored.

---

### Task 5: Wire the Level-1 rate bound into the verification probe

**Files:**
- Modify: `apps/api/src/services/control-gate/verify.ts`
- Test: extend `apps/api/tests/adverse/control-gate.test.ts`'s existing "FR-017 - Level 1 probing is bounded regardless of attestation" describe block, or add a new adjacent test file if that block's existing tests already construct their own `Level1RateBound` instance directly rather than testing `createSafeNetProbe`'s integration — read the existing block first to see exactly what it already covers before deciding.

**Interfaces:**
- Consumes: `level1RateBound` (the exported singleton, `apps/api/src/services/control-gate/rate-bound.ts`).
- Modifies: `createSafeNetProbe()`'s returned `ControlProbe` — its `fetchFile`/`resolveTxt` methods now consult the rate bound before making a real network call.

**Context:** `level1RateBound` is fully built and tested in isolation (`Level1RateBound` class, `tryAcquire`/`retryAfterMs`/`release`) but has zero callers anywhere in the `apps/` tree. `createSafeNetProbe()` in `verify.ts` is the one place that actually issues the network requests (`fetchFile`/`resolveTxt`) this rate bound exists to protect. Read `apps/api/src/services/control-gate/rate-bound.ts`'s full current implementation and its existing adverse-suite assertions (the three `it()` blocks already listed in this plan's research: "applies the same published rate at every control level", "bounds each target separately", "publishes the rate rather than hiding it in code") before writing the integration — those tests define the exact contract (per-target-key bounding, same rate regardless of attestation) that `createSafeNetProbe`'s new behavior must satisfy. In particular, confirm from reading the class: does `tryAcquire` returning `false` mean the caller should throw, or wait `retryAfterMs`? Match whatever behavior the existing adverse tests already assert, don't invent a new one.

- [ ] **Step 1: Read `rate-bound.ts` in full and the existing "Level 1 probing" describe block in `control-gate.test.ts` in full.** Determine from their existing content: (a) the exact refusal/wait behavior expected when the bound is exceeded, (b) what "targetKey" should be keyed on (likely the target's canonical value or id — check).

- [ ] **Step 2: Write the failing test**

Based on what Step 1 finds, write a test proving `createSafeNetProbe()`'s `fetchFile`/`resolveTxt` now actually calls `level1RateBound.tryAcquire(targetKey)` before issuing a request, and behaves correctly (refuse or wait, per Step 1's finding) when the bound is exceeded for that target key. Use a fixture that calls the probe enough times in quick succession to exceed the bound's own default rate (read the default `maxRequestsPerSecond`/`burst` from `rate-bound.ts` to know how many calls that takes).

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL — the probe issues every request unconditionally today, so exceeding the bound produces no refusal/wait.

- [ ] **Step 4: Implement**

Wrap `createSafeNetProbe()`'s `fetchFile`/`resolveTxt` implementations to call `level1RateBound.tryAcquire(targetKey)` first, with behavior matching Step 1's finding. Use a stable, reasonable `targetKey` — the canonical value/hostname being probed, consistent with what the existing adverse tests already assume (check their fixture setup for what key shape they construct `Level1RateBound` calls against, if they test the class directly, and match it).

- [ ] **Step 5: Run test to verify it passes, then the full control-gate adverse suite**

Run: `pnpm test -- apps/api/tests/adverse/control-gate.test.ts` (real invocation form).
Expected: PASS, including the pre-existing "Level 1 probing" block, unaffected or now more directly exercised depending on what Step 1 found.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/control-gate/verify.ts <your new/modified test file>
git commit -m "feat(control-gate): wire level1RateBound into the real verification probe"
```

---

## Final verification (after all 5 tasks)

- [ ] `pnpm run lint && pnpm run format:check`
- [ ] `pnpm -r typecheck` (not `pnpm run typecheck` — the root script fails on a pre-existing, unrelated cyclic dependency, per the R1 plan's own note; still true here)
- [ ] `pnpm run test` — full unit suite, isolated (no concurrent session touching the same test DB)
- [ ] `pnpm run test:adverse` — full adverse suite, isolated, specifically re-confirm `control-gate.test.ts`'s full 19 tests stay green
- [ ] Re-run `apps/api/tests/integration/gated-check-partial.test.ts` — if the R1 plan's terminal-refund observer already landed, and this plan now makes `resolveRequiredControlLevel`/orchestrator gating real, check whether this test's docstring (which the R1 plan's research flagged as stale relative to current reality) needs updating, or whether the test itself now passes for a genuinely different reason than either plan assumed — do not force it green if the real behavior doesn't match; report honestly what actually happens.
- [ ] Update PROGRESS.md: the review's Section B finding ("Target control gate: FAIL — nothing in production actually calls it with real data") is now closed; add a pointer to this plan's commits, matching the style already used for Open Decision #11 (R1's own PROGRESS.md update).
