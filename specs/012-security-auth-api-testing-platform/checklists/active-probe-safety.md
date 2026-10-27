# Active Probe Safety Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Active probes are bounded, harmless, authorized per request, budgeted before sending and cannot loop, extract data or reach prohibited destinations
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Probe content

- [x] CHK001 Probes are versioned data from a closed harmless alphabet; no corpus, no runtime download, no runtime-evaluated code — _FR-066/105_
- [x] CHK002 No exploit payload string appears anywhere in the package — _regex scan_
- [x] CHK003 Command, template, path-traversal, deserialization and NoSQL active probes are UNSUPPORTED in v1 — _FR-106 (v1 scope clause)_
- [x] CHK004 Weak signals are never confirmed: ladder, confirmationLimitation, INCONCLUSIVE for generic errors — _FR-106_
- [x] CHK005 Fuzzing, race flooding, active rate-limit probing, OAST and brute force are unsupported — _FR-087/103/118_

## Per-request controls

- [x] CHK006 The per-request pipeline order is fixed: scope gate, local budget, checkpoint, intent, send with AbortSignal, bounded read, redact-claim-write — _FR-055_
- [x] CHK007 Local budgets are enforced before sending with atomic reserve; retries consume budget — _FR-070/071_
- [x] CHK008 Retries default to attempts:1; non-idempotent retries are forbidden — _FR-057_
- [x] CHK009 Rate pacing, 429 pause and lockout stop are specified — _FR-073/074_
- [x] CHK010 Workflows are finite (<= 25 steps) with no unbounded loop — _FR-075_
- [x] CHK011 Each checkpoint call has its own deterministic idempotency key so F07 budget decrements per request — _FR-072_
- [x] CHK012 All traffic goes through SecurityHttpClient on safe-net; no second HTTP stack or global fetch — _FR-054_
- [x] CHK013 Decoded size, ratio, JSON depth and key-count are capped — _FR-070_

## Containment

- [x] CHK014 The engine child has restricted egress, orphan-exit, closed-schema IPC and parent-observed exit — _FR-175_
- [x] CHK015 Real TLS inspection is deferred and reported UNSUPPORTED/NOT_TESTED rather than faked — _FR-109; T129_
- [x] CHK016 All hostile-text processing runs in a terminable worker-thread executor in both child and parent — _FR-174_
- [x] CHK017 The child has no network path; it sends only step reference frames (`stepId` + slot values) that the parent resolves to an immutable plan step, admits, renders, serializes (HTTP/1.1, one request per connection) and sends over a fully validated, SPKI-pinned, address-pinned connection with an internal single-use permit — _FR-175, FR-199_
- [x] CHK018 A fail-closed matrix lists every dependency of permit minting (clock, consent, registry, budget, F07, address pin, broker, ledger, MAC) with its closed reason — _FR-190_
- [x] CHK019 Unit host ownership uses a never-stale-reclaimed claim and the finalize guard; grant consistency is per class — _FR-195_

## Open

- [ ] CHK020 The SecurityHttpClient safe-net door (multi-value headers, timing, no auto cross-origin redirect, credential stripping) is implemented and the SSRF adverse suite is green — _OPEN — implementation; gate SG5_ **Class: implementation task plus activation gate SG5 (T750-series).**
- [ ] CHK021 The step-frame egress-gate feasibility spike (T650) has produced a decision record — _OPEN — mandatory before SG5; not yet performed_ **Class: activation-only gate (T650).**

## Third repair pass (2026-10-14; author-checked planning text only, independent review pending)

- [x] CHK022 Admission order puts every side-effect-free read before reservations and the F07 consume last, with a fixture proving F07 consumption is unchanged when a Phase A/B step fails — _FR-190, T663_
- [x] CHK023 The gate generates all HTTP framing; forbidden headers, CONNECT/TRACE, CR/LF/NUL and non-admitted host:port are refused; TLS is never relaxed (code-search test) — _FR-199, T651, T754_
- [ ] CHK024 The Destination Authorization Policy (P16) is approved and an operator enablement process exists — _OPEN — owner decision; until then every destination is refused_ **Class: owner decision (P16).**
- [x] CHK025 No document claims that address or HTTP-file proofs establish ownership of an upstream origin; the forwarder limitation is stated as a security limitation with a policy, not a footnote — _FR-172, FR-197_

## Fourth repair pass (2026-10-15; author-checked planning text only, independent re-review pending)

- [x] CHK026 Every request is bound to an immutable parent-held plan step; the child names only `stepId` and typed slot values and cannot choose method, URL, headers, body, category, identity, fixture or authorization context — _FR-200, T790-T793_
- [x] CHK027 Post-C1 failures (C2-C4) are an accounted, audited, non-retried loss and the claim/reservations are released before C1 — _FR-190, T663, T664_
- [x] CHK028 Plain-HTTP targets and non-default ports are refused; proof requests carry cache-busting and refuse cache indicators; the gate sends the path byte-exact and refuses ambiguous paths — _FR-172, FR-199, T530, T651_

## Fifth targeted repair (2026-10-15; author-checked planning text only, independent confirmation pending)

- [x] CHK029 The unit input manifest (kinds, canonical digest, tenant/target binding, `inputsRootDigest` in the MAC tuple) is defined and content digests are verified over raw bytes before any parser; evidence produced during the plan is never an input — _FR-200, FR-173, T810, T811_
- [x] CHK030 `PlanStepTable` has a concrete schema (step identity, ordering, successors, check/target/category/identity, slots, replay controls) and a once-only recorded `tableDigest` — _FR-200, data-model 4.9L_
- [x] CHK031 `RESPONSE_DERIVED` values and redirects have parent-side provenance (exact prior step, identity, destination, attempt, age, consume limit); redirects follow only planned steps; provenance loss fails safe without sending — _FR-200, T812, T813_
- [x] CHK032 Dispatch order follows 009 steps 0-5 with no new status or edge; claim changes no status; broker lease after `RUNNING`; a checkpoint STOP or any pre-run refusal is `REFUSED` through a finalize-equivalent using only edges in the 009 table (never a pre-run `KILLED`, never a bare CAS) — _FR-195, FR-201, T814, T815, T822, T823_
- [x] CHK033 A redirect is followed only through a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation with closed typed path shapes (UUID, UINT, HEX, ENUM), byte-exact matching and fixed literal segments; there is no redirect slot; a hostile `Location`, encoded path, cross-identity value or undeclared operation is not followed; a hop is fully re-admitted — _FR-200(e), FR-192, T820, T821_
- [x] CHK034 The renderer reads only the verified manifest; every manifest kind (including `TEST_ROLE`) has declared canonical columns; `inputsRootDigest` is the only input member of the MAC tuple — _FR-200(a), data-model 4.9L, T826, T827_
- [x] CHK035 Every pre-run refusal (U-1 step 0 through `sec_refuse_unclaimed_unit`; guards, input mismatch, checkpoint STOP and VAB/DAP refusal through `sec_finalize_unit` as claim owner) runs the shared finalize body with lease release, dependent `BLOCKED` propagation, final snapshot, audit, idempotency and claim fencing in one transaction — _FR-195, FR-201(c), T822, T823_
- [x] CHK036 No refusal path accepts a caller-chosen status or an unverifiable reason without a claim: `sec_refuse_unclaimed_unit` is `PLANNED`-only, class-scoped and limited to the four database-verified tier-U reasons, every other refusal needs the claim, the sweep takes no caller outcome and no worker can execute it, and the closed reason matrix has a predicate or an explicit host-asserted label per row — _FR-195, FR-201(c)(d)(i), data-model 4.10B, T829, T830_
- [x] CHK037 The `PlanStepTable` slot schema separates `type` (origin), `position.kind` (where), `shape` (validation) and `source` (provenance); hop path and query substitutions use closed shapes cut by the parent from the retained `Location` (`HOP_MATCHED`), the query must equal the template, and a customer-asserted `READ_ONLY` declaration is never described as proof of a non-mutating endpoint — _FR-200(b)(d)(e), data-model 4.9L, T831, T832_
- [x] CHK038 No response-derived value can carry an object identifier: `RESPONSE_DERIVED` is a token slot (`tokenClass` required, never a path position) and a redirect `Location` can only select among plan-known identifiers (`HOP_MATCHED` with a mandatory `values[]`), consistent with FR-092 and the identifier invariants of the test-identity, authorization, mutation and workflow contracts — _FR-092, FR-200(d)(e), T839, T840_
- [x] CHK039 The per-fixture mutation cap is atomic across sibling units (unique `mutationOrdinal`, 1..3), not a count-then-insert, and the write-ahead order is PROCEED, `INTENDED`, `SENT`, send in every document — _FR-120, FR-125, FR-190, T843, T844, T845_

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
