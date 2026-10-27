# Evidence and Coverage Honesty Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Findings are evidence-backed, confidence is separate from severity, and absence of findings is never reported as a pass
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Verdicts and findings

- [x] CHK001 NO_ISSUE_DETECTED is always rendered with the executed-check statement and never as 'secure' or a bare PASS — _FR-137_
- [x] CHK002 Confidence (CONFIRMED/LIKELY/CONFIG_RISK/INFORMATIONAL) is separate from severity; LIKELY <= HIGH; CVSS only when determinable — _FR-138_
- [x] CHK003 Only four finding verdicts materialize Findings; a weak signal never exceeds LIKELY — _FR-139_
- [x] CHK004 CONFIRMED requires a confirmable check and a fixture-confined oracle, never status code or AI — _FR-140_
- [x] CHK005 AI explains only; module-level ban on AI-originated findings; closed AI input schema — _FR-144/165_
- [x] CHK006 Fingerprints exclude volatile data; rootCauseGroup dedupe uses a canonical checkId — _FR-141_

## Coverage

- [x] CHK007 Coverage distinguishes seven states and never turns absence of findings into a pass — _FR-143_
- [x] CHK008 A DEGRADED SECURITY result is never COMPLETE and carries a persisted coverageComplete marker read by every consumer; a consumer audit exists — _FR-186; T577_
- [x] CHK009 NOT_APPLICABLE (null) only when nothing was measured; the repository scoring rule is respected — _FR-142; L41_
- [x] CHK010 Every requested check yields a verdict; the sweep never leaves a silent gap — _registry contract_
- [x] CHK011 P13 policy: observed score preserved; readiness PASS prohibited while required security coverage is incomplete; enumerated consumers apply the gate — _FR-188_
- [x] CHK012 Compatibility impact on the existing readiness contract is stated as strictly additive, with no SPEC 014 or frozen-document edit — _FR-188; AR-16_
- [x] CHK013 A single writer owns ModuleResult(SECURITY): legacy persist is guarded and the 012 finalizer is last — _FR-196_
- [x] CHK014 Root-cause group findings materialize once through a deterministic group barrier — _FR-141_
- [x] CHK015 Partial billing: only executed billable work is charged; active/authenticated work is not purchasable until F06 defines the refund rule — _FR-189; AR-15_

## Evidence

- [x] CHK016 Evidence stores shapes, classes and redacted excerpts only; no raw credentials, tokens, bodies or records — _FR-130/131_
- [x] CHK017 Value-aware redaction is not name-based only; names are values; cost is bounded — _FR-128/174_
- [x] CHK018 Unit-produced writes are fenced; residual manifests are written by the parent finalizer — _FR-058/162_
- [x] CHK019 Issue.location is a canonical METHOD+URL template bound to a concrete destination at reverify — _FR-145/163_
- [x] CHK020 Reverify is fresh, minimal, freshly authorized and honest (INCONCLUSIVE when it cannot run) — _FR-151/153_

## Open

- [ ] CHK021 Independent re-review confirms WEAK/GAP scenarios are now ADEQUATE — _OPEN — NOT YET: re-review found 19 WEAK + 1 GAP remaining (adversarial-rereview.md); not self-assessed_ **Class: independent-certification gate (closes with CHK039).**
- [ ] CHK022 Second independent review confirms the partial-coverage and readiness mechanisms are effective — _OPEN — pending; not self-certified_ **Class: independent-certification gate (closes with CHK039).**

## Third repair pass (2026-10-14; author-checked planning text only, independent review pending)

- [x] CHK023 Live progress events carry `coverageComplete`/`observedScore` and are emitted only after the finalizer commit; the web progress view never shows a secure/pass state for incomplete coverage — _FR-188, T766_
- [x] CHK024 The single-writer design uses only Prisma-expressible operations (empty-update upsert/createMany plus guarded updateMany; a locked finalizer transaction) — _FR-196, T764_
- [x] CHK025 REVERIFY group barriers await only scheduled members; READ_ONLY declarations are labelled customer-asserted and unverified without a marker — _FR-141, FR-192, T690, T700_

## Fourth repair pass (2026-10-15; author-checked planning text only, independent re-review pending)

- [x] CHK026 All legacy SECURITY writes (ModuleResult, Issue, CapabilityExecution) pass one guarded transaction; late writes are dropped and audited; the `FAILED` state is used consistently with FR-142 — _FR-196, FR-142, T764, T765_

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
