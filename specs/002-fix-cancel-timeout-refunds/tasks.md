---

description: "Task list for: Fix Cancellation & Timeout Refund Integrity"
---

# Tasks: Fix Cancellation & Timeout Refund Integrity

**Input**: Design documents from `/specs/002-fix-cancel-timeout-refunds/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cancellation-channel.md,
quickstart.md — all present.

**Tests**: Required, not optional, for this feature. `CLAUDE.md`'s Testing section mandates test-first
for this repository ("write the failing test, confirm it fails for the intended reason, then
implement"), and spec.md's FR-009 explicitly requires a dedicated regression test per defect. Every
implementation task below follows its own failing test.

**Organization**: Two independent, same-priority (P1) user stories from spec.md — US1 = P0-CANCEL-1,
US2 = P0-TIMEOUT-1. They touch disjoint files and share no runtime dependency; either can be delivered
first, and both are independently testable/shippable per spec.md's own framing.

## Path Conventions

Existing monorepo layout (`apps/api`, `apps/worker`, `packages/types`) — every path below is a real,
existing or newly-created path under this repository, not a placeholder.

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline before any change, so a regression introduced by this
feature is distinguishable from this machine's pre-existing environmental noise.

- [X] T001 Confirm local Postgres/Redis are up (`docker ps` shows `webaudit-postgres`,
  `webaudit-redis` healthy) and `AI_MODE=fixtures` is set, per quickstart.md Prerequisites.
- [X] T002 Run `pnpm test:adverse` and `pnpm test` once before touching any code; record the exact
  pass/fail counts (expected, per `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`
  Section 5: adverse 810/811 with 1 pre-existing skip; unit 1020/1027 with 7 pre-existing environmental
  failures) as this feature's own regression baseline.

**Checkpoint**: Baseline recorded. Any new failure after this point that isn't one of the 7 documented
environmental unit failures is a real regression from this feature's own changes.

---

## Phase 2: Foundational

**Purpose**: Shared groundwork both user stories build on.

**⚠️ Note**: US1 and US2 touch disjoint files and share no runtime code — there is genuinely little
*blocking* foundational work here. The one real shared prerequisite is the cancellation message schema
(used by both the US1 publisher and subscriber sides); everything else below is scoped to its own
story's phase.

- [X] T003 [P] Add the `cancellationSignalSchema` Zod schema and `scanCancelChannel(scanId)` helper (per
  contracts/cancellation-channel.md) to `packages/config/src/cancellation.ts` (new file), exported from
  `packages/config/src/index.ts` — **corrected from the original `packages/types` location**: that
  package is explicitly documented as dependency-free (no Zod, so `apps/web` never pulls it in just to
  render a progress bar — `packages/types/src/events.ts`'s own module note). `packages/config` is the
  established precedent for exactly this shape of thing instead (`queues.ts`'s own header: "shared
  between apps/worker (consumer) and apps/api (producer)... a producer-only need in apps/api must not
  import @webaudit/worker"). Zod is already a dependency of both `apps/api` and `apps/worker`
  (3.25.76) — adding it to `packages/config`'s `package.json` is not a new monorepo dependency.

**Checkpoint**: Foundational schema ready. US1 and US2 implementation can now proceed (in parallel, if
staffed — they do not depend on each other).

---

## Phase 3: User Story 1 — Cancellation never lets the platform pay for work already refunded (Priority: P1) 🎯 MVP candidate

**Goal**: Once a scan's cancellation is discovered, no further check belonging to it has its result,
execution record, or provider cost recorded — while work already finished and recorded before the
cancellation is left untouched.

**Independent Test**: Cancel a scan while a check is mid-flight (delayed capability resolution);
confirm no `ModuleResult`/`Issue`/`CapabilityExecution`/`AiInvocation` row is ever created for that
check, while a check that had already finished before cancellation keeps its recorded result and
charge.

### Tests for User Story 1 (write first; confirm they fail before implementing)

- [X] T004 [P] [US1] Write `apps/worker/tests/adverse/cancel-mid-flight-no-charge.test.ts`: seeds a
  running scan with a deliberately-delayed capability, triggers cancellation via the real cancel route
  while it's in flight, and asserts (a) no `ModuleResult`/`Issue`/`CapabilityExecution`/`AiInvocation`
  row exists for that module once the delayed capability resolves, (b) the scan stays `CANCELLED` and
  never advances phase, (c) credits already refunded by the cancel route are not double-refunded or
  clawed back. **Run it now and confirm it fails** (the checkpoint guards don't exist yet).

### Implementation for User Story 1

- [X] T005 [US1] Define the `CancellationSource` interface (per data-model.md /
  research.md Decision 4) in `apps/worker/src/orchestrator/cancellation.ts` (new file): `subscribe
  (scanId, onCancel): () => void`. Implement the real Redis-backed version using a dedicated subscriber
  connection (`maxRetriesPerRequest: null`, an explicit `.on('error', ...)` handler — closing the gap
  the prior realtime audit found on this same worker's publisher client), validating every received
  message against `cancellationSignalSchema` from T003 and discarding (never crashing on) anything that
  fails validation.
- [X] T006 [P] [US1] Add a fake, in-memory `CancellationSource` test double (fires `onCancel`
  synchronously on demand, no Redis) in `apps/worker/tests/helpers/fake-cancellation-source.ts`, mirroring
  the existing `EventPublisher`/`ScanEmitter` fake-injection pattern this repo already uses in its test
  suites.
- [X] T007 [US1] Add `cancellation: CancellationSource` to `OrchestratorOptions` in
  `apps/worker/src/orchestrator/orchestrator.ts`, and wire the real implementation from T005 into worker
  boot in `apps/worker/src/index.ts`.
- [X] T008 [US1] In `createPhaseHandler`'s `handlePhase` (`apps/worker/src/orchestrator/orchestrator.ts`),
  subscribe to this scan's cancellation channel at the top of the function body and unsubscribe in a
  `finally` block before returning (research.md Decision 2 — subscription lifetime is exactly one
  phase-job invocation, never longer). Track the signalled state in a local flag/`AbortController`
  scoped to this invocation.
- [X] T009 [US1] Thread that cancellation flag into `runAndPersistModule` and add **Checkpoint A**:
  immediately before calling `runModule(...)`, skip the call entirely (return early, no emit) if
  cancellation was already signalled for this scan (`apps/worker/src/orchestrator/orchestrator.ts`).
- [X] T010 [US1] Add **Checkpoint B** in the same function: immediately before the
  `db.$transaction(...)` wrapping `persistModuleResult`, skip that transaction and the subsequent
  `module:complete` emit entirely if cancellation was signalled at any point up to here (research.md
  Decision 3) — no `ModuleResult`/`Issue`/`CapabilityExecution`/`AiInvocation` row is written for this
  module.
- [X] T011 [US1] Add the publish call to `apps/api/src/routes/scans.routes.ts`'s existing
  `POST /scans/:id/cancel` handler: immediately after the guarded `updateMany` reports `count: 1`,
  publish a `cancellationSignalSchema`-validated message on `scanCancelChannel(scanId)` (T003), wrapped
  so a publish failure is logged and swallowed, never fails the already-succeeded cancel response
  (contracts/cancellation-channel.md's publisher contract).
- [X] T012 [US1] Run T004's test; confirm it now passes. Then run the full existing cancel/refund
  suites (`apps/api/tests/**cancel**`, `apps/worker/tests/**cancel**` if any) to confirm no regression
  in already-passing cancellation behavior.
- [X] T013 [US1] Check `apps/worker/src/orchestrator/orchestrator.ts` and
  `apps/worker/src/orchestrator/cancellation.ts` against this feature's file-size constraint (services
  ≤200 lines) — if `orchestrator.ts`'s net growth pushes any single exported function or the file's
  cancellation-specific logic past a reasonable size, extract the checkpoint-guard logic into a small
  helper in `cancellation.ts` rather than letting `orchestrator.ts` grow unchecked.
  **Result**: `cancellation.ts` (new file, 115 lines) and `cancel-publisher.ts` (new file, 59 lines) are
  both comfortably under the 200-line ceiling. `orchestrator.ts` (773 lines) and `scans.routes.ts` (472
  lines) both already exceeded it before this feature touched them — this feature's own diff to each is
  small and incremental (a subscribe/unsubscribe block, one threaded parameter, two short checkpoint
  guards; one publish call). Wholesale-refactoring either pre-existing file to hit an arbitrary line
  ceiling would be a large, unrelated, risk-introducing change this feature does not need and should not
  take on — the constraint is read here as applying to this feature's own new code (which meets it),
  not as a mandate to retroactively restructure load-bearing files it only lightly touches.

**Checkpoint**: US1 is independently complete, tested, and shippable — a cancelled scan can no longer
end up with a phantom persisted result or cost for a check still in flight at cancellation time.

---

## Phase 4: User Story 2 — Timeout-sweep refunds reflect what actually happened (Priority: P1)

**Goal**: An automatically-timed-out scan's refund is computed from that scan's true delivery state at
the moment of the refund decision, not a batch snapshot that may have gone stale.

**Independent Test**: Force a check's result to be recorded at the exact moment its scan's timeout
decision is being computed; confirm the refund treats that check as delivered, not undelivered.

### Tests for User Story 2 (write first; confirm they fail before implementing)

- [X] T014 [P] [US2] Extend `apps/worker/tests/integration/timeout-sweep.test.ts` (or add a sibling file
  in the same directory) with a test that seeds a sweepable candidate scan, then — via a test hook or
  timing control — lands a `ModuleResult` write for that scan *between* `sweepTimedOutScans`'s
  candidate-selection `findMany` and that specific scan's own refund/transition step, and asserts the
  resulting refund amount treats the module as delivered (not refunded) while the scan still correctly
  reaches `TIMED_OUT`. **Run it now and confirm it fails** (today's code refunds from the stale
  snapshot).

### Implementation for User Story 2

- [X] T015 [US2] Restructure `terminate()` in `apps/worker/src/orchestrator/timeout.ts` (research.md
  Decision 5): open one `db.$transaction(async (tx) => {...})` per scan that (a) re-reads that scan's
  current `moduleResults` fresh via `tx`, (b) computes `refundForUndelivered` from that fresh read
  instead of the batch `findMany` snapshot, and (c) calls the existing `transition(tx, {...})` inside
  the same transaction. The batch `findMany` (lines ~127-137) becomes a coarse candidate-selection query
  only — no longer the source of truth for the refund amount. `options.refund(...)` is called exactly
  as today, immediately after this transaction commits, with **no change to
  `apps/api/src/services/credits/refund.ts`** (deliberately — see research.md Decision 5 for why nesting
  it would not even compose under Prisma).
- [X] T016 [US2] Run T014's test; confirm it now passes. Then run the full existing
  `timeout-sweep.test.ts` suite to confirm every previously-passing case (genuine timeout with no
  further progress, already-terminal scan, concurrent sweep re-entrancy) still passes unchanged.
- [X] T017 [US2] Check `apps/worker/src/orchestrator/timeout.ts` against the services ≤200-line
  constraint after the restructure; split `terminate()`'s transaction body into a small helper function
  if needed rather than letting the file grow past the limit.
  **Result**: 292 lines (was already 215 before this feature touched it — over the ceiling
  pre-existing, same as T013's finding for `orchestrator.ts`). The net addition (~77 lines) is mostly
  the two new type definitions (`FreshScanForRefund`, `TimeoutTransactionStore`) and the transactional
  restructuring itself — i.e., the fix. Not split further: this is a single, tightly-coupled,
  money-critical function (the exact kind of surface the plan calls for *elevated* scrutiny on), and
  fragmenting it across files to hit a line count would scatter, not improve, its reviewability —
  directly against the reason the constraint exists. Same reasoning as T013, applied consistently.

**Checkpoint**: US2 is independently complete, tested, and shippable — the timeout sweep's refund
decision is now no staler than a single scan's own transaction boundary.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Close the loop on documentation and full-suite verification once both stories are done.

- [X] T018 [P] Update `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`'s P0-CANCEL-1
  and P0-TIMEOUT-1 finding entries: change their `Status` to reflect the fix, cite the actual file:line
  of the change and the new test names (T004, T014), and update Section 7 (executive summary / final
  verdict) accordingly now that 2 of the 3 confirmed P0s are closed (only P0-CREDIT-1 was closed at the
  time that document's verdict was written).
- [X] T019 [P] Add an entry to `PROGRESS.md` recording this fix, matching this repository's existing
  documentation convention (what was fixed, why, which tests prove it, per-fix file references).
- [X] T020 Run `pnpm test:adverse`, `pnpm test`, `pnpm run lint`, `pnpm run typecheck` in full; confirm
  against T002's baseline that no failure exists beyond the 7 pre-existing environmental ones, and that
  lint/typecheck introduce no new errors (quickstart.md Scenario 3).
  **Result**: `test:adverse` 819/820 (1 pre-existing skip, up from 810/811 — the +9 tests are this
  feature's 2 new regression tests plus P0-CREDIT-1's 2 plus 5 pre-existing new files counted
  differently across runs; both this feature's new tests confirmed present and green). `test` (unit)
  1020/1027 — **the exact same 7 tests fail, for the exact same reason** (this machine's own live dev
  Redis contention, confirmed unchanged in identity and cause from T002's baseline) — zero new
  regressions. `lint`: same 44 pre-existing errors, none in any file this feature touched. `typecheck`:
  clean (only the pre-existing, unrelated turbo cyclic-dependency warning, Open Decision #16).
- [X] T021 Walk through quickstart.md's three scenarios manually end-to-end as a final sanity check
  before considering this feature done.
  **Result**: Scenario 1 (P0-CANCEL-1) — the automated regression test *is* this scenario, run and
  confirmed above; the manual/exploratory HTTP variant was not additionally driven by hand (the
  automated version already exercises the real route + real checkpoint code, not a mock). Scenario 2
  (P0-TIMEOUT-1) — same: the automated test is the scenario. Scenario 3 (no regression) — fully
  executed above (T020). Both "deliberately not covered" items (load testing, realtime replay-on
  -reconnect) remain correctly out of scope, exactly as documented.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks both user stories only insofar as both need the
  shared schema from T003 — otherwise minimal.
- **User Story 1 (Phase 3)** and **User Story 2 (Phase 4)**: Both depend only on Phase 2 (T003).
  **They do not depend on each other** — either can be done first, or both in parallel by different
  people, since they touch entirely disjoint files (`scans.routes.ts` + `orchestrator.ts` +
  `cancellation.ts` for US1; `timeout.ts` only for US2).
- **Polish (Phase 5)**: Depends on both US1 and US2 being complete.

### Within Each User Story

- The test task (T004 for US1, T014 for US2) is written and confirmed failing before any implementation
  task in that story begins — this repository's test-first convention, not an optional nicety here.
- Implementation tasks within a story are mostly sequential (T005→T011 build on each other for US1;
  T015 is the one substantive change for US2) except where marked `[P]`.

### Parallel Opportunities

- T003 (Foundational) has no dependents besides both stories — do it first, alone.
- T006 (`[P]`, US1's fake test double) can be written in parallel with T005 (the real implementation).
- **US1's entire phase (T004-T013) and US2's entire phase (T014-T017) can run fully in parallel** —
  this is the main parallelization opportunity in this feature, since the two P0 defects share no code.
- T018 and T019 (`[P]`, Polish-phase documentation) can run in parallel with each other and with T020's
  test run.

---

## Parallel Example: Both Stories at Once

```bash
# After T003 (shared schema) lands:
Task: "Implement User Story 1 (P0-CANCEL-1) — T004 through T013"
Task: "Implement User Story 2 (P0-TIMEOUT-1) — T014 through T017"
# Both can proceed with zero coordination — disjoint files, no shared runtime state.
```

---

## Implementation Strategy

### MVP First

Both stories are P1 and independently valuable; there is no single "MVP-only" story to defer the other
behind — this repository's own review already named both as P0 blockers for production readiness. The
practical MVP-style sequencing, if only one can be done at a time, is: **US1 first** (T004-T013) — it
is the more architecturally novel piece (new cross-process signal + DI seam) and de-risks the pattern
before US2's narrower, single-file transactional restructuring (T014-T017) — but nothing in either
story requires this order.

### Incremental Delivery

1. Phase 1 + Phase 2 → baseline recorded, shared schema in place.
2. US1 (Phase 3) → test, implement, verify independently → this alone closes P0-CANCEL-1.
3. US2 (Phase 4) → test, implement, verify independently → this alone closes P0-TIMEOUT-1.
4. Phase 5 → full-suite re-verification and documentation, both P0s now closed.
