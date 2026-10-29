# SPEC 009 — independent verification report (2026-10-29)

## A. Executive summary

**Verdict: PARTIALLY COMPLETE.** SPEC 009 has a working service layer and a direct integration path that passed against disposable PostgreSQL, Redis, and BullMQ. A new role-isolation regression reproduced and fixed excess finalizer grants on a fresh migration chain. The worker startup factory now composes locally supplied SPEC 009 adapters, but its executable entrypoint currently supplies none; no SPEC 010–012 production engine is registered, and the API-to-worker path was not exercised. DoD gates remain open.

## B. Starting repository state

- Checkout: `H:\Projects\Webaudit-ai-`; branch `main`.
- Local HEAD and `origin/main` at inspection: `96df6fe72d1107c352e89b9aa6534d612077e4a7`; working tree was already dirty.
- GitHub API and `origin` identify `Yousef-Abdallah-1711/Webaudit-ai-`; the pasted repository name `Yousef-Abdallah-1711/motakamel` returned not-found. No remote divergence was present.
- Existing website/auth refactor edits, `pnpm-lock.yaml`, `.next-final-cta-verify/`, and `logs/` were preserved and excluded from this SPEC 009 change set.

## C. Cross-device environment recovery

Node 24.16, pnpm 9.0.0, Docker 29.7.2, PostgreSQL 16 and Redis 7 images were available. Existing WebAudit production-named containers and shared development Postgres/Redis were left running and untouched. Two isolated disposable containers were created for this verification: PostgreSQL at `127.0.0.1:5545` and Redis at `127.0.0.1:6391`; Postgres data is tmpfs and the containers are `--rm`. A fresh isolated database received the full 27-migration chain. No owner database was reset or migrated in this session.

## D. Specification inventory

The SPEC 009 spec defines FR-001–047 plus amendments, 8 success criteria, 10 U-1 implementation tasks, and 28 DoD gates. Its contracts cover configuration, profiles, plan resolution, unit lifecycle, runtime, deadlines, finalization, evidence, artifacts, provenance, and retention. This report does not claim all 49 requirement entries were re-tested.

## E. Decision verification

The dated decision amendment records DEC-047 Option A, DEC-051 Option A, and DEC-066 Option A in principle as approved. The v6 amendment is retained. No business or billing policy was changed. Future-engine decisions remain with SPEC 010–012.

## F. Requirement-by-requirement delta review

Static inspection confirmed implementation in planning, runtime, safety integration, evidence, artifacts, materialization, and the planned timeout sweep. This session directly re-ran only the role-isolation regression and the execution-runtime integration suite. The requirement matrix's prior totals and commit references are stale and must not be treated as a fresh complete 49-FR review. Main current gaps: supplying a production adapter registry, API plan-resolution/dispatch invocation, full permission matrix, event consumer authorization/reconnect behavior, and full-stack evidence.

## G. Database migration results

Created disposable database `m009_privilege_test` and applied all 27 migrations successfully. The additive migration `20261030130000_core01_restrict_finalizer_grants` revokes `EXECUTE` on `fahes_finalize_unit` from `PUBLIC`, `fahes_api`, and `fahes_worker_exec`, then grants it to `fahes_exec_host` and `fahes_orchestrator`. No shared database received this correction. Fresh install was verified; upgrade/rollback of this new additive correction was not run.

## H. Real non-superuser privilege tests

`apps/api/tests/adverse/core01-role-isolation.test.ts` creates actual TCP LOGIN roles for API, generic worker, execution host, orchestrator, operator, and an ungrouped user. Against the pre-fix chain the regression failed for API and generic worker as expected. Against the corrected fresh chain all 7 tests passed: only host/orchestrator can execute the finalizer, column status update privilege is host-only, and a host direct terminal-status write is rejected by the trigger. Lease-secret reads, cross-tenant mutation, effect-ledger forgery, immutable plan writes, and all F07 function bypasses were not covered by this test; the complete requested privilege matrix remains open. The migrated existing development database still has the earlier grant state until the additive correction is deployed there.

## I. BullMQ integration results

`apps/worker/tests/integration/execution-runtime.test.ts`: the initial full run was 17/17; the current rerun after per-unit child execution and IPC passed 19/19 with real disposable PostgreSQL, Redis, BullMQ queues, and workers. Covered standard `startWorker` composition with a locally supplied test adapter, master-phase enqueue at the plan gate, shutdown draining, minimal payload rejection, duplicate delivery, dependent enqueue, progress publication, evidence rows, effect authorization, cancellation, kill switch, grant revocation, deadlines, hard stop, lost lease, and crashed-host state recovery. The process-isolation case proves a distinct PID, no database/Redis URLs in the child, and parent-mediated evidence writes. It is not an API HTTP flow or a production engine deployment.

## J. Execution host verification

The host/adapter implementation was exercised by those 17 tests; worker TypeScript typecheck passed. `startWorker` now composes explicitly supplied local adapters into per-class execution consumers, queues, the plan continuation gate, dependent enqueue, and shutdown. A review found that the unregistered-engine refusal path finalized without invoking the plan gate; that path now loads the plan's `scanId` and uses the configured gate. A mismatched adapter/unit class is refused. The executable entrypoint currently calls `startWorker()` without any adapter registry, because no SPEC 010–012 engine is registered; the repository still has no API production caller of `resolvePlan`.

## K. Progress-event verification

The integration suite observed multiple Redis progress messages on the per-unit channel and validated their shape and indeterminate flag. Authenticated frontend consumption, tenant authorization at subscription time, ordering through reconnect, missed/duplicate event recovery, and restart behavior were not verified.

## L. Artifact retention and reaper verification

Static inspection confirms `createArtifactReaperHandler` is included in the real worker handler map and `scheduleArtifactReaper` is scheduled on the maintenance queue. The worker also passes `artifactStore` into billing retention. This session did not run a retention/reaper lifecycle test or use R2; real object storage remains unverified. The old progress text claiming the reaper was unscheduled is stale.

## M. Real full-stack results

Existing WebAudit Docker containers reported healthy at inspection. They were not launched or modified in this session, and no HTTP scan lifecycle was run through them. Isolated database/Redis integration tests are not a real API+worker stack test.

## N. Real Chrome acceptance

Not run. No Chrome/Chromium manual journey, screenshot, trace, or Playwright MCP session is claimed.

## O. Failure injection

Controlled runtime tests covered cancellation, kill switch, authorization revocation, deadline, hard stop, lease loss, duplicate delivery, and a unit persisted RUNNING after host loss. PostgreSQL/Redis outage, actual process crash/restart, artifact upload/delete failure, and worker reconnection were not injected.

## P. Security review

Confirmed defect: the initial grant migrations left the finalizer callable by API and generic-worker roles. Reproduced with real login roles, fixed additively, and verified on a fresh migration chain. Direct host terminal update is trigger-blocked. The full adverse suite passed, including 116 safety role-isolation cases and 7 CORE-01 role-isolation cases. This is substantial coverage but not the complete SPEC 009 least-privilege matrix across lease secrets, tenant mutations, immutable plan data, effects, admission, every SECURITY DEFINER function, and real API/worker service connections. The correction is not yet deployed to the existing shared dev database.

## Q. Full unit suite

The serial unit/contract/integration workspace was run against disposable PostgreSQL `m009_privilege_test` and isolated Redis at `127.0.0.1:6391`: **243/243 files and 1,851/1,851 tests passed** in 906.98 seconds. It includes the five previously identified failing files, the SPEC 009 execution-runtime integration (17/17 at that time), the admin capability contract (27/27), and production email boot guard (3/3). The separate adverse and visual projects were not included; this is not Playwright/browser or complete SPEC 009 DoD evidence. Subsequent changes were verified with the targeted runtime integration (19/19), safety role-isolation and kill-switch adverse tests (127/127), worker typecheck/lint/format, and a separately tagged Docker image build and in-image child-process smoke.

The earlier whole-suite failures were resolved with two findings: `EMAIL_TRANSPORT=""` from the repository/deployment environment was treated as an invalid production transport instead of omitted, preventing the documented SMTP default; `SANDBOX_RUNNER_URL` from `.env` leaked into a contract test that assumed it was absent. Blank email transport now normalizes to unset, and the contract test explicitly clears its local default before asserting the unconfigured path. The focused tests and the complete serial workspace passed after these changes.

## R. Adverse suite

The full serial adverse workspace passed **72/72 files and 1,134/1,134 executed tests**, with one SDK adverse test skipped by the suite (1,135 total). This includes `safety-role-isolation.test.ts` (116/116), `core01-role-isolation.test.ts` (7/7), kill-switch, admission-race, auth, billing, sandbox escape, process-crash containment, capability containment, redaction, workspace-confinement, and real Chromium browser-pool SSRF checks. The Chromium tests cover the probe-pool SSRF boundary; they are not the manual SPEC 009 user journey.

## S. Contract suite

Contract tests were included in the complete serial unit/contract/integration workspace: **243/243 files and 1,851/1,851 tests passed**. Adverse project results are recorded separately in section R.

## T. Playwright regression

Not run. The web app build previously passed in this session chain, but a build is not browser regression evidence.

## U. Performance measurements

Not run. No k6 or load baseline was collected.

## V. Instrumented coverage

Not run. No coverage report was produced.

## W. Remaining defects and gaps

1. The worker startup factory composes supplied SPEC 009 adapters, but the actual executable entrypoint supplies none; no production engine exists yet.
2. Repository search found `resolvePlan` used in tests and defined in the API service, but no production caller. No API-to-plan-to-enqueue path was exercised.
3. No production SPEC 010–012 adapter is present; this is a future-spec dependency, not a reason to omit testing the generic runtime.
4. The complete negative privilege matrix and non-superuser API/worker execution remain open.
5. The full serial unit/contract/integration workspace now passes 243/243 files and 1,851/1,851 tests. The two initial failures were traced to blank `EMAIL_TRANSPORT` handling and an ambient `.env` sandbox URL; both are corrected and covered.
6. R2, event consumer security/reconnection, full stack, Chrome, k6, and coverage remain unverified.
7. Existing shared development database still has the earlier finalizer grants until the additive migration is deployed.

## X. External dependencies

- Future engine adapters and browser pool: SPEC 010–012 (D-1 remains open).
- R2 credentials and real object-storage verification: not used or requested.
- Repository identifier mismatch: supplied `motakamel` is not the valid configured remote; work remains on the verified `Webaudit-ai-` origin.
- No unresolved owner business decision was encountered.

## Y. Definition-of-Done results

The 28-gate reassessment is in `DEFINITION_OF_DONE.md`. The full serial unit/contract/integration and adverse workspaces passed, but the report still does not establish the production worker/API path, complete privilege matrix, visual/Playwright gates, manual browser acceptance, performance baseline, or instrumented coverage. No historical PASS was promoted solely from these suite results.

## Z. Git commits and remote synchronization

The reviewed SPEC 009 changes were committed as `b2f05c0d41d61f59f9cf385a63719f7c7ea049d3` (`fix(spec-009): restrict finalizer grants and close refusal gate`) and pushed to `origin/main` with a normal push. Follow-up `git fetch origin main`, `git rev-parse HEAD`, `git rev-parse origin/main`, and `git ls-remote origin refs/heads/main` all returned `b2f05c0d41d61f59f9cf385a63719f7c7ea049d3`. The branch is even with origin. Existing web/auth changes, lockfile changes, `.next-final-cta-verify/`, and `logs/` remain uncommitted and unstaged.

## Verification commands and evidence classification

- `pnpm.cmd --filter @webaudit/worker typecheck` — exit 0; static TypeScript check.
- `TEST_DATABASE_URL=...m009_privilege_test ... vitest run tests/adverse/core01-role-isolation.test.ts` — 7/7, real PostgreSQL TCP login roles; run earlier in this task chain against isolated Docker PostgreSQL.
- `TEST_DATABASE_URL=...m009_privilege_test EXEC_TEST_REDIS=127.0.0.1:6391 pnpm.cmd --filter @webaudit/worker exec vitest run tests/integration/execution-runtime.test.ts --reporter=dot` — 17/17; real PostgreSQL, Redis, BullMQ, test adapter, including standard worker startup factory composition.
- Temporary isolated Vitest workspace override set `REDIS_URL=redis://127.0.0.1:6391/15` and ran the five historical files serially — 5 files, 27/27 passed. The temporary workspace file was removed; the shared development Redis was not used.
- `pnpm.cmd --filter @webaudit/worker typecheck` — exit 0 after startup composition.
- Targeted ESLint on the five changed worker TypeScript files — exit 0 after correcting one strict-equality lint finding.
- The full serial unit/contract/integration workspace passed 243 files / 1,851 tests. API typecheck, scoped ESLint, scoped Prettier, and `git diff --check` also passed.
- The full serial adverse workspace passed 72 files / 1,134 executed tests with one skipped test.
- No separately launched API+worker plan-dispatch lifecycle, Chrome, Playwright MCP/CLI, real R2, k6, or coverage evidence is claimed.

## Post-checkpoint revalidation — 2026-10-29

- Latest execution-runtime integration: **20/20 passed** on isolated PostgreSQL, Redis, and BullMQ, including F07 checkpoint STOP over IPC during a child action. The test confirms the child is killed, the unit is finalized as `KILLED` with `AUTHORIZATION_REVOKED`, and its lease is released.
- Latest complete unit/contract/integration workspace: **243/243 files and 1,854/1,854 tests passed** in 1,001 seconds on fresh disposable PostgreSQL and Redis. The prior interrupted attempt was due to stopped Docker infrastructure; its `0x40010004` exit was a console-control interruption. No test assertion failures were reported in the completed rerun.
- Targeted adverse suites: safety role isolation **116/116** and worker kill switch **11/11**, total **127/127**. The complete adverse workspace was rerun after the current runtime changes: **72/72 files, 1,134 passed, 1 skipped** in 462.33 seconds. This includes real PostgreSQL role isolation, Redis kill-switch recovery, Chromium SSRF checks, sandbox containment, and failure-injection coverage; it does not establish the entire SPEC 009 privilege/race matrix.
- Worker TypeScript check, scoped ESLint, scoped Prettier, and `git diff --check` passed. Rebuilt `webaudit-worker:spec009-child-isolation`; in-image child smoke returned `ENGINE_RESULT`, checkpoint `PROCEED`, and confirmed the child had no DB/Redis URL.
- DoD remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**. Production API plan dispatch and production adapter registration, complete privilege and race matrix, visual/Playwright/manual browser evidence, load, coverage, and real R2 remain incomplete. No production service container was started or replaced.

### Latest delivery synchronization — 2026-10-29

Scoped commit `1d6e8b80db7ce0c98b4b6f044d97290ec54795d0` (`fix(spec-009): compose worker adapters and close suite failures`) was pushed normally. Post-push `git fetch origin main`, local `HEAD`, `origin/main`, and `git ls-remote origin refs/heads/main` all agree on that hash. Pre-existing website/auth edits, `pnpm-lock.yaml`, `.next-final-cta-verify/`, and `logs/` were not staged or committed.

## Final independent revalidation — 2026-10-29

This section supersedes the earlier test totals and statements that Playwright was not run.

### Verification results

- Full serial unit/contract/integration workspace, against disposable PostgreSQL `127.0.0.1:5545/m009_privilege_test` and isolated Redis `127.0.0.1:6391`: **243 files, 1,855 tests passed**. The suite is serial; `AI_MODE=fixtures` was set.
- Full serial adverse workspace on the same disposable services: **72/72 files passed, 1,142 passed, 1 skipped**.
- Full Chromium Playwright E2E suite: **93/93 passed** in 26.2 minutes. It exercised the application’s test stack, public/auth pages, dashboard, and onboarding flows. It is not proof of the missing production SPEC 009 API-to-plan execution path, and it is not the separate 24-step manual Chrome acceptance.
- `pnpm.cmd test:visual`: **2 files passed; 8 passed, 17 todo**. The harness and real-page capture run, but the page-to-reference comparisons are explicitly todo, so the required 1440/390 visual-parity threshold is not established.
- SPEC 009 worker execution-runtime integration: **21/21 passed**, including isolated PostgreSQL, Redis/BullMQ, actual per-unit child process, parent-mediated effects/evidence/progress, F07 checkpoint, cancellation, kill, revocation, deadlines, hard-stop, lease loss, duplicate delivery, and standard `startWorker` composition with a deterministic test adapter.
- API, worker, and web TypeScript checks passed during this continuation. The visual suite built and started the Next app. Prisma validation and migration status passed: **31 migrations found; isolated database up to date**. Scoped ESLint passed; Oxlint UI adherence passed on 210 files with zero warnings/errors; `git diff --check` passed. Prettier passed on the scoped source/docs except `apps/web/tests/e2e/onboarding/first-audit.spec.ts`; the same file from `HEAD` also fails the Prettier check, so its existing style was not mass-reformatted as part of the Redis-only test fix.

### Browser test harness routing issue and correction

The first full Playwright run completed **90/93**. Two onboarding/dashboard cases timed out because their specs overrode API `REDIS_URL` to the shared development Redis at `localhost:6389/15` while the isolated worker used `TEST_REDIS_URL=127.0.0.1:6391`. The first run therefore wrote E2E queue keys to development Redis database 15 and split queue producer/consumer traffic. The local database reported 47 keys at inspection. No keys were deleted and no `FLUSHDB`/`FLUSHALL` was issued. Subsequent runs did not target port 6389. The harness now resets API `REDIS_URL` to `TEST_REDIS_URL` before stack boot, and the per-spec hardcoded Redis overrides were removed. Focused affected tests and the full 93-test rerun passed against isolated Redis.

The same first browser run found that the signup form enabled its submit button with an empty email. The page now disables submission until a non-empty email and minimum-length password are entered; the focused auth visual tests and full browser suite pass. This edit is in the user’s ongoing auth/public-page refactor and remains outside the SPEC 009 commit.

### Current SPEC 009 limits

- Repository search still finds no production caller of `resolvePlan`; the production API plan-to-queue path is absent.
- The actual worker entrypoint has no production SPEC 010–012 engine adapter. The generic runtime is exercised using a local test adapter only.
- The direct runtime suite is real PG/Redis/BullMQ/process integration, not the full HTTP API + non-superuser API/worker production scan flow.
- Full lease/effect/definer-function privilege matrix, all U-1 AC-1…20 race/fairness cases, API cancellation/refund lifecycle, audit-event rollback, authenticated progress reconnect recovery, actual restart/outage recovery, real R2 lifecycle, performance baseline, instrumented coverage, and manual Chrome journey remain open.
- The additive finalizer-grant correction is verified on a fresh isolated migration chain; it was not applied to the shared development database.
- The current 49-FR review is in `REQUIREMENT_DELTA_MATRIX.md`; the current 28-gate count is in `DEFINITION_OF_DONE.md`. Both retain **NOT COMPLETE** as the SPEC 009 verdict.
- A full-workspace attempt without `EXEC_TEST_REDIS` had 242/243 files pass; the runtime file used its documented fallback `localhost:6399` and failed to connect. The runtime file passed 21/21 focused with `EXEC_TEST_REDIS=127.0.0.1:6391`, and the complete serial workspace then passed **243/243 files, 1,855/1,855 tests** in 754.79 seconds with that variable explicitly set.

### Privilege migration follow-up — 2026-10-29

- A new disposable database `m009_core01_fresh_test` received all **32 migrations from the beginning**; Prisma reported the schema up to date. Shared development/production data were not targeted.
- Real LOGIN-role adverse suite: **17/17 passed** after the fix. A test assertion first failed against the existing default PUBLIC EXECUTE ACL on `fahes_dependency_same_plan()`; the additive migration `20261030180000_core01_revoke_public_definer_execute` removes that ACL. The actual API-role dependency trigger still rejects cross-plan edges. The temporary API finalizer-grant mutation was detected (1 expected failing assertion) and revoked.
- Catalog checks confirmed all ten CORE-01 tables and the finalizer/host SECURITY DEFINER functions are owned by `fahes_owner`, runtime roles are non-superuser, schema `public` is not writable by PUBLIC or the host role, and the relevant definer functions pin `search_path`.
- Runtime integration on the fresh database and isolated Redis: **21/21 passed**, including a real non-superuser execution-host login. Broader tenant/effect/lease-secret checks and the composed production API/worker flow remain open; DoD gates 10 and 24 remain incomplete.
- Additional artifact/evidence/retention/reaper checks passed **32/32** with an in-memory object store and isolated PostgreSQL. Existing API/worker phase progression passed **1/1** over isolated Redis; authenticated SPEC 009 unit-progress reconnect/recovery and real R2 remain unverified.
- Scoped delivery commit `80118ad59f03fb80c523c3d10bfb795850f62c6e` was pushed and verified against remote `main`; unrelated dirty website/auth edits remain preserved.

### Focused regression follow-up — 2026-10-29

- The production email boot guard passed **3/3** with `EMAIL_TRANSPORT` explicitly blank and `EXEC_TEST_REDIS=127.0.0.1:6391`; the isolated child process confirmed blank transport selects the documented SMTP default and configured SMTP starts successfully.
- The sandbox-unconfigured capability contract passed **1/1** with a disposable JWT secret and isolated PostgreSQL/Redis. Its test removes the repository's `SANDBOX_RUNNER_URL` before making the request.
- To keep that email boot test off the shared development Redis DB 15, its child now takes `TEST_REDIS_URL` or derives DB 15 from the dedicated `EXEC_TEST_REDIS` test endpoint. No shared Redis/database or running service was changed.
- These are focused re-runs; the full serial unit/contract/integration suite was not rerun after the latest test-only edits. Existing complete-run counts remain historical evidence, not a fresh result from this continuation.

### Current checkout and delivery

- At the start of this revalidation, branch `main`, `HEAD`, and `origin/main` were `974d2620306a200660304984f0e42eac174d4445`; there was no local/remote divergence. The configured remote was `https://github.com/Yousef-Abdallah-1711/Webaudit-ai-.git`.
- User-owned auth/public-page refactor files, translations, pricing work, E2E changes outside the SPEC 009 harness correction, `pnpm-lock.yaml`, `.next-final-cta-verify/`, and `logs/` were kept out of the SPEC 009 scope. No existing running service was stopped or replaced.
- This report records the verification snapshot before delivery. The scoped commit and normal push are authorized; the delivery hash is reported in the handoff after remote verification.

### API planning-role verification follow-up — 2026-10-29

- Fresh disposable `m009_core01_fresh_test` now has **34 migrations** applied; Prisma reports up to date. Shared development/production databases were not targeted.
- Real CORE-01 LOGIN-role suite: **20/20**. Two test-first cases initially failed because the API login could not read the minimum scan/target ownership fields or F01 authorization inputs. Additive migrations `20261030190000_core01_api_plan_ownership_reads` and `20261030200000_core01_api_authorization_reads` grant the exact required columns/tables. The API role resolves passive and authorized BROWSER plans and performs the production F01 authorization query; the generic worker still cannot read authorization rows.
- The worker runtime separately remains **21/21** with real PostgreSQL/Redis/BullMQ and an execution-host login. This is not a composed production API/queue/worker scan. The full HTTP scan path, broader tenant/effect/lease-secret matrix, R2, authenticated unit-progress recovery, outages, browser acceptance, performance, and coverage remain open. DoD gate 10 is PARTIAL and gate 24 NOT STARTED; SPEC 009 remains NOT COMPLETE.
