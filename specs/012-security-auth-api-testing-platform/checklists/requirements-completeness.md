# Requirements Completeness Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Requirements are numbered, traceable, testable, bounded and complete across spec, plan, data model, contracts and tasks
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Numbering and traceability

- [x] CHK001 Every functional requirement is numbered contiguously FR-001..FR-201 with no duplicates — _201 FRs (analyze2.py M1)_
- [x] CHK002 Every FR is cited by at least one task and every task cites at least one FR — _483 tasks; traceability regenerated untruncated, 0 mismatched rows (author scratch script)_
- [x] CHK003 Every FR is cited by at least one contract — _all 187 cited_
- [x] CHK004 The tasks.md traceability table equals a recomputation from the task lines — _verified by analyze2.py: 0 mismatched rows_
- [x] CHK005 No TBD/TODO/NEEDS CLARIFICATION placeholders remain in any 012 document — _grep over 26 documents_

## Acceptance and success criteria

- [x] CHK006 All 8 user stories carry an Independent Test and numbered Acceptance Scenarios — _8 scenario blocks_
- [x] CHK007 Success criteria SC-001..SC-006 are measurable and cite their evidence source
- [x] CHK008 Closed reason-code registry: one code per row, no free-text reasons — _81 codes_

## Contracts and entities

- [x] CHK009 All 19 contracts contain the mandated sections (ownership, consumers, inputs, outputs, operations, invariants, safety, failure states, idempotency, evidence, budgets, reverify, boundary rules, named limitations, FR traceability, acceptance tests) — _19/19 complete_
- [x] CHK010 Every contract names a real consumer (no contract without one)
- [x] CHK011 Both execution-class contract fills carry all 18 template fields, none TBD — _E14 18/18, E15 18/18_
- [x] CHK012 Every entity a contract names is defined in data-model.md — _11 tables_
- [x] CHK013 Each new table states tenant ownership, uniques, retention, deletion, concurrency, audit and encryption

## Decisions

- [x] CHK014 All provisional product decisions P1-P18 are enumerated with a conservative default
- [ ] CHK015 Independent re-review confirms the 44 WEAK and 9 GAP scenarios are resolved — _OPEN — re-review PERFORMED 2026-10-11 (adversarial-rereview.md): 33 ADEQUATE / 19 WEAK / 1 GAP, verdict READY-WITH-REPAIRS; must-fix list open; a second independent review is required after repairs_ **Class: independent-certification gate (superseded by CHK039; the reviews performed so far found the defects now repaired).**
- [x] CHK016 Owner approvals of 2026-10-11 are recorded as OWNER-APPROVED for P1, P2, P3, P7, P10/AR-3, P13 and P15, P11 is recorded as DEFERRED, and no other decision is marked approved — _plan Product decisions; spec Clarifications_
- [x] CHK017 Every blocker B-1..B-13 is in a repair matrix with root cause, trust boundary, mechanism, owner contract, fail-closed behavior, tests/tasks, FR mapping, residual risk and upstream compatibility — _repair-matrix.md_
- [ ] CHK018 Remaining provisional decisions are approved or amended: P4, P5, P6, P8, P9, P12, P14, P16 (fail-closed default refuse), P17 (proposed) and P18 (default unsupported) — _OPEN — no approval has been given or inferred; closure task T520_ **Class: owner decision (see final-owner-approval-package.md).**
- [ ] CHK019 A SECOND independent review (not the repair author) confirms B-1..B-13, the remaining 19 WEAK + 1 GAP scenarios and the absence of new regressions — _OPEN — handoff prepared (second-review-handoff.md); review not yet performed; the repair author does not self-certify_ **Class: independent-certification gate (superseded by CHK039).**

## Third repair pass (2026-10-14; author-checked planning text only, independent review pending)

- [x] CHK030 Execution-class-level billing defines units, allocation, rounding, refunds, idempotency and cancellation, keeps the credit ledger, and keeps active/authenticated billing disabled until F06 and AR-15/AR-17 — _FR-198, T762_
- [x] CHK031 Contracts carry one consolidated authoritative section each; no earlier addendum with a conflicting normative instruction remains — _contracts grep_
- [ ] CHK032 An independent reviewer (not the repair author) has re-rated the repairs — _OPEN — the independent third-pass review (2026-10-15) returned FAILED with F-01..F-22; the fourth repair pass applied them; a fresh independent re-review is required (fourth-review-handoff.md)_ **Class: independent-certification gate (superseded by CHK039).**

## Fourth repair pass (2026-10-15; author-checked planning text only, independent re-review pending)

- [x] CHK033 Billing defaults to today's `AREA_COUNT` semantics; P15 (approved principle) is distinguished from P17 (unapproved mechanism); AR-17 states the exact ADR-005 conflict and applies to every class under `CLASS_LEVEL` — _FR-189, FR-198, AR-17_

## Fifth targeted repair (2026-10-15; author-checked planning text only, independent confirmation pending)

- [x] CHK034 The owner decision register records the P15 conflict as two decision-ready options, `SecuritySettlement` retention and AR-13 scheduling without selecting or approving any — _plan.md Owner decision register_
- [x] CHK035 AR-18 records the four 009 status and finalization ambiguities and the amendment path; 012 adds no status or edge — _upstream-amendment-requests.md_
- [x] CHK036 No normative text still carries the superseded `REDIRECT_LOCATION` slot, a broker acceptance of `DISPATCHED`, a pre-run `KILLED` edge, a bare-CAS pre-run refusal, "R1-R6" where R7 applies, or "P13 PROVISIONAL" — _semantic grep in sixth-semantic-audit.md_
- [ ] CHK037 The sixth repair is confirmed by a reviewer independent of the repair author — _OPEN — independent review pending (sixth-review-handoff.md)_ **Class: independent-certification gate (superseded by CHK039).**
- [ ] CHK038 The seventh repair (final-findings F1-F3, L1-L5, AR-18 items 5 and 6) is confirmed by a reviewer independent of the repair author — _OPEN — independent delta review pending (seventh-review-handoff.md)_ **Class: independent-certification gate (superseded by CHK039).**
- [ ] CHK039 The master audit repair (MA-01 to MA-19, `master-repair-matrix.md`) and the certification-finding repair (IC-1 to IC-7, `final-certification-repair.md`) are confirmed by a reviewer independent of the repair author — _OPEN — independent certification pending (master-independent-review-handoff.md)_ **Class: independent-certification gate.**

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
