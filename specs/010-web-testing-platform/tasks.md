# Tasks: Web / UI / Accessibility / Functional Web / SEO Testing Platform

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`
**Phase**: Planning/decomposition only (`/speckit-tasks`'s planning-artifact mode) — per this
feature's own explicit charter, `/speckit-implement` and `/speckit-converge` are NOT run against
this feature. Every task below is a planning-pass activity this session performed, not an
application-code change.

## Phase 0: Repository Truth and Evidence Gathering

- [X] T001 Capture `git status`/branch/HEAD/origin tracking state before touching anything;
  identify and preserve all unrelated/concurrent in-progress work. Noted: HEAD advanced by one
  commit (`2be9a70` → `99a0e69`) between this conversation's start and this spec's own start —
  flagged to the user as a concurrent-session change this session did not make, not investigated
  further (out of this feature's own scope). [Spec §Input]
- [X] T002 Confirm `specs/006-scan-architecture-v2/`, `specs/007-foundation-target-authorization-
  scope/`, `specs/008-safety-killswitch-budget-audit/`, `specs/009-core-scan-execution-platform/`
  are frozen/complete (009 confirmed closed with a prior "closure/freeze review pass," all tasks
  checked, zero `NEEDS CLARIFICATION` markers) — treated as upstream contracts to consume, never
  modified by this session. [User's own correction mid-session: this spec's job is to create 010,
  not re-review 009.]
- [X] T003 Read 009's own ten contracts in full (`execution-unit`, `execution-runtime`, `evidence-
  envelope`, `artifact`, `progress-event`, `execution-plan`, `finding-materialization`, `runtime-
  finalization`) plus its `data-model.md`. [Plan §F01/F07/009 Integration]
- [X] T004 Read F01's `scope-matching-contract.md`/`authorization-check-contract.md` and F07's
  `safety-checkpoint-contract.md` in full. [Plan §Browser/Crawler Safety Model]
- [X] T005 Dispatch three parallel research passes over current-state infrastructure: (a)
  `apps/probe-pool`, `withPage`, Playwright usage repo-wide, `screenshot-capture`/`cwv-analyzer`/
  `lighthouse-analyzer`, E2E test infra, browser isolation/concurrency/crash handling; (b) crawler/
  link-discovery, `network-inspector`/`meta-checker`/`content-checker`/`css-analyzer`/`impeccable`,
  accessibility code, sitemap/robots parsing, the capability-SDK contract shape; (c) orchestrator
  dispatch, `ModuleType`/`Capability`/`CapabilityExecution`/`Issue` schema, fingerprinting,
  `@webaudit/redaction`, pricing, `ScanForm.tsx`, R2 screenshot storage, the reverify runner. All
  three returned evidence-cited findings now folded into `plan.md`'s Current-State Architecture and
  Reuse/Extend/New Matrix. [Research §R1-R11]

## Phase 1: Product-Policy Clarification

- [X] T006 Identify the three genuine product-policy questions the triggering brief itself flagged
  as "stop and ask" (workflow authorship scope, visual-baseline approval mode, `robots.txt`
  policy) — confirmed these are not inferable from repository evidence or a safe technical
  default, per the brief's own explicit instruction. [Spec §Clarifications]
- [X] T007 Put all three to the user via a structured question; recorded all three answers
  (Fahes-declared bounded workflow catalog only; user-controlled baseline approval; `robots.txt`
  informational-only for SEO) verbatim in `spec.md`'s Clarifications before drafting any FR that
  depended on them. [Spec §Clarifications]

## Phase 2: Specification (`/speckit-specify` equivalent)

- [X] T008 Draft `spec.md`'s consolidation note, establishing the Engine/Domain two-kind
  organization (Browser, Crawler = Engines; Frontend/UX, Accessibility, Functional Web, SEO =
  Domains) as the structure, directly generalizing 009's own Engine≠Domain framing one layer down.
  [Spec §Consolidation note]
- [X] T009 Draft User Stories 1-3 and their Edge Cases. [Spec §User Scenarios]
- [X] T010 Draft Functional Requirements FR-001 through FR-053, grouped by area, each citing either
  repository evidence or a specific upstream F01/F07/009 FR/contract. [Spec §Requirements]
- [X] T011 Resolve one additional architectural clarification found during drafting (does Domain-
  check dispatch need its own new `ExecutionUnitClass` — resolved no, `research.md` R3) beyond the
  three product-policy questions from Phase 1. [Spec §Clarifications]
- [X] T012 Draft Key Entities, Success Criteria (SC-001 through SC-007), and Assumptions. [Spec
  §Key Entities, §Success Criteria, §Assumptions]

## Phase 3: Plan (`/speckit-plan`)

- [X] T013 Draft `plan.md`'s Constitution Check as a six-column table (two Engines, four Domains)
  against Principles I-XIV, plus a post-design re-check on the Domain-check-dispatch decision's own
  Principle XII implications. [Plan §Constitution Check]
- [X] T014 Draft all twelve required Mermaid diagrams. [Plan §Target Architecture]
- [X] T015 Draft the Reuse/Extend/New Matrix and the Domain/Engine Matrix, each row citing a
  specific file/line from Phase 0's own research passes. [Plan §Reuse/Extend/New Matrix, §Domain/
  Engine Matrix]
- [X] T016 Draft the Browser/Crawler Safety Model and Crash/Recovery Model sections. [Plan
  §Browser/Crawler Safety Model, §Crash/Recovery Model]

## Phase 4: Research (`/speckit-plan` Phase 0, documented separately)

- [X] T017 Draft `research.md` R1-R12, each with Decision/Rationale/Alternatives-considered,
  covering: the `ModuleType`-extension safety proof, in-process vs. standalone-service wiring for
  `apps/probe-pool`, the domain-check-dispatch-location decision, the `CHECK_RESULT`-Evidence-not-
  new-table decision, `PageIdentity` reuse of F01's normalization, `VisualBaseline` retention
  non-extension, the automatability-tier-is-code-not-schema decision, fingerprint-parts reuse for
  viewport identity, redaction-call-site extension, axe-core vendoring fit, backward-compatibility
  evidence, and zero-amendment confirmation. [Research §R1-R12]
- [X] T018 Draft the Independent Adversarial Review table (30 scenarios, covering every one named
  in the triggering brief's own truncated §40-equivalent list plus every threat-model section's own
  named scenarios), disposing each to either "already resolved by F01/F07/009" or a specific FR of
  this spec's own. [Research §Independent Adversarial Review]

## Phase 5: Data Model (`/speckit-plan` Phase 1)

- [X] T019 Draft the real, Prisma-feasible schema for the one new model (`VisualBaseline`) plus the
  two new `ModuleType` values and four new `EvidenceKind` values, proving — not assuming — zero
  `@relation` edges into any existing/frozen model. [Data-Model §every section]
- [X] T020 Draft the code-level (non-persisted) registry shapes (`BrowserMatrixEntry`,
  `WebCheckDefinition`, `WorkflowDefinition`/`WorkflowStep`) and the Validation rules/Schema
  invariant ownership table. [Data-Model §Code-level registry shapes, §Validation rules]

## Phase 6: Contracts (`/speckit-plan` Phase 1)

- [X] T021 Draft all ten contracts (`browser-execution`, `crawler`, `page-identity`, `web-check-
  registry`, `accessibility-check`, `frontend-ux-check`, `functional-workflow`, `seo-check`,
  `visual-baseline`, `coverage`), each with Signature/Required-behavior/Non-negotiable-boundary-
  rules, cross-referencing F01/F07/009's own contracts wherever this platform consumes them rather
  than reimplementing them. [contracts/*.md]

## Phase 7: Checklists (`/speckit-checklist`)

- [X] T022 Draft `checklists/requirements.md` (21 items, including Engine/Domain boundary
  discipline and upstream-contract-fidelity sections specific to this consolidated spec).
  [checklists/requirements.md]
- [X] T023 Draft `checklists/browser-crawler-safety.md` (20 items). [checklists/browser-crawler-
  safety.md]
- [X] T024 Draft `checklists/frontend-functional-correctness.md` (16 items). [checklists/frontend-
  functional-correctness.md]
- [X] T025 Draft `checklists/accessibility-coverage-honesty.md` (12 items). [checklists/
  accessibility-coverage-honesty.md]
- [X] T026 Draft `checklists/seo-correctness-coverage.md` (10 items). [checklists/seo-correctness-
  coverage.md]
- [X] T027 Draft `checklists/tenant-privacy-evidence-security.md` (15 items). [checklists/tenant-
  privacy-evidence-security.md]
- [X] T028 Run all six checklists against the drafted package; confirmed every item before marking
  it `[x]` by cross-referencing the specific FR/contract/research entry it depends on.

## Phase 8: Cross-Artifact Analysis (`/speckit-analyze` equivalent)

- [X] T029 Cross-check every FR against: a Constitution Principle, a `plan.md` artifact (diagram/
  matrix/section), and a `data-model.md`/`contracts/` artifact — confirmed no orphaned
  requirement, folded into `plan.md`/`research.md`'s own cross-references directly rather than as
  a separate file, mirroring 009's own identical choice for an FR count in the same range (53 here
  vs. 46 for 009).
- [X] T030 Confirm zero contradiction with frozen 006/007/008/009: every cited FR/contract was
  re-read from the actual frozen document text during T003/T004, not from memory; zero amendment
  to any of the four was required (`research.md` R12).

## Phase 9: Independent Adversarial Review

- [X] T031 Re-attempt to break the design against 30 named scenarios spanning scope/authorization
  races, browser-level escape vectors (SSRF/file:/data:/popups/service-workers), crawl traps
  (calendar URLs, query explosion, redirect loops, recursive/huge sitemaps, compression bombs),
  visual-baseline races, coverage-silently-PASS risks, and the combinatorial-explosion risk the
  triggering brief itself named — confirmed zero scenario left without a resolving FR or an
  explicit, correctly-scoped defer-to-F01/F07/009 citation. [Research §Independent Adversarial
  Review]

## Phase 10: Closure

- [X] T032 Verify `git status`/`git diff --name-only` shows changes confined to
  `specs/010-web-testing-platform/` only, with every pre-existing unrelated/concurrent change still
  present and untouched, and with 006/007/008/009's own directories byte-for-byte unmodified by
  this session.
- [X] T033 Produce this feature's final structured report and single final verdict line, delivered
  in this session's own final message, not as a repository file — mirroring 009's own identical
  posture that the master-brief report format is a one-time session deliverable.

## Phase 11: Closure + Correction + Freeze Pass (same session, 2026-10-08)

- [X] T034 Re-recorded repository state (branch `main`, HEAD advancing twice more during this pass
  — `99a0e69`→`1e1de71`→further — due to a confirmed concurrent session, not this one); re-read the
  full SPEC 010 package fresh (`spec.md`/`plan.md`/`research.md`/`data-model.md`/`quickstart.md`/
  `tasks.md`/all ten contracts) before editing anything.
- [X] T035 Found and fixed Closure Finding CF-1: `VisualBaseline`'s original single-table design
  carried a bare `@@unique` across a triple whose own prose claimed service-layer-only enforcement
  — infeasible as drafted. Split into `VisualBaseline` (pointer) + `VisualBaselineApproval`
  (history), both using ordinary non-partial unique constraints; defined the atomic upsert-plus-
  supersession transaction that makes two concurrent approvals race-safe. [data-model.md,
  contracts/visual-baseline-contract.md, spec.md FR-026]
- [X] T036 Closed the Domain Check Registry's recursion/idempotency/readiness lifecycle: `CHECK_
  RESULT` permanently excluded from the trigger set (non-recursion by construction); introduced
  `IdempotentClaim` (one generic, reusable claim-once primitive) for exactly-once execution under
  retry/replay/concurrency; defined `readinessScope` for multi-unit checks; defined
  `sweepUnresolvedChecks` so a requested check can never end a scan with no recorded verdict.
  [data-model.md, contracts/web-check-registry-contract.md, spec.md FR-001a/FR-041a, research.md
  R15]
- [X] T037 Fixed the stale `FR-xxx` placeholder (two occurrences: Clarifications' fourth bullet,
  Edge Cases' shared-evidence bullet) — replaced with real FR-001a/FR-041a references; grepped the
  entire directory for `TODO`/`TBD`/`FIXME`/`NEEDS CLARIFICATION`/other placeholder markers —
  confirmed zero remaining beyond this explanatory sentence itself. [spec.md]
- [X] T038 Re-verified F01's own frozen `scope-matching-contract.md`/`authorization-check-
  contract.md` text word-for-word against this spec's own "every navigation/redirect/popup/cross-
  origin resource load" claim; found a genuine textual ambiguity (not a contradiction) and resolved
  it as a documented interpretation — F01 governs engine-chosen destinations only, ordinary page
  subresources are governed by `packages/safe-net`'s own unconditional egress policy — without
  editing F01's own document. [research.md R13, contracts/browser-execution-contract.md, spec.md
  FR-012/FR-017]
- [X] T039 Closed the crawler budget/dedup race conditions: `maxPages` reserved via a single atomic
  conditional-increment statement (`CrawlBudgetCounter`); `PageIdentity` dedup via `IdempotentClaim`
  — neither a count-then-create nor a SELECT-then-INSERT race remains. [data-model.md,
  contracts/crawler-contract.md, spec.md FR-020, research.md R16]
- [X] T040 Strengthened `PageIdentity`'s query-parameter handling: unknown parameter is semantic by
  default; the exclusion list is an explicit allow-list, never a heuristic. [contracts/page-
  identity-contract.md, spec.md FR-018]
- [X] T041 Added `FR-028a` (structural `HUMAN_JUDGMENT_REQUIRED` override to `INCONCLUSIVE`) and
  `FR-032a` (an `actionSafety` value, including `DESTRUCTIVE`, grants no capability by itself; every
  mutating workflow step carries its own idempotency claim) — both found during this closure pass
  as real gaps, not previously stated. [spec.md, contracts/accessibility-check-contract.md,
  contracts/functional-workflow-contract.md, data-model.md]
- [X] T042 Added `FR-003a` (ModuleType activation touchpoints — pricing/`ScanForm`/exhaustive-
  switch/AI-prompt call sites that must independently be updated before `ACCESSIBILITY`/
  `FUNCTIONAL` are operational) so the enum addition is never mistaken for operational readiness.
  [spec.md, plan.md]
- [X] T043 Put the one genuine product-policy question this closure pass surfaced (approved-
  baseline retention) to the user rather than inventing it; recorded the confirmed answer (extended
  retention while active) as `FR-026a` and closed the mechanism in `data-model.md`/`contracts/
  visual-baseline-contract.md`. [spec.md Clarifications]
- [X] T044 Tightened `FR-036` (added explicit duplicate-metadata-across-crawl coverage), `FR-043`
  (reverify uses the *minimum* necessary coverage scope, never blind reuse or blind over-scanning),
  and `FR-046` (screenshot privacy limitation states its actual operational consequence: tenant-
  scoped access control only, no pixel redaction). [spec.md, contracts/seo-check-contract.md]
- [X] T045 Performed the cross-artifact consistency pass: re-verified every FR number referenced
  anywhere in this package resolves to a real FR; re-verified enum/entity/contract-function/status
  names match across `spec.md`/`plan.md`/`data-model.md`/every contract; updated and honestly
  re-evaluated every checklist item touched by a fix rather than leaving a stale `[x]` (six
  checklists, twenty-one items added or revised).
- [X] T046 Ran the closure-pass independent adversarial review: 26 named scenarios (simultaneous
  baseline approvals, superseded-baseline history, approved-artifact retention, `CHECK_RESULT`
  self-trigger recursion, duplicate/late/replayed Evidence, worker-restart-during-evaluation,
  duplicate Finding materialization, CDN/subresource scope behavior, redirect-to-localhost, DNS
  rebinding, popup/iframe escape, crawler budget/dedup races, semantic query collapse, sitemap
  explosion, unsupported browser, missing required Evidence, axe/human-judgment false PASS,
  persistent-mutation retry, destructive-workflow-action, truncated-crawl orphan claim, screenshot
  privacy exposure, stale reverify authorization, tenant-crossing baseline lookup) — confirmed
  every one maps to a resolving mechanism; zero disappeared silently. [research.md Closure-Pass
  Independent Adversarial Review]
- [X] T047 Re-verified all eighteen freeze conditions this closure pass's own charter named; all
  eighteen confirmed true. Updated `spec.md`'s own Status line to "Planning complete — frozen for
  downstream specs" and added the Downstream Contract Freeze header block, mirroring 009's own
  identical pattern.
- [X] T048 Re-verified `git status`/`git diff --name-only`: changes remain confined to
  `specs/010-web-testing-platform/`; 006/007/008/009 remain byte-for-byte unmodified; no application
  code, Prisma schema, queue, or production file was touched; confirmed `/speckit-implement`/
  `/speckit-converge` were not run.

## Explicitly NOT performed (per this feature's own charter, reconfirmed at closure)

- `/speckit-implement` — NOT run. No application code, route, service file, browser-pool wiring
  change, or Prisma migration was written.
- `/speckit-converge` — NOT run.
- Any edit to `specs/006-scan-architecture-v2/`, `specs/007-foundation-target-authorization-
  scope/`, `specs/008-safety-killswitch-budget-audit/`, or `specs/009-core-scan-execution-
  platform/` — NOT performed, including during this closure pass (F01's navigation/subresource
  question was resolved as a documented interpretation, never an edit to F01's own document).
- SPEC 011 (Source/Backend/Database testing), SPEC 012 (Active Security testing), SPEC 013
  (Performance/Load testing) — NOT designed; this spec names only their extension points.
