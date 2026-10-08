---
description: "Task list for Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope"
---

# Tasks: Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope

**Input**: Design documents from `specs/007-foundation-target-authorization-scope/`

**Prerequisites**: plan.md (done), spec.md with Clarifications (done), research.md (done),
data-model.md (done), contracts/ (done), quickstart.md (done), checklists/requirements.md (24/24)
and checklists/authorization-safety.md (45/45) (done)

**Tests**: included — per `.specify/memory/constitution.md`'s Development Workflow section
("Tests come first for any feature or bugfix") and `AGENTS.md`'s verification rules, every
implementation task below is preceded by the test task(s) that must fail first, mirroring the
existing `apps/api/tests/adverse/control-gate.test.ts` pattern this spec's own services directly
parallel.

**Organization**: tasks are grouped by this spec's three user stories (`spec.md`), plus Setup and
Foundational phases for the shared schema, plus a Polish phase.

**Explicitly out of scope for every task below** (per this spec's own non-goals, SC-004, and
Constitution Principle XIV's gate): no task is executed in this planning session. These are
tasks for whichever future session runs `/speckit-implement` against this spec, once that is
explicitly approved. No task here deploys a service, implements F02/F04/F05/F07's own
responsibilities, or writes any engine's (Active Security, Authenticated Workflow, etc.) execution
logic.

## Phase 1: Setup (Schema Foundation)

**Purpose**: add this spec's new enums to the schema before any model that references them.

- [ ] T001 Add `ExecutionClass`, `TargetEnvironmentClassification`, and `ScopeTargetKind` enums to
  `apps/api/prisma/schema.prisma`, exactly as specified in `data-model.md`'s "ExecutionClass (new
  enum)" through "ScopeDefinition (new model)" sections' enum blocks — enums only in this task, no
  models yet. (No `TargetAuthorizationState` enum exists in this spec's final design — every state
  is derived live from `grantedAt`/`revokedAt`/`expiresAt`, per `data-model.md`'s "Derived state"
  section; a `/speckit-analyze` pass against an earlier draft found and removed that dead enum.)
- [ ] T002 Run `pnpm --filter @webaudit/api exec prisma validate` to confirm the schema still
  parses after T001, before adding any model that references these enums. (The feasibility of the
  full schema, including the two `Target` back-relation fields T003/T005 require, was already
  proven against an isolated, untracked schema copy during this spec's closure pass — see
  `data-model.md`'s Prisma feasibility note — so this task should encounter no surprise; it exists
  to re-confirm against the real schema file, which may have drifted since this spec was planned.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the three new models must all exist, migrated, before any service code in Phase 3+
can be written against them.

**⚠️ CRITICAL**: No User Story phase may begin until this phase's migration is generated and
applied to the test database.

- [ ] T003 Add the `TargetEnvironment` model to `apps/api/prisma/schema.prisma` per
  `data-model.md`'s "TargetEnvironment (new model)" section, including its `@@unique([targetId])`
  constraint and the `target` relation back to the existing `Target` model. **Also add the
  `targetEnvironment TargetEnvironment?` structural back-relation field to the existing `Target`
  model** (next to its existing `verifications`/`scans` relation fields) — this single field,
  proven necessary by `prisma validate` during this spec's closure pass (see `data-model.md`'s
  Prisma feasibility note), is the one addition to `Target` this spec makes; it carries no
  business logic, default, or semantic meaning. Do not add any *other* field to `Target`.
- [ ] T004 [P] Add the `ScopeDefinition` model to `apps/api/prisma/schema.prisma` per
  `data-model.md`'s "ScopeDefinition (new model)" section, including every `WEB`/`REPOSITORY`/
  authenticated-workflow-layer field listed there.
- [ ] T005 Add the `TargetAuthorization` model to `apps/api/prisma/schema.prisma` per
  `data-model.md`'s "TargetAuthorization (new model)" section (depends on T001's enums and T004's
  `ScopeDefinition` for its `scope` relation), including both `@@index` declarations. **Also add
  the `targetAuthorizations TargetAuthorization[]` structural back-relation field to the existing
  `Target` model**, for the same Prisma-required, business-meaning-free reason as T003's
  `targetEnvironment` field.
- [ ] T005a Run `pnpm --filter @webaudit/api exec prisma validate` again after T003-T005 and
  confirm it reports the schema valid with zero errors — this is the final confirmation that the
  real schema (not the closure pass's isolated scratch copy) is actually feasible, closing the
  loop on T002's earlier, enum-only check.
- [ ] T006 Generate the Prisma migration (`pnpm --filter @webaudit/api exec prisma migrate dev
  --name add_target_authorization_scope`) and review the generated SQL by hand for the exact
  constraints `data-model.md` specifies (NOT NULL on non-optional fields, the unique index on
  `TargetEnvironment.targetId`, the composite index on `TargetAuthorization(targetId, userId)`,
  and the two new nullable/array relation columns being relation-only with no unexpected scalar
  column generated for `Target`) — per the constitution's "Schema changes ship as reviewed,
  reversible migrations" rule.
- [ ] T007 [P] Create the `apps/api/src/services/authorization/` directory with an empty
  `index.ts` barrel file, parallel in structure to the existing
  `apps/api/src/services/control-gate/index.ts` barrel.

**Checkpoint**: schema migrated; `apps/api/src/services/authorization/` exists as an empty shell.
User Story work can now begin.

---

## Phase 3: User Story 1 - A target owner grants scoped permission for a new testing capability (Priority: P1) 🎯 MVP

**Goal**: a user can create a `TargetAuthorization` grant, and a (test-simulated) consumer can
correctly evaluate `isAuthorized`/`isInScope` against it.

**Independent Test**: grant a `TargetAuthorization` for one execution class with a non-trivial
`ScopeDefinition`, and confirm a scope-evaluation call admits an in-scope request and refuses an
out-of-scope one — entirely independent of any engine existing yet (per `spec.md`'s own Independent
Test for this story).

### Tests for User Story 1 ⚠️

> Write these first; confirm each fails for the intended reason before implementing.

- [ ] T008 [P] [US1] Unit tests for the scope-matching contract in
  `apps/api/tests/unit/scope-match.test.ts`, covering every rule in
  `contracts/scope-matching-contract.md`, including at minimum this exact wildcard matrix (closure-
  pass addition, closing Blocker B's contradiction with concrete cases rather than prose alone):
  `*.example.com` -> `a.example.com` = **true**; `*.example.com` -> `a.b.example.com` = **false**;
  `*.example.com` -> `example.com` = **false** (the wildcard alone does not cover the bare domain);
  exact `example.com` -> `example.com` = **true**; and exclusion precedence when an inclusion
  wildcard and an exclusion exact-host both could apply (e.g. `includedHosts: ["*.example.com"]`,
  `excludedHosts: ["checkout.example.com"]` -> `checkout.example.com` = **false**,
  `api.example.com` = **true**) — plus path-prefix boundary matching, scheme/port defaulting,
  query-string exclusion, and trailing-dot/punycode normalization.
- [ ] T009 [P] [US1] Unit tests for the authorization-check contract's six `AuthzResult` variants
  (`AUTHORIZED`, and all five `REFUSED` reasons) in `apps/api/tests/unit/authorization-check.test.ts`,
  covering `NO_MATCHING_GRANT` and `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED` at minimum (the other
  four reasons are exercised more fully by User Story 2's tests).
- [ ] T010 [P] [US1] Adverse test: `createAuthorization` refuses when the Target's live-reconfirmed
  control level is `NONE` (FR-004), in `apps/api/tests/adverse/authorization.test.ts` — new file,
  parallel to `control-gate.test.ts`.
- [ ] T011 [P] [US1] Adverse test: `createAuthorization` refuses a grant whose
  `environmentRestriction` includes `PRODUCTION` alongside any of `ACTIVE_SECURITY`/
  `AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY` (FR-015a), **and separately confirms a `SOURCE_EXECUTION`
  grant with `PRODUCTION` in `environmentRestriction` is accepted** (FR-015a's closure-pass
  exemption for this one class — asserting the exemption explicitly, not only the prohibition, so
  a future maintainer cannot "fix" the exemption away as an apparent bug), in the same file as
  T010.
- [ ] T012 [P] [US1] Adverse test: `createAuthorization` refuses a budget exceeding FR-011's
  platform-wide maximums (1,000,000 / 1,000 / 2,592,000s), in the same file as T010.
- [ ] T011a [P] [US1] Adverse test: `createAuthorization` refuses a Scope whose `includedHosts`
  names a host outside the owning Target's own domain tree (e.g. a grant on verified Target
  `mysite.com` scoped to `google.com` or to the wildcard `*.com`), and separately refuses a
  `REPOSITORY`-kind Scope whose `repositoryFullName` differs from the Target's own canonical value
  — the single highest-severity test in this suite, covering the critical gap found during this
  spec's independent adversarial review (`data-model.md`'s validation rules, point added after
  "scopeId MUST reference..."). **Must additionally include the dot-boundary bypass attempts found
  during the closure-pass adversarial review**: for a Target with `canonicalValue: "example.com"`,
  a Scope naming `attackerexample.com` MUST be refused (bare-suffix-without-dot bypass), and a
  Scope naming `example.com.attacker.net` MUST be refused (reversed-contains bypass) — both are
  distinct from, and must be tested separately from, the unrelated-host case (`google.com`) because
  they specifically probe the "subdomain of" boundary definition's dot-anchoring, not merely
  "is this a different domain." **Must additionally confirm a case/encoding variant does not
  evade the check either direction** (closure-pass follow-on finding): for a Target with
  `canonicalValue: "example.com"`, a Scope naming `EXAMPLE.COM` or `Staging.Example.Com` MUST be
  **accepted** as bounded (case-insensitive match, not a false-negative rejection), while this
  does not create any new acceptance path for an unrelated domain typed in a different case. In
  the same file as T010.
- [ ] T012a [P] [US1] Unit test: a single grant whose `executionClasses` lists both
  `AUTHENTICATED_WORKFLOW` and `ACTIVE_SECURITY` (FR-006's composite-authorization case) is
  independently evaluated correctly by `isAuthorized` for each listed class against the same
  Scope/budgets — added per this spec's own `/speckit-analyze` finding E2 that no task previously
  exercised a multi-class grant. In `apps/api/tests/unit/authorization-check.test.ts` (same file
  as T009).
- [ ] T012b [P] [US1] Unit test confirming `apps/api/src/services/authorization/index.ts` exposes
  no update/mutate operation for `ScopeDefinition` content at all (FR-009's immutability is
  structurally enforced by this contract never defining such an operation, not by a runtime
  rejection check — `narrowAuthorization`, per `contracts/grant-lifecycle-contract.md`, creates a
  new `ScopeDefinition` rather than editing one) — a barrel-export-surface assertion, not a
  behavioral test. Added per this spec's own `/speckit-analyze` finding E1, which found no task
  previously made this invariant explicit. In
  `apps/api/tests/contract/authorization-contracts.test.ts` (same file as T027).

- [ ] T012c [P] [US1] Adverse test: `classifyEnvironment` refuses when called by a user who does
  not own the Target (same `NotFoundError`-shape non-disclosure as `createAuthorization`), and
  succeeds (writing `environment.classified` then, on a second call with a different value,
  `environment.reclassified`) when called by the owner — added per FR-001/FR-017a/FR-018a
  (closure-pass additions, no task previously covered the `TargetEnvironment` write path at all).
  In the same file as T010.

### Implementation for User Story 1

- [ ] T012d [US1] Implement `classifyEnvironment` from `contracts/grant-lifecycle-contract.md` in
  `apps/api/src/services/authorization/classify-environment.ts`, including the owner-only
  precondition (FR-017a, no operator variant) and the `environment.classified`/
  `environment.reclassified` `AuditLogEntry` write (FR-018a) (depends on T003's schema; makes
  T012c pass).
- [ ] T013 [P] [US1] Implement the normalization + matching functions from
  `contracts/scope-matching-contract.md` (`isInScope`, host/path/scheme/port/repo-ref matching, all
  normalization rules including trailing-dot/punycode-fold and query-string discard) in
  `apps/api/src/services/authorization/scope-match.ts` (makes T008 pass).
- [ ] T014 [US1] Implement the authorization-check contract's `isAuthorized` function from
  `contracts/authorization-check-contract.md` in `apps/api/src/services/authorization/check.ts`,
  calling T013's `isInScope` and reading `TargetEnvironment` live (depends on T013; makes T009
  pass for the two variants it currently tests).
- [ ] T015 [US1] Implement `createAuthorization` from `contracts/grant-lifecycle-contract.md` in
  `apps/api/src/services/authorization/create.ts`, including every precondition in that contract's
  stated order (Target ownership, live control-level reconfirmation via the existing
  `reconfirmControl`, execution-class/environment-restriction validation including FR-015a's
  production restriction, budget-ceiling validation per FR-011, scope/target-kind match, and the
  scope-to-Target host/repository-boundedness check added per the adversarial review) and the
  `authorization.granted` `AuditLogEntry` write (depends on T003-T006's schema, T013; makes
  T010-T012, T011a pass).
- [ ] T016 [US1] Export `createAuthorization`, `classifyEnvironment`, `isAuthorized`, `isInScope`
  from `apps/api/src/services/authorization/index.ts` (the barrel created in T007).

**Checkpoint**: a grant can be created and correctly evaluated. User Story 1 is independently
testable and deliverable as the MVP slice of this spec.

---

## Phase 4: User Story 2 - A grant is revoked while work is in flight, and the revocation actually matters (Priority: P1)

**Goal**: revoking a grant makes every subsequent `isAuthorized` call for it refuse immediately,
and budget exhaustion is a distinguishable fourth refusal reason.

**Independent Test**: grant an Authorization, confirm `isAuthorized` returns `AUTHORIZED`, revoke
it, and confirm an immediately-following `isAuthorized` call for the identical inputs now returns
`REFUSED`/`REVOKED` (per `spec.md`'s own Independent Test for this story).

### Tests for User Story 2 ⚠️

- [ ] T017 [P] [US2] Adverse test: `isAuthorized` returns `AUTHORIZED` before revocation and
  `REFUSED`/`REVOKED` for the identical call immediately after revocation, in
  `apps/api/tests/adverse/authorization.test.ts` (same file as T010-T012, appended).
- [ ] T018 [P] [US2] Adverse test: `isAuthorized` returns `REFUSED`/`EXPIRED` once `now >=
  expiresAt`, distinguishable from `REVOKED`, in the same file.
- [ ] T019 [P] [US2] Adverse test: `isAuthorized` returns `REFUSED`/`BUDGET_EXHAUSTED` once a
  grant's tracked consumption meets its `requestBudget`/`concurrencyBudget`, distinguishable from
  `REVOKED`/`EXPIRED`, in the same file (this task may stub budget-consumption tracking, since
  authoritative runtime metering/enforcement is F07's responsibility per FR-015 — the test only
  needs to prove the derive-state function correctly classifies a pre-set "exhausted" input; F04
  is the dispatch context that calls this check, not the owner of the metering itself).
- [ ] T019a [P] [US2] Unit test confirming `isAuthorized` is side-effect-free — calling it twice in
  a row with identical inputs and no intervening state change returns identical results, and
  neither call mutates any `TargetAuthorization` row (e.g. no `requestBudget` consumption counter
  changes as a side effect of the check itself) — added per FR-024's closure-pass "decision, not
  reservation" requirement. In `apps/api/tests/unit/authorization-check.test.ts` (same file as
  T009).
- [ ] T020 [P] [US2] Adverse test: `revokeAuthorization` called by a user who is neither the
  grant's owner nor an operator returns the same `NotFoundError` shape as a nonexistent grant id
  (FR-016/FR-017/FR-019's non-disclosure rule), in the same file.
- [ ] T021 [P] [US2] Adverse test: `revokeAuthorization` called by an operator (`isOperator: true`)
  on another user's grant succeeds and writes `authorization.revoked_by_operator` (not
  `authorization.revoked`), in the same file.
- [ ] T021a [P] [US2] Unit test asserting the actual `AuditLogEntry` row shape (`action`,
  `subjectType`, `subjectId`, `before`/`after`) for each of `authorization.granted`,
  `authorization.revoked`, `authorization.revoked_by_operator` (`subjectType:
  'TargetAuthorization'`), and `environment.classified`/`environment.reclassified`
  (`subjectType: 'TargetEnvironment'`, closure-pass addition per FR-018a), per `data-model.md`'s
  audit table — added per this spec's own `/speckit-analyze` finding E3, which found FR-018
  covered only as an implicit side effect of T015/T024's other assertions, not directly. In
  `apps/api/tests/unit/authorization-audit.test.ts`.

### Implementation for User Story 2

- [ ] T022 [US2] Implement the derived-state function (`GRANTED`/`ACTIVE`/`REVOKED`/`EXPIRED`/
  `BUDGET_EXHAUSTED`) from `data-model.md`'s "Derived state (FR-012)" pseudocode in
  `apps/api/src/services/authorization/derive-state.ts`, reading `grantedAt`/`revokedAt`/
  `expiresAt`/budget-consumption fresh on every call, never from a cached verdict (depends on
  T005's schema; makes T017-T019 pass once wired into T014's `isAuthorized`).
- [ ] T023 [US2] Wire `derive-state.ts` into `check.ts`'s `isAuthorized` (replacing any
  placeholder state logic from T014) so every call re-derives state fresh, per FR-014's live-
  recheck requirement (depends on T014, T022).
- [ ] T024 [US2] Implement `revokeAuthorization` from `contracts/grant-lifecycle-contract.md` in
  `apps/api/src/services/authorization/revoke.ts`, including the owner-or-operator authority check
  (FR-016/FR-017), the idempotent-no-op-on-already-terminal rule, and the `authorization.revoked`/
  `authorization.revoked_by_operator` `AuditLogEntry` write (depends on T015's `create.ts` for the
  shared lookup pattern; makes T020-T021 pass).
- [ ] T025 [US2] Export `revokeAuthorization` from the barrel (`index.ts`).

**Checkpoint**: revocation, expiration, and budget exhaustion are all live, independently
verifiable refusal reasons. User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - A future child spec author determines whether their execution class needs scope, environment restriction, or both (Priority: P2)

**Goal**: the grant-lifecycle contract's `narrowAuthorization` operation exists and is documented
clearly enough that F02/F05/F07 can consume this spec's package without a follow-up question (per
`spec.md`'s own Independent Test for this story).

**Independent Test**: hand this spec's `contracts/` and `data-model.md` to a reader with no other
context and confirm they can correctly answer, for a hypothetical tenth execution class, whether it
needs Scope, whether it needs an Environment restriction, and how composite (multi-class)
authorization is represented (per `spec.md`).

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Adverse test: `narrowAuthorization` revokes the original grant and creates a
  new one with a smaller Scope, never mutating the original `ScopeDefinition`/`TargetAuthorization`
  row in place (FR-009), in `apps/api/tests/adverse/authorization.test.ts` (same file, appended).
- [ ] T027 [P] [US3] Contract test: every function `contracts/*.md` documents
  (`createAuthorization`, `classifyEnvironment`, `revokeAuthorization`, `narrowAuthorization`,
  `isAuthorized`, `isInScope`) is actually exported from
  `apps/api/src/services/authorization/index.ts` with a matching signature shape, in
  `apps/api/tests/contract/authorization-contracts.test.ts` — a lightweight type-level/
  export-presence check, not a behavioral test (those are covered above).

### Implementation for User Story 3

- [ ] T028 [US3] Implement `narrowAuthorization` from `contracts/grant-lifecycle-contract.md` in
  `apps/api/src/services/authorization/narrow.ts`, as `revokeAuthorization` (self-only, never
  operator) followed by `createAuthorization` with the original grant's `executionClasses`/
  `environmentRestriction` and the caller's narrowed scope/budgets, writing the
  `authorization.replaced` `AuditLogEntry` on the original (depends on T015, T024; makes T026 pass).
- [ ] T029 [US3] Export `narrowAuthorization` from the barrel (`index.ts`); add a module-level
  doc-comment to `index.ts` summarizing each export's one-line purpose, matching this spec's own
  `contracts/` summaries (makes T027 pass).

**Checkpoint**: all three user stories are independently functional. This spec's own package is
ready for F02/F05/F07 to consume per their roadmap dependency.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: confirm the finished implementation matches this spec's own validation guide and
leaves no loose end for the next child spec.

- [ ] T030 [P] Run `quickstart.md`'s Part A eight-step self-check against the finished
  implementation (not just the planning package) and record the result.
- [ ] T031 [P] Run `pnpm --filter @webaudit/api typecheck` and `pnpm --filter @webaudit/api lint`
  against the new `apps/api/src/services/authorization/` directory.
- [ ] T032 Run the full adverse suite (`pnpm test:adverse`) to confirm no existing control-gate or
  scan-creation adverse test regressed (per FR-021's zero-change guarantee).
- [ ] T033 Update `PROJECT_MAP.md`'s "Targets, control proof" row to add
  `apps/api/src/services/authorization/` and this spec's path, per `AGENTS.md`'s "update the map
  when paths... change" rule.
- [ ] T034 [P] Re-run `quickstart.md`'s Part B against F02/F05/F07's own future plans once any of
  them exists, confirming they cite this spec's actual contracts/entities (not a placeholder) — a
  follow-up check for whichever future session plans those specs, noted here for traceability.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, can start immediately.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS every User Story phase.
- **User Story 1 (Phase 3)**: depends only on Foundational. This is the MVP slice.
- **User Story 2 (Phase 4)**: depends on Foundational and on User Story 1's `check.ts`/`create.ts`
  existing (it extends `isAuthorized` with live-state derivation and adds `revoke.ts`) — not
  independent of US1's code, though it is independently *testable* once US1 is merged.
- **User Story 3 (Phase 5)**: depends on User Story 2's `revoke.ts` (narrowing is revoke-then-
  create).
- **Polish (Phase 6)**: depends on Phases 3-5 all being complete.

### Parallel Opportunities

- T004 (Foundational) in parallel with T003 once T001 is done.
- T007 (Foundational) in parallel with T003-T006.
- T008-T012 (US1 tests) in parallel with each other.
- T013 (US1 implementation) can start as soon as T008 exists (TDD: write test, watch it fail, then
  implement); T014 depends on T013.
- T017-T021 (US2 tests) in parallel with each other, once US1's Phase 3 checkpoint is reached.
- T026-T027 (US3 tests) in parallel with each other, once US2's Phase 4 checkpoint is reached.
- T030, T031, T034 (Polish) in parallel; T032-T033 are sequential after them.

## Implementation Strategy

### MVP scope

User Story 1 (Phase 3) alone delivers a real, independently useful artifact: a Target owner can
create a grant and have it correctly evaluated — this is the concrete, testable core of
Constitution Principle X made real. If this implementation effort needed to stop early, Phases
1-3 leave the package in a genuinely usable state (grants exist and are checkable; they just are
not yet revocable/narrowable).

### Full completion

Phases 1 -> 2 -> 3 -> 4 -> 5 -> 6, then this spec is ready for F02/F05/F07 to begin planning in
concrete detail against it, per `roadmap.md`'s dependency table.
