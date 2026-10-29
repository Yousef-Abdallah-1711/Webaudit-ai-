# SPEC 009 — session progress and continuation handoff

## Current verified handoff — 2026-10-29

This section supersedes earlier status/count snapshots below. Current local branch is `main`; `HEAD`, `origin/main`, and live `origin` `main` all resolve to `e03577d6ccaa115f49648e6a24be6cb0bba18a45`. The worktree is dirty with pre-existing website/auth edits and local SPEC 009 implementation/evidence changes; preserve them. No reset, broad staging, commit, or push was performed.

- Latest full isolated unit/contract/integration run: **244 files / 1,874 tests passed**; adverse: **73 files / 1,153 passed / 1 skipped**. Full Playwright E2E passed **93/93 in 22.6 minutes** with real Chromium, API, worker and Next.js on isolated PostgreSQL/Redis. The completed scan path is the legacy queue, not SPEC 009 plan dispatch. Visual checks passed 8 mechanisms with 17 TODO comparisons.
- The current `execution-runtime.test.ts` passed **24/24**, including secret-free lifecycle/resource telemetry for success, infrastructure failure and F07 kill, and a real worker process crash/replacement case. Worker typecheck, scoped ESLint and Prettier checks passed. `git diff --check` passed with the existing user-owned migration CRLF warning.
- Latest recorded separate privilege/lifecycle evidence: CORE-01 real-login privilege matrix **24/24**; worker PostgreSQL/Redis/BullMQ lifecycle **22/22**, including process crash/replacement. Earlier email boot guard **3/3** and exact sandbox-unconfigured contract **1/1** reruns pass; the complete current unit and adverse runs are green.
- The U-1 acceptance audit now maps AC-1 through AC-20 to source/tests. AC-12/19 still lack production SPEC 010–012 engine termination/backstop evidence, and AC-17 lacks deployed NTP/skew-bound evidence. DoD gate 14 and T-U1-10 remain open. SPEC 009 is **NOT COMPLETE**.
- Full workspace typecheck passed 30/30 packages; Prisma validation passed. Scoped SPEC 009 V8 coverage: 25 files, **87.06% lines, 88.28% functions, 80.89% branches**. Full workspace lint needs to exclude the existing untracked Next build output; full format reports 322 files. Scoped source lint/adherence and touched-file Prettier passed.
- Current DoD is **11 PASS · 17 PARTIAL · 0 FAIL · 0 BLOCKED · 0 NOT STARTED**. Gates 24 and 25 are PARTIAL on the real Chromium E2E and isolated browser screenshots; neither is complete because the scan follows the legacy path and the 24-step manual/visual-parity acceptance is unfinished.
- Other open DoD gates include production API-to-plan-to-queue-to-worker execution, production engine termination, real R2 and outage recovery, visual/manual acceptance, sustained production-relevant performance, and deployment credential verification. The E2E path confirms the existing legacy route and remains unchanged under FR-040.
- Isolated disposable PostgreSQL/Redis verification containers remain on ports 5545/6391; the existing application/dev stack was not touched. The isolated `m009_closure_unit_test` database remains disposable and available.

Resume from the U-1 evidence audit in `DEFINITION_OF_DONE.md`; do not treat historical counts/status blocks below as current where they conflict with this handoff.

### Final closure-pass update — 2026-10-29

- The full serial unit/contract/integration suite passed **244 files / 1,882 tests**; the full adverse suite passed **73 files / 1,153 passed / 1 skipped** on isolated PostgreSQL and Redis. The current progress recovery subset was **66/66** across five files.
- Workspace typecheck passed **30/30 packages**; focused ESLint and Prettier passed. Visual mechanisms passed **8**, with **17 TODO** parity comparisons. Full Chromium E2E remains the prior **93/93** run and was not repeated during this closure pass.
- SPEC 009 remains **NOT COMPLETE**, DoD remains **11 PASS / 17 PARTIAL**, and T-U1-10 remains open for production-engine termination/backstop and deployed clock-skew evidence. See `HANDOFF_2026-10-29.md` for the delivery inventory and remaining acceptance tasks.

Last updated 2026-10-29. Session start: HEAD `a1034fa` = `origin/main`.
**Verdict: SPEC 009 is NOT COMPLETE.** Service layer implemented and tested on real PostgreSQL; dispatch/queues, host loop, progress events, engines, real full-stack, Chrome acceptance, performance and the dev-database migration are not done. Gate count (`DEFINITION_OF_DONE.md`): 9 PASS · 13 PARTIAL · 6 NOT STARTED of 28. Requirement count (`REQUIREMENT_DELTA_MATRIX.md` addendum): 26 IMPLEMENTED-TESTED · 2 VERIFIED · 14 PARTIAL · 4 MISSING · 3 N/A.

## Decisions (owner, 2026-10-29)
DEC-047 A, DEC-051 A, DEC-066 A (in principle) approved by the owner's message; recorded in `docs/audits/fahes-master-audit/final-planning/DECISION_AMENDMENT_2026-10-29_SPEC009_LEVEL1.md`. v6 drafted and checked against 006/007/008/009 as implemented: `specs/009-core-scan-execution-platform/amendments/AMENDMENT-U1B-v6.md` (v1-v5 untouched). **Disclosed**: the migration has ten tables, not eight (`ExecutionUnitHostClaim`, `EffectAuthorization` are required by the approved options), plus a `terminalReason` column on `ExecutionUnit` (contract step 3 requires the reason to be recorded; the data model had no field). DEC-056/057/058/064 were treated as technical decisions inside DEC-066 (labelled as such, not owner answers).

## Commits (local; push status at the bottom)
| Commit | Content |
|---|---|
| `7e113f8` | decision record, v6 amendment, delta matrix, DoD, backlog, T-U1-2 ticked |
| `5f42179` | CORE-01 migration `20261030000000` + rollback + 17 DB tests |
| `c7d99f5` | planning: graph, U-1 deadline arithmetic, ScanConfiguration, profiles, resolver (118 tests) |
| `14bcb54` | runtime: claim, CAS, effect ledger, `expirePlanUnits`, failure classes (54 tests, 7/7 mutants killed) |
| `a60ee73` | enum mirrors in `packages/types` + drift guard (caught a real omission) |
| `959802e` | worker: planned sweep, self-healing pass, plan-unit barrier, orchestrator hook (10 tests) |
| `1f6e4a9` | evidence/artifact/materialization (23 tests, 5/5 mutants killed) |
| `f0fb3cd`, `bab4c23` | docs: progress, DoD, matrix addendum, process status; FR-024 registry guard |
| `2265019` | dispatch sequence (v6 §2), host-loop decision, per-class queue names (19 tests; 5/6 mutants killed, 1 equivalent) |

## Verification actually run
- Migration: fresh install (all 25 migrations), rollback (`ROLLBACK-M009.sql`: tables 5→0, functions 5→0, types 0, history row removed), re-apply — on disposable database `m009_fresh`; only new tables are touched, 0 `DROP`/`DELETE`; applied to `webaudit_test` (recovered a failed history row caused by my own first, banner-polluted SQL via `prisma migrate resolve --rolled-back`). **Not applied to the dev `webaudit` database.**
- Focused suites on an isolated `_test` database: planning/runtime/evidence 218 tests, worker sweep/gate/legacy timeout 13 + orchestrator subset 27, enum drift. Format, ESLint and `tsc --noEmit` clean for api and worker.
- Mutation checks: graph/deadline 4/4, runtime 7/7, evidence 5/5 killed; DB guards (three triggers dropped) caught by 5 failing tests; sources restored each time.
- **Full serial unit suite**: see "Full-suite result" below.

## Defects found while building (all fixed, with tests)
1. `parseScanConfiguration` stack overflow on 50 000-deep input (`JSON.stringify` before the depth guard).
2. `materializeFinding` lost a race on the same fingerprint: a unique violation aborts the Postgres transaction, so the fallback read failed → `ON CONFLICT DO NOTHING`.
3. Enum-drift guard (existing) failed on the 7 new enums → mirrored in `packages/types`; `graph.ts` now reuses them.
4. Sweep batch query used a Prisma-rejected max date → ordinary far-future date plus an id filter.
5. Process errors of my own: Prisma update banner written into the generated SQL (caught by the first deploy), a regex patch that damaged `PROCESS_FOR_THE_APP.md` (restored from git, redone line by line).

## Not done, with the reason
| Area | State |
|---|---|
| BullMQ producers/consumers for the per-class queues, the host process that runs `hostLoopDecision`, progress events (FR-017/018/027) | the logic (`dispatchExecutionUnit`, `hostLoopDecision`, queue names) is built and tested; the BullMQ wiring and the host process need an engine (SPEC 010-012) to be meaningful; progress events not built |
| Engines for non-passive classes | out of scope (SPEC 010-012); the resolver refuses a class with no registered engine |
| Production `artifactStore` for the retention job, scheduling `reclaimOrphanedArtifacts` | `enforceRetention` now calls `enforceArtifactRetention` inside one interactive transaction (legacy retention tests green + new test); needs R2 credentials and a scheduler entry |
| Real R2 | no credentials; adapter covered by a command stub only |
| Real API + worker + Redis run, Chrome acceptance (24 steps, 3 viewports), failure injection, load baselines, coverage | not started: there is no user-visible surface and no running unit path to drive; backend features are verified by DB tests only. Playwright MCP was not used. |
| Dev DB migration | **applied 2026-10-29** after a `pg_dump -Fc` backup: `User` 86 / `Scan` 243 / `CreditTransaction` 267 and the `User` table checksum identical before and after; history 24 → 25; ten new tables and `fahes_finalize_unit` present. The running dev API/worker are unaffected (they do not use the new tables yet) |
| D-1 (browser pool) | unchanged and open: needs the SPEC 010 BROWSER engine (DEC-052/042) |
| Least-privilege runtime on the dev stack | unchanged: dev API/worker still use the superuser; **not claimed** |
| Role grants for the ten new tables | **not defined**: migration `20261030000000` grants only `EXECUTE` on `fahes_finalize_unit`; which of `fahes_api` / `fahes_worker_exec` / `fahes_orchestrator` may read or write each table (DEC-044 intent: workers hold no status privilege where SPEC 012 needs it) needs a design and a role-isolation test like 008's 116-case matrix. Until then a non-superuser runtime would need blanket grants (as 008's isolated stack used) and the privilege boundary is **not claimed** for the new tables |
| Adverse suite, Playwright E2E, contract suite re-run after the change | not re-run |

## Environment hazards (for the next session)
- Each DB-backed test resets ~70 partitioned tables: ~2 s idle, ~7 s under load → the serial unit suite takes hours. Do **not** run other DB work against the same Postgres container while it runs. Use a dedicated `*_test` database (`TEST_DATABASE_URL=...m009_*_test`); the helper auto-runs `migrate deploy` on it, so a malformed migration file leaves a failed history row there.
- Disposable databases created this session: `m009_fresh`, `m009_core_test`, `m009_full_test` (safe to drop).

## Next exact tasks
1. Read the full-suite result below; fix any regression attributable to this work.
2. Create the BullMQ queues/workers for `EXEC_QUEUE_NAMES` and call `dispatchExecutionUnit` from a worker (payload = `{ executionUnitId }` only); run `hostLoopDecision` every ≤5 s in the engine host and apply its action (finalize via `finalizeUnitAndContinue`). Needs one real or test engine to exercise it end to end.
3. Wire `enforceArtifactRetention` into the retention transaction and schedule the reaper; progress events.
4. Full-stack run on non-superuser roles (dev DB is already migrated); Chrome journey for whatever becomes user-visible.
5. Re-run adverse + Playwright + k6 baselines; update DoD gates 7-15, 20, 23-26.

## Continuation notes
Owner changes in the working tree are never staged: `pnpm-lock.yaml` hunks, `apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-*`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Normal push only.

## Full-suite result
The complete serial unit run **finished** (throwaway tmpfs Postgres, 1158 s): **236 files, 1789 tests: 1783 passed, 6 failed in 5 files** (`admin.queue` x2, `gated-check-partial`, `paymob-checkout-flow`, `progress-streaming`, `repo-revoked`). All five files **pass when re-run alone (27/27)**, so they are order/timing-dependent in the full run (queue/Redis-heavy; known test-env hazards), not attributed to this work. A clean, fully green single run was not obtained; adverse suite, Playwright E2E and contract suite were not re-run.

## Git
Pushed with a normal push: local `main` = `origin/main` = `2265019` (verified with `git ls-remote`). Owner working-tree files were not staged.

---

## Cross-device revalidation — 2026-10-29 (supersedes status claims above where they differ)

**Current checkout**: `H:\Projects\Webaudit-ai-`, branch `main`, local HEAD and `origin/main` both `96df6fe72d1107c352e89b9aa6534d612077e4a7` at inspection. The configured valid repository is `Yousef-Abdallah-1711/Webaudit-ai-`; the pasted `Yousef-Abdallah-1711/motakamel` is not found. Website/auth edits, `pnpm-lock.yaml`, `apps/web/.next-final-cta-verify/`, and `logs/` were already present and are preserved.

### Verified in this continuation

- Started only isolated disposable Docker services: PostgreSQL `127.0.0.1:5545` (tmpfs, `--rm`) and Redis `127.0.0.1:6391` (`--rm`). Existing WebAudit and unrelated services were not stopped or modified.
- Regenerated Prisma client; API, worker, and web typechecks passed; web build passed (in the prior part of this task chain).
- Applied all 27 Prisma migrations on a fresh disposable test database.
- Added `20261030130000_core01_restrict_finalizer_grants` after a real-login regression demonstrated that `fahes_api` and `fahes_worker_exec` retained finalizer EXECUTE from the earlier grants. The isolated role matrix passed 7/7 after the fix; before it, the test failed for those two roles as intended.
- Found and corrected a host edge: an unregistered-engine refusal now supplies the configured plan gate. The ready-barrier regression passes.
- Runtime integration against actual PostgreSQL, Redis, and BullMQ passed 16/16; worker typecheck passed after the host change.
- Static inspection corrected stale claims: artifact reaper handler and scheduler are wired; per-class queue/host/progress code exists and is covered directly in integration tests.

### Current blockers and unverified scope

- Production `apps/worker/src/index.ts` does not start the SPEC 009 exec queue consumers/host; `resolvePlan` has no production caller in `apps/` by repository search. No API→plan→queue→production-worker scan path is proven.
- No production engine adapter is registered (future SPEC 010–012). Do not count the deterministic test adapter as an engine.
- The additional finalizer-revocation migration has only been applied to a fresh isolated database. Do not infer it is deployed to the existing shared `webaudit` database.
- Full role-negative matrix, historical six-suite failure root cause, full unit/adverse/contract/Playwright runs, API/worker process integration, R2, Chrome, k6, and coverage remain unverified.
- DoD reassessment is in `DEFINITION_OF_DONE.md`; dated A–Z evidence report is `FINAL_VERIFICATION_REPORT_2026-10-29.md`. Verdict remains PARTIALLY COMPLETE.

### Next exact actions

1. Review scoped diff and ensure no website changes, generated artifacts, or secrets are included.
2. Run the role-isolation test on corrected fresh migrations and the runtime integration test on dedicated PG/Redis if any related code changes.
3. Decide/implement safe SPEC 009 production composition without loading remote code or embedding SPEC 010–012 engines; add a real `startWorker` lifecycle test.
4. Reproduce the six historical failures only with an explicitly isolated Redis URL (the checked-in workspace config currently hardcodes `localhost:6389/15`; do not run reset/queue suites against it by accident).
5. Complete remaining gates and update matrices; commit and push only verified SPEC 009 paths after final review.

### Delivery update

- Scoped commit `b2f05c0d41d61f59f9cf385a63719f7c7ea049d3` created and pushed normally to `origin/main`.
- Post-push `git fetch`, local HEAD, `origin/main`, and `git ls-remote` all agree on `b2f05c0d41d61f59f9cf385a63719f7c7ea049d3`.
- Remaining dirty/untracked files are the pre-existing website/auth edits, lockfile, `.next-final-cta-verify/`, and `logs/`; none were staged or committed.
- Verification gap continues: full suite, production adapter registration, and API-to-plan path are still open; do not report SPEC 009 complete.

## Worker lifecycle continuation — 2026-10-29

- Added `executionAdapters` composition to `startWorker`: validated adapter registry, per-class BullMQ consumers, durable dependent enqueue, plan-gate master-phase enqueue, progress/evidence host dependencies, and coordinated shutdown.
- Adapter registration now declares its execution-unit class; registry startup refuses classes without an execution queue, and the host refuses an adapter/unit class mismatch.
- Added an integration case that starts the standard worker service with a local deterministic adapter on isolated PostgreSQL/Redis and verifies unit completion, master-phase enqueue, and clean shutdown.
- Re-ran execution runtime integration: **17/17 passed**. Worker typecheck passed before the docs update.
- This repo has no production SPEC 010–012 adapter; the executable `startWorker()` entrypoint still supplies none. API `resolvePlan` still has no production caller. The end-to-end API plan producer remains open.
- Changed paths for this continuation: `apps/worker/src/index.ts`, `apps/worker/src/execution-runtime/adapter.ts`, `apps/worker/src/execution-runtime/host.ts`, `apps/worker/tests/helpers/test-adapter.ts`, `apps/worker/tests/integration/execution-runtime.test.ts`, and the SPEC 009 audit reports.
- These changes are not yet committed or pushed at this checkpoint.
- Investigated all five previously named failing test files with a temporary Vitest workspace routing `REDIS_URL` to isolated Redis `127.0.0.1:6391` and `TEST_DATABASE_URL` to `m009_privilege_test`; **5 files / 27 tests passed** sequentially. The temporary workspace was removed. This does not prove the cause of the prior full-suite failures; the full suite was not run.
- Re-ran worker typecheck and targeted ESLint after startup composition; both passed. ESLint initially caught `== null`; changed it to explicit null/undefined checks and reran clean.

## Full unit/contract/integration workspace and failure closure — 2026-10-29

- Ran the complete serial unit/contract/integration Vitest workspace with disposable PostgreSQL `m009_privilege_test` and isolated Redis `127.0.0.1:6391`: **243/243 files, 1,851/1,851 tests passed**, duration 906.98 seconds. This includes runtime, API contract, worker integration, and web unit suites; separate adverse and visual projects were not run.
- First run identified two failures. The email child-process tests inherited the repository's empty `EMAIL_TRANSPORT` from `.env`; production treated empty as invalid rather than omitted. `createDefaultMailer` now trims and normalizes blank transport to `undefined`, preserving the documented SMTP default. All 3 email boot tests pass.
- The admin capability contract assumed the sandbox URL was absent, while repository `.env` provides `http://localhost:3003`. The no-sandbox test now explicitly deletes that ambient default before asserting; the file passes 27/27.
- Full rerun after both changes passed all 243 files and 1,851 tests. Expected logs from negative DB, provider, cancellation, and failure-injection tests are not suite failures.
- The 28-gate DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**. Remaining key gaps include production `resolvePlan`/API queue dispatch, registered production engine adapter, full privilege matrix, separate adverse/visual projects, browser, performance, coverage, and real R2 verification.
- This update includes two API files in the SPEC 009 scope: `apps/api/src/app.ts` and `apps/api/tests/contract/admin.capabilities.test.ts`. Existing owner website/auth changes and lockfile/log/generated paths remain excluded.

### Delivery update — 2026-10-29

- Scoped commit `1d6e8b80db7ce0c98b4b6f044d97290ec54795d0` (`fix(spec-009): compose worker adapters and close suite failures`) was committed and pushed normally to `origin/main`.
- Post-push `git fetch origin main`, local `HEAD`, `origin/main`, and `git ls-remote origin refs/heads/main` all agree on `1d6e8b80db7ce0c98b4b6f044d97290ec54795d0`.
- Final checks: full isolated unit/contract/integration workspace 243/243 files and 1,851/1,851 tests; API typecheck; scoped ESLint; scoped Prettier; `git diff --check` all passed.
- Only pre-existing website/auth work, `pnpm-lock.yaml`, `apps/web/.next-final-cta-verify/`, and `logs/` remain dirty/untracked; they were not staged or committed.
- SPEC 009 remains PARTIALLY COMPLETE; see current DoD and remaining gaps above.

## Full adverse workspace — 2026-10-29

- Ran the complete serial adverse Vitest workspace with both `DATABASE_URL` and `TEST_DATABASE_URL` explicitly set to disposable `m009_privilege_test`, and Redis set to `127.0.0.1:6391`.
- Result: **72/72 files passed, 1,134 tests passed, 1 test skipped** (1,135 total). The skip is reported by `packages/capability-sdk/tests/adverse/context-confinement.test.ts`.
- Included `apps/api/tests/adverse/safety-role-isolation.test.ts` (116/116), `core01-role-isolation.test.ts` (7/7), and the other API/worker security, safety, concurrency, SSRF, sandbox, and containment cases. Real Chromium SSRF tests for the probe-pool boundary passed; manual Chrome acceptance for SPEC 009 was not performed.
- The worker/API plan producer path, production adapter registration, complete privilege matrix, visual/Playwright, manual Chrome, k6/load, coverage, and real R2 checks remain open. DoD remains 25 PARTIAL / 3 NOT STARTED / 0 PASS.

## Hard-stop regression continuation — 2026-10-29

- Added a real OS child process to the execution-runtime integration fixture. The regression failed before the fix: timeout expired but the child was never terminated because the host dropped `dispatchExecutionUnit`'s returned handle and awaited `adapter.run()` indefinitely.
- Updated the host to retain and terminate that handle on abort, race adapter completion against abort, and return `CHILD_TERMINATION_UNCONFIRMED` without finalizing or releasing the lease if the kill cannot be confirmed.
- Re-ran `apps/worker/tests/integration/execution-runtime.test.ts` on the isolated PostgreSQL `m009_privilege_test` and Redis `127.0.0.1:6391`: **18/18 passed**. Worker TypeScript check passed. `git diff --check` passed.
- Scope limit: the dispatched child is still inert; `adapter.run()` executes in the worker process. Engine-in-child execution, host-owned IPC for effects/checkpoints, and production engine registration remain open. DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**.
- Changed SPEC 009 paths: `apps/worker/src/execution-runtime/host.ts`, `apps/worker/tests/helpers/test-adapter.ts`, `apps/worker/tests/integration/execution-runtime.test.ts`, and `docs/audits/spec-009-implementation/{DEFINITION_OF_DONE.md,SESSION_PROGRESS.md}`. Pre-existing website/auth edits, lockfile, generated output, and logs remain untouched.

## Per-unit child execution and IPC — 2026-10-29

- Added `process-child.ts` and `child-entry.ts`: every non-passive unit forks one OS process before the `RUNNING` edge; only a local workspace file module and the unit's execution data are sent to it. The child receives an allowlisted environment without `DATABASE_URL` or `REDIS_URL`.
- Engine work now executes in the child. Effect authorization, effect confirmation, evidence writes, and progress ticks cross a validated IPC protocol to parent-owned services. The parent deadline is armed before worker-side unit reads; abort kills the child, and failed termination leaves the row/lease for the planned sweep.
- Test-first evidence: the process-ID regression failed before implementation (child evidence PID equaled the worker PID), then passed after the change. Runtime integration is **19/19** with real isolated PostgreSQL/Redis/BullMQ; child evidence verifies distinct PID and absence of DB/Redis URLs. Safety role-isolation plus worker kill-switch adverse suites: **127/127**.
- Worker TypeScript check, scoped ESLint, Prettier, `git diff --check` passed. A uniquely tagged `webaudit-worker:spec009-child-isolation` image built; an in-image Node/TSX smoke exercised the actual `forkExecutionChild` and returned `ENGINE_RESULT`. Existing Docker services were not replaced or restarted.
- Updated PROJECT_MAP, DoD, requirement delta, verification report, and this progress record. DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS** because API plan resolution still has no production caller, no production engine is registered, and other gates (complete privilege/race matrix, browser/visual, load, coverage, R2) remain open.
- Current changes are not yet committed. Earlier dirty website/auth files, lockfile, generated output, and logs remain untouched.

## Safety-checkpoint IPC regression continuation — 2026-10-29

- Runtime integration now passes **20/20**. The added F07 regression revokes a grant during child work and verifies checkpoint STOP travels over IPC, the host kills the child, the unit finalizes as `KILLED` with `AUTHORIZATION_REVOKED`, and the lease is released.
- Re-ran targeted adverse suites against isolated PostgreSQL/Redis: safety role isolation **116/116** and worker kill switch **11/11**, total **127/127**.
- Worker TypeScript check and scoped ESLint pass. Scoped Prettier initially found formatting in the integration test; the file was formatted and the complete scoped Prettier check then passed. `git diff --check` passed.
- Current branch is `main`; `HEAD` and `origin/main` both resolve to `974d2620306a200660304984f0e42eac174d4445`. The new runtime changes and evidence are still uncommitted. The worker image predates the checkpoint addition and must be rebuilt/smoke-tested before its evidence is current.
- DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**. No claim is made that the entire SPEC 009 suite was rerun after these changes.

## Full workspace and Docker revalidation — 2026-10-29

- The first full-suite retry was interrupted after setup failures showed Docker Desktop and its isolated PostgreSQL/Redis containers were down; exit `0x40010004` was a console interruption, not a test assertion failure. Docker Desktop was started and only disposable verification containers were recreated on ports 5545/6391.
- Re-ran the complete serial unit/contract/integration workspace against fresh disposable PostgreSQL/Redis using a temporary Vitest workspace override: **243/243 files, 1,854/1,854 tests passed** in 1,001 seconds. This run includes the 20-test execution-runtime suite.
- Rebuilt `webaudit-worker:spec009-child-isolation` after the checkpoint IPC addition. In-image smoke returned `ENGINE_RESULT`; parent mediation observed `PROCEED`; child evidence reported `DATABASE_URL` and `REDIS_URL` unavailable.
- Targeted runtime/adverse results remain 20/20 and 127/127. The complete adverse workspace was also rerun after the runtime changes: **72/72 files, 1,134 passed, 1 skipped** in 462.33 seconds. DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**; visual/browser, production API/engine, complete privilege/race matrix, load, coverage, and real R2 gates remain open.

## Final continuation — 2026-10-29

- The latest full Playwright CLI run finished **93/93 passed** in 26.2 minutes on isolated PostgreSQL `127.0.0.1:5545` and Redis `127.0.0.1:6391`. Focused previously failing queue/onboarding specs and the auth visual suite also passed after the harness changes.
- First full browser attempt was **90/93** because two specs forced the API to use shared development Redis `localhost:6389/15` while the worker used isolated Redis `6391`. That run created keys in dev Redis DB15 (47 keys were present at inspection). Nothing was flushed or deleted. Harness fixes now force API Redis to the configured isolated `TEST_REDIS_URL`; later browser runs did not access port 6389.
- The first browser run also found empty signup could be submitted; the signup button now requires a non-empty email and 12-character password. This user-owned auth/public-page refactor remains outside the SPEC 009 commit.
- Final full unit/contract/integration rerun is green against the same disposable database and Redis: **243/243 files, 1,855/1,855 tests passed** in 754.79 seconds with `EXEC_TEST_REDIS=127.0.0.1:6391`. A first rerun omitted this suite-specific variable (242/243 files passed, runtime file hit fallback `localhost:6399`); the focused runtime rerun then passed 21/21 and the corrected full rerun passed.
- Full adverse workspace is green: **72/72 files, 1,142 passed, 1 skipped**. Runtime integration is **21/21**. API, worker and web typechecks pass. `pnpm test:visual` completed with **8 passed, 17 todo**; the reference parity assertions remain todo, so visual acceptance is not claimed.
- Updated the 49-entry requirement matrix, 28-gate DoD, final verification report, implementation backlog, and PROJECT_MAP test-environment note. Current DoD is **11 PASS · 13 PARTIAL · 4 NOT STARTED**; verdict remains **NOT COMPLETE** because production API plan dispatch, production engine registration, full privilege/AC matrix, visual parity, audit rollback, real R2, performance, coverage, and manual Chrome remain open.
- Keep shared development/production containers untouched. Do not clean Redis DB15: it is a shared developer DB and this run made no deletion attempt.

## Privilege migration continuation — 2026-10-29

- Latest continuation: fresh disposable DB is current through **34 migrations**. The real CORE-01 LOGIN-role suite passes **20/20** after test-first fixes for narrowly scoped `fahes_api` reads. API login resolves passive and authorized BROWSER plans and executes F01 authorization; the generic worker still cannot select authorization rows.
- Worker runtime remains **21/21**; artifact/evidence/retention/reaper checks **32/32** with an in-memory object store; existing phase progress **1/1** over isolated Redis. These are separate service-level proofs, not a production HTTP-to-queue scan flow. Gate 10 remains PARTIAL; gate 24 remains NOT STARTED. SPEC 009 remains NOT COMPLETE.
- Two additive migrations and the role-isolation test are the only SPEC 009 code changes in this continuation. Existing website/auth dirty files and generated output/logs remain excluded.

- Starting checkout was `main`, `HEAD` and `origin/main` both `4ed0ed067952e7e29cdd60619ee0c0c1a1e0ffdb`; this is newer than the historical handoff hash `96df6fe72d11`. The WebAudit remote is `Yousef-Abdallah-1711/Webaudit-ai-.git`. Existing website/auth, lockfile, generated output, and logs changes were preserved.
- On a newly created disposable `m009_core01_fresh_test` database, all **32 migrations** applied from the beginning; `prisma migrate status` reported up to date. The isolated database and Redis container were used; shared dev/prod databases and running production-named containers were not changed.
- The CORE-01 real LOGIN-role suite passes **17/17**. Catalog inspection confirms all ten CORE-01 tables are owned by `fahes_owner`, runtime groups are non-superuser, `public` and `fahes_exec_host` cannot create in schema `public`, and the finalizer/host SECURITY DEFINER helpers have fixed search paths.
- Test-first finding: `fahes_dependency_same_plan()` retained default PUBLIC EXECUTE despite being a SECURITY DEFINER trigger helper. The new adverse assertion failed before the fix. Additive migration `20261030180000_core01_revoke_public_definer_execute` removes it; after deploy the suite passes, including API insertion being rejected for a cross-plan edge by the actual trigger. A separate temporary API finalizer grant produced the expected failing regression assertion and was revoked immediately on the disposable database.
- Worker execution-runtime integration passes **21/21** with actual PostgreSQL, Redis/BullMQ, non-superuser host login, child process, F07 checkpoint, progress/evidence, and finalization. It still does not exercise a production API `resolvePlan` producer or production engine.
- Remaining verification: broad tenant/effect/lease-secret permission cases, real production API/worker role deployment, end-to-end API plan producer, R2, outages/restarts, Chrome, load/performance, coverage, and complete U-1 matrices. SPEC 009 remains NOT COMPLETE.
- Additional isolated evidence/retention/reaper suites passed **32/32**, and API/worker phase progress passed **1/1**. Scoped change delivery is commit `80118ad59f03fb80c523c3d10bfb795850f62c6e`; remote `main` was verified to match. The unit-progress authenticated reconnect/recovery gap remains open.

## U-1 continuation — 2026-10-29

- Fresh isolated database `m009_core01_evidence_fence_test` applied all **35 migrations**; isolated Redis `127.0.0.1:6391` was used for worker runtime. The `fahes_exec_host` can write engine evidence through the new fence helper, while direct host-role `UPDATE Scan.startedAt` is rejected. `fahes_owner` has only column-level UPDATE on `Scan.startedAt` to acquire the row lock inside the helper.
- Re-ran `resolver.test.ts`, `dispatch.test.ts`, `runtime.test.ts`, and `planned-timeout-sweep.test.ts`: **125/125**; `core01-schema.test.ts`: **17/17**; evidence tests: **25/25**; worker runtime: **21/21**; refund-staleness adverse checks: **2/2**. API and worker typechecks, Prisma validation, scoped ESLint, Prettier (changed TS/docs; SQL has no configured parser), and `git diff --check` pass.
- Added timeout-sweep/finalization race coverage and a late dependent-unit refusal; the planned refund regression also verifies the fresh `ModuleResult` read after expiry processing.
- T-U1-1 through T-U1-9 are checked. T-U1-10 remains open; AC-5/12/17/19 have explicit restart/progress, timing-bound, or production-engine gaps listed in `DEFINITION_OF_DONE.md`. SPEC 009 remains **NOT COMPLETE**. This continuation's changes are local/uncommitted, and existing website/auth edits, lockfile, generated output, and logs remain outside scope.

## Progress/redelivery deadline check — 2026-10-29

- Added an isolated integration assertion to the duplicate-delivery worker test: a mutable unit progress update and repeated queue delivery preserve the owning plan's immutable `deadlineMs`; the durable host claim count remains one.
- The targeted case passed **1/1** against `m009_core01_evidence_fence_test` and isolated Redis `127.0.0.1:6391`. The first attempt exposed an ordering mistake in the test itself (waiting for RUNNING before enqueue); it was corrected, and the final run passed.
- AC-5 is still PARTIAL until worker restart/recovery is exercised. AC-12/17/19 and T-U1-10 remain open. Production API plan resolution and SPEC 010–012 adapters remain absent. Current passive scans stay on the legacy route under the parallel-run boundary; no cutover behavior was invented.

## CORE-01 privilege matrix follow-up — 2026-10-29

- Expanded `core01-role-isolation.test.ts` with a catalog-backed exact table-level matrix across six real LOGIN roles and all ten CORE-01 tables, including denial of table-level `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges.
- Added exact execute grants and no-PUBLIC checks for the five CORE-01 SECURITY DEFINER functions. The isolated real-login suite passes **22/22** on `m009_core01_evidence_fence_test` after all 35 migrations.
- Residual gap: tenant/effect abuse cases and production API/worker service credentials are not verified. This strengthens the isolated privilege evidence but does not close DoD gate 22.

## AC-12 live sweep cadence follow-up — 2026-10-29

- Added a real BullMQ repeat-scheduler test to `planned-timeout-sweep.test.ts`. It waits for an initial empty sweep, then creates a terminal scan with a pending unit and measures until the next scheduled sweep expires it.
- The full file passes **12/12** against isolated PostgreSQL and Redis. The tested bound is one configured 5-second interval plus the 5-second host-loop allowance.
- This proves the PLANNED/no-child case only. Active-engine termination/confirmation remains open because no production adapter is registered; AC-12 remains PARTIAL.

## AC-12 registered engine expiry-hook follow-up — 2026-10-29

- The production worker now passes its execution adapter registrations into the timeout-sweep handler. Expiry routes RUNNING units to the matching adapter's `onUnitExpired` hook, preserves passive-unit semantics, and applies that adapter's `hardStopMarginMs`; a missing hook stays PENDING until the compatibility margin.
- The regression first failed because the timeout handler never called the hook. After wiring, confirmed termination and PENDING-within-engine-margin cases pass; the full `planned-timeout-sweep.test.ts` file passes **14/14** against isolated PostgreSQL and Redis. Worker typecheck passes.
- The registry now rejects non-passive adapters that omit `onUnitExpired`; the test-only crash worker was updated to provide the hook. The focused process crash/replacement regression passes, and the full execution runtime file passes **22/22**. The planned sweep plus adapter-registry tests pass **15/15**. API and worker typechecks, scoped ESLint, and Prettier pass.
- This tests the worker seam with a registered test adapter. No production SPEC 010–012 adapter/backstop exists, so AC-12/19 remain PARTIAL, T-U1-10 is open, and SPEC 009 remains NOT COMPLETE. Changes remain local and uncommitted; unrelated website/auth work and the pre-existing migration edit were preserved.

## AC-5 consumer recreation follow-up — 2026-10-29

- Extended the real PostgreSQL/Redis/BullMQ runtime case: after progress and duplicate delivery complete a unit, it closes that worker consumer, creates a new host identity, and redelivers the terminal unit.
- The focused case passes **1/1**; terminal state and one host claim remain unchanged, and the plan deadline is identical before/after the redelivery.
- This is consumer recreation after completion, not an OS process crash with active work. AC-5 remains PARTIAL pending in-flight process restart/recovery evidence.

## Known suite regression follow-up — 2026-10-29

- Re-ran `email-boot-guard.test.ts` with `EMAIL_TRANSPORT=''` and the isolated Redis endpoint: **3/3 passed**. Updated its child-process environment to follow `TEST_REDIS_URL` or `EXEC_TEST_REDIS`, removing the prior hard-coded shared Redis DB 15 dependency.
- Re-ran the unconfigured sandbox capability contract with a throwaway JWT secret and isolated services: **1/1 passed**. The test deletes the repository `.env` URL before exercising the 503 path.
- Full serial suite was not rerun after this test-harness change. Its latest full pass is in `FINAL_VERIFICATION_REPORT_2026-10-29.md`; the two targeted reruns confirm the previously diagnosed regressions only.

## AC-5 execution-worker crash/replacement follow-up — 2026-10-29

- The real isolated worker runtime file passes **22/22** on disposable PostgreSQL and Redis. Its new subprocess case creates a temporary non-superuser execution-host login, confirms one F07 effect, kills the worker process while the unit is RUNNING, and starts a replacement worker.
- The replacement fails the stalled BullMQ job without re-claiming the unit or repeating its confirmed effect. The test observes the per-unit child exit after IPC disconnect, keeps `ScanPlan.deadlineMs` unchanged, then advances the scan start time beyond that deadline and verifies expiry finalizes the unit.
- `execution-child-disconnect.test.ts` separately passes **1/1**. AC-5 is COVERED; outage recovery and AC-12/17/19 gaps remain. SPEC 009 remains NOT COMPLETE.
- CORE-01 real-login privilege matrix passes **22/22** on the same isolated PostgreSQL database; the planned timeout sweep passes **12/12** on isolated PostgreSQL/Redis. The complete workspace suites were not rerun after these scoped changes.

## Full regression refresh — 2026-10-29

- Full unit/contract/integration workspace passed **244/244 files, 1,864/1,864 tests** on disposable PostgreSQL and Redis `127.0.0.1:6391`. Full adverse workspace passed **73/73 files, 1,151 passed, 1 skipped**.
- The Vitest project Redis setting now honors `TEST_REDIS_URL`; the API secure-cookie integration child was updated to honor it too and passed **2/2** on isolated Redis. This fixes the remaining unconditional 6389/15 child override found during the audit.
- Focused SPEC 009 checks: worker runtime **22/22**, planned sweep/registry **15/15**, CORE-01 real-login matrix **22/22**, and execution-child disconnect **1/1**. API/worker typechecks, scoped ESLint, Prettier and diff check pass.
- Full Playwright E2E 93/93 remains prior evidence, not rerun in this continuation. Visual parity assertions (17 todo), the 24-step manual Chrome journey, production API plan producer, production engine/backstop, R2, performance and coverage remain open. SPEC 009 is NOT COMPLETE.

## AC-19 lease-retention verification — 2026-10-29

- Strengthened `apps/api/tests/unit/planning/runtime.test.ts` to create a real RUNNING unit through F07 admission, then expire its plan. The real PostgreSQL assertions prove a PENDING termination keeps the admission lease live, a confirmed termination releases it, and the bounded `TERMINATION_UNCONFIRMED` outcome releases it only after the margin.
- The first focused run caught a fixture-order issue: the unit was being admitted after its deadline. The fixture now admits the unit before advancing `Scan.startedAt`, matching the production lifecycle. The complete runtime file passes **54/54** against isolated PostgreSQL.
- AC-19 gains component-level lease-ordering evidence, but remains PARTIAL because no production engine termination backstop is registered. T-U1-10 remains open for the full AC matrix and deployed clock-skew/production-engine evidence.

## AC-17 reverse clock-skew verification — 2026-10-29

- Added the missing reverse-skew case to `apps/api/tests/unit/planning/runtime.test.ts`: with the scan already past its immutable deadline, the worker clock is moved 10 hours behind and the pre-run classifier must still return `SCAN_DEADLINE_EXPIRED` from PostgreSQL's clock. The existing companion test moves the worker clock 10 hours ahead while the plan is live and expects `NONE`.
- The complete API runtime file passes **55/55** against isolated PostgreSQL. AC-17 now has deterministic two-direction worker-skew evidence; the deployed NTP/skew bound remains unverified, so DoD gate 14 and T-U1-10 stay partial/open.

## Finalization audit rollback verification — 2026-10-29

- A disposable PostgreSQL trigger forces the terminal row update to fail after F07 lease release. The unit remains RUNNING, the live lease and concurrency counter remain unchanged, and no `BUDGET_RELEASED` row is committed. After removing the trigger, finalization succeeds and exactly one release audit event is committed.
- The API runtime suite passes **56/56**. DoD gate 20 is PASS for transactional consistency of the existing F07 event. The SPEC 009 finalizer does not create a duplicate audit event; overall SPEC remains NOT COMPLETE.

## Local performance smoke baseline — 2026-10-29

- Extended `scripts/spec009-dag-benchmark.ts` to measure passive plan resolution, DAG scheduling, BullMQ queue latency and a 500-job burst, inline evidence writes, artifact metadata plus a memory object store, planned-unit REFUSED finalization, and failed-scan sweep. Nine 100-iteration DAG/queue runs, five 100-plan PostgreSQL runs, and three 100-operation runs for the remaining DB-backed paths are recorded in `PERFORMANCE_BASELINE_2026-10-29.md`. Two no-op bursts measured 2,950–3,083 jobs/s; serial finalization measured 720–898 REFUSED units/s.
- Full workload, host details, reproduction command, limits and unmeasured dimensions are recorded in `PERFORMANCE_BASELINE_2026-10-29.md`. The benchmark ran on the host against isolated PG/Redis containers. Sustained capacity, resource usage, successful running-engine completion, real R2 and outage performance remain unmeasured, so DoD gate 23 stays PARTIAL.
- DoD gate 23 is now PARTIAL. Current DoD count is **11 PASS · 15 PARTIAL · 2 NOT STARTED**; SPEC 009 remains NOT COMPLETE.

## Fresh CORE-01 login-role verification — 2026-10-29

- Re-ran `apps/api/tests/adverse/core01-role-isolation.test.ts` against a newly created `m009_core01_role_audit_test` database on the isolated PostgreSQL container. All **22/22** tests passed after all **35** migrations were applied. The suite checked real LOGIN roles, effective CORE-01 table grants, SECURITY DEFINER function execution grants, direct-write denial, API planning/F01, host/orchestrator finalizer roles, and worker/F07 entry points.
- The suite removed its temporary LOGIN roles. Catalog verification found **0** `zz_t_009_*` roles remaining. This strengthens isolated grant evidence; tenant/effect abuse coverage and deployed API/worker credential verification remain open, so security/privilege gates stay PARTIAL.
- Re-ran `apps/worker/tests/integration/execution-runtime.test.ts` on separate fresh databases `m009_core01_runtime_audit_test` and `m009_core01_runtime_recheck_test` with isolated Redis `127.0.0.1:6391`; both runs passed **22/22**. This exercises real BullMQ, PostgreSQL, an execution-host LOGIN, F07 admission/effect/evidence, hard stops, lease loss, duplicate delivery, and worker crash/replacement using the deterministic test adapter. The production engines remain owned by SPEC 010–012.
- A before/after role-catalog comparison around the recheck showed the worker test suite added no `zz_exec_host_*` or `zz_exec_crash_*` login. One `zz_exec_host_*` login that existed before the recheck remains; it has only `fahes_exec_host` membership and no database-owned objects. Its origin predates the recorded inventory, so it remains untouched.

## Known suite-failure recheck — 2026-10-29

- On a separate fresh `_test` database and isolated Redis, the production email boot guard passed **3/3** again, including empty/unset `EMAIL_TRANSPORT` and both SMTP startup cases.
- The previously fixed sandbox-unconfigured API contract case passed **1/1** when run by exact test-name filter from `admin.capabilities.test.ts` (26 unrelated cases were skipped by the filter). The full recorded serial unit/contract/integration and adverse runs remain **244/244 files, 1,864/1,864 tests** and **73/73 files, 1,151 passed, 1 skipped**; they were not rerun in this continuation.

## AC-1 legacy timeout boundary follow-up — 2026-10-29

- Added a no-plan regression that runs the real timeout sweep at 14m50s and confirms the scan remains `RUNNING_PHASE_1` with no refund, then moves it just beyond 15 minutes and confirms `TIMED_OUT` with exactly one refund.
- The complete `planned-timeout-sweep.test.ts` file passes **15/15** on a fresh isolated PostgreSQL database and isolated Redis. This closes the explicit legacy-boundary assertion, not the full AC-1…AC-20 matrix.
- T-U1-10 remains open; production-engine timing/backstop, deployed NTP/skew bound, and remaining acceptance breadth remain unverified. Overall SPEC 009 remains **NOT COMPLETE**; DoD stays **11 PASS · 15 PARTIAL · 2 NOT STARTED**.

## AC-20 passive dispatch follow-up — 2026-10-29

- Added a dispatch case with an expired plan and a `PASSIVE_HTTP` unit. Dispatch returns `PASSIVE_LEGACY_QUEUE` before deadline step 0; the unit stays `PLANNED` and no host claim, F07 call, lease, or budget counter is created.
- `apps/api/tests/unit/planning/dispatch.test.ts` passes **21/21** on isolated PostgreSQL. This verifies the passive boundary only; the complete AC matrix and production API-to-queue lifecycle remain open.
- Gate 14 remains PARTIAL and SPEC 009 remains **NOT COMPLETE**.

## AC-7 refund-staleness recheck — 2026-10-29

- Re-ran the adverse legacy/planned timeout refund regression against isolated PostgreSQL: **2/2 passed**. A module result committed after candidate discovery is included in the fresh refund read, limiting the refund to the still-undelivered module.
- This adds no broader race-matrix coverage; gate 14 remains PARTIAL and SPEC 009 remains **NOT COMPLETE**.

## AC-16 dispatched-unit expiry follow-up — 2026-10-29

- Added a real dispatch-to-expiry race against PostgreSQL: F07 admits the unit, dispatch pauses at `DISPATCHED` before the child can run, and expiry refuses it while blocking the dependent and releasing its lease. Resuming dispatch loses the transition race and invokes `terminate()` on the inert-child test handle; no second admission or effect authorization occurs.
- `dispatch.test.ts` passes **22/22**. The API runtime suite passes **56/56** after removing the earlier seeded-state test. This covers the dispatched pre-child state only; T-U1-10 and DoD gate 14 remain open/partial.

## CORE-01 real-login tenant-boundary recheck — 2026-10-29

- Added a cross-tenant resolver attempt through the actual `fahes_api` LOGIN role: the scan belongs to one user while the supplied target belongs to another. The resolver returns `REFUSED/SCAN_NOT_FOUND` and persists no plan or execution units.
- `apps/api/tests/adverse/core01-role-isolation.test.ts` passes **23/23** on isolated PostgreSQL with the complete 35-migration schema. Catalog verification found **0** temporary `zz_t_009_*` roles after cleanup. DoD gate 22 remains PARTIAL because broader effect abuse and deployed credential checks remain open.

## AC-15 pending-stop termination-boundary follow-up — 2026-10-29

- Compared the edge against `scan-deadline-contract.md` and U-1b v6: an F07 stop prevents a deadline `TIMEOUT`, while a non-passive engine still reporting `PENDING` past its hard-stop margin must end as `TRANSIENT_INFRASTRUCTURE/TERMINATION_UNCONFIRMED` and hold its F07 lease until that boundary.
- Added a real-F07 test for the uncovered combination. It verifies the unit stays RUNNING and retains its lease during the margin, then finalizes as `TERMINATION_UNCONFIRMED` rather than `TIMEOUT` after the margin. The API runtime file passes **57/57** against isolated PostgreSQL `m009_core01_u1_boundary_test`; API typecheck, targeted ESLint, Prettier, and `git diff --check` pass.
- This adds one AC-15/19 interaction case; it does not close T-U1-10. Production-engine backstop, deployed NTP/skew evidence, and remaining acceptance breadth remain open. SPEC 009 remains **NOT COMPLETE**.

## CORE-01 direct ledger-access abuse follow-up — 2026-10-29

- Extended the real LOGIN-role suite to attempt claim reads/inserts, effect ledger reads/inserts/updates, and execution of the host-only live-lease helper. API, generic worker, operator, and ungrouped roles are denied these operations; the orchestrator can read effect rows as explicitly granted but cannot mutate them or invoke the host helper. This checks actual SQL access as well as the catalog privilege matrix.
- The suite passes **24/24** on isolated PostgreSQL with all **35** migrations applied. Post-run catalog inspection found **0** temporary `zz_t_009_*` roles.
- DoD gate 22 remains PARTIAL because production service credentials and broader tenant/effect abuse paths are not verified. SPEC 009 remains **NOT COMPLETE**.

## Production-compose database role separation — 2026-10-29

- Read-only inspection of the existing local `webaudit-ai-production` Compose stack showed API and worker both connect as `webaudit_local`, a PostgreSQL superuser with full DML on F07 and CORE-01 sensitive tables. The existing services and data were not changed.
- Updated the production Compose topology to reserve `MIGRATION_DATABASE_URL` for the one-shot migration and provisioning jobs. The provisioner creates/reconciles `webaudit_api_runtime` and `webaudit_worker_runtime` with only `fahes_api`/`fahes_worker_exec` membership; the API and worker receive distinct runtime URLs. Removed the production single-user PgBouncer option because its fixed backend identity would bypass role separation; the dev-only pooler remains documented.
- Verified the SQL provisioner against the isolated PostgreSQL service, including TCP login for both roles: both are non-superusers, have their expected group membership, and cannot read sensitive effect/lease tables. Roles were dropped after that isolated check.
- Reconciliation hardening test seeded stale direct grants on `public` schema/table objects and an unintended `fahes_operator` membership for the API login. The provisioner removed those, preserved only each expected group membership, and left both roles without elevated cluster flags or the seeded access. A separate owned-table probe made provisioning fail closed; after removing the probe, provisioning succeeded. Both temporary runtime roles and the probe were dropped after the checks.
- A separate throwaway Compose project applied all 35 migrations, completed role provisioning, brought API and worker healthy with the distinct non-superuser logins, showed live DB sessions under those identities, omitted admin/provision secrets from app containers, and returned API `/health` 200. Its containers and volumes were created separately from the existing stack.
- Gate 22 remains PARTIAL because the already-running local stack still uses `webaudit_local` until it is recreated with the new role URLs, and deployed credentials/broader abuse paths remain unverified. Gate 24 stays NOT STARTED: this smoke is not a real scan end-to-end.

## AC-13 post-finalizer timeout race — 2026-10-29

- Added an isolated regression where the plan gate passes its first deadline check, a registered module-result finalizer advances the scan past the database deadline, and the real timeout sweep marks it `TIMED_OUT` and refunds the undelivered module.
- The regression failed before the fix because the gate still returned `continued` and enqueued master synthesis after the sweep won. `continueScanIfPlanTerminal` now rechecks the scan barrier state and database-clock deadline after finalizers and before the queue side effect.
- `planned-timeout-sweep.test.ts` passes **16/16** on a fresh disposable database with isolated Redis, including the race asserting no enqueue and exactly one 15-credit refund. Its repeat-scheduler case requires `EXEC_TEST_REDIS=host:port`; the first full-file attempt omitted it and tried the former default port 6399. The test now fails fast when the endpoint is missing, and the isolated rerun with `127.0.0.1:6391` passed.
- API/worker typechecks, targeted ESLint, Prettier and `git diff --check` pass. T-U1-10 remains open for remaining AC breadth and production-engine/deployed-clock evidence; DoD gate 14 remains PARTIAL and SPEC 009 remains NOT COMPLETE.

## AC-12 live active-adapter sweep — 2026-10-29

- Extended the real BullMQ repeat-scheduler integration case to include a RUNNING BROWSER execution unit with a registered test adapter, alongside the existing PLANNED unit. The live timeout-sweep handler invokes the adapter's `onUnitExpired` hook and finalizes the unit within the configured 5-second sweep interval plus 5-second host-loop allowance.
- The targeted live-scheduler test passes **1/1**, and the combined `planned-timeout-sweep.test.ts` file passes **16/16** on disposable PostgreSQL and Redis DB 14. Worker typecheck, targeted ESLint and Prettier pass. This verifies bounded sweep composition with a deterministic test adapter; no SPEC 010–012 production engine/backstop exists, so AC-12 and DoD gate 14 remain PARTIAL.

## AC-13 atomic continuation claim — 2026-10-29

- The plan gate now requires the worker state-machine's one database-clock CAS from `RUNNING_PHASE_3` to `RUNNING_MASTER` after module-result finalizers. A timeout sweep or concurrent gate caller that wins first prevents the losing caller from enqueueing master synthesis; the write remains behind the central transition authority.
- The CAS winner emits the persisted-state progress event and queues the master phase with `alreadyTransitioned=true`; worker phase entry therefore does not attempt a second state transition.
- The isolated worker suites pass **39/39** (`planned-timeout-sweep.test.ts` 17/17 and `execution-runtime.test.ts` 22/22), including concurrent gate callers, finalizer-versus-timeout, and standard-worker queue composition. The latter confirms the scan state is `RUNNING_MASTER` and the queued payload is `alreadyTransitioned=true`.
- API/worker typechecks, targeted ESLint, source Prettier, and `git diff --check` pass. T-U1-10 and gate 14 remain open/partial; SPEC 009 remains **NOT COMPLETE**.
