# SPEC 012 — Handoff to the Independent Delta Review of the Seventh Repair

> **Superseded in part by `master-repair-matrix.md` (2026-10-16)**: current counts are 506 tasks (Phases 22 and 23), 220 checklist items (195 checked, 25 open) and the findings MA-01 to MA-16; the broker authorizes every worker-callable operation, `RESPONSE_DERIVED` is a token slot, vault writes go through `vault_*` functions, and the per-fixture mutation cap is atomic. Statements below that conflict with the master matrix are historical.

**Date**: 2026-10-16 · Prepared by the repair author. **Not a review; no certification.** SELF-REVIEW, NOT INDEPENDENT. The reviewer must be independent of the repair author (who also wrote the final certification review), read-only, and re-derive every check. Treat `seventh-repair-matrix.md` and every checklist mark as claims.

## Scope

Confirm F1–F3, L1–L5 and AR-18 items 5–6 as listed in `seventh-repair-matrix.md`, then run a contradiction sweep restricted to what the repair touched. Do not reopen findings earlier reviews rated ADEQUATE without new evidence.

## Attacks to attempt

1. **No-claim path** (FR-201(c)(ii), data-model 4.10B, T829/T830): find any caller-influenced input to `sec_refuse_unclaimed_unit` or `sec_finalize_unit` that selects a status, a reason outside the matrix, a tenant, a unit of another class, or a unit that is not `PLANNED`; any tier-U predicate that reads a table a worker role can write; any way a denied call still changes state or propagates `BLOCKED`; any worker-reachable path to the sweep; the claim-versus-refuse race; whether the host-asserted tier-C list is complete and honestly labelled; whether the claim-first guard order (FR-195 step 2a, E14 step 2-3, E15 step 1) leaves any unclaimed refusal that is not database-verifiable.
2. **Residual honesty** (FR-173, broker item 7, 4.10B): is the stated blast radius complete?
3. **Broker** (FR-031, FR-032, T056, T057, broker contract steps 1-3 and item 7): any remaining caller-supplied principal, any "holder token" or "fenced" assumption, R7 leakage into the breach streak, R6 or R1-R3 counts.
4. **Dependencies** (authorization-testing item 10, `T-AUTHZ-08`, T160, auth-workflow dependency rows): any remaining runtime use of `SKIPPED`; whether `baselineValid` gating is consistent with finalize step 5.
5. **Hop slots** (FR-200(b)(d)(e), data-model 4.9L, T831/T832): any slot `type`, `position.kind` or `shape` overlap left; any path or query value a `Location` can still choose outside a closed shape; any text that still calls a customer declaration proof.
6. **008/009 integration** (data-model 4.10C, AR-18 items 5-6, SG1, CHK032): is the required capability exact, and does any document still assume a TypeScript API joins the transaction?
7. **Traceability and counts**: re-run a range-aware validator (expand `FR-NNN..FR-MMM`), recompute 201 FRs, 491 tasks, 83 codes, 20 models, 19 diagrams, 214 checklist items (191 checked, 23 open).

## Mechanical checks the author ran (re-run; do not trust)

201 FRs; 491 task ids, none duplicated, 0 FRs without a task, 0 tasks without an FR; range-aware regeneration of the traceability table equals the table; 83 reason codes with 0 unregistered tokens; 20 models; 19 diagram blocks; 214 checklist items; stale-text greps listed in `seventh-repair-matrix.md` section 3; `git diff --stat -- specs/009-*` unchanged. **SpecKit Analyze was not run.**

## Not executed / still open

Any implementation, migration, probe, planned test, T650, SpecKit Analyze, any independent review.

Owner decisions pending: P4, P5, P6, P8, P9, P12, P14, P16, P17, P18 (P11 deferred), OD-1, OD-2, OD-3. Upstream: AR-8/AR-9 provenance; AR-13 (activation); AR-15, AR-17; AR-18 items 1-6 (clarification requests, none approved); the 008 transactional release capability (4.10C). Activation gates: see `seventh-repair-matrix.md` section 6.

## Required reviewer output

Re-rate F1–F3, L1–L5 and AR-18 items 5-6 (ADEQUATE / WEAK / GAP) with file and line evidence, list new findings by severity, state whether the residual blast radius is now fully and accurately documented, and end with exactly one verdict line of the reviewer's choosing.
