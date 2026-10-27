# Upstream Integration Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: SPEC 012 consumes the frozen 007/008/009/010/011 contracts without a second scheduler, store, ledger or kill switch
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Frozen contracts

- [x] CHK001 No second scheduler, graph, evidence store, finding engine, authorization service, budget ledger, kill switch or scan-evidence artifact pipeline — _plan Summary; FR-002_
- [x] CHK002 F07 is authoritative for request count, concurrency and duration; every other limit is labeled LOCAL — _FR-069/070_
- [x] CHK003 Checkpoint consumption patterns are consistent across contracts — _patterns seen {('false', 'true'): 2, ('false', 'false'): 7, ('true', 'false'): 4}_
- [x] CHK004 Only existing execution classes and the 009 queue names are used — _Clarifications_
- [x] CHK005 Queue payload is exactly {executionUnitId} — _contracts_
- [x] CHK006 009 U-1 obligations are declared for both engines (onUnitExpired, hardStopMarginMs, backstop, fenced writer, module-result finalizer) — _FR-052/058/061_
- [x] CHK007 Unit timing arithmetic matches the U-1 formula (E14 720000, E15 1020000, critical path 2940000) — _plan; analyze M9_
- [x] CHK008 010 is reused only through BROWSER units, unauthenticated and non-mutating; no duplicate browser runtime — _FR-085/048_
- [x] CHK009 011 SOURCE_SURFACE, DEPENDENCY, CODE_FLOW and RouteIdentity (grammar v1) are consumed by name; 012 never acquires source or runs customer code — _FR-156/068_
- [x] CHK010 013/014 handoff identifiers and ownership are defined without preempting them — _FR-157_

## Governance

- [x] CHK011 Every upstream gap is recorded with a classification; none is REQUIRED — _upstream-amendment-requests.md_
- [x] CHK012 Existing capabilities are classified REUSE/EXTEND/REPLACE/DEPRECATE/NEW/OUT OF SCOPE with a migration map — _plan_
- [x] CHK013 Activation gates SG1-SG10 are enumerated and fail closed; flags are default-off and independent — _plan_
- [x] CHK014 The Constitution check covers Principles I-XIV that 012 implicates and the Principle XIV class fills — _plan_
- [x] CHK015 The adversarial review exists with 50 required + additional scenarios and a recorded disposition — _adversarial-review.md_
- [x] CHK016 Amendment requests AR-1..AR-17 are recorded (AR-17 = ADR-005 billing conflict, controlled amendment request, billing disabled); AR-3 is closed by the owner; none is BLOCKING; AR-13 is REQUIRED FOR ACTIVATION (FR-201), AR-15 RECOMMENDED, AR-14 OPTIONAL, AR-16 a note — _upstream-amendment-requests.md_
- [x] CHK017 The SECURITY plan resolver is placed in apps/api, consistent with SPEC 009's Plan Resolver placement; the worker holds no signing key — _plan; scope contract_
- [x] CHK018 Readiness gating is additive over the existing readiness contract and requires no frozen-document edit — _FR-188; AR-16_
- [x] CHK019 Mermaid diagrams D1-D16 present with the updated D2 (signing authority), D7 (permit gate), D15 (address binding), D16 (readiness gating) — _plan_

## Open

- [ ] CHK020 009 U-1 text is committed to the repository (provenance; AR-8) — _OPEN — U-1 edits are uncommitted working-tree changes_ **Class: owner decision (AR-8: commit or confirm 009 U-1).**
- [ ] CHK021 SPEC 011 is committed to the repository (provenance; AR-9) — _OPEN — specs/011 is untracked_ **Class: owner decision (AR-9: commit or confirm SPEC 011).**
- [ ] CHK022 The user's SPEC 009/011 provenance is confirmed before freeze — _OPEN — closure task T521_ **Class: owner decision (provenance confirmation, T521).**

## Third repair pass (2026-10-14; author-checked planning text only, independent review pending)

- [x] CHK030 The ADR-005 conflict is recorded as controlled amendment request AR-17 and no frozen 006-011 document is edited — _AR-17_
- [x] CHK031 AR-18 lists the four 009 wording ambiguities (`ADMITTED` timing, `DISPATCHED` meaning, pre-run `KILLED`, `PLANNED/DISPATCHED->REFUSED` labels and the "never admitted" finalize wording; items 5 and 6 are CHK033) and states why no 012 repair needs a new status or edge — _AR-18_
- [ ] CHK032 The generated `ExecutionUnitTransitionPolicy` equals the 009 implementation's table and 008 provides the transactional, unit-keyed, holder-token-free lease release of data-model 4.10C (or the AR-13 alternative is agreed) so it can run inside the finalizing transaction — _OPEN — upstream capability and implementation evidence; gate SG1 (T835)_ **Class: upstream amendment dependency (AR-19, AR-18 items 5 and 6) and activation gate SG1.**
- [x] CHK033 AR-18 records six items (the four 009 wording ambiguities, the 009 single-authority rule versus the 012 database entry points, and the 008 transactional lease-release surface of data-model 4.10C); each is recorded as a clarification request, none is approved or implemented, and no frozen text is edited — _AR-18, 4.10C, T835_
- [ ] CHK034 Owner decision OD-4 (worker isolation mode: Mode S tenant-scoped principals with per-tenant routing, or Mode P shared pool with rule CS1 and SG10 review) is made — _OPEN — owner decision; default Mode P is the only planned mode (FR-173, plan.md OD-4)_ **Class: owner decision (OD-4 isolation mode).**
- [x] CHK035 AR-19 (008 transactional admission and release surface, required for activation), AR-20 (per-tenant job routing, only for Mode S) and AR-21 (non-012 class writes, recommended) are recorded as unapproved requests with the exact required behavior, and no frozen text is edited — _AR-19, AR-20, AR-21, data-model 4.10C_

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
