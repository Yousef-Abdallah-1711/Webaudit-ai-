# Checklist: Requirements Completeness

## Requirement Clarity

- [x] CHK-RQ001 Every FR is phrased as a testable obligation ("MUST"), not a goal or aspiration.
- [x] CHK-RQ002 Every FR names which of the six areas (or "cross-cutting") owns it — no FR is
  ambiguous about which bounded area is responsible for its enforcement.
- [x] CHK-RQ003 No `[NEEDS CLARIFICATION]` marker remains anywhere in `spec.md` — the three genuine
  product-policy questions this spec's own brief flagged (workflow authorship, baseline approval
  mode, `robots.txt` policy) were put to the user this session and are recorded, with their
  answers, in Clarifications.

## Engine / Domain Boundary Discipline

- [x] CHK-RQ004 No FR lets an Engine (Browser, Crawler) decide a Finding directly — every Finding-
  producing path routes through the Domain Check Registry (FR-001, FR-041).
- [x] CHK-RQ005 No FR lets a Domain (Frontend/UX, Accessibility, Functional, SEO) execute against
  the target directly — every Domain consumes Evidence an Engine already produced, or today's
  unchanged HTTP-only capability path (FR-005).
- [x] CHK-RQ006 The Crawler Engine's own FRs (FR-016 through FR-022) contain zero SEO-specific
  logic — SEO's own interpretation of discovered pages lives entirely in `seo-check-contract.md`.

## Upstream Contract Fidelity

- [x] CHK-RQ007 Every citation of a 009 contract (`execution-unit`, `execution-runtime`, `evidence-
  envelope`, `artifact`, `execution-plan`, `finding-materialization`, `runtime-finalization`) was
  verified against the actual frozen document text in this session, not from memory.
- [x] CHK-RQ008 Every citation of an F01 contract (`scope-matching`, `authorization-check`) was
  verified against the actual frozen document text in this session.
- [x] CHK-RQ009 Every citation of an F07 contract (`safety-checkpoint`) was verified against the
  actual frozen document text in this session.
- [x] CHK-RQ010 This spec proposes zero amendment to 006/007/008/009's own entities, contracts, or
  ceiling values — confirmed by `research.md` R12.

## Evidence Grounding (this spec's own current-state claims)

- [x] CHK-RQ011 Every "today's code does X" claim in `spec.md`/`plan.md`/`research.md` cites a
  specific file and line range from this session's own three parallel research passes.
- [x] CHK-RQ012 The claim "no crawler/link-discovery capability exists" was verified by an explicit
  directory listing of `packages/capabilities-vendored/`, not inferred.
- [x] CHK-RQ013 The claim "no accessibility-testing capability exists for customer targets" was
  verified by distinguishing `apps/web`'s own internal E2E axe-core usage from any customer-facing
  capability — confirmed zero overlap.
- [x] CHK-RQ014 The claim "`apps/probe-pool` is real but unwired" was verified by both (a) reading
  its own working Chromium-launch code and (b) confirming zero call sites from `apps/worker`/
  `apps/api`.

## New Construct Justification

- [x] CHK-RQ015 The two new `ModuleType` values are justified as additive, non-structural, non-
  frozen-spec-owned (`research.md` R1) — not merely asserted safe.
- [x] CHK-RQ016 Every one of this spec's four new `EvidenceKind` values has a stated reason it does
  not fit an existing value from 009's own fourteen.
- [x] CHK-RQ017 (re-evaluated during this spec's closure pass — the original item asserted "the
  one new table"; corrected here rather than left stale) Each of this spec's four new tables
  (`VisualBaseline`, `VisualBaselineApproval`, `IdempotentClaim`, `CrawlBudgetCounter` — the first
  corrected and the latter two added during closure) was checked against the master brief's own
  "do not blindly create all of them" instruction — every other candidate entity (`BrowserMatrix`,
  `CrawlPage`, `WorkflowDefinition`, `CoverageSummary`) still has a stated reason it is code-level
  or Evidence-shaped instead of a table, and each of the four actual tables has its own stated,
  closure-pass-specific justification (`data-model.md`) rather than being assumed necessary.

## Consolidation Discipline

- [x] CHK-RQ018 This spec explicitly resolves the "where does domain-check dispatch run" question
  (`research.md` R3) rather than leaving it implicit — this was the single highest-risk boundary
  question a six-area consolidation could have gotten wrong.
- [x] CHK-RQ019 No FR widens 009's own `ExecutionUnitClass` enum — confirmed by direct re-scan of
  every FR in `spec.md`.

## Success Criteria Testability

- [x] CHK-RQ020 Every SC in `spec.md` names a concrete, checkable artifact or verification step
  (a file, a `git diff`, a checklist pass) — none is a vague aspiration.
- [x] CHK-RQ021 SC-006 (zero changes outside this spec's own directory) is independently re-verified
  at closure, not only asserted once at drafting time.

## Closure-Pass Integrity (added 2026-10-08)

- [x] CHK-RQ022 The stale `FR-xxx` placeholder found in the original draft (Clarifications' fourth
  bullet and the Edge Cases' "two domains share evidence" bullet) is confirmed replaced with real
  FR-001a/FR-041a references — re-grepped across the entire directory to confirm zero remaining
  `FR-xxx` occurrences outside this explanatory sentence itself.
- [x] CHK-RQ023 Every new FR this closure pass added (FR-001a, FR-003a, FR-026a, FR-028a, FR-032a,
  FR-041a) is confirmed to use letter-suffix numbering rather than renumbering FR-002 through
  FR-053 — consistent with this lineage's own established convention (F07/009's identical
  `FR-022a`-style insertions) and avoiding a cascade of now-incorrect cross-references throughout
  this package's own contracts/checklists/tasks.
- [x] CHK-RQ024 A genuine data-model defect found during this closure pass (`VisualBaseline`'s
  original single-table design, `data-model.md` Closure Finding CF-1) was fixed with a documented,
  Prisma/PostgreSQL-feasible mechanism (pointer/history split) rather than papered over with
  revised prose alone — the schema and the prose now agree.
- [x] CHK-RQ025 One upstream-text ambiguity (F01's navigation-vs-subresource scope semantics,
  `research.md` R13) was resolved as a documented interpretation for this spec's own consuming
  purposes, with F01's own document left unmodified, rather than either silently assumed away or
  used to block this closure pass entirely — the reasoning for treating it as ambiguity rather
  than contradiction is stated explicitly, not merely asserted.
- [x] CHK-RQ026 One genuine product-policy question found during this closure pass (approved-
  baseline retention, FR-026a) was put to the user rather than invented — consistent with this
  spec's own established practice for the three product-policy questions from the original
  planning pass.
