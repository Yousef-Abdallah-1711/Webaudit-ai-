# Next-session handoff — SPEC 007 closure audit (2026-10-27)

Prepared from a **read-only audit** of the working tree, Git, running services and existing logs. Nothing was re-run except cheap connectivity and HTTP checks. Older reports are treated as historical.

## 1. Executive summary

- **Repository:** `C:\Users\Yousef\Desktop\Projects\motakamel`, branch `main`, HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196` ("test(web): verify marketing fidelity and prune old artifacts"). **0 staged files, 55 `git status --short` entries** (35 tracked files modified, +543/−139, plus untracked paths).
- **App is running:** web `http://localhost:3010` (pid 9480, Next dev) and API `http://localhost:3011/health` (pid 3600) both answer. Routes `/`, `/en`, `/login`, `/signup`, `/pricing`, `/scan` all returned HTTP 200 in this audit. (`/en/login` was 404 earlier and is not a required route.)
- **SPEC 007:** all 42 task checkboxes are ticked in `tasks.md`. T001–T033 have fresh-in-this-day evidence (adverse suite, typecheck). T034 is a document-level review only. **Task closure is not release readiness, and SPEC 007 should not be called fully closed** until the items below are resolved.
- **Full unit suite is NOT green.** Last full run (`unit2.log`, 09:28): 71 failed / 1425 passed, exit 1, dominated by Redis connection failures caused by the Docker/WSL loopback relay. The earlier run (`unit.log`, 07:11) had 4 failures.
- **Most important next action:** the owner repairs the `127.0.0.1:6389` relay (restart Docker Desktop/WSL, which needs the owner's permission), then re-run the full unit suite and triage whatever remains.

## 2. Verified completed work

| Item | Evidence |
|---|---|
| Git state (above) | `git rev-parse`, `git status` this session |
| Web and API running and healthy | HTTP checks this session; pid ownership via `Get-CimInstance` |
| Three test-file edits are present in the working tree | `git diff --numstat`: `auth.register.test.ts` +26/−3, `email-boot-guard.test.ts` +98/−72 (includes a prettier re-wrap of `it(` calls), `cost-alerts-sweep.test.ts` +5/−0 |
| SPEC 007 source under `apps/api/src/services/authorization/` and its six test files exist (untracked) | `git status` |
| `apps/api/tests/helpers/db.ts` adds `TargetAuthorization`, `TargetEnvironment`, `ScopeDefinition` to the truncation list (+3 lines) | `git diff` |
| Fixes from the earlier session (historical, not re-run today): `auth.register` 21/21 with and without a different `WEB_URL`; `cost-alerts-sweep` 25 clean runs after a captured 1 ms race; `email-boot-guard` 3/3 idle | `SPEC007_CLOSURE_MANUAL_QA_2026-10-27.md` §7 |

## 3. Partially completed work

- **`email-boot-guard`:** refusal case now ends on its real signal; the 60 s deadline is only an upper bound. Under heavy synthetic CPU load the two "boots successfully" cases still timed out. **Mitigation, not a verified fix.** Also, in the 09:28 run both "boots successfully" cases failed, which fits the Redis fault but was not individually attributed.
- **T034:** accepted on a document review of specs 008/009/012 (checks 1–6 of quickstart Part B). Acceptance text: "confirming they cite this spec's actual contracts (not a placeholder)". The 009 spec has an uncommitted U-1 amendment and 012 is untracked, so "frozen" is not git-backed. Positional signature in those plans differs from the implemented `(db, {…})` shape (cosmetic, previously noted).
- **T026 narrowing tests:** no observed pre-implementation failure, no mutation test. Do not claim test-first.
- **Manual QA:** service-level only (14 scenarios PASS); no browser/UI testing because SPEC 007 has no route or page.
- **Full unit suite:** no complete clean run exists.

## 4. Blockers

**Infrastructure**
- `127.0.0.1:6389` refuses connections; `::1:6389`, `localhost:6389` (via `::1`) and `192.168.1.3:6389` connect; `127.0.0.1:5442` (Postgres) works. Re-verified this session with `net.connect`. The listener on `127.0.0.1:6389` is `wslrelay` (pid 21048); `0.0.0.0:6389` is `com.docker.backend` (pid 17792). Redis itself answers `PONG` inside the container. Tests use `redis://localhost:6389/15`, which Node resolves to 127.0.0.1 first. Recovery: owner restarts Docker Desktop/WSL (not done by this session).
- The running API (pid 3600) holds its Redis connections over `[::1]` (netstat shows `[::1]:…→[::1]:6389`), which is how it stays healthy.
- Port 3001 is **no longer listening**; the other project's Nuxt dev server remains on `[::1]:3000` (pid 17036). Do not touch it.

**Code/test**
- `tailwind-migration-guardrails` "light severity tokens remain distinct from accent tokens": fails deterministically; the uncommitted `colors.css` sets `--accent-text` to #c2410c, equal to `--sev-high`. **Owner's colour decision; do not edit.**
- Remaining 70 failures in `unit2.log`: failing files are queue/Redis/payment/scan-start tests (list in §6). 16388 `ECONNREFUSED` lines exist in that log, but each failing test was **not** individually attributed. Mapping to the fault is likely, not proven. Classification: tailwind = deterministic assertion; the rest = "likely Redis/infrastructure, unproven per test".
- Unattributed intermittent history: `adherence-lint` timeout and `gated-check-partial` failed in the first earlier run and passed in the second; `gated-check-partial` failed again in `unit2.log` (2 tests).

**Owner decisions (still unresolved in the register; verified)**
- DEC-034, DEC-044, DEC-045, DEC-048, DEC-049 — all Level 1, blocking SPEC 008. Questions are in `final-planning/phase-2/OWNER_DECISIONS_TO_CLOSE.md`, Batch 1 (DEC-045 l.17, DEC-044 l.23, DEC-034 l.27, DEC-048 l.30, DEC-049 after). Answer format e.g. `DEC-044: A`. Batch 0 (A0-1) is the only item needed to start any implementation. **SPEC 008 stays blocked.**

**Contract questions (not decided here)**
- Whether `narrowAuthorization` needs a scope-subset rule (contract has none; code does not check).
- It refuses non-live originals (`GRANT_NOT_ACTIVE`) and budgets can only decrease; contract is silent.
- `validateGrantRequest` runs before the transaction in `create`/`narrow`; a Target control-level change in between is not re-checked.
- Origin-versus-bare-host wording in the spec.

## 5. Runtime and database safety

- **Ports:** 3010 web (pid 9480), 3011 API (pid 3600, command `node --import tsx src/index.ts`, started in the earlier session with `API_PORT=3011` and a Redis override to `[::1]`); 3000 belongs to the Nuxt project (pid 17036); 5442 Postgres, 6389 Redis, 6452 pgbouncer via Docker.
- **Containers:** `webaudit-postgres` and `webaudit-pgbouncer` up 12 h, `webaudit-redis` up 7 h (restarted once earlier; AOF + volume, 92 keys intact).
- **Known side effects (historical, preserved):** API startup reconciled the capability registry in dev database `webaudit` twice ("16 updated" each time); the suites truncated and migrated `webaudit_test`; the QA probe wrote rows to `webaudit_test`; the `webaudit-redis` container was restarted once. No migration was created or edited. **This session: no additional side effects** (read-only audit; only TCP/HTTP probes and `redis-cli ping` / `pg_isready`).
- No credentials appear in this document.

## 6. Test evidence matrix

All logs are in `C:\Users\Yousef\AppData\Local\Temp\claude\c--Users-Yousef-Desktop-Projects-motakamel\c230e2bc-9168-4bce-831a-55bb3b7916b5\scratchpad\` (temporary; copy if needed). "Historical" = not re-run in this session.

| Command | When | Exit | Result | Log | Status |
|---|---|---|---|---|---|
| `pnpm typecheck` | 06:45 | 0 | clean | `typecheck.log` | historical |
| `pnpm lint:adherence` | 06:49 | 0 | clean | `lintadh.log` | historical |
| `pnpm lint:code` | 06:49 | 1 | 87 errors / 6 warnings, all in gitignored `.worktrees/` or unrelated untracked files | `lintcode.log` | historical |
| `eslint` + `prettier --check` on SPEC 007 files | ~08:00 | 0 | clean | (console) | historical |
| `pnpm test:adverse` | 07:28 | 0 | 64 files; 930 passed, 1 skipped; 981 s | `adverse.log` | historical |
| `pnpm test` (unit) #1 | 07:11 | 1 | 223 files: 219 passed, 4 failed; 1495 tests: 1491 passed, 4 failed; 1348 s | `unit.log` | historical |
| `pnpm test` (unit) #2 | 09:28 | 1 | 223 files: 202 passed, 21 failed; 1496 tests: 1425 passed, 71 failed; 1971 s; 16388 `ECONNREFUSED` | `unit2.log` | historical (most recent) |
| QA probe `qa-probe.ts` | ~07:30 | 0 | QA-01…QA-14 PASS | (console, recorded in QA report) | historical |
| `cost-alerts-sweep` ×25 | ~08:50 | 0 | 0 failures | (console) | historical |
| `email-boot-guard` idle ×3 / loaded | ~08:25 | 0 / fail | idle 3/3 pass; 8–16 CPU spinners: fail | `ebg-repeat.log` | historical |
| HTTP checks, port/pid listing, `net.connect` to 6389/5442, `redis-cli ping`, `pg_isready` | this session | — | see §1, §4 | — | **fresh** |

Failing files in `unit2.log` (failures per file): paymob-webhook-and-redirect 12, admin.queue 13, paymob-checkout-flow 8, scan-phase-producer 5, scans.cancel-refund 5, scans.refusals 5, capability-lifecycle-e2e 4, checkout-flow 4, secure-cookie-tls-boundary 2, gated-check-partial 2, email-boot-guard 2, billing-provider-default-wiring 2, scans.quote 2, and one each in teardown-wiring, ai-disabled-worker-boot, tailwind-migration-guardrails, repo-revoked, progress-streaming, scans.get, receipts, entitlements.

## 7. Exact next-step order

1. **(Owner)** Authorize or perform the Docker Desktop / WSL restart. Stop condition: do not proceed until `node -e "net.connect(6389,'127.0.0.1')"` connects.
2. Re-check the live app (`3010`, `3011/health`); if the API lost Redis, restart only pid 3600's process with the same `API_PORT=3011`, without touching 3000.
3. Run `pnpm test` once (about 25–33 min, serial). Expected: only the Tailwind guardrail should remain. Log the exit code and counts. Stop if more than a handful of failures; classify from the log before touching anything.
4. For each remaining failure: capture assertion, reproduce in isolation, classify (deterministic / environment / flaky), fix only with evidence. Do not weaken assertions.
5. Re-verify the three edited tests: `auth.register` with and without `WEB_URL`; `cost-alerts-sweep` ×25; `email-boot-guard` idle ×3 and note load behaviour honestly.
6. Re-run `pnpm test:adverse` only if source or schema changed.
7. Update `SPEC007_CLOSURE_MANUAL_QA_2026-10-27.md` and `PROCESS_FOR_THE_APP.md` with fresh results.
8. **(Owner)** Answer Batch 0 / Batch 1 decisions before any SPEC 008 work; decide the colour token.

## 8. Owner decisions required

| Decision | Where to answer |
|---|---|
| A0-1 (authorization to start) | `final-planning/phase-2/OWNER_DECISIONS_TO_CLOSE.md`, Batch 0 |
| DEC-045 admission/release exposure | same file, Batch 1, answer `DEC-045: A` or `B` |
| DEC-044 database role boundary | `DEC-044: A` or alternative |
| DEC-034 owner/date for AR-13/AR-19 design | `DEC-034: owner=<name>, date=<date>` |
| DEC-048 stranded kill-switch states | Batch 1 |
| DEC-049 `recordStopped` preconditions | Batch 1 |
| `--accent-text` vs `--sev-high` colour | owner's design call; no document asks it yet |
| Narrowing subset rule, validation placement, origin-vs-host wording | contract questions for the SPEC 007 owner |

## 9. Risks and things not to do

- Do not edit `colors.css`, `--accent-text`, `--sev-high`, `dark.css`, or any web design token.
- Do not change authorization behaviour (`narrow`, `create`, `revoke`, `check`) without an explicit contract or owner decision.
- Do not start SPEC 008, or implement anything dependent on the five decisions.
- Do not stage, commit, push, stash, reset, clean or revert; `pnpm-lock.yaml` and the web/spec 009/011/012 edits are the owner's.
- Do not run destructive operations against `webaudit`. Only `webaudit_test` may be reset.
- Do not kill or restart processes on ports 3000/3001 or the shared Docker stack without permission.
- Earlier QA report §4 says `gated-check-partial` "passed" this time; that was true of the 07:11 run only, and it failed again in the 09:28 run. Read the matrix above, not that sentence.

## 10. Copy-ready prompt for the next coding session

```
You are continuing the Fahes / WebAudit AI repo at C:\Users\Yousef\Desktop\Projects\motakamel.
First read docs/audits/fahes-master-audit/final-planning/NEXT_SESSION_HANDOFF_2026-10-27.md,
then check git (branch, HEAD, `git status --short`, staged count) and runtime
(http://localhost:3010 routes, http://localhost:3011/health, listeners on 3010/3011/5442/6389).
Rules: preserve the whole working tree; never stage, commit, push, stash, reset, clean or revert;
no migrations; write only to webaudit_test, never to webaudit; do not touch ports 3000/3001 or
unknown processes; do not restart Docker Desktop/WSL/Redis without the owner's explicit permission;
do not edit colors.css/--accent-text/--sev-high; do not change authorization behaviour without a
contract or owner decision; do not start SPEC 008 while DEC-034/044/045/048/049 are unanswered.
Steps: (1) verify whether 127.0.0.1:6389 still refuses (net.connect); if it does, stop and ask the
owner to repair Docker/WSL, do not work around it in shared config. (2) Once healthy, run `pnpm test`
serially, record exit code, counts and log path. (3) Triage each remaining failure one by one:
capture the assertion, reproduce in isolation, classify, fix only with evidence, never weaken
assertions or call anything flaky without repeated-run evidence. The Tailwind guardrail failure
stays documented as awaiting the owner. (4) Re-verify auth.register (with and without WEB_URL set),
cost-alerts-sweep (25 runs) and email-boot-guard (idle x3, report load behaviour honestly).
(5) Keep the app running throughout and re-check it at the end. (6) Update
SPEC007_CLOSURE_MANUAL_QA_2026-10-27.md and PROCESS_FOR_THE_APP.md with fresh, exact results.
Never claim a green suite or full closure unless it was run and its exit code captured.
```

## 11. Update (2026-10-27, after the controlled full-suite run) — FRESH

Supersedes the status in §1, §4 and §6 where they conflict; earlier text is kept as history.

- **Full unit suite with the process-local shim:** exit 1, 223 files (221 passed / 2 failed), 1496 tests (**1494 passed / 2 failed / 0 skipped**), 2020 s, 0 `ECONNREFUSED`. Log: scratchpad `unit3.log`.
- **Remaining failures:** (1) Tailwind guardrail, owner colour decision, deterministic; (2) `adherence-lint` first ESLint test, timeout at ~8 s vs 5 s default, components verified lint-clean (`eslint` exit 0); proposed per-test timeout NOT applied, needs approval.
- **Isolation used:** shim redirect + `SELECT 15 -> 13` rewrite + `DATABASE_URL` = `webaudit_test` for the one command. DB 15 residue untouched (digests identical); dev DB `webaudit` not written during the run; DB 13 now holds 56 test-created keys (your decision whether to remove).
- **Still true:** the Docker/WSL IPv4 relay is unrepaired; the shim is not a repair; SPEC 008 blocked by DEC-034/044/045/048/049; narrowing contract questions open; T026 has no mutation evidence.
- **SPEC 007:** not declared closed. Task boxes are ticked, but the full suite is not green (2 failures), T026 lacks mutation evidence and T034 is document-level.
- **Re-verification of the three edited tests, still pending:** `auth.register` and `cost-alerts-sweep` passed inside this run; the dedicated repeat runs (with/without `WEB_URL`, 25x) were not repeated today.
- **Next:** approve (or reject) the `adherence-lint` per-test timeout; decide the colour token; decide whether to clear DB 13; then re-run the failing pair and the three edited tests.
