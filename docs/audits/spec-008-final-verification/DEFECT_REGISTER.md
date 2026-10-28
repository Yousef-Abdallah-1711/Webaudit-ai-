# Defect register

Severity: CRITICAL / HIGH / MEDIUM / LOW. "Fixed" means fixed **and** covered by a regression test that failed (or could not run) against the old behaviour.

## Found by this independent audit — fixed
| ID | Sev | Requirement | Reproduction (old behaviour) | Root cause | Fix | Regression test | Status |
|---|---|---|---|---|---|---|---|
| D-A | **HIGH** | FR-016a | renew a lease after its grant's `expiresAt` → `RENEWED`; an execution could run indefinitely past its authorization | `f07_renew_lease` checked only token, stop rows and lease expiry; the lease-path checkpoint skipped `isAuthorized` | renew refuses revoked/expired grants (`GRANT_INVALID`); checkpoint re-authorizes on every call | `REM D-A` (3) | **Fixed** |
| D-C | **MEDIUM-HIGH** | FR-015 | second worker acquires a lease for a live execution id under a new idempotency key → both hold leases | frozen unique key is per `(grant,key)`; nothing tied a lease to its unit | one live lease per unit (per-unit advisory lock + refusal `EXECUTION_ALREADY_LEASED`) | `REM D-C` (5) | **Fixed** |
| D-I | MEDIUM | FR-001 | environment reclassified between the caller's `isAuthorized` read and the locked section is not re-checked | environment (the only mutable authz input) was read only in TypeScript | `f07_admit` re-verifies classification under the locks | `REM D-I` (2) | **Fixed** |
| D-B | MEDIUM | FR-021 | a failed lease-renewal read was reported as `LEASE_FENCED` | failure swallowed into the fenced path | `UNCERTAIN` → checkpoint `STATE_UNCERTAIN` | `REM D-B` (3) | **Fixed** |
| D-D | MEDIUM | FR-016 | environment refusal at a checkpoint stopped only that call; reverting the classification let the unit continue | refusal not persisted as a stop | checkpoint persists an `EXECUTION` SYSTEM stop | `REM D-D` | **Fixed** |
| D-E | MEDIUM | FR-020 | audit rows had NULL `scopeId`, `environmentAtEvent`, `executionClass` | the SQL audit helper took none of them | DB derives scope/environment from the grant; class stored on the lease | `REM D-E` (2) | **Fixed** |
| D-G | MEDIUM | FR-024 | no retention for `ExecutionAuditEvent` | not implemented | plan-based purge functions + hourly sweep step | `REM D-G` (3) | **Fixed** |
| D-F | LOW | FR-023 | `NO_MATCHING_GRANT`, cross-tenant id and similar refusals wrote no event | early returns before the audit call | audited (target known) | `REM D-F` | **Fixed** |
| D-H | MEDIUM | robustness | `resolveEffectivePlan` throwing (missing plan data) made the whole `safety-sweep` job fail every minute | retention step shared the safety job's failure path | retention failure is caught/logged, retried hourly; reclaim/reconcile always run | `SWEEP D-H`; observed live in the QA worker log | **Fixed** |
| D-K | LOW (process) | evidence | `ROLLBACK-M008.sql` removed only migration A's history row, so a re-`deploy` skipped B | script predated B | removes both rows; B has its own tested rollback | exercised ~10× + `MIGRATION_VERIFICATION.md` | **Fixed** |
| D-L | LOW | e2e | `admin/plan-and-credit-journey.spec.ts:69` strict-mode violation ("Plan credits" is both a column header and a `<dt>`); the assertion was also vacuous because the header is always visible | selector ambiguity (not an a11y/product bug) | assert the detail panel's `term` | the spec itself (passes; also in the full run) | **Fixed** |

## Observed, accepted or open
| ID | Sev | Description | Status / reason |
|---|---|---|---|
| D-1 | **HIGH (product)** | Browser-dependent capabilities report `succeeded=true` and Performance shows COMPLETE/93 with the scan charged in full, with no browser pool wired. **Re-reproduced in real Chrome run M8.2** (cwv-analyzer succeeded, 0 findings; Performance COMPLETE 93; charged 80). | **Open.** Outside SPEC 008. Needs the owner's browser-pool transport decision and the DEC-061 / DEC-032 billing semantics; no credit policy invented. |
| D-J | LOW | One hot grant plateaus at ~105–113 admit+release/s; at 40 concurrent callers 6 admissions fail closed on the 3 s lock timeout. | **Accepted** — designed fail-closed (FR-005); callers retry with the same key (FI S4). Revisit with real engine load. |
| D-M | MEDIUM (operational) | The shared dev API/worker still connect as the superuser, so SPEC 008 role isolation is not in force there; production role provisioning (EV-07) unknown. | **Open (operational).** Not changed: shared credentials are out of scope. Proven on an isolated non-superuser stack. |
| D-N | LOW | Migration B not applied to the owner's `webaudit` database. | **Resolved**: applied with `migrate deploy` after a `pg_dump` backup; User 86 / Scan 243 / CreditTransaction 267 identical before and after; 23 functions, `f07_admit` 8 args. |
| FR-014 | spec-named | Forcible OS-process termination is not connected to a real sandbox child (F04 dependency). | **Accepted (partial)**. |
| FR-022 | LOW | Admission refusals that roll back (`INTERNAL_ERROR`) or concern a non-existent target are not audited. | **Accepted** — cannot be durably written (FR-021). |
| ENV | LOW | "ETIMEDOUT" ioredis noise during e2e runs from a component dialing a non-listening address; tests still pass. | Observed, not investigated (pre-existing). |
| COV | LOW | Instrumented code coverage not measured (no provider installed; `c8` produced no mappable output). | Open — see `COVERAGE_REPORT.md`. |
