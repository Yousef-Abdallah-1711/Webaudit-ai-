---
description: "Task list for the Fahes Scan Platform Architecture v2 master planning pass"
---

# Tasks: Fahes Scan Platform Architecture v2

**Input**: Design documents from `specs/006-scan-architecture-v2/`

**Prerequisites**: plan.md (done), spec.md with Clarifications (done), research.md (done),
data-model.md (done), contracts/ (done), quickstart.md (done), roadmap.md (done), decisions.md
(done), checklists/requirements.md (16/16) and checklists/architecture-quality.md (44/46, 2
deferred) (done)

**Tests**: not applicable — this feature produces no running system, so there is no test suite to
write. "Independent Test" below means the validation method from `spec.md`'s own Acceptance
Scenarios, not an automated test.

**Organization**: tasks are grouped by this feature's three user stories (`spec.md`), plus Setup
and Foundational phases for cross-cutting planning-package work, plus a Polish phase that preps
for `/speckit-analyze` (the next SpecKit phase — this task list does not duplicate Analyze's own
job, only prepares for it) and confirms the repository-safety constraint held throughout.

**Explicitly out of scope for every task below** (per this spec's own non-goals and FR-024): no
task implements a scanner, check, or capability; no task deploys a service (including the
browser-pool); no task builds an isolation/sandbox mechanism; no task runs a real Prisma
migration; no task redesigns `/scan`'s actual UI; no task writes production application code.

## Phase 1: Setup (Package Completeness)

**Purpose**: confirm the planning package itself is structurally complete before any
validation/handoff work begins.

- [x] T001 Confirm every file listed in plan.md's "Documentation (this feature)" tree actually
  exists under `specs/006-scan-architecture-v2/` (spec.md, plan.md, research.md, data-model.md,
  contracts/*, quickstart.md, roadmap.md, decisions.md, checklists/*) and note any gap. —
  Confirmed complete; `handoff-F01.md` and `analyze-inputs.md` were added during Phases 5-6 and are
  not gaps, they are this task list's own deliverables.
- [x] T002 [P] Confirm `.specify/memory/constitution.md` is at v1.2.0 with Principles I-XIV present
  and the Sync Impact Report at the top matches the actual added sections. — Confirmed.
- [x] T003 [P] Confirm `.specify/feature.json` points at `specs/006-scan-architecture-v2` so
  downstream SpecKit commands resolve this feature without relying on git branch naming. —
  Confirmed (verified independently by `check-prerequisites.ps1`'s own resolution during the Plan
  and Clarify phases).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: turn this planning pass's own open items into a durable, trackable form before this
feature can honestly report "ready for child specs." No child-spec handoff work (Phase 5) may be
considered complete until this phase is done.

**⚠️ CRITICAL**: Phase 5's F01 handoff task depends on T004-T006 below being complete, since the
handoff brief must carry the open decisions forward accurately.

- [x] T004 Cross-check `decisions.md`'s Open Decisions table against
  `checklists/architecture-quality.md`'s two unchecked items (CHK025, CHK038) and confirm both are
  represented with matching category labels (`PRODUCT DECISION REQUIRED` / `UNKNOWN - REQUIRES
  INVESTIGATION` / `PROVISIONAL`) in `decisions.md`. — Confirmed both present and correctly
  labeled.
- [x] T005 Cross-check every `TODO(...)` in `.specify/memory/constitution.md`'s Sync Impact Report
  against `decisions.md`'s Open Decisions table and add any missing row. — The two v1.2.0 TODOs
  are present; the three pre-existing v1.0.0 TODOs (`CREDIT_PRICE_TABLE`, `PLAN_TIERS`,
  `DATA_MODEL`) are already marked resolved in the constitution's own file history (superseded by
  current code per `PROJECT_MAP.md`) and `TODO(SANDBOX_MECHANISM)` is superseded by this feature's
  own `TODO(UNTRUSTED_EXECUTION_MECHANISM)`, which the Open Decisions table already carries — no
  missing row.
- [x] T006 [P] Confirm `roadmap.md`'s "Dropped" note (Billing/Credits UX) and its own
  re-add-with-evidence condition are also reflected in `decisions.md`'s Open Decisions table as a
  PROVISIONAL entry. — Confirmed present.

**Checkpoint**: open items are durably tracked in `decisions.md` — Phase 5's handoff task can now
proceed with an accurate, non-stale open-decisions list.

---

## Phase 3: User Story 1 - Classify an existing subsystem before touching it (Priority: P1)

**Goal**: a platform architect can trust every Reuse/Extend/New classification in `plan.md`
without re-deriving it from source.

**Independent Test**: pick any subsystem row in `plan.md`'s Reuse/Extend/New Matrix and confirm its
classification traces to a specific file/symbol (per `spec.md`'s own Acceptance Scenario 1).

### Validation for User Story 1

- [x] T007 [US1] Re-read `plan.md`'s Reuse/Extend/New Matrix row by row and confirm every Evidence
  cell names an actual file path that exists in the repository. — Confirmed against this
  conversation's own direct source reads (`packages/config/src/queues.ts`,
  `apps/api/src/services/credits/debit.ts`, `apps/worker/src/readiness/{verdict,diff}.ts`,
  `apps/worker/src/reverify/runner.ts`, `packages/capability-sdk/src/contract.ts`,
  `apps/probe-pool/src/browser/pool.ts`, `apps/sandbox-runner/src/host/server.ts`,
  `packages/safe-net/src/address-rules.ts`, `packages/safe-archive/src/guard.ts`,
  `load-testing/RUNBOOK.md`) — every cell traces to a file this session actually opened.
- [x] T008 [US1] Confirm the Execution-Class Matrix's intake-mode mapping sentence still accurately
  reflects `data-model.md`'s `Target`/`ScanPlan` entities after T004-T006's edits. — Confirmed, no
  drift (T004-T006 only touched `decisions.md`, not `data-model.md`).

**Checkpoint**: User Story 1 is fully satisfied — every classification in the matrix is
independently verifiable by a reader with no other context.

---

## Phase 4: User Story 2 - Route a new testing requirement to the right engine and safety tier (Priority: P2)

**Goal**: a platform architect can route any future testing requirement to exactly one execution
class with a stated authorization tier and safety prerequisite.

**Independent Test**: take any item from the triggering task's "current product vision" list
(e.g. SQL injection, IDOR, load testing) and confirm `plan.md`'s Execution-Class Matrix resolves it
to exactly one class (per `spec.md`'s own Acceptance Scenarios 1-2 for User Story 2).

### Validation for User Story 2

- [x] T009 [US2] Walk every example in the triggering task's "CURRENT PRODUCT VISION" lists and
  confirm each maps to exactly one row in `plan.md`'s Execution-Class Matrix. — Most map cleanly
  (SQLi/XSS/SSRF-of-target -> `ACTIVE_SECURITY`; CWV/bundle/image -> `BROWSER`/`SOURCE_STATIC`;
  load/stress/spike/soak -> `LOAD_CAPACITY`; SAST/dependency -> `SOURCE_STATIC`; accessibility ->
  `BROWSER`; multi-page SEO -> `CRAWLER`). **Found a genuine non-clean fit**: IDOR, business-logic/
  price/coupon manipulation, and race conditions each span *two* classes (`AUTHENTICATED_WORKFLOW`
  for session/role setup plus `ACTIVE_SECURITY` for the adversarial request), not one — recorded
  in `decisions.md`'s Open Decisions table per this task's own instruction rather than forced into
  a single row.
- [x] T010 [US2] Confirm every one of the four classes requiring Authorization beyond Ownership
  Verification is listed with F07 as a dependency in `roadmap.md`. — Confirmed: E13, E14, E15, E16
  each list F07 in their Depends-on column.

**Checkpoint**: User Story 2 is fully satisfied — every current-vision testing capability has a
determinate execution-class and safety-prerequisite answer.

---

## Phase 5: User Story 3 - Determine what to plan next without re-deriving the platform (Priority: P3)

**Goal**: an engineering lead can read `roadmap.md` alone and know the correct next child spec and
its prerequisites.

**Independent Test**: hand `roadmap.md` to a reader with no other context and confirm they name
F01 as next, with its (empty) prerequisite list, without consulting the current codebase (per
`spec.md`'s own Acceptance Scenario for User Story 3).

### Handoff preparation for User Story 3

- [x] T011 [US3] Create `specs/006-scan-architecture-v2/handoff-F01.md`. — Done; covers the three
  owned entities, what must not be touched, the two genuinely open questions (authorization
  taxonomy refinement + the two-class-span nuance found in T009), and the downstream unblocking
  chain.
- [x] T012 [US3] [P] Re-read `roadmap.md`'s "Recommended planning order" against the dependency
  graph Mermaid diagrams in `plan.md`/`roadmap.md`. — **Found and fixed a real inconsistency**:
  `roadmap.md`'s table listed F03 as a dependency for E11 (Crawler), but `plan.md`'s dependency
  graph only showed F04 -> E3B, not F03 -> E3B. Added the missing edge to `plan.md`'s Mermaid
  diagram so the two artifacts agree.

**Checkpoint**: User Story 3 is fully satisfied — a future session can pick up F01 from
`handoff-F01.md` alone and begin `/speckit-specify` without re-reading this entire feature.

---

## Phase 6: Polish & Analyze Preparation

**Purpose**: prepare for the `/speckit-analyze` phase that follows this task list (Analyze itself
is a separate SpecKit command and is not duplicated here) and reconfirm the repository-safety
constraint that has held since Phase 0 of this planning pass.

- [x] T013 [P] Build a cross-reference table. — Created `analyze-inputs.md`: FR -> Principle ->
  Plan-artifact table, plus a Principle -> first-consuming-child-spec table.
- [x] T014 Re-run `git status --short`/`git diff --name-only` and confirm only expected paths
  changed. — Confirmed: only `.specify/memory/constitution.md` (expected, this feature's own
  amendment) and `specs/006-scan-architecture-v2/` (expected) are attributable to this feature.
  `apps/api/tests/contract/auth.oauth-flow.test.ts`, `apps/api/tests/unit/cost-alerts.test.ts`,
  and `apps/web/tests/e2e/onboarding/hero-url-handoff.spec.ts` are a different set of files than
  this session's own earlier git-status snapshots showed modified — confirming an unrelated
  concurrent session is still active and continuing to change files, not this feature. Flagged,
  not touched.
- [x] T015 [P] Run `quickstart.md`'s eight validation steps against this feature's own `plan.md`/
  `data-model.md`. — Done; recorded inline in `quickstart.md` as a dated validation note. All
  eight pass (one trivially, since there is no separate child classification to compare the
  master against).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies, can start immediately.
- **Foundational (Phase 2)**: depends on Setup; BLOCKS Phase 5 (T011 needs an accurate open-
  decisions list).
- **User Stories (Phases 3-5)**: Phases 3 and 4 depend only on Setup and can run in parallel with
  each other and with Phase 2; Phase 5 additionally depends on Phase 2.
- **Polish (Phase 6)**: depends on Phases 3, 4, and 5 all being complete.

### Parallel Opportunities

- T002, T003 (Setup) in parallel.
- T006 (Foundational) in parallel with T004-T005 once both are individually underway.
- Phase 3 (T007-T008) and Phase 4 (T009-T010) in parallel with each other.
- T012 (Phase 5) in parallel with T011 once T011's first draft exists.
- T013, T015 (Polish) in parallel; T014 is independent and can run any time after Phase 1.

## Implementation Strategy

### MVP scope

User Story 1 (Phase 3) alone already delivers the highest-priority value (a trustworthy
Reuse/Extend/New classification) and is independently valid without Phases 4-5. If this planning
pass needed to stop early, Phases 1-3 are the minimum that leaves the package in a genuinely usable
state for a future reader.

### Full completion

Phases 1 -> 2 -> {3, 4 in parallel} -> 5 -> 6, then proceed to `/speckit-analyze` as the next
SpecKit command (not part of this task list).
