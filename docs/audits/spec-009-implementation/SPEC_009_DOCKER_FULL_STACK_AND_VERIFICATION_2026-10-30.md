# SPEC 009 — Docker full stack and verification, 2026-10-30

**Verdict: PARTIALLY COMPLETE.** G-4 is closed at the acceptance level, N03/N04 are done for their defined scope, and the real application ran end to end in Docker on production-equivalent database identities. Open: V03–V06, V08–V09 coverage, failure injection, the broad legacy-table grants review (B03), real R2, SPEC 010–012 items. Evidence tag [DEV] = run on this machine in this session. Nothing here enables production cutover; `SCAN_EXECUTION_PLANS` is off by default everywhere and was turned on only inside the disposable acceptance stack.

## Starting state and delivery
Starting HEAD `a7c632a`, 0/0 with `origin/main`. Commits of this session are listed in the final message. Owner files were not staged. One incident: `prettier --write` was run on a file list that accidentally included the untracked owner files `apps/web/audit-sweep.mjs` and `apps/web/auth-state.mjs`; they were reformatted (whitespace only, no content change intended) and cannot be restored byte-for-byte because they are untracked. They are not part of any commit.

## G-4 (security closure)
Root cause: the provisioner granted the runtime logins no application-table privileges and no login held `fahes_orchestrator`. Fix (DEC-076): login `webaudit_orchestrator_runtime` (member of `fahes_orchestrator` only) used by the worker process, which is the orchestrator; `webaudit_worker_runtime` stays for a future execution host; the provisioner grants DML on every legacy table (not owned by `fahes_owner`) to `fahes_api` and `fahes_orchestrator`; SPEC 008/009 tables stay function-only. Evidence [DEV]: 23 role tests on real LOGIN roles; inside the running Docker containers `pg_stat_activity` shows the API connecting as `webaudit_api_runtime` and the worker as `webaudit_orchestrator_runtime`, no superuser, no BYPASSRLS, zero permission-denied lines; the seed bootstrap and the full lifecycle pass under those logins.
**Not closed (B03):** the legacy grants are table-level DML, not a derived minimum. A static usage scan was too incomplete to trust, so no grants were narrowed; this is a recorded limitation needing a query-level review. The process-level separation is by connection identity inside one worker process, not separate processes; the execution-host identity is unused until a SPEC 010+ engine exists.

## N03, N04, V02
- N03 done: shared `readScanCoverage`, report carries `coverage`, report screen Coverage card (en/ar, translated status and unit-class labels), 7 contract tests, and real Chromium at 3 viewports in en and ar/RTL (screenshots reviewed).
- N04 done for scope: HTTP recovery (3 tests) and 4 WebSocket reconnect tests on the real server; the earlier failures were my test harness dropping messages that arrived before `next()` was called (fixed with an inbox wait, no assertion weakened). Not covered: Redis interruption mid-stream, worker restart mid-stream.
- V02 partial: cancel/refund/duplicate/cross-tenant tests (4), plan-refusal refund, flag-ON lifecycle in Docker including cancel + refund. Not covered: deadline expiry and restarts through the flag-ON HTTP path.

## Docker architecture and acceptance
Files: `infrastructure/docker-compose.acceptance.yml` (project `fahes-accept`, own volumes/network/ports), `infrastructure/acceptance-env.sh` (random throwaway secrets to a git-ignored `.env.acceptance`), `infrastructure/docker-acceptance.md` (runbook), `scripts/acceptance/docker-e2e.mjs`, `scripts/acceptance/docker-chromium.mjs`. Images built from the existing production Dockerfiles: api 724 MB, worker 724 MB, web 473 MB. Services: postgres 16, redis 7, migrate, provision-runtime-roles, seed, api, worker, fixture (shares the worker network namespace), web, minio (pinned release). The shared dev stack was not touched; the shared dev database remains 11 migrations behind (defect G-7, not migrated).
- Startup: all services healthy; 36/36 migrations applied; worker logs "no execution engines registered"; worker heartbeat key present.
- Real HTTP/WebSocket acceptance [DEV]: legacy path 40/40; SPEC 009 flag ON 42/42 (RESOLVED plan, both passive units COMPLETED by the orchestrator, coverage lists them, one DEBIT, cancel -> one REFUND, duplicate cancel 409, no resurrection, owner subscription acknowledged, other tenant refused, reconnect re-authorises, HTTP snapshot recovers terminal state).
- Real Chromium against the Docker web: 43/43 (login through the real form, report render, direction, no overflow, Coverage card, no console/network failures after sign-in). The Coverage "not completed" branch was exercised with one administrator-inserted SKIPPED unit labelled "render check"; it is not a product result.
- Findings from the Docker run: (1) a freshly migrated database has no plans, so scan creation 500s until `scripts/seed.ts` runs (documented bootstrap; now a `seed` service); (2) the SMTP client requires implicit TLS by design, so Mailpit cannot be used: the stack uses the console mailer and the SMTP path is NOT verified; (3) Docker Desktop's loopback port proxy for `127.0.0.1:5461` wedged mid-session (stale CLOSE_WAIT), causing a spurious first adverse/Playwright failure burst; `localhost` worked (environment, not code).
- Credentials for a demo user and an admin were seeded into the acceptance database only (not committed).

## D01 (emulator only)
6 tests against MinIO (`m009-minio`/the pinned compose service): upload/list/download with row/object agreement, content-addressed duplicates, tenant/key refusals, retention + failed-delete orphan + grace-period reaper, referenced objects never reaped, unreachable store leaves no row. Not real R2; no presigned path exists.

## Regression on the final tree [DEV] (isolated PostgreSQL :5461, Redis :6399)
| Check | Result |
|---|---|
| Typecheck | 30/30 |
| ESLint touched files, `lint:adherence`, Prettier | clean |
| Unit/contract/integration (`vitest --project unit`, `EXEC_TEST_REDIS=127.0.0.1:6399`, MinIO enabled) | 248 files, 1,913 passed, 0 failed, 0 skipped, exit 0, 906.75 s |
| Adverse (`--project adverse`, via `localhost`) | 75 files, 1,180 passed, 1 skipped, exit 0, 460.63 s. An earlier run via `127.0.0.1` had 43 failures, all `P1001` caused by the wedged port proxy; the same 13 files passed 49/49 on rerun |
| Visual (`--project visual`) | 2 files, 8 passed, 17 todo (pre-existing TODO comparisons); no new visual parity claim |
| Playwright full run | 90 passed, 2 failed (a `next build` failure while the web source was being edited during the run, and one settings test timeout); both specs rerun alone: 4/4 passed. NOT a single clean 94/94 run on the final tree |
| Coverage | not run: no coverage provider installed; adding one changes the lockfile that carries owner-local edits |
| k6 | smoke only: 20 VUs x 30 s on the least-privilege API, p95 17.8 ms, no 5xx; authenticated routes 429 after ~60 requests per user (limiter). No approved thresholds exist |
| Failure injection | not run |

## Requirements and 28-gate DoD (recounted)
FR 49: 2 verified-invariant / 28 implemented-and-tested / 16 partial / 0 missing / 3 N/A (FR-039 now consumed by report and UI but not yet closed against its full acceptance; FR-027/027a partial on Redis/worker-restart). DoD gate 21 (tenant isolation) moves PARTIAL -> PASS: the production HTTP IDOR path now exists and is tested (create, cancel, coverage, report, WebSocket, targets) in unit and Docker runs. Gates 17 (artifacts, real R2), 22 (security: B03 grants review), 23 (performance), 14/15 (failure recovery) stay PARTIAL. **DoD: 12 PASS / 16 PARTIAL / 0 FAIL / 0 BLOCKED.**

## Remaining
Independent: B03 grant minimisation, V03/V04 matrices, V05 outage injection in the Docker stack, V08 24-step acceptance, a clean single Playwright run, coverage provider decision. External: real R2 credentials, deployed environment with NTP evidence (V06), k6 thresholds. SPEC 010–012: non-passive engines, dispatch hook, N05, T-U1-10. Owner decisions: which login holds `fahes_orchestrator` in production deployments beyond compose, DEC-032/062 billing, rollout approval, the Codex-model exception, migrating or cleaning the shared dev database (G-7).
