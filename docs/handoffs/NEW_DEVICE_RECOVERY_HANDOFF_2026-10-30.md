# New-device recovery handoff — 2026-10-30

Verified on the **existing Windows machine** (Windows 10 Home 10.0.19045, Node 24.15, pnpm 9.0.0,
Docker Desktop). The earlier "new device" framing was wrong: the earlier recovery session established
this is the same computer, so this is a re-verification of a healthy checkout, not a rebuild on fresh
hardware.

Evidence tags: **[DEV]** run in this recovery on this machine; **[PRIOR]** run earlier in the
recovery session and recorded in `docs/audits/spec-009-implementation/CURRENT_STATUS_AND_NEXT_EXECUTION_PLAN.md`.

## 1. Repository state

| Item | Value |
|---|---|
| Remote | `https://github.com/Yousef-Abdallah-1711/Webaudit-ai-.git` |
| Branch | `main` |
| Local HEAD = `origin/main` | `8aa5fc2b1a18` (ahead/behind 0/0 after `git fetch`) [DEV] |
| SPEC 009 state | NOT complete; production wiring absent (see audit report) |

Uncommitted at the start of this session:

- Three Prettier-only edits made during recovery: `apps/api/src/services/evidence/materialize.ts`,
  `apps/api/tests/helpers/runtime-fixtures.ts`, `apps/web/tests/e2e/onboarding/first-audit.spec.ts`.
  Reviewed [DEV]: 5 insertions / 6 deletions, line-joins and wrapping only, identical with
  whitespace ignored; no behaviour change. No repository-wide reformat was done.
- Owner files, preserved untouched: `pnpm-lock.yaml` (local hunks), `apps/web/audit-sweep.mjs`,
  `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-eink/`, `showcase-esaalnybot/`,
  `showcase-omanda-ai/`, `showcase-trimora/`.
- `docs/audits/spec-009-implementation/CURRENT_STATUS_AND_NEXT_EXECUTION_PLAN.md` (the audit report).

## 2. Infrastructure

| Service | Container / port | Role | Touched? |
|---|---|---|---|
| `webaudit-postgres` | 5442 | shared dev database | no |
| `webaudit-pgbouncer` | 6452 | shared dev pooler (healthy) | no |
| `webaudit-redis` | 6389 | shared dev Redis | no |
| `m009-fast-pg` | 127.0.0.1:5461, tmpfs | disposable test Postgres 16 | yes (test DBs only) |
| `m009-redis` | 127.0.0.1:6399 | disposable test Redis | yes (`/7` for smoke) |

Use `127.0.0.1`, not `localhost` (Docker IPv6 proxy makes Prisma intermittently unreachable).
Test database names must end `_test`. Disposable data is tmpfs and is lost if Docker restarts.
Required env for suites: `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `EXEC_TEST_REDIS`.

## 3. Database

35/35 migrations apply to a fresh database [DEV: `smoke_test`, `_prisma_migrations` = 35]
(also [PRIOR] on `rec_unit_test`). `pnpm db:generate` can EPERM when a running process holds the
query-engine DLL; types still update. Runtime roles `fahes_api`, `fahes_exec_host`,
`fahes_worker_exec`, `fahes_orchestrator`, `fahes_operator`, `fahes_owner` are exercised by the real-login
suites (CORE-01, SPEC 008) [PRIOR]. The dev stack itself still connects as a superuser, so those
privileges are not in force there.

## 4. Test results

| Check | Result | Tag |
|---|---|---|
| Typecheck | 30/30 | PRIOR |
| Unit/contract/integration | 241 files, 1,873 passed | PRIOR |
| Adverse | 73 files, 1,153 passed, 1 skipped | PRIOR |
| Playwright e2e | 93 passed, 28.1 min | PRIOR |
| Tracked-source ESLint, adherence lint | pass | PRIOR |
| Visual project, coverage | not run | — |

Historical numbers; they must be re-run after any new change.

## 5. Standalone stack start/stop [DEV]

Started as three separate processes against `smoke_test` + Redis `/7`, `AI_MODE=fixtures`:

- API (`pnpm start`, port 4510): listening; `GET /health` → `200 {"ok":true}`; registry reconciled 16 new capabilities.
- Worker (`pnpm start`): logged "consuming — phase orchestrator, re-verification, and the repeatable timeout sweep".
- Web (`next build` then `next start --port 4511`): `GET /` → 200.

Logs contained zero `error`/`unhandled` lines. Shutdown: processes stopped by exact PID; ports 4510/4511/4599
confirmed free; shared containers unchanged. **Limitation:** Windows has no POSIX SIGTERM, so
`Stop-Process` is a hard kill. Graceful `shutdown()` is verified only by the in-process tests that
call it, not by this run.

## 6. Real Chromium smoke [DEV]

Playwright's bundled Chromium, three viewports (desktop 1366×800, tablet 820×1180, mobile 390×844),
fresh user per viewport. Script and screenshots are in the session scratchpad (not committed).

| Journey | Desktop | Tablet | Mobile | Note |
|---|---|---|---|---|
| Home | PASS | PASS | PASS | 200 |
| Signup | PASS | PASS | PASS | lands on `/verify-email` |
| Login | PASS | PASS | PASS | after DB verification flip in the disposable DB |
| Dashboard pages (progress, readiness, fixes, settings) | PASS | PASS | PASS | all 200 |
| Scan creation | **REFUSED** | **REFUSED** | **REFUSED** | see below |
| Billing + usage | PASS | PASS | PASS | 200 |
| Logout | PASS | PASS | PASS | redirected to `/login?next=…` |

- Scan creation: the quote was shown (30 credits) but `POST /targets` returned **422** and the UI said
  "That address cannot be audited." The smoke target was a loopback fixture, which the production
  safe-net guard correctly refuses. This is fail-closed behaviour, **not** a passed scan. A scan
  through to a report is covered only by the Playwright first-audit spec (in-process, permitted
  fixture) [PRIOR].
- **Not exercised** in this smoke: target authorization/verification, scan progress, scan results,
  cancellation, credit purchase. Playwright specs cover several of these [PRIOR]; they were not
  re-driven here.
- Diagnostics per viewport: 7 console errors and 2 network failures. The console errors were
  `401` (`/auth/me` and `/auth/refresh` before login and after logout) and the single `422` above; the
  two network failures are Next.js RSC prefetches aborted by navigation (`ERR_ABORTED`). No 5xx.
- DB side effects: 3 users, 6 refresh tokens, 0 targets, 0 scans.
- Email verification was done by a direct update to the disposable DB, as the existing e2e helper does
  (mail is console-logged in dev), not by clicking an email link.

## 7. Remaining issues

- Visual project and coverage have never been run on this device.
- No graceful-signal shutdown check possible on Windows.
- Prettier debt remains elsewhere in the repo; intentionally not mass-reformatted.
- `docs/handoffs/` did not exist before this file.

## 8. SPEC 009 readiness

Recovery of the baseline is complete enough to proceed: Git state understood, source preserved,
infrastructure operational, baseline suites green [PRIOR]. SPEC 009 itself remains NOT complete; next
work is integration (N01–N05) and verification (V01–V09) per the audit report.
