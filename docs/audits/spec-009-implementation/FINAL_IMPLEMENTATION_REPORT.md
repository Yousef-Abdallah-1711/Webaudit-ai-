# SPEC 009 — implementation report (2026-10-29)

## Verdict
**SPEC 009 is NOT COMPLETE and is not claimed as verified.** The service layer (schema, planning, runtime core, finalizer, U-1 sweep/gate, evidence/artifacts, dispatch logic) is implemented, committed, pushed and tested against real PostgreSQL. The parts that need a running engine host, a BullMQ consumer, a browser or a production-like stack are not done. Definition of Done: **9 PASS · 13 PARTIAL · 6 NOT STARTED** of 28 gates; requirements: **27 IMPLEMENTED-TESTED · 2 VERIFIED · 13 PARTIAL · 4 MISSING · 3 N/A** of 49 (`DEFINITION_OF_DONE.md`, `REQUIREMENT_DELTA_MATRIX.md` addendum).

## Owner decisions
DEC-047 A, DEC-051 A, DEC-066 A (in principle) approved by the owner 2026-10-29. v6 amendment drafted and checked against SPEC 006/007/008/009 as implemented, with no business-policy change; historical v1–v5 untouched (`specs/009-…/amendments/AMENDMENT-U1B-v6.md`, `final-planning/DECISION_AMENDMENT_2026-10-29_SPEC009_LEVEL1.md`). Disclosed up front: ten tables instead of eight, and a `terminalReason` column. DEC-056/057/058/064 were treated as technical decisions inside DEC-066 and labelled so.

## Delivered (all on `origin/main`)
| Area | What exists | Verification |
|---|---|---|
| CORE-01 schema | `20261030000000_add_core_scan_execution_platform`: 10 tables, 7 enums, deadline CHECK, one-initial-plan-per-scan, 11-status transition trigger, immutable plan/edges/claims, effect-ledger trigger, `fahes_finalize_unit` | fresh install, rollback, re-apply on disposable PostgreSQL; additive (0 DROP); 17 DB tests incl. all 110 status pairs; applied to `webaudit_test` and to the dev DB after a backup (row counts and `User` checksum unchanged) |
| Planning | graph rules, U-1 deadline arithmetic (contract worked example reproduced exactly), ScanConfiguration (secret-key guard), profiles (versioned, immutable), Plan Resolver (fresh F01 per class, tenancy re-derived, fail-closed, one transaction, REVERIFY, deadline/grant refusals), engine registry (FR-024 guard) | 62 pure + 40 resolver tests; mutation 4/4 |
| Runtime core | `claimUnitHost`, single-statement `casHostTransition` (+ class L lease check), `authorizeEffect`/`confirmEffect`, `classifyPreRunCause` (database clock), `expirePlanUnits` (status-by-cause matrix, termination confirmation), TS face of the single finalizer, failure classifier | 54 tests incl. races; mutation 7/7 |
| Dispatch | `dispatchExecutionUnit` (v6 §2), `hostLoopDecision` (v6 §7, fail-closed renewal handling), per-class queue names and routing | 19 tests with real F07; mutation 5/6 (1 equivalent) |
| U-1 worker | planned timeout pass, self-healing pass, plan-unit barrier, optional `planGate` hook (answers `no-plan` for every legacy scan) | 10 tests; legacy sweep/orchestrator tests green |
| Evidence | `recordEvidence` (unconditional redaction for the three classes), `createArtifact` (object-then-row, budgets under per-scan lock), reaper, retention function, `materializeFinding` (existing fingerprint, MEASURED, tenant-safe links), `scanCoverageSummary` | 23 tests; mutation 5/5 |

## Defects found and fixed during the work
Stack overflow in configuration validation on deep input; a transaction-abort race in finding materialization; the enum-drift guard correctly failing on 7 unmirrored enums; a Prisma-rejected max date in the sweep; the real `renewLease` reporting a pending stop before a fenced holder (loop now reads lease liveness from the row); my own migration SQL polluted by a CLI banner (caught by the first deploy; the shared test DB's failed history row was recovered with `prisma migrate resolve --rolled-back`); a regex patch that damaged `PROCESS_FOR_THE_APP.md` (restored from git, redone line by line).

## Not done (each is a stated gap, not a pass)
- BullMQ producers/consumers for the per-class queues and the host process that runs the loop; progress events; engines for non-passive classes (SPEC 010–012). The resolver refuses a class with no registered engine.
- Passing `artifactStore` to the production retention job and scheduling the reaper (retention itself now removes artifact rows in its transaction, tested); real R2 (no credentials; adapter covered by a command stub).
- Role grants for the ten new tables (migration grants only `EXECUTE` on the finalizer): the privilege boundary is **not claimed** for them. The dev API/worker still use the superuser; **no least-privilege claim anywhere**.
- Real API + worker + Redis run, Chrome acceptance (nothing user-visible exists to drive; Playwright MCP was not used), failure injection, performance baselines, coverage measurement, adverse suite, Playwright E2E and contract suite re-runs.
- D-1 (browser pool) is unchanged: it needs the SPEC 010 BROWSER engine (DEC-052/042). SPEC 009 does not close it.
- **Full unit suite**: finished at 1783 passed / 6 failed (236 files, 1789 tests) on a throwaway tmpfs Postgres; the 6 failures are in 5 queue/Redis-heavy files that all pass when re-run alone (27/27), so they are order/timing-dependent, not attributed to this work. No fully green single run was obtained; gate 26 stays PARTIAL (adverse, Playwright and contract suites not re-run).

## Next
See `SESSION_PROGRESS.md` "Next exact tasks".

## Continuation verification — 2026-10-29

- Created a new disposable database, applied all **32 migrations from the beginning**, and confirmed `prisma migrate status` reports the schema is up to date. No shared development or production-named container was migrated or modified.
- Verified all ten CORE-01 tables are owned by `fahes_owner`; runtime groups are non-superuser and have no create privilege on `public`; the finalizer and execution-host SECURITY DEFINER helpers have `fahes_owner` ownership and fixed `search_path` settings.
- The real LOGIN-role adverse suite passed **17/17**. It covers finalizer grants, terminal writes, selected column/table grants, F07 admission helper access, lease and stop reads, and a cross-plan dependency rejection while the API role invokes the actual production trigger.
- Test-first review found `fahes_dependency_same_plan()` was SECURITY DEFINER with default `PUBLIC EXECUTE`. The new adverse assertion failed against that state; migration `20261030180000_core01_revoke_public_definer_execute` revokes the default grant. After applying it, the same suite passed. A separate mutation that temporarily granted finalizer execution to `fahes_api` caused the test to fail (14 passed, 1 failed); the temporary grant was revoked on the disposable database.
- The isolated PostgreSQL/Redis/BullMQ worker integration passed **21/21**, including non-superuser host execution and the end-to-end queued unit lifecycle. This still does not exercise the production API `resolvePlan` producer or a production SPEC 010–012 engine.
- Scope remains incomplete: broader tenant/effect/lease-secret permission cases, API/worker production credentials, API plan production, real R2, process restart/outage, manual browser acceptance, performance, and full acceptance matrices remain open. Overall SPEC 009 verdict remains **NOT COMPLETE**.

### Lifecycle checks and delivery update

- Evidence persistence, artifact retention, and reaper integration passed **32/32** on isolated PostgreSQL with an in-memory object store. Existing API/worker phase progress passed **1/1** over isolated Redis; this does not verify SPEC 009 authenticated unit-progress reconnect/recovery.
- Scoped changes were committed and pushed as `80118ad59f03fb80c523c3d10bfb795850f62c6e`; local `HEAD`, `origin/main`, and remote `main` matched after fetch/`ls-remote`. The website/auth refactor remains uncommitted and untouched.
