# Database and role verification

## Role inventory (created by migration A; cluster-level, `NOLOGIN`, no passwords, no credentials in the repo)
`fahes_owner` (owns the 5 tables and every `f07_*` function) · `fahes_api` · `fahes_worker_exec` · `fahes_orchestrator` · `fahes_operator`.
Verified `rolsuper = false`, `rolbypassrls = false`, and that no runtime role is a member of `fahes_owner`.

## Privilege matrix (asserted in both directions by `safety-role-isolation.test.ts`, 116 tests, real logins `zz_t_f07_*`)
| Function | api | worker_exec | orchestrator | operator |
|---|---|---|---|---|
| `f07_admit` | ✔ | ✘ | ✘ | ✘ |
| `f07_renew_lease`, `f07_release_lease_by_token` (holder-token bound) | ✔ | ✔ | ✘ | ✘ |
| `f07_trigger_stop` | ✔ | ✘ | ✔ | ✔ |
| `f07_stop_pending` | ✔ | ✔ | ✔ | ✔ |
| `f07_budget_snapshot`, `f07_record_audit_ts` | ✔ | ✘ | ✘ / ✔ (audit_ts) | ✘ |
| `f07_ack_stop`, `f07_record_stopped`, `f07_mark_escalated` | ✘ | ✔ | ack/stopped ✔ | ✘ |
| `f07_release_leases_by_execution`, `f07_ack_stop_by_authority`, `f07_reclaim_expired_leases`, `f07_reconcile_stranded_stops` | ✘ | ✘ | ✔ | ✘ |
| `f07_audit_owner_ids`, `f07_purge_execution_audit`, `f07_purge_unowned_execution_audit` (B) | ✘ | ✘ | ✔ | ✘ |
| internals `f07_lock_scope`, `f07_audit`, `f07_audit_scope`, `f07_scope_has_live_execution` | ✘ | ✘ | ✘ | ✘ |
Direct table DML/TRUNCATE on the five tables: denied to every runtime role; `SELECT` on `ExecutionAuditEvent` only for `fahes_api`; audit INSERT/UPDATE/DELETE denied to all.

## Other attacks attempted and refused (real PostgreSQL)
`SET ROLE fahes_owner` · `CREATE TABLE` in `public` · shadow temp tables + `SET LOCAL search_path = pg_temp, public` against `f07_budget_snapshot` and `f07_admit` (results unchanged — `SET search_path = pg_catalog, public, pg_temp` is pinned) ·
forged grant id for another tenant (`NO_MATCHING_GRANT`, no counter created) · foreign `scanId` / re-used `executionId` (refused, audited) · another tenant stopping a unit through a shared id (refused, uniform error) · direct `UPDATE` of audit rows (trigger) ·
direct `REQUESTED → STOPPED` write by a superuser (trigger).

## Is runtime role isolation a SPEC 008 requirement?
The spec's FRs do not mention database roles; the isolation comes from the owner-approved direction **DEC-044 (A)** and F-02. It is therefore a *delivered capability* (roles, grants, definer functions, negative tests), and **activating it in an environment** is an operational step.
- **Isolated stack (this audit): ACTIVE.** API ran as `rt_api` and worker as `rt_worker` (both `NOSUPERUSER`, no access to the five tables except via functions) against a dedicated Postgres: full scan journey, sweep reclaim/reconcile, 9 failure scenarios and a staged load all ran with **0 permission-denied lines**. Finding: the app logins needed explicit `GRANT … ON ALL TABLES` for the legacy tables (previously the app used the owner/superuser).
- **Shared dev stack: NOT ACTIVE** — still the superuser `webaudit`. Not changed (shared credentials were out of scope and must not be altered destructively). No production-grade isolation claim is made.
