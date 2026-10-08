---

description: "Task list for Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail"
---

# Tasks: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail

**Input**: Design documents from `specs/008-safety-killswitch-budget-audit/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` (all present)

**Tests**: Included, test-first, per the constitution's Development Workflow ("Tests come first for any
feature or bugfix: write the failing test, confirm it fails for the intended reason, then implement")
and per this spec's own safety-critical nature (every race/crash/redelivery scenario in `spec.md`'s Edge
Cases needs an adverse test proving it, not only a requirement describing it).

**Organization**: Tasks are grouped by this spec's three user stories (User Story 1 and User Story 2 are
tied P1; User Story 3 is P2), after a Setup phase and a Foundational phase every story depends on.

**NOT executed by this session** — `/speckit-implement` is explicitly out of scope for this planning pass
(mission constraint). This file is the dependency-ordered task list a future implementation session runs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (concurrency/budget admission atomicity), US2 (kill switch), US3 (audit trail)

## Path Conventions

Monorepo paths per `plan.md`'s Project Structure: `apps/api/src/services/safety/` (new), `apps/worker/
src/orchestrator/` (existing, extended), `packages/config/src/` (existing, extended), Prisma schema at
`apps/api/prisma/schema.prisma` (existing, additively extended per `data-model.md`).

---

## Phase 1: Setup

**Purpose**: Scaffold the new schema and service directory this spec's every story depends on.

- [ ] T001 Create the `apps/api/src/services/safety/` directory with empty `admission.ts`,
  `budget-counter.ts`, `kill-switch.ts`, `kill-switch-state.ts`, `audit.ts`, `checkpoint.ts` module stubs,
  per `plan.md`'s Project Structure.
- [ ] T002 Add the five new Prisma models (`BudgetCounter`, `AdmissionLease`, `BudgetConsumption`,
  `KillSwitchState`, `ExecutionAuditEvent`) and four new enums (`SafetyScope`, `StopLifecycleState`,
  `KillSwitchReason`, `ExecutionAuditEventType`) to `apps/api/prisma/schema.prisma`, exactly as specified in
  `data-model.md` — **zero `@relation` fields and zero edits to any existing model** (`Target`,
  `TargetAuthorization`, `ScopeDefinition`, `Scan`, `CapabilityExecution` all remain byte-for-byte
  unchanged, per `research.md` R9). Verify with `prisma validate` before proceeding.
- [ ] T003 Generate the Prisma migration for T002's additions (`prisma migrate dev` against a local/test
  database) and confirm the generated SQL touches only the five new tables/four new enum types — no
  `ALTER TABLE` against any existing table.

**Checkpoint**: Schema and service-directory skeleton exist; no story work has started.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared primitives every user story's implementation calls into. **No story work begins
until this phase is complete.**

- [ ] T004 Implement the `BudgetCounter` lazy-create-on-first-use + `SELECT ... FOR UPDATE`-guarded
  read/increment helper in `apps/api/src/services/safety/budget-counter.ts`, per
  `contracts/safety-admission-contract.md` step 3 and `data-model.md`'s validation rules (ceiling checks
  against the grant's `requestBudget`/`concurrencyBudget`, read via F01's `TargetAuthorization` row).
- [ ] T005 [P] Implement the `KillSwitchState` multi-scope-key fast-read helper (the "check six scope keys
  in one indexed query" shape from `data-model.md`'s "Fast-read checkpoint query" note) in
  `apps/api/src/services/safety/kill-switch-state.ts`.
- [ ] T006 [P] Implement the `ExecutionAuditEvent` writer in `apps/api/src/services/safety/audit.ts`
  (`recordExecutionAuditEvent`, per `contracts/execution-audit-contract.md`), including the mandatory
  `@webaudit/redaction` pass-through on `payload` and the fixed `{"_redactionFailed": true}` sentinel
  behavior on a redaction-mechanism failure (contract boundary rule 2).
- [ ] T007 [P] Implement the scope-keyed Redis channel-naming helper in `packages/config/src/
  safety-channels.ts`, generalizing `packages/config/src/cancellation.ts`'s existing single-channel-per-
  scan pattern to the six channel prefixes `research.md` R4 defines
  (`safety:stop:execution:<id>`/`scan:<id>`/`grant:<id>`/`target:<id>`/`tenant:<id>`/`platform`).
- [ ] T008 Extend F01's future `isAuthorized` implementation (`apps/api/src/services/authorization/
  check.ts`, not yet built — add this call site as part of that implementation, not as a retroactive edit
  to an existing file) to read `BudgetCounter` via T004's helper (a plain, non-locked, advisory read, per
  `spec.md` FR-005a) when computing its own `BUDGET_EXHAUSTED` refusal reason for `requestBudget`/
  `concurrencyBudget` (durationBudget/`expiresAt` remains F01's own, independent check).

**Checkpoint**: Every shared primitive (budget counter, kill-switch state read, audit writer, channel
naming, F01 integration point) exists and is independently unit-testable. User story implementation can
now begin.

---

## Phase 3: User Story 1 - Two Workers Cannot Both Consume the Last Unit of a Scarce Budget (Priority: P1) 🎯 MVP

**Goal**: Deliver the atomic Safety Admission operation — the race F01's own FR-024 explicitly leaves open
and assigns to this spec.

**Independent Test**: Configure a grant with `concurrencyBudget: 1`; issue two concurrent admission
requests; confirm exactly one succeeds. Per `quickstart.md` Part B1.

### Tests for User Story 1

> Write these tests first; confirm they fail (no admission implementation exists yet) before implementing.

- [ ] T009 [P] [US1] Adverse test: two concurrent `requestAdmission` calls against a grant with
  `concurrencyBudget: 1` yield exactly one `GRANTED` and one `BUDGET_EXHAUSTED_CONCURRENCY`, never both/
  neither — in `apps/api/tests/adverse/safety-admission-concurrency-race.test.ts`, modeled on the existing
  `apps/api/tests/adverse/credits-debit-refund-race.test.ts` harness shape.
- [ ] T010 [P] [US1] Adverse test: two concurrent `requestAdmission` calls consuming the last remaining
  `requestBudget` unit yield exactly one success and one `BUDGET_EXHAUSTED_REQUEST` — in `apps/api/tests/
  adverse/safety-admission-request-race.test.ts`.
- [ ] T011 [P] [US1] Contract test: a duplicate `requestAdmission` call with the same
  `(targetAuthorizationId, idempotencyKey)` returns the identical prior outcome without consuming a second
  unit — in `apps/api/tests/contract/safety-admission-idempotency.test.ts`.
- [ ] T012 [P] [US1] Contract test: an internal error (simulated database failure) at any step of the
  admission sequence surfaces as `REFUSED`/`INTERNAL_ERROR` with no partial effect (no row inserted, no
  counter incremented) — in `apps/api/tests/contract/safety-admission-fail-closed.test.ts`, per `spec.md`
  FR-005's rollback guarantee.

### Implementation for User Story 1

- [ ] T013 [US1] Implement `requestAdmission`'s full 5-step sequence (`contracts/
  safety-admission-contract.md`) in `apps/api/src/services/safety/admission.ts`, composing T004's
  `BudgetCounter` helper, T005's `KillSwitchState` check (step 1), and a fresh call to F01's `isAuthorized`
  (step 2) inside one `$transaction` (depends on T004, T005, T008).
- [ ] T014 [US1] Implement `AdmissionLease` creation (30-second expiry per `spec.md` FR-004, with a fresh
  `holderToken` per FR-006a), idempotent `releaseLease`/consumption-completion (FR-007), and the
  token-guarded renewal operation (`UPDATE ... WHERE holderToken = $presented AND releasedAt IS NULL AND
  reclaimedAt IS NULL`) in `apps/api/src/services/safety/admission.ts` — the caller-side contract for a
  failed renewal (treat it as an immediate stop, per FR-006a) is T024's responsibility, not this task's.
- [ ] T014a [P] [US1] Adverse test: acquire a lease, let it expire and be reclaimed by the sweep, then
  attempt to renew the *original* `holderToken` — confirm the renewal affects zero rows (fails) rather
  than silently succeeding or resurrecting the lease — in `apps/api/tests/adverse/
  safety-admission-lease-fencing.test.ts`, per `spec.md` FR-006a (found during this spec's own independent
  adversarial review, scenario 17).
- [ ] T015 [US1] Implement the `AdmissionLease` expiry-and-reconciliation sweep as a new maintenance-queue
  job in `apps/worker/src/orchestrator/safety-lease-sweep.ts`, on the 60-second cadence `research.md` R3
  specifies, reusing the `upsertJobScheduler`/`timeout-scheduler.ts` registration pattern; corrects
  `BudgetCounter.activeConcurrency` drift for any lease it reclaims.

**Checkpoint**: Safety Admission is fully functional and independently testable — a future engine spec can
already call `requestAdmission` safely, even before any kill-switch or audit-trail work exists.

---

## Phase 4: User Story 2 - A Running Execution Actually Stops When Its Authorization Is Revoked (Priority: P1)

**Goal**: Deliver the kill-switch mechanism F01's own FR-014 closure-pass boundary names as this spec's
responsibility.

**Independent Test**: Grant an authorization, start a simulated long-running execution polling every
second, revoke the grant, confirm the execution observes and acknowledges the stop within 5 seconds and
a redelivered copy of the same job is refused immediately. Per `quickstart.md` Part B2.

### Tests for User Story 2

- [ ] T016 [P] [US2] Adverse test: revoking a grant mid-execution causes the simulated execution's next
  checkpoint (within 5 seconds) to return `STOP`, with `KillSwitchState` reaching `ACKNOWLEDGED` in the
  same window — in `apps/worker/tests/adverse/kill-switch-revocation.test.ts`.
- [ ] T017 [P] [US2] Adverse test: redelivering the underlying job for an execution already in `STOPPED`
  state is refused at the `KillSwitchState` check, before any admission/budget logic runs — in
  `apps/worker/tests/adverse/kill-switch-no-resurrection.test.ts`, covering every vector `spec.md` FR-015
  enumerates (retry, stalled-job redelivery, duplicate dispatch, stale worker past lease expiry, new
  worker same identity).
- [ ] T018 [P] [US2] Contract test: two `triggerStop` calls for the same `(scope, scopeId)` produce exactly
  one `KillSwitchState` row and exactly one `STOP_REQUESTED` audit event, never two — in `apps/api/tests/
  contract/kill-switch-idempotency.test.ts`.
- [ ] T019 [P] [US2] Adverse test: an operator triggers a `TARGET`-scoped stop against a target with
  multiple running executions under different grants; confirm every execution under that target observes
  the stop, and confirm an ordinary (non-operator) user attempting the same `TARGET`-scoped call is
  refused — in `apps/api/tests/adverse/kill-switch-operator-scope.test.ts`, per `spec.md` FR-010/FR-011's
  Clarifications-resolved multi-scope operator authority.
- [ ] T019a [P] [US2] Adverse test: reclassifying a Target's `TargetEnvironment` from staging to
  production mid-execution (under a grant whose `environmentRestriction` no longer permits the new
  classification) causes the execution's next checkpoint to return `STOP`, and confirm a later
  reclassification back to staging does **not** cancel the already-`REQUESTED` stop — in
  `apps/worker/tests/adverse/kill-switch-environment-reclassification.test.ts`, per `spec.md` FR-016
  (found uncovered during this spec's own `/speckit-analyze` pass, finding C1).
- [ ] T019b [P] [US2] Adverse test: simulate an execution unit that never calls `acknowledgeStop` within
  5 seconds of a `triggerStop` call; confirm escalation fires (the composed `AbortSignal` aborts, a
  sandboxed child receives `SIGKILL` via the generalized sandbox-runner path), `KillSwitchState.escalatedAt`
  is set, and a distinct `ESCALATED` audit event is written separate from `STOP_REQUESTED` — in
  `apps/worker/tests/adverse/kill-switch-escalation.test.ts`, per `spec.md` FR-014 and User Story 2
  Scenario 2 (found with implementation but no dedicated test during this spec's own `/speckit-analyze`
  pass, finding C3).
- [ ] T019c [P] Adverse test: simulate a platform restart (process exit/restart of the component holding
  in-memory state) while a `KillSwitchState` row is `REQUESTED` and an `AdmissionLease` is held; confirm
  both are still enforced correctly afterward — the stop is not forgotten and the lease is still subject
  to FR-006's bounded reclamation, never silently treated as still valid indefinitely — in
  `apps/worker/tests/adverse/safety-state-restart-recovery.test.ts`, per `spec.md` FR-017 (found uncovered
  during this spec's own `/speckit-analyze` pass, finding C2; this task has no `[Story]` label since it
  validates a cross-cutting property of both US1's leases and US2's kill-switch state together, not one
  story alone).

### Implementation for User Story 2

- [ ] T020 [US2] Implement `triggerStop` with its actor/scope authority preconditions
  (`contracts/kill-switch-contract.md`) in `apps/api/src/services/safety/kill-switch.ts` (depends on T005,
  T006, T007).
- [ ] T021 [US2] Implement `acknowledgeStop`/`recordStopped` and the 5-second escalation trigger
  (generalizing `apps/sandbox-runner`'s unconditional-`SIGKILL`-on-every-outcome-path pattern per
  `research.md` R7) in `apps/worker/src/orchestrator/kill-switch.ts`, alongside the existing
  `apps/worker/src/orchestrator/cancellation.ts` (do not modify that file's existing scan-cancellation
  behavior — this is new, additive wiring per `spec.md` FR-026).
- [ ] T022 [US2] Wire F01's future `revokeAuthorization` implementation
  (`apps/api/src/services/authorization/revoke.ts`, not yet built) to call T020's `triggerStop`
  (`scope: GRANT`, `reason: AUTHORIZATION_REVOKED`) as part of the same operation that sets `revokedAt`,
  per `spec.md` FR-012's named integration point.
- [ ] T023 [US2] Compose the kill-switch `AbortSignal` into the existing per-call `AbortSignal.any([...])`
  sites (`packages/ai-executor/src/executor.ts`, `packages/safe-net/src/safe-fetch.ts`) per `research.md`
  R6, so an outbound AI/network call made during a safety-sensitive action is actually interrupted on
  abort, not only skipped at the next discrete step.
- [ ] T024 [US2] Implement `safetyCheckpoint` (`contracts/safety-checkpoint-contract.md`), composing T013's
  `requestAdmission`, T020's kill-switch-pending check, and T014's lease-renewal call — treating a failed
  renewal (stale `holderToken`, per FR-006a) identically to a `KILL_SWITCH_PENDING` refusal, aborting the
  composed `AbortSignal` — in `apps/api/src/services/safety/checkpoint.ts` (depends on T013, T014, T020).

**Checkpoint**: Both P1 stories are complete and independently functional — admission and the kill switch
both work, each testable on its own.

---

## Phase 5: User Story 3 - A Reviewer Can Reconstruct Exactly What an Execution Did (Priority: P2)

**Goal**: Deliver the complete, redacted `ExecutionAuditEvent` trail.

**Independent Test**: Run a simulated execution through an admission refusal, a granted execution with a
simulated secret-bearing payload, and a kill-switch stop; query the audit trail and confirm all three are
present, distinguishable, and redacted. Per `quickstart.md` Part B3.

### Tests for User Story 3

- [ ] T025 [P] [US3] Contract test: an admission refusal (no `executionId` yet) still produces an
  `ExecutionAuditEvent` with `eventType: ADMISSION_REFUSED` — in `apps/api/tests/contract/
  execution-audit-refusal.test.ts`, per `spec.md` FR-023.
- [ ] T026 [P] [US3] Contract test: a `payload` containing a fake session-cookie value is never stored in
  raw form — in `apps/api/tests/contract/execution-audit-redaction.test.ts`, per `spec.md` FR-024.
- [ ] T027 [P] [US3] Integration test: querying `ExecutionAuditEvent` for one grant's full lifecycle
  (admission → stop) returns events whose `USER_CANCELLATION`/`AUTHORIZATION_REVOKED`/
  `OPERATOR_EMERGENCY_STOP` reasons are mutually distinguishable — in `apps/api/tests/integration/
  execution-audit-reconstruction.test.ts`, per User Story 3 Scenario 3.

### Implementation for User Story 3

- [ ] T028 [US3] Wire `recordExecutionAuditEvent` (T006) into every transition T013/T014/T020/T021 produce,
  so every `ExecutionAuditEventType` value (`data-model.md`) is actually emitted by at least one real call
  site — no enum value left dead.
- [ ] T029 [US3] Implement the tenant-scoped reconstruction query helper in `apps/api/src/services/
  safety/audit.ts` (re-deriving ownership through `targetAuthorizationId`'s owning grant's `userId`, per
  `contracts/execution-audit-contract.md` boundary rule 3 — never a bare cross-tenant query path).

**Checkpoint**: All three user stories are independently functional. This spec's full scope is delivered.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Run `quickstart.md` Part A (the parent architecture's 8-step child-spec validation) and
  Part B (this spec's own 3 scenario validations) against the finished implementation.
- [ ] T031 [P] Add a "Safety / kill switch / budget enforcement" row to `docs/agent-domain-rules.md`'s
  "Backend and security work" section, per `AGENTS.md`'s own maintenance rule ("Update the map when...
  domains... change").
- [ ] T032 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:adverse`; confirm zero regressions
  in any file outside `apps/api/src/services/safety/`, `apps/worker/src/orchestrator/{kill-switch,
  safety-lease-sweep}.ts`, `packages/config/src/safety-channels.ts`, and the new Prisma models (SC-005's
  additive-only bar).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story.
- **User Story 1 (Phase 3)**: Depends only on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational; T024 (`safetyCheckpoint`) additionally depends on
  US1's T013, since the checkpoint contract composes admission and kill-switch checks — this is the one
  genuine cross-story dependency, declared explicitly rather than left implicit.
- **User Story 3 (Phase 5)**: Depends on Foundational; T028 depends on US1's T013/T014 and US2's T020/T021
  existing as real call sites to wire into (an audit trail with nothing to audit has nothing to test).
- **Polish (Phase 6)**: Depends on all three stories being complete.

### Parallel Opportunities

- T004-T007 (Foundational) are independent files and may run in parallel; T008 depends on T004.
- T009-T012 (US1 tests) may run in parallel with each other (different files).
- T016-T019 (US2 tests) may run in parallel with each other.
- T025-T027 (US3 tests) may run in parallel with each other.
- US1 (Phase 3) and US2 (Phase 4) may be staffed in parallel once Phase 2 completes, up to T024's single
  cross-story dependency.

## Implementation Strategy

### MVP First (User Story 1 Only)

Complete Phase 1 → Phase 2 → Phase 3. This delivers a safe, atomic, idempotent admission primitive any
future engine spec could already build against — even before the kill switch or audit trail exist — though
Constitution Principle XIV's own gate means no engine may actually dispatch real traffic against it until
Phases 4-5 (kill switch, audit trail) are also complete, since `requestAdmission` alone has no stop
mechanism and no audit record of what it granted.

### Incremental Delivery

Phase 1-2 (foundation) → Phase 3 (US1: admission works, independently testable) → Phase 4 (US2: kill
switch works, independently testable) → Phase 5 (US3: audit trail works, independently testable) →
Phase 6 (polish, full quickstart validation). Each phase is independently demonstrable per its own
`spec.md` Independent Test, matching this spec's own User Story structure exactly.
