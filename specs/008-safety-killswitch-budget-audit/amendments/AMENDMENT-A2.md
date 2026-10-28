# SPEC 008 Amendment A2 — contract changes made by the independent final audit (2026-10-29)

**Provenance**: engineering decisions made under the owner's standing delegation of technical decisions for SPEC 008, found by
a requirement-by-requirement review of `spec.md` against the implementation. Not owner answers. Frozen files are unchanged;
A1 and F-02 §13 remain in force except where this amendment says otherwise. Migration:
`20261029000000_safety_audit_context_and_lease_exclusivity` (rollback: `ROLLBACK-M008B.sql`).

| # | Change | Reason (spec) | Where |
|---|---|---|---|
| A2-1 | **One live lease per execution unit.** A second `requestAdmission` that consumes concurrency for an `executionId` already holding an unreleased, unreclaimed, **unexpired** lease under a different idempotency key is refused with the new reason `EXECUTION_ALREADY_LEASED`. A replay with the original key still returns the original lease. After release, expiry or reclaim the unit may be re-acquired (the old holder is then fenced). | FR-015 ("a new worker picking up the same execution-unit identity while the original is still alive" MUST be refused) and `data-model.md` ("one held unit … for one execution unit") | `f07_admit` (+ per-unit advisory lock, level 1 of the lock order) |
| A2-2 | **Lease renewal never outlives its grant.** `f07_renew_lease` returns `GRANT_INVALID` (`REVOKED`/`EXPIRED`) for a revoked or expired grant; `safetyCheckpoint` re-runs `isAuthorized` on every call, including with a held lease (stop check first, then authorization, then renewal). | FR-016a, FR-018 order | SQL + `checkpoint.ts` |
| A2-3 | **`STATE_UNCERTAIN`.** Any failure to read safety state at a checkpoint (renewal, authorization re-check, admission internal error) aborts the controller and returns `STOP` with reason `STATE_UNCERTAIN`, distinct from `KILL_SWITCH_PENDING` and `LEASE_FENCED`. | FR-021 | `checkpoint.ts`, `renewLease` (`UNCERTAIN`) |
| A2-4 | **An environment refusal at a checkpoint is persisted as an `EXECUTION`-scope SYSTEM stop** (`ENVIRONMENT_RECLASSIFIED`), so reverting the classification never resumes the unit. | FR-016 | `checkpoint.ts` |
| A2-5 | **Environment is re-verified inside `f07_admit` under the locks** (the one mutable authorization input). | FR-001 | `f07_admit` |
| A2-6 | **Audit rows carry context.** `scopeId` and `environmentAtEvent` are derived by the database from the grant; the execution class is stored on `AdmissionLease.executionClass` and carried on release/reclaim events; `f07_record_audit_ts` derives the same when the caller supplies a grant. | FR-020 | `f07_audit`, `f07_record_audit_ts`, column |
| A2-7 | **Previously silent admission refusals are audited** (`NO_MATCHING_GRANT` for a grant not belonging to the target, a scan or execution id belonging to another tenant, `EXECUTION_ALREADY_LEASED`, environment). Refusals that roll back (`INTERNAL_ERROR`) and a target that does not exist remain unaudited by construction. | FR-022/FR-023 | `f07_admit` |
| A2-8 | **Execution-audit retention.** Events follow the tenant's current effective plan `retentionDays` (same rule as report data); unowned/orphan events follow the longest plan retention. Done by `f07_purge_execution_audit`, `f07_purge_unowned_execution_audit`, `f07_audit_owner_ids` (EXECUTE: `fahes_orchestrator` only) called from the `safety-sweep` job at most hourly; a retention failure is logged and **never** fails or starves lease reclaim/stop reconciliation. | FR-024 + Clarifications 2026-10-07 | `retention.ts`, `safety-lease-sweep.ts` |

Not changed: lock order (DEC-050) — the new per-unit key is a level-1 lock taken by `f07_admit` only, never while holding a lower level;
all privileges in F-02 §4 except the three retention functions (orchestrator only).
