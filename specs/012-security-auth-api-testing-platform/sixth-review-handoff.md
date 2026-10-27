# SPEC 012 — Handoff to the Sixth Independent Certification Review

> **Superseded in part by `seventh-repair-matrix.md` (2026-10-16)**: counts are now 491 tasks (Phase 22), 214 checklist items (191 checked, 23 open) and AR-18 lists six items; finalization has one internal body with three entry points (`sec_finalize_unit` for the claim owner only, `sec_refuse_unclaimed_unit`, the orchestrator-only `sec_sweep_finalize_unit`); R7 is a tenant quota; the broker signature is `issueCredentialLease(executionUnitId, purpose, attempt, testIdentityId)`. Statements below that conflict with the seventh matrix are historical.

**Date**: 2026-10-15 · Prepared by the repair author. **Not a review; no certification.** The reviewer must be independent of the repair author and of the fifth reviewer's session, read-only, and re-derive every check. Treat `sixth-repair-matrix.md`, `sixth-semantic-audit.md` and every checklist mark as claims.

## Scope

Confirm N5-1 … N5-9, the A1 residuals and AR-18 as listed in `sixth-repair-matrix.md`, then repeat a contradiction sweep over the whole normative package. Do not reopen findings earlier reviews rated ADEQUATE without new evidence.

## Targets and attacks to attempt

1. **Redirect and path authority** (FR-200 d/e, data-model 4.9L, T820/T821): any remaining text that lets a `Location`, a child frame or a slot choose a path outside a planned, `READ_ONLY`-declared hop; shapes that can spell a word; operations that bypass `operationRef`; re-admission gaps after substitution.
2. **Lifecycle** (FR-195, FR-201 c/d, active-security dispatch, AR-18, T814/T815/T822/T823) against `specs/009-*` `plan.md` lifecycle diagram, `execution-runtime-contract.md`, `runtime-finalization-contract.md`, `scan-deadline-contract.md` matrix: any edge used that 009 lacks; any terminal status written without finalize semantics; atomicity claims about 008 lease release; `sec_finalize_unit` authority and the claim race; the `DISPATCHED` pickup path.
3. **Broker** (FR-032, FR-173, FR-201, broker body item 2 and item 7, T056, T784/T785, T816/T817, T824/T825): `RUNNING`-only everywhere, registration atomicity, class scoping honesty, durable streak under two replicas, R6 floor, lock-order deadlocks.
4. **Inputs** (FR-200a, 4.9L, T810/T811/T826/T827): per-kind canonical columns versus the actual models (`TestRole`, `TestIdentity`, `FixtureResource`, `ApiOperationDeclaration`, `SecurityConfigVersion`), anything the renderer could read outside the manifest.
5. **Consistency**: re-run the semantic greps in `sixth-semantic-audit.md` §5, read contract bodies (not only consolidated sections), and compare the mutation vocabulary (`state` + `cleanupState`) across plan D8, data-model 4.8/7.6, FR-120, T300 and contracts.

## Mechanical checks the author ran (re-run; do not trust)

201 FRs contiguous; 483 unique task rows; 0 FRs without a task and 0 tasks without an FR; traceability table 201 rows regenerated from the task lines, 0 mismatches; 83 registered reason codes, all present in a contract, 0 unregistered tokens; 20 Prisma models; one M012-7 row; 19 mermaid blocks with 0 structural problems; 209 checklist items (187 checked, 22 open); AR-1 … AR-18 in the summary table. **SpecKit Analyze was not run** (`.specify/feature.json` points at SPEC 011); the checks above come from an author scratch script.

## Not executed / still open

Any implementation, migration, probe, planned test, T650, SpecKit Analyze, any independent review.

Owner decisions pending: P4, P5, P6, P8, P9, P12, P14, P16, P17, P18 (P11 deferred), OD-1, OD-2, OD-3 (the plan now states that `AREA_COUNT` conflicts with the approved P15 principle for partially covered passive security work; both options are preserved). Upstream: AR-13 (required for activation), AR-15, AR-17, AR-18 (four ambiguities, activation-time clarification), AR-8/AR-9 provenance (commit or confirm 009 U-1 and 011). Activation gates: SG1 transition-policy equality and 008 lease release inside the finalizing transaction, SG3 threshold calibration (CHK038), T650, F06.

## Required reviewer output

Re-rate N5-1 … N5-9, the A1 residuals and AR-18 (ADEQUATE / WEAK / GAP) with file and line evidence, list new findings by severity, state whether AR-18 may stay an activation-time clarification, and end with exactly one verdict line of the reviewer's choosing.
