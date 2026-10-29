# Tasks: Core Scan & Execution Platform (F02 + F03 + F04 consolidated)

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Phase**: Planning/decomposition only (`/speckit-tasks`'s planning-artifact mode) —
per this spec's own explicit charter, `/speckit-implement` and `/speckit-converge` are NOT run
against this feature. Every task below is a planning-pass activity this session performed, not an
application-code change.

## Phase 0: Repository Truth and Evidence Gathering

- [X] T001 Capture `git status`/branch/HEAD/origin tracking state before touching anything;
  identify and preserve all unrelated/concurrent in-progress work (marketing component edits,
  deleted artifact screenshots, the untracked `specs/006-008` directories, `logs/`, `docs/
  reviews/scan-audit-2026-10-07/`). [Spec §Input, this feature's own final report]
- [X] T002 Read `.specify/memory/constitution.md` v1.2.0 in full, including Principles VIII-XIV and
  the amended Security requirements. [Plan §Constitution Check]
- [X] T003 Read the full frozen `specs/006-scan-architecture-v2/` package (spec, plan, research,
  data-model, roadmap, decisions, handoff-F01, analyze-inputs, quickstart, all contracts, all
  checklists). [Spec §Input, Plan §Current-State Architecture]
- [X] T004 Read the full frozen `specs/007-foundation-target-authorization-scope/` package (F01:
  spec, plan, data-model, all three contracts). [Spec §Input, Plan §F01 Integration]
- [X] T005 Read the full frozen `specs/008-safety-killswitch-budget-audit/` package (F07: spec,
  plan, research, data-model, quickstart, all four contracts). [Spec §Input, Plan §F07 Integration]
- [X] T006 Read current-infrastructure evidence directly from source: `apps/api/prisma/
  schema.prisma` (`Target`/`Scan`/`Issue`/`CapabilityExecution`/`AuditLogEntry`/`BillingEvent`),
  `packages/capability-sdk/src/contract.ts`, `apps/worker/src/orchestrator/orchestrator.ts`,
  `apps/worker/src/workspace/teardown.ts`, `apps/api/src/services/storage/{uploads,retention}.ts`,
  plus `docs/reviews/scan-audit-2026-10-07/{CURRENT_SCAN_INFRASTRUCTURE,
  CURRENT_SCAN_ARCHITECTURE}.md`. [Plan §Current-State Architecture, Research §every R-entry's
  evidence citations]

## Phase 1: Specification (`/speckit-specify` equivalent)

- [X] T007 Draft `spec.md`'s consolidation note, establishing the three bounded contexts (Scan
  Planning/Execution Runtime/Result-Evidence Platform) as the organizing structure, mapped
  explicitly to F02/F04/F03. [Spec §Consolidation note]
- [X] T008 Draft User Stories 1-3 and their Edge Cases, each independently testable and prioritized.
  [Spec §User Scenarios]
- [X] T009 Draft Functional Requirements FR-001 through FR-046, grouped by bounded context, each
  citing either repository evidence or a specific upstream F01/F07 FR/contract. [Spec §Requirements]
- [X] T010 Resolve four genuine architectural clarifications during drafting (bounded vs.
  enumerated plan intent for frontier-driven classes; Evidence-Issue cardinality; `ExecutionUnit`
  vs. `CapabilityExecution`; process-isolation threat-model scoping), recording each as a
  Clarification with its resolving evidence — none required stopping to ask the user, since each
  was resolvable from repository evidence or sound architectural default, per this feature's own
  "do not manufacture questions" instruction. [Spec §Clarifications]
- [X] T011 Draft Key Entities, Success Criteria (SC-001 through SC-007), and Assumptions. [Spec
  §Key Entities, §Success Criteria, §Assumptions]

## Phase 2: Plan (`/speckit-plan`)

- [X] T012 Draft `plan.md`'s Constitution Check as a three-column table (one per bounded context)
  against Principles I-XIV, plus a post-design re-check. [Plan §Constitution Check]
- [X] T013 Draft the nine required Mermaid diagrams (end-to-end lifecycle, bounded-context
  boundaries, execution-plan resolution, execution-DAG lifecycle, runtime dispatch + F07 admission,
  cancellation/safety-stop/failure transitions, evidence-finding-artifact relationships,
  crash/recovery flow, current-production parallel-run boundary). [Plan §Target Architecture
  through §Current-Production parallel-run / future-cutover boundary]
- [X] T014 Draft the Reuse/Extend/New Matrix, each row citing a specific file/line. [Plan §Reuse /
  Extend / New Matrix]
- [X] T015 Draft the Runtime/Queue Topology section, including the `BROWSER`-own-queue refinement
  to 006's own tentative placement, recorded as a proposed amendment per 006's own governance
  model (never a silent edit to 006's own document). [Plan §Runtime / Queue Topology, Research §R3/
  R12]
- [X] T016 Draft the Process Isolation / Force-Termination Resolution section, directly answering
  F07's own named `research.md` R7 dependency. [Plan §Process Isolation / Force-Termination
  Resolution]

## Phase 3: Research (`/speckit-plan` Phase 0, documented separately)

- [X] T017 Draft `research.md` R1-R12, each with Decision/Rationale/Alternatives-considered,
  covering: `ExecutionUnit` table feasibility, zero-relation reference pattern, queue-placement
  rule, process-isolation mechanism choice, progress-persistence throttling, finalization
  idempotency-key derivation, evidence/artifact storage split, R2 key scheme, failure-
  classification ownership (plus R9a's own found-during-review correction), reverify-plan
  resolution, backward-compatibility evidence, and the `BROWSER`-queue amendment's governance
  handling. [Research §R1-R12]
- [X] T018 Draft the Independent Adversarial Review table (31 named scenarios from the triggering
  master prompt's own §40 list), disposing each to either "already resolved by F01/F07" or a
  specific FR of this spec's own. [Research §Independent Adversarial Review]

## Phase 4: Data Model (`/speckit-plan` Phase 1)

- [X] T019 Draft the real, Prisma-feasible schema for all eight new models (`ScanProfile`,
  `ScanProfileVersion`, `ScanPlan`, `ExecutionUnit`, `ExecutionDependency`, `Evidence`,
  `IssueEvidenceLink`, `Artifact`) plus six new enums, proving — not assuming — zero `@relation`
  edges into any existing/frozen model. [Data-Model §every section]
- [X] T020 Draft the Validation rules and Schema invariant ownership table, cross-referencing which
  bounded context owns enforcement of each invariant. [Data-Model §Validation rules, §Schema
  invariant ownership]

## Phase 5: Contracts (`/speckit-plan` Phase 1)

- [X] T021 Draft all ten contracts (`scan-configuration`, `scan-profile`, `execution-plan`,
  `execution-unit`, `execution-runtime`, `progress-event`, `evidence-envelope`, `artifact`,
  `finding-materialization`, `runtime-finalization`), each with Signature/Required-behavior/
  Non-negotiable-boundary-rules, cross-referencing F01/F07's own contracts wherever this platform
  consumes them rather than reimplementing them. [contracts/*.md]

## Phase 6: Checklists (`/speckit-checklist`)

- [X] T022 Draft `checklists/requirements.md` (standard spec-quality checklist, 24 items, extended
  with a consolidation-specific section testing bounded-context-boundary discipline specifically).
  [checklists/requirements.md]
- [X] T023 Draft `checklists/runtime-cancellation-recovery-safety.md` (20 items, Execution Runtime
  context). [checklists/runtime-cancellation-recovery-safety.md]
- [X] T024 Draft `checklists/evidence-artifact-provenance-integrity.md` (18 items, Result/Evidence
  Platform context). [checklists/evidence-artifact-provenance-integrity.md]
- [X] T025 Draft `checklists/tenant-security-boundaries.md` (16 items, cross-cutting security
  self-review). [checklists/tenant-security-boundaries.md]
- [X] T026 Run all four checklists against the drafted package; find and fix three genuine
  internal-consistency gaps (`DETERMINISTIC_FINDING`'s persisted-value ambiguity, the `TELEMETRY`-
  class status-transition exception, the `REVERIFY`-plan destination-resolution gap) before
  marking any item `[x]`. [Research §R9a, Data-Model §ExecutionUnitStatus comment, Contracts
  §execution-plan-contract.md step 2]

## Phase 7: Cross-Artifact Analysis (`/speckit-analyze` equivalent)

- [X] T027 Cross-check every FR against: a Constitution Principle, a `plan.md` artifact (diagram/
  matrix/section), and a `data-model.md`/`contracts/` artifact — confirmed no orphaned requirement
  (every FR traces to at least one of each, mirroring 006's own `analyze-inputs.md` cross-reference
  table pattern, folded into this spec's own `plan.md`/`research.md` cross-references directly
  rather than as a separate file, since this spec's FR count (46) is smaller than 006's and did not
  warrant a dedicated fourth cross-reference document).
- [X] T028 Confirm zero contradiction with frozen F01/F07: every F01/F07 FR this spec cites is
  quoted or paraphrased accurately against the actual frozen document (re-read during T004/T005,
  not from memory). [Plan §F01 Integration, §F07 Integration]
- [X] T029 Confirm zero contradiction with the Master Architecture (006): the one refinement found
  (`BROWSER`'s own dedicated queue) is recorded as a proposed amendment per 006's own governance
  model, not a silent edit to 006's document, and 006's own `plan.md`/`spec.md`/`data-model.md`
  files remain byte-for-byte untouched by this session. [Research §R12]

## Phase 8: Independent Adversarial Review (separate from `/speckit-analyze`, per this feature's
own required workflow)

- [X] T030 Re-attempt to break the design against all 31 named scenarios from the triggering master
  prompt's own §40 list, plus this spec's own nine Edge Cases — already folded into T018's own
  table and `spec.md`'s own Edge Cases section; confirmed zero scenario left without a resolving
  FR or an explicit, correctly-scoped defer-to-F01/F07 citation. [Research §Independent
  Adversarial Review, Spec §Edge Cases]

## Phase 9: Closure

- [X] T031 Re-verify `git status`/`git diff --name-only` shows changes confined to
  `specs/009-core-scan-execution-platform/` only, with every pre-existing unrelated/concurrent
  change (T001) still present and untouched. [Spec §SC-006]
- [X] T032 Produce this feature's final structured report (36 sections per the triggering master
  prompt's own §43) and its single final verdict line (§44). [delivered in this session's own
  final message, not as a repository file — the triggering master prompt's own report format is a
  one-time session deliverable, not a planning artifact this spec's directory itself needs to
  carry]

## Phase 10: Closure/Freeze Review Pass (separate session, same feature — no scope expansion)

- [X] T033 Re-read this entire package fresh (not from the prior session's summary): `spec.md`,
  `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `tasks.md`, all 10 contracts, all 4
  checklists. Cross-verified the most load-bearing upstream citations directly against the actual
  frozen 006/007/008 text (not memory): 006's `plan.md` Execution-Class Matrix `BROWSER` row
  ("Existing scan-phase queue once deployed"), 006's `spec.md` Edge Cases governance clause
  ("surface this back to this master spec as a proposed amendment"), 006's own prior use of that
  exact mechanism (the F01 FR-015a production-prohibition note in `plan.md`'s Safety &
  Authorization Model, left as "historical placeholder record, not rewritten" — the direct
  precedent this spec's own `BROWSER`-queue refinement follows), F07's `spec.md` FR-018/FR-026
  text, and the real `apps/api/prisma/schema.prisma` (`ModuleType` enum present at line 28,
  `ExecutionClass` absent, `CapabilityExecution.capabilityId` confirmed required).
- [X] T034 Classify the `BROWSER`-queue refinement: confirmed **A — valid downstream refinement**,
  not an upstream contradiction. 006's own Edge Cases text is the general permission; 006's own
  `plan.md` already contains a *precedent instance* of this exact pattern (the F01 FR-015a note),
  proving the convention is "leave 006's document as historical record, let the authoritative
  current rule live in the downstream spec" — exactly what this spec already does. No edit to 006
  required or made.
- [X] T035 Add one small, additive "Downstream contract freeze" paragraph to `spec.md`'s header
  (mirroring F07's own identical block), naming the frozen contracts future specs MUST consume and
  cross-referencing both numbering schemes in use across this planning lineage (SPEC 2-6 and SPEC
  010-014) for the same five future domain specs — the one genuine prominence gap found during this
  closure pass; no other correction was needed. [spec.md's own header, between the Status line and
  the Consolidation note]
- [X] T036 Re-verify `git status`/`git diff --name-only` a second time: confirmed changes remain
  confined to `specs/009-core-scan-execution-platform/`; one additional, unrelated, pre-existing
  concurrent modification (`apps/web/components/marketing/audit-areas.tsx`) had appeared since the
  first planning pass — noted, not touched, consistent with this feature's own repository-safety
  charter.

## Phase 12: Controlled Upstream Amendment U-1 — Scan Deadline Policy (2026-10-10)

Planning-only amendment authorized by the project owner; implementation tasks below are future work and are NOT performed.

- [X] T037 Verify the conflict read-only against `timeout-scheduler.ts`, `timeout.ts`, `state-machine.ts` and the 009 text; record the proven conflict in `plan.md`.
- [X] T038 Author `contracts/scan-deadline-contract.md`; add FR-047, the FR-040 amendment note, SC-008, Key-Entity and Assumption notes to `spec.md`; add `ScanPlan.deadlineMs`/`deadlineBreakdown` and invariants to `data-model.md`; amend `execution-plan-contract.md` (step 4a), `execution-runtime-contract.md` (step 0, 6a, rule 6), `runtime-finalization-contract.md` and `evidence-envelope-contract.md`.
- [X] T039 Record the amendment history in `spec.md` header and `plan.md`; preserve FR-040's original text.
- [X] T-U1-1 Add `ScanPlan.deadlineMs Int?` and `deadlineBreakdown Json?` with a migration (implementation). Verified against a fresh disposable PostgreSQL database with all 35 migrations applied.
- [x] T-U1-2 Implement and unit-test `computePlanDeadline` (critical path, ceiling, grant expiry, passive-only equals legacy). Done in `apps/api/src/services/planning/plan-deadline.ts` (62 tests in `apps/api/tests/unit/planning/`, 4/4 mutants killed); persistence is covered by T-U1-1 and resolver wiring by T-U1-3.
- [X] T-U1-3 Integrate into `resolvePlan` with `PLAN_DEADLINE_EXCEEDS_CEILING` / `GRANT_EXPIRES_BEFORE_DEADLINE`. Verified in `resolver.test.ts` (40 tests, including ceiling/grant refusals).
- [X] T-U1-4 Dispatch step 0 with `SCAN_DEADLINE_EXPIRED` / `SCAN_DEADLINE_INSUFFICIENT` before F07 admission. Verified in `dispatch.test.ts` (20 tests; deadline refusal asserts no admission, lease, or budget, including a later dependent unit).
- [X] T-U1-5 Engine host-loop expiry check and shared helper. Verified in `dispatch.test.ts` (19 tests; database clock, stop precedence, lease loss, deadline handling).
- [X] T-U1-6 Extend `sweepTimedOutScans` with the planned pass; existing timeout tests unchanged and green. Verified the legacy 30-minute timeout/refund and the plan-specific timeout in `planned-timeout-sweep.test.ts` (10 tests).
- [X] T-U1-7 `expirePlanUnits` (topological order, status-by-cause matrix, engine `onUnitExpired -> TERMINATED|PENDING` with the lease held until confirmation, F07-state precedence), planned-pass ordering (expire -> module-result finalizers -> guarded transaction), self-healing pass with a supporting index, reverify-plan pass, all in the same `timeout-sweep` job. Verified in `runtime.test.ts` (54 tests) and `planned-timeout-sweep.test.ts` (10 tests), including topological BLOCKED propagation, stop precedence, self-heal of cancelled/REVERIFY plans, and termination confirmation.
- [X] T-U1-8 `continueScanIfPlanTerminal` gate, domain-registered module-result finalizer extension point, event-driven completion from `finalizeExecutionUnit`, and the orchestrator's final transition routed through the gate. Verified in `planned-timeout-sweep.test.ts` (10 tests), including no-plan legacy behavior, readiness barrier, deadline guard, and module-result finalizer registration; worker runtime suite verifies completion invokes the gate.
- [X] T-U1-9 Engine execution-wrapper fencing helper (terminal unit / terminal scan / passed deadline in one transaction) and the two added edges `PLANNED -> REFUSED` / `DISPATCHED -> REFUSED`; fence-first-claim-second ordering; engines confirm their lease before finalizing; generic `recordEvidence` stays permissive. Verified by API evidence tests (25/25) and the real non-superuser worker runtime suite (21/21), including refusal of direct host-role `Scan.startedAt` UPDATE.
- [ ] T-U1-10 Adverse tests for AC-1..AC-20 (database clock, kill-vs-deadline precedence, sweep-vs-gate race, refund fairness, legacy regression). AC-5 now has isolated coverage that mutable progress plus duplicate delivery leave the immutable plan deadline unchanged; worker restart/recovery evidence remains open.

## Explicitly NOT performed (per this feature's own charter)

- `/speckit-implement` — NOT run. No application code, route, service file, or Prisma migration
  was written.
- `/speckit-converge` — NOT run.
- Any edit to `specs/006-scan-architecture-v2/`, `specs/007-foundation-target-authorization-scope/`,
  or `specs/008-safety-killswitch-budget-audit/` — NOT performed (the one proposed amendment, T015/
  T029, is recorded in this spec's own `research.md`, not written into 006's files).
- Design of any individual execution engine (E10-E17) or product-testing domain (SPEC 2-6) — NOT
  performed; this spec defines only the platform those future specs will consume.
- Design of credential/session storage (F05) or final pricing (F06) — NOT performed; only the
  opaque reference hooks those future specs will fill in are defined here.
