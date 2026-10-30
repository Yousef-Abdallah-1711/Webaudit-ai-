# SPEC 009 defect register

Standalone register (closes audit item X-4). Carried forward from `CURRENT_STATUS_AND_NEXT_EXECUTION_PLAN.md` section N and extended on 2026-10-30. "Gap" means a missing decision or capability, not a regression.

| Id | Type | Description | State |
|---|---|---|---|
| R-1 | Environment | Docker Desktop engine crashed mid-run (2026-10-29 19:41) | Recovered; suites re-run clean |
| R-2 | Environment | `EXEC_TEST_REDIS` must be set; `localhost` is flaky for Prisma on Docker (use `127.0.0.1`) | Documented in the recovery handoff |
| R-3 | Environment | `prisma generate` EPERM when a dev process holds the engine DLL | Known; types still update |
| F-1 | Formatting debt | 84 older tracked files fail Prettier | Pre-existing, not a blocker; not mass-reformatted |
| F-2 | Formatting | Three SPEC 009-era files | Fixed and committed in the recovery-closure commit |
| L-1 | Lint | Two errors in owner's untracked scratch scripts | Not repo defects; untouched |
| X-1 | Doc drift | `PROCESS_FOR_THE_APP.md` CORE-04 / CORE-10 rows stale | Open |
| X-2 | Doc drift | Earlier matrix tally said 27/17; rows say 28/16 | Superseded by the recounted audit |
| X-3 | Doc drift | `DEFINITION_OF_DONE.md` keeps superseded historical tables | Open |
| X-4 | Missing doc | No standalone defect register | Closed by this file |
| G-1 | Gap (decision) | No contract says who completes a `PASSIVE_HTTP` unit. The DB transition table lets only `TELEMETRY` go `PLANNED -> COMPLETED`; a passive unit can only be refused from `PLANNED`. A flag-on plan containing passive units would strand at the plan-unit barrier until the deadline | Closed 2026-10-30 by DEC-071 (dedicated orchestrator-only function + guard flag) |
| G-2 | Gap (decision) | `/scans` has no profile field, and the CUSTOM configuration maps every domain to `PASSIVE_HTTP`; production requests cannot express non-passive work | Closed 2026-10-30 by DEC-072 (optional validated `profile`, default `PASSIVE_BASELINE`) |
| G-3 | Design note | `enqueueEligibleUnits` is in `apps/worker`; the API cannot import it. Enqueue must be a worker-side hook after `Scan.startedAt` is set | Recorded under N01 |
| P-1 | Known gap | D-1 browser pool | SPEC 010 |
| P-2 | Known gap | Dev stack uses the database superuser, so role isolation is not in force there | Environment; V01 |
| T-1 | Test reliability | Six earlier full-suite failures (queue/Redis-heavy files) did not recur on isolated PostgreSQL + Redis | Not reproduced |
| S-1 | Observation | Standalone-stack smoke: loopback scan target is refused (422), correct fail-closed behaviour; scan-to-report is covered only by the Playwright first-audit spec | Recorded in the recovery handoff |
| S-2 | Limitation | Windows has no POSIX SIGTERM; graceful shutdown cannot be signal-tested on this machine | Covered only by in-process `shutdown()` tests |
| G-4 | Finding (V01) | In the isolated database no runtime LOGIN has grants on the legacy tables, and the documented production worker login (`webaudit_worker_runtime`, member of `fahes_worker_exec` only) can neither execute `fahes_finalize_unit` nor `fahes_complete_passive_unit` (both are orchestrator/host only). The compose pattern cannot run the flag-ON path under least privilege; the existing sweep finalization has the same gap | Open; needs a provisioning decision (which login holds `fahes_orchestrator`), not changed here |
| G-5 | Gap | Non-passive dispatch (worker-side `enqueueEligibleUnits` hook) is not wired: no non-passive plan can be created (refused as `PROFILE_UNAVAILABLE`), so nothing can be stranded | Deferred to SPEC 010-012 |
| G-6 | Doc | `DEC-071` narrows the earlier text that only TELEMETRY completes from PLANNED | Recorded in `DECISION_AMENDMENT_2026-10-30_SPEC009_INTEGRATION.md` |
