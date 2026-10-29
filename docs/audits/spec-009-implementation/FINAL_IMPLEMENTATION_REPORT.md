# SPEC 009 — implementation report (2026-10-29)

## Current status — refreshed 2026-10-29

**SPEC 009 remains NOT COMPLETE.** Current DoD is **11 PASS · 17 PARTIAL · 0 NOT STARTED** of 28 gates. The latest full unit/contract/integration run passed **244/244 files and 1,874/1,874 tests**; adverse passed **73/73 files, 1,153 passed, 1 skipped**; real-browser Playwright E2E passed **93/93**. The complete scan journeys exercised the existing legacy path and do not close production SPEC 009 plan-to-queue integration.

## Browser, coverage and workspace checks — 2026-10-29

- Full Playwright E2E passed **93/93** against isolated PostgreSQL/Redis and Chromium; it confirms the current legacy scan flow. Production `/scans` does not call `resolvePlan`, and no production SPEC 009 adapter is registered, so gate 24 remains PARTIAL.
- Browser evidence: home/login desktop at 1440px and login mobile at 390px are saved under `browser-evidence/`. Visual project passed **8 checks** with **17 TODO** comparisons; manual acceptance and reference parity are incomplete. The home page also shows a low-severity missing-favicon request.
- Targeted SPEC 009 V8 coverage (25 files): **87.06% lines, 88.28% functions, 80.89% branches**; not whole-workspace coverage. Typecheck passed 30/30 packages, Prisma validate passed, scoped lint/adherence passed. Full format check reports 322 files and root lint requires excluding generated `.next-final-cta-verify` output.
- DoD is **11 PASS · 17 PARTIAL · 0 NOT STARTED**. SPEC 009 remains **NOT COMPLETE** because production plan wiring, engine termination/backstop, deployment clock bounds, R2/outage, sustained load and manual/visual acceptance remain open.

### Latest U-1 continuation CAS follow-up — 2026-10-29

`continueScanIfPlanTerminal` now requires the worker state-machine's database-clock compare-and-swap to move a ready planned scan from `RUNNING_PHASE_3` to `RUNNING_MASTER`. Only the winning caller emits the progress transition and enqueues the master job with `alreadyTransitioned`; the worker no longer leaves a check-to-enqueue race before phase entry, and the state write stays behind the central transition authority. The isolated worker suites pass **39/39** (`planned-timeout-sweep.test.ts` 17/17 and `execution-runtime.test.ts` 22/22), including concurrent callers, the timeout sweep winning during a module-result finalizer, and actual worker queue composition. API/worker typechecks, targeted ESLint, Prettier on source files, and `git diff --check` pass. T-U1-10 and DoD gate 14 remain open/partial; SPEC 009 remains **NOT COMPLETE**.

### Latest U-1 regression check — 2026-10-29

The isolated planned-timeout sweep suite now passes **15/15**, including a no-plan legacy scan at 14m50s (still running, no refund) and just beyond 15 minutes (timed out, one refund). DoD gate 14 remains PARTIAL: the full AC-1…AC-20 matrix, deployed clock-skew evidence, and production-engine termination backstop are still open. Overall SPEC 009 remains NOT COMPLETE.

The API dispatch suite now passes **21/21** with an added AC-20 case: an expired plan does not trigger deadline step 0 for `PASSIVE_HTTP`; the unit remains `PLANNED` without a host claim, F07 admission, lease, or budget counter. This is boundary evidence, not a production API queue integration.

The adverse timeout refund-staleness file also passes **2/2** against isolated PostgreSQL/Redis. Both legacy and planned sweep regressions verify that a module result committed after candidate discovery is included in the fresh transactional refund calculation. Gate 14 remains PARTIAL for the rest of the AC matrix and production/deployed evidence.

The API runtime suite passes **56/56** after removing the seeded-state AC-16 check. The stronger dispatch suite passes **22/22** with a real dispatch-to-expiry race: it obtains F07 admission, pauses in `DISPATCHED` before child start, expires and refuses the unit, blocks its dependent, releases the lease, and calls `terminate()` on the inert-child test handle when dispatch resumes. It also confirms no second admission or effect authorization occurs.

The latest continuation adds and verifies worker expiry-hook dispatch, engine-specific hard-stop margins, adapter registration validation, isolated Redis configuration for child-process tests, AC-19 F07 lease retention through termination confirmation, AC-17 database-clock behavior under worker clock skew in both directions, transactional rollback of the F07 release audit during failed unit finalization, AC-15 pending-stop versus unconfirmed-termination precedence, and direct CORE-01 claim/effect ledger abuse checks. Focused results include API runtime **57/57**, API dispatch **22/22**, worker runtime **22/22**, planned timeout sweep plus adapter registry **15/15**, CORE-01 real-login role matrix **24/24**, refund staleness **2/2**, and secure-cookie Redis boundary **2/2**. The API runtime and role matrix suites were rerun on isolated PostgreSQL for the latest AC-15 and privilege-boundary cases. API typecheck, targeted ESLint, Prettier, and `git diff --check` pass; full-workspace checks remain prior evidence. See `FINAL_VERIFICATION_REPORT_2026-10-29.md` and `DEFINITION_OF_DONE.md` for evidence and limits.

The production Compose definition now separates migration/admin access from API and worker logins. A compose stack built from uniquely tagged images of the current checkout applied **35/35** migrations, completed role provisioning, and started API and worker healthy using their respective non-superuser roles; API `/health` returned **200**. The pre-existing local Compose stack was inspected read-only and still runs both processes as `webaudit_local` superuser; it was deliberately not restarted or modified. Gate 22 therefore remains PARTIAL pending deployment of the new environment and broader production evidence.

The role provisioner was also exercised with deliberately stale direct schema/table grants and an extra API-role membership. It removed those privileges and preserved only the intended group roles. A runtime-owned table caused provisioning to fail closed, then the check passed after cleanup; temporary logins and the probe were removed from the isolated PostgreSQL service.

The latest U-1 follow-up closes an AC-13 race found by regression tests: finalizer-vs-sweep expiry and concurrent gate calls are now serialized by the single database-clock state CAS before master enqueue. The affected worker integration file passes **17/17** with isolated PostgreSQL/Redis; API/worker typechecks, targeted ESLint, and Prettier pass. T-U1-10 and gate 14 remain open for the rest of the acceptance matrix and external engine/deployment evidence.

The same live sweep suite now covers AC-12 with a RUNNING BROWSER test-adapter unit: a real repeat-scheduled BullMQ worker invokes its registered expiry hook and finalizes within the 10-second sweep/host-loop allowance. The targeted live-scheduler case passes **1/1** on isolated infrastructure; production engine termination remains unverified.

The CORE-01 real-LOGIN matrix now passes **24/24** on the isolated 35-migration database. It covers the cross-tenant API resolver refusal plus direct claim/effect ledger access attempts; catalog verification found no temporary `zz_t_009_*` roles after cleanup. The real PostgreSQL/Redis/BullMQ worker lifecycle passed **22/22 twice** against separate fresh databases, including crash/replacement and F07 behavior with a deterministic test adapter. A before/after catalog comparison around the repeat proved it introduced no worker test logins; one older test-prefixed login remains untouched because its origin predates the snapshot. The performance baseline now includes database-backed evidence, artifact metadata, finalizer and sweep measurements plus a two-run no-op queue burst; the production performance gate remains partial.

The production API still has no `resolvePlan` caller, and no SPEC 010–012 production engine adapter is registered. FR-040 keeps current passive `/scan` behavior on the legacy path; connecting it to planned dispatch would change production behavior and is not part of this implementation without an approved cutover. Local baselines now cover passive plan resolution, DAG, BullMQ latency and no-op burst, evidence, artifact metadata with an in-memory store, planned-unit REFUSED finalization, and failed-scan sweep. Sustained capacity, successful engine throughput, real R2, and outage performance remain unverified. Visual parity, manual Chrome, coverage, and deployed clock-skew evidence remain open. The AC-1…20 source/test mapping is now documented; production evidence for AC-12/19 and deployment evidence for AC-17 remain open. This continuation is local and uncommitted; only the base commit is on `origin/main`.

The sections below preserve historical reports and dated evidence. Where their status, test totals, or delivery statements differ, this current-status block and the latest dated verification section supersede them.

## Owner decisions
DEC-047 A, DEC-051 A, DEC-066 A (in principle) approved by the owner 2026-10-29. v6 amendment drafted and checked against SPEC 006/007/008/009 as implemented, with no business-policy change; historical v1–v5 untouched (`specs/009-…/amendments/AMENDMENT-U1B-v6.md`, `final-planning/DECISION_AMENDMENT_2026-10-29_SPEC009_LEVEL1.md`). Disclosed up front: ten tables instead of eight, and a `terminalReason` column. DEC-056/057/058/064 were treated as technical decisions inside DEC-066 and labelled so.

## Earlier delivery snapshot (at the time, scoped changes were on `origin/main`)
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

## Earlier open-gaps snapshot (superseded by the current status above and latest dated sections below)
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
- The isolated PostgreSQL/Redis/BullMQ worker integration now passes **22/22**, including non-superuser host execution, end-to-end queued unit lifecycle, and actual execution-worker crash/replacement recovery. This still does not exercise the production API `resolvePlan` producer or a production SPEC 010–012 engine.
- Scope remains incomplete: broader tenant/effect/lease-secret permission cases, API/worker production credentials, API plan production, real R2, process restart/outage, manual browser acceptance, performance, and full acceptance matrices remain open. Overall SPEC 009 verdict remains **NOT COMPLETE**.

### API least-privilege planning follow-up

- A fresh disposable database received all **34 migrations** and Prisma reports the schema up to date. No shared development or production-named database was migrated.
- The real LOGIN-role suite now passes **20/20**. New test-first cases first failed when `fahes_api` lacked plan-ownership and F01 authorization reads; additive migrations `20261030190000_core01_api_plan_ownership_reads` and `20261030200000_core01_api_authorization_reads` grant only the required columns/tables. The API login now resolves passive and authorized BROWSER plans and calls the production F01 authorization query. The generic worker still cannot read authorization rows.
- This proves the API planning service under its intended non-superuser login, not a production HTTP route, durable queue producer, or complete API/worker scan. Those remain open; DoD gate 10 stays PARTIAL and gate 24 stays NOT STARTED.
- The isolated worker runtime integration now passes **22/22**; artifact/evidence/retention/reaper checks remain **32/32** with an in-memory object store; existing API/worker phase progress remains **1/1**. Authenticated SPEC 009 unit-progress reconnect/recovery and real R2 are unverified.
- The 28-gate assessment remains **NOT COMPLETE**. Gate 10 remains PARTIAL and gate 24 remains NOT STARTED: role-scoped planning and worker-runtime evidence are separate, with no production HTTP-to-queue scan path.

### Lifecycle checks and delivery update

- Evidence persistence, artifact retention, and reaper integration passed **32/32** on isolated PostgreSQL with an in-memory object store. Existing API/worker phase progress passed **1/1** over isolated Redis; this does not verify SPEC 009 authenticated unit-progress reconnect/recovery.
- Scoped changes were committed and pushed as `80118ad59f03fb80c523c3d10bfb795850f62c6e`; local `HEAD`, `origin/main`, and remote `main` matched after fetch/`ls-remote`. The website/auth refactor remains uncommitted and untouched.

### Evidence-fence continuation — 2026-10-29

- Added the narrow `recordExecutionEvidence` wrapper and a SECURITY DEFINER lock/check helper for unit-produced evidence. The host runtime now routes engine evidence through it; generic registry evidence remains permissive after terminalization.
- Fresh isolated PostgreSQL applied all **35 migrations**. API evidence tests passed **25/25**; the real isolated PostgreSQL/Redis/BullMQ runtime suite now passes **22/22**, including execution as a non-superuser host login and actual worker process crash/replacement. The host login's direct update of `Scan.startedAt` is explicitly rejected.
- The serialized resolver, dispatch/host-loop, expiry, planned-sweep, and plan-gate checks passed **125/125** across four files; CORE-01 schema/immutability passed **17/17**; refund-staleness adverse checks passed **2/2**. Timeout-sweep/finalization race coverage passed with no duplicate refund or master enqueue. T-U1-1 through T-U1-9 are checked in the task list. AC-5 is now COVERED; AC-12, AC-17 and AC-19 retain explicit gaps, so T-U1-10 and the overall SPEC 009 verdict remain open. The current scoped changes are local and uncommitted; unrelated website/auth changes were preserved.

### Progress/redelivery deadline check — 2026-10-29

- Added isolated worker-runtime coverage for an `ExecutionUnit.progressSnapshot` update and duplicate BullMQ delivery. On disposable PostgreSQL/Redis, the case passed **1/1**, observed one durable host claim, and confirmed `ScanPlan.deadlineMs` remained unchanged. The schema immutability suite already verifies that a direct plan deadline update is rejected.
- Follow-up added consumer recreation before another terminal-unit redelivery. The focused integration case passed again **1/1**, with one durable host claim and the same immutable plan deadline.
- AC-5 is now COVERED by mutable progress, duplicate delivery, consumer recreation, schema-level deadline immutability, and the real worker crash/replacement test described in the current DoD. AC-12, AC-17 and AC-19 still lack active-engine termination, deployed clock-skew evidence and a production engine backstop. The production API has no `resolvePlan` caller and the worker registers no SPEC 010–012 engine adapter. SPEC 009 remains NOT COMPLETE.
- Current focused reruns: worker runtime **22/22**, CORE-01 real-login matrix **22/22**, and planned-timeout sweep **12/12**. The complete workspace unit/contract/adverse suites were not rerun after this continuation; earlier totals in this report are historical evidence.
- Current passive scans remain on the legacy path under the parallel-run boundary. Connecting every passive scan to planned execution would require an explicit contract/cutover decision; no production behavior was changed here.

### AC-12 live scheduler check — 2026-10-29

- Added a real BullMQ repeat-scheduler test to the existing planned sweep integration file. After an empty sweep completes, it creates a terminal scan with a pending unit and verifies the next scheduled sweep terminalizes the unit within the configured 5-second interval plus the 5-second host-loop allowance.
- `planned-timeout-sweep.test.ts` passes **12/12** on isolated PostgreSQL/Redis. This covers a PLANNED unit with no child to terminate; active production-engine termination remains unverified and AC-12 remains PARTIAL.

### AC-12 registered engine expiry-hook follow-up — 2026-10-29

- The timeout-sweep production composition now receives the worker's registered adapters, dispatches `onUnitExpired` for RUNNING units, and applies engine-specific `hardStopMarginMs`. Missing hooks remain pending; passive units preserve their immediate termination path. The adapter registry now rejects non-passive adapters without the required hook.
- Regression-first verification demonstrated the hook was previously not called. Confirmed termination and still-pending-within-margin cases pass. The planned sweep and registry tests pass **15/15**; the worker crash/replacement runtime file passes **22/22**. API and worker typechecks, scoped ESLint, and Prettier pass.
- No production SPEC 010–012 adapters/backstops are registered, so AC-12/19 remain PARTIAL, T-U1-10 stays open, and SPEC 009 remains NOT COMPLETE. The continuation is local/uncommitted.

### Current regression refresh — 2026-10-29

- After the AC-13 atomic continuation-claim changes, the full serial unit/contract/integration workspace passed **244 files and 1,872 tests**. The full serial adverse workspace passed **73 files, 1,153 tests, and 1 skip**. Both ran against disposable PostgreSQL and isolated Redis; the skip is the existing capability-sdk context-confinement case.
- The focused AC-13 integration files passed **17/17** (`planned-timeout-sweep.test.ts`) and **22/22** (`execution-runtime.test.ts`). API/worker typechecks, scoped ESLint, source Prettier, and `git diff --check` passed.
- Earlier full-workspace totals in this report are historical snapshots; these are the current totals for this continuation. The result does not close the remaining production API-to-queue wiring, SPEC 010–012 production-engine termination/backstop, deployed clock-skew, outage/R2, visual, or manual-acceptance gates. SPEC 009 remains **NOT COMPLETE**.

### Current U-1 acceptance audit and checkout verification — 2026-10-29

- Independently mapped AC-1 through AC-20 to current source and regression tests in `DEFINITION_OF_DONE.md`. Each AC now has named evidence and an explicit limitation where evidence is component/test-adapter-only. AC-12/19 require registered production engine termination/backstop evidence; AC-17 requires deployed NTP/skew-bound evidence. T-U1-10 remains unchecked for these gaps.
- The checkout is on `main`; local `HEAD`, `origin/main`, and live remote `main` all resolve to `e03577d6ccaa115f49648e6a24be6cb0bba18a45`. The dirty worktree was preserved; nothing was committed or pushed.
- This closes the documentation ambiguity around U-1 acceptance evidence. It does not close SPEC 009: production API-to-queue execution, engine adapters, deployed clock proof, R2/outage, visual/manual, and remaining DoD gates stay open.

### FR-043 generic execution telemetry — 2026-10-29

- Added a structured per-engine execution telemetry event at the worker finalization boundary. It reports persisted queue wait/duration, status, failure class, attempt, cost micros, host-local concurrency, child CPU/RSS, derived engine health, and F07 cancellation/kill reason. Child process resource values are validated over the local IPC boundary; the event excludes configuration and raw execution payloads and is emitted through the existing redacting logger.
- Regression-first isolated integration now covers successful execution telemetry without a credential sentinel/configuration leak, infrastructure failure classification, and operator-kill telemetry. The full runtime lifecycle file passes **24/24**, the full adverse suite passes **73 files / 1,153 passed / 1 skipped**, and worker typecheck, scoped ESLint and Prettier checks pass.
- FR-043 has implementation/test evidence but remains PARTIAL: no production engine adapter or deployed log aggregation/health view exists, and resource/concurrency measurements are not load-tested across hosts. SPEC 009 remains **NOT COMPLETE**.
