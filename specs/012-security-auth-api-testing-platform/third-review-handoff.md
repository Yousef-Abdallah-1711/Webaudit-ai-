# SPEC 012 — Handoff to an Independent Third Review

> **Superseded in part (2026-10-15)**: the fourth repair pass (`fourth-repair-matrix.md`) rewrote FR-172/173/175/189/190/191/196/198/199, amended FR-041/055/142, added FR-200/201 and changed the plan-fixture names to `PFnn`. Statements below about child-framed requests, local-only attempt counting, area-count/class settlement defaults and AR-13 as RECOMMENDED are historical.

**Date**: 2026-10-14 · **Prepared by**: the repair author. This document is **not** a review and carries **no certification**; the author did not and cannot act as the independent reviewer.

## Reviewer rules

1. **Strictly read-only.** Do not edit any file, run migrations, commit, push, deploy, freeze SPEC 012 or start SPEC 013. Do not use the author's session or scratch output as evidence; re-derive every check.
2. You must be a different session/agent from the repair author. Treat every statement in `third-repair-matrix.md` as a claim to attack, not a result.
3. Planning closure must not be read as runtime feasibility. T650 and the other gates below are unproven.

## Reading order

`third-repair-matrix.md` → `spec.md` (FR-172, 173, 175, 177, 186–193, 196–199) → `plan.md` (registry, E14/E15 fields, SG1/SG5/SG8, P16–P18, D7, D15) → `data-model.md` (4.9D–4.9H, V-17..V-19) → the consolidated section at the end of each of the 19 `contracts/*-contract.md` → `tasks.md` Phase 18 (T750–T770) and rewritten T161/T530/T531/T536/T537/T540/T541/T605/T606/T650–T664/T670/T671/T690/T700/T710 → `upstream-amendment-requests.md` (AR-13/14/15/17) → `research.md` R17–R18. Earlier review artifacts (`adversarial-review.md`, `adversarial-rereview.md`, `closure-review.md`, `repair-matrix.md`, `second-review-handoff.md`) are historical and keep their original wording.

## Challenges the reviewer must attempt (not exhaustive)

- **A. Address binding and forwarders.** Can any path downgrade probe traffic to HTTP, relax certificate validation, or substitute a customer attestation for a proof? Does any sentence imply HTTP-file or IP-literal proofs establish upstream-origin ownership? Is the port-80 unauthenticated channel's limitation stated and bounded? Is the DAP fail-closed default reachable in every path (plan resolution, dispatch, broker issue, Phase A2)?
- **B. Egress gate.** Construct a request the child could cause that the parent did not admit (header injection, path normalization differences, redirect, response splitting back into a later frame, connection reuse). Is "one request per connection" enforced by the gate and tested? Does anything still say the child holds or presents a permit?
- **C. Admission order.** Find a Phase A/B step that mutates budget, ledger or counters, or a fallible step between Phase C and the send. Is every reservation releasable and idempotent? Can a replayed F07 `GRANTED` bypass the kill-switch re-read?
- **D. Auth-attempt lifecycle.** Race `markAuthAttemptSent` against the release sweep and against restore; can an unsent attempt ever count as a failure, or a sent unresolved one be forgotten?
- **E. Billing.** Verify the settlement arithmetic with edge cases (planned weight 0, rounding, cancel mid-run, reverify, mixed scans, DEGRADED delivered) and that no path double-refunds with `refundForUndelivered`. Confirm active/authenticated billing really stays disabled and AR-17 is correctly classified.
- **F. Broker anomaly rules.** Try to stay under R1–R6 while attacking multiple tenants; assess the provisional thresholds, quarantine denial of service and the operator clearance path.
- **G. Coverage consumers.** Enumerate consumers of SECURITY scores/events not in the FR-188 list; verify the single-writer transaction is expressible and lock-safe; check REVERIFY barrier and READ_ONLY wording; check checkpoint-store outage and recovery state machine for a gap.
- **H. Contradiction sweep.** Independently search the whole package for contradictory normative statements (permit holders, proof semantics, attempt counting, per-request order, code/FR/decision counts, stale file paths).

## Mechanical checks the author actually executed (re-run them; do not trust)

Run from the session scratchpad scripts (author's own, Python): `analyze2.py` — FR numbering contiguous 1..199, 0 duplicates; 447 task rows, 0 FRs without a task, 0 tasks without an FR, trace table 199 rows 0 mismatched, 0 dangling task references; registry 83 unique codes, every code in ≥ 1 contract, 0 unregistered `SEC_*` tokens outside historical documents; stale-value greps clean except historical documents (`closure-review.md`) and wording that quotes a check name. `mermaid_lint.py` — 19 diagrams (16 in plan, 3 in data-model), 0 problems. `b_trace.py` — B-1..B-13 mapping intact (it does not cover Phase 18; the N2 mapping is `third-repair-matrix.md`). Checklist validation — 8 files, 183 items, no duplicate CHK ids; open items are decisions/reviews/implementation evidence. Semantic greps for superseded designs (`sharedEdgeAttestation`, `pendingReservation*`, child egress proxy, child-held permit, conditional-upsert update clause, 81/196 counts, P1–P14 lists) returned only quoted/historical or intentional text after the repairs.

**Not executed**: the SpecKit `analyze` command itself (the author ran the mechanical `analyze2.py` equivalent only); any implementation, migration, probe, network or KMS action; T650; any independent review.

## Pending owner decisions

P4, P5, P6, P8, P9, P12, P14; **P16** (DAP), **P17** (class-level settlement), **P18** (private-CA pin); P11 deferred. Approved and unchanged: P1, P2, P3, P7, P10/AR-3, P13, P15.

## Upstream amendment requirements

AR-13, AR-14, AR-15, **AR-17**. No frozen document edited. 009 U-1 and 011 are uncommitted (commit order when approved: 009 U-1, 011, then 012, explicit paths only — never `git add -A`; `showcase-*` directories are unrelated).

## Residual risks the reviewer should weigh

Undetectable tenant-controlled forwarder (policy only); unauthenticated port-80 proof channel; unproven gate feasibility (T650) and OS egress denial; provisional thresholds (anomaly, grace G, re-proof cadence); billing depends on F06 and an ADR-005 amendment; checkpoint-store selection (P11) open; a compromised worker can still obtain leases for MAC-valid dispatchable units within anomaly limits.

## Required reviewer output

Re-rate N2-1…N2-10 (RESOLVED / WEAK / OPEN), list new defects, and end with exactly one verdict line chosen by the reviewer.
