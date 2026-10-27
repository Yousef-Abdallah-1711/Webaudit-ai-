# SPEC 007 closure — manual QA and test record (2026-10-27)

Branch `main`, HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`, 0 staged files, 52 `git status --short` entries (unchanged count). No migration was created or edited. Only database `webaudit_test` (`localhost:5442`) was written. Credentials are not reproduced here.

## 1. Scope limit

SPEC 007 is a service layer. `grep services/authorization apps/` finds only test files: no HTTP route, page or UI consumes it (FR-021 forbids an API layer in this spec). So there is **no browser/UI/keyboard/responsive surface to test**; those checks are **NOT APPLICABLE — no UI exists for this feature** and nothing was claimed for them. Manual QA below drives the real service functions against `webaudit_test` with an independent script (not the vitest suite) and checks stored rows directly.

Probe: `scratchpad/qa-probe.ts` (kept outside the repo), run with `pnpm exec tsx` from `apps/api`. It creates uniquely tagged users/targets, deletes nothing, and writes only to `webaudit_test` (hard guard on the database name). Expected results come from `contracts/grant-lifecycle-contract.md`, `authorization-check-contract.md`, `scope-matching-contract.md`, FR-009/012/014/016/017/018/019.

## 2. Manual QA table

| ID | Area | Preconditions | Steps | Expected result | Actual result | Evidence | Status |
|---|---|---|---|---|---|---|---|
| QA-01 | Valid grant | Owner, attested, STAGING Target, live BROWSER grant on example.com | `isAuthorized` for example.com | AUTHORIZED with the grant id | AUTHORIZED, grant id matched | probe output | PASS |
| QA-02 | Scope | as QA-01 | check host `evil.example.org` | REFUSED / OUT_OF_SCOPE | REFUSED / OUT_OF_SCOPE | probe | PASS |
| QA-03 | Target / tenant | second user + second target | check owner against a Target with no grant; check another user against the owner's Target | REFUSED / NO_MATCHING_GRANT for both | both NO_MATCHING_GRANT | probe | PASS |
| QA-04 | Expiry | live grant | check at `expiresAt - 1 ms` and at `expiresAt` | AUTHORIZED, then EXPIRED | AUTHORIZED, EXPIRED | probe | PASS |
| QA-05 | Revocation | live grant | owner revokes; check next | REFUSED / REVOKED | REFUSED / REVOKED | probe | PASS |
| QA-06 | Idempotency | revoked grant | revoke again | no second audit row | 1 `authorization.revoked` row | DB count | PASS |
| QA-07 | Malformed / missing ref, tenant boundary | grant owned by another user | revoke a fake id; revoke another user's grant | identical error (FR-019) | both `AuthorizationNotFoundError`, identical message | probe | PASS |
| QA-08 | Forged operator claim | user not flagged operator in DB | revoke another user's grant with `actingUserIsOperator: true` | same NotFound, grant stays live | NotFound; `revokedAt` still null | probe + DB read | PASS |
| QA-09 | Narrowing | grant on {example.com, api.example.com} | narrow to {example.com}; check both hosts | old grant revoked with scope untouched; new grant on a NEW scope row; api host refused, main host authorized by the new grant | old.hosts both hosts kept, revoked; new scope id differs; api OUT_OF_SCOPE; main AUTHORIZED by new id | probe + DB read | PASS |
| QA-10 | Audit relationship | after QA-09 | read `authorization.replaced` rows | 1 row on the original with `after.replacedByGrantId` = new id | 1 row, ids match | DB read | PASS |
| QA-11 | Atomicity (fault injection) | live grant | wrap the transaction so the `authorization.replaced` audit write throws after the revoke and new grant were written | whole transaction rolls back | error `INJECTED_FAULT`; original still live; grant/scope/audit counts identical before and after | DB counts | PASS |
| QA-12 | No state change on refusal | live grant | narrow to a host outside the Target | validation error, nothing written | `AuthorizationValidationError`; counts unchanged | DB counts | PASS |
| QA-13 | Stale state | revoked grant | narrow it | refused | `GRANT_NOT_ACTIVE` | probe | PASS |
| QA-14 | Error hygiene | messages from QA-07/08/11/12/13 | scan for connection string, password, secret, token | none | none found | probe | PASS |
| QA-15 | Browser/UI, keyboard, responsive, console | — | — | — | no UI/route exists for this feature | grep above | NOT RUN (not applicable) |
| QA-16 | Dependency-unavailable behaviour | stop Postgres | — | — | not exercised: stopping shared Docker services was not authorised and could disturb other work | — | NOT RUN |
| QA-17 | Mutation test of T026 narrowing tests | — | — | — | no mechanism that avoids editing the working tree; not performed | — | NOT RUN |

Limits: QA-11 injects the fault with a wrapper; it proves rollback of one failure point (audit write), not every possible point. Concurrency is covered by the adverse suite (concurrent revoke, concurrent narrow), not re-run by hand.

## 3. Automated results (all 2026-10-27, serial)

| Command | Exit | Result | Log |
|---|---|---|---|
| `pnpm typecheck` | 0 | root + all turbo packages clean | scratchpad `typecheck.log` |
| `pnpm lint:adherence` | 0 | clean | `lintadh.log` |
| `pnpm lint:code` (whole repo) | **1** | 87 errors / 6 warnings, **all in** the gitignored `.worktrees/phase-7-monitoring/` tree or in untracked unrelated files (`apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/screens/summarize.mjs`, `showcase-omanda-ai/dashboard/vendor/react*.js`). Not caused by SPEC 007 files. | `lintcode.log` |
| `eslint` on every SPEC 007 source + test file | 0 | clean | — |
| `prettier --check` on SPEC 007 files + tasks.md | 0 | clean | — |
| `pnpm test` (unit project, entire repo) | **1** | 223 files: 219 passed, 4 failed; 1495 tests: 1491 passed, 4 failed; 1348 s | `unit.log` |
| `pnpm test:adverse` | 0 | 64 files passed; 930 passed, 1 skipped; 981 s | `adverse.log` |
| `git diff --check` | 0 | only CRLF→LF warnings on unrelated web files | — |

SPEC 007 unit/contract/adverse tests all ran inside those two full runs and passed (authorization-check, authorization-audit, derive-state, scope-match, authorization-contracts; authorization and control-gate adverse).

## 4. The four unit failures of this run (none involve SPEC 007 code)

The set differs from the one recorded earlier. `adherence-lint` timeout and `gated-check-partial` **passed** this time, so they are intermittent. They were not investigated further because they did not fail.

| Test | Re-run | Classification | Evidence / action |
|---|---|---|---|
| `tailwind-migration-guardrails` "light severity tokens remain distinct from accent tokens" | fails deterministically | **Defect in uncommitted owner work.** The working-tree `colors.css` adds `--accent-text: #c2410c`, identical to the existing `--sev-high: #c2410c` (HEAD has no `--accent-text`; diff is +2 lines). | Not fixed: it is the owner's uncommitted web design change; the correct token value is a design decision. Owner action: change `--accent-text` or `--sev-high`. |
| `auth.register` "same response for a duplicate email…" | fails as-is; **passes (20/20) with `WEB_URL=http://localhost:3000`** | **Environment-dependent.** The test hard-codes `localhost:3000` links; the local `.env` sets the web URL to port 3010. | Not changed. Owner action: make the test read the configured URL, or pin `WEB_URL` for tests. |
| `email-boot-guard` "NODE_ENV=production … refuses to start" | **passes 3/3 in isolation**; failed after 24 s inside the full run (empty stdout/stderr) | **Load/timing-dependent (flaky); root cause unproven.** | No change. |
| `cost-alerts-sweep` "real handler … records a breach" | failed in the full run and in the first standalone run; **then passed 4 of 4 re-runs** | **Intermittent; root cause unproven.** Container clock matched host clock to the second when checked, so the clock-skew hypothesis is unsupported. | No change. Needs a repeat-until-fail investigation by someone who owns the worker tests. |

None were labelled pre-existing: no clean baseline was run (it would need a stash or worktree, which was out of bounds).

## 5. T034 (quickstart Part B) evidence

Prerequisite check: the plans exist as frozen planning artifacts — F07 = `specs/008-…`, F02/F03/F04 = `specs/009-…`, F05 (credential broker) is inside `specs/012-…`. Task text says "once any of them exists". Findings against the six checks:

1. Both call points: 009 `execution-plan-contract.md:26` (plan-resolution) and plan FR-022a/dispatch; 008 `safety-admission-contract.md:42` re-runs `isAuthorized` fresh at admission; 012 four independent refusals (plan, dispatch, per-request F07). PASS (documentation level).
2. No parallel scope matcher: 012 uses `isInScope` (api-discovery, api-security-check); 008/009 contain no host/path comparison logic (grep). PASS.
3. Grant lifecycle: 008 kill-switch cites the 007 grant-lifecycle lookup; 012 `security-scope-contract` cites it; 012 data model gives 007 tables SELECT-only, "007 owns writes". PASS.
4. No field added to `Target`/`TargetVerification`: 008 `data-model.md:11` "zero structural changes"; 012 I-16 forbids `@relation` to 007 tables; 009 same. PASS.
5. ExecutionClass: 009 defines its own `ExecutionUnitClass` and states which classes never need authorization; no loose reuse found. PASS.
6. Budgets via F07: 008 owns budget counters/leases keyed to `TargetAuthorization`; 009 deadline contract consumes no F07 budget and does not call `isAuthorized`. PASS.

Caveats: this is a document review of plans, not code; signatures in 009/008 are written positionally `isAuthorized(targetId, userId, executionClass, destination, now)` while the implementation takes `(db, {…})` — cosmetic, already recorded as an open wording point. 009 has an uncommitted U-1 amendment and 012 is frozen only as planning.

## 6. Open items needing the owner (not decided here)

- DEC-034, DEC-044, DEC-045, DEC-048, DEC-049 (Level 1) still block SPEC 008 (S-01…S-05); verified listed as unresolved Level 1 decisions in `PROCESS_FOR_THE_APP.md` (the `DECISION_REGISTER.md` itself was not re-read in this pass). Smallest unblock: written answers to those five questionnaire items in `phase-2/OWNER_DECISIONS_TO_CLOSE.md`.
- `narrowAuthorization`: no scope-subset check, refuses non-live originals, budgets only decrease — contract is silent; owner review.
- T026 narrowing tests: no observed pre-implementation failure and no mutation test. Do not claim test-first.
- Origin-vs-bare-host spec wording unresolved.
- `create.ts` / `narrow.ts` run `validateGrantRequest` before the transaction (read-then-write). A Target whose control level changes between validate and insert is not re-checked inside the transaction. Same shape as the pre-existing create; not changed; flag for contract review.

## 7. Follow-up pass (2026-10-27, later): fixes, re-runs and the environment fault

**Live app:** web `http://localhost:3010` (`/`, `/en`, `/login`, `/signup`, `/pricing`, `/scan` all 200; `/en/login` is 404 because that locale route does not exist) and API `http://localhost:3011/health` (200) were verified before and after the changes. Ports 3000/3001 (another project) were not touched. The API process was restarted once (new pid) to point it at Redis over `[::1]` (see below); its log is `api-run2.log`.

**Fixes (test files only; no application source changed):**

| Test | Root cause (evidence) | Change | Retest |
|---|---|---|---|
| `auth.register.test.ts` | Links come from `WEB_URL`; the local `.env` sets another port, the test assumed 3000. | `vi.stubEnv('WEB_URL', …)` in `beforeAll`, `vi.unstubAllEnvs()` in `afterAll`; new regression test that the links follow a configured `WEB_URL`. | 21/21 pass with and without `WEB_URL=http://localhost:3010` set in the environment. |
| `cost-alerts-sweep.test.ts` | **Captured:** `createdAt` of the seeded row was 05:50:37.523, the sweep's JS `now` 05:50:37.522 (delta −1 ms), so `createdAt <= windowEnd` excluded it. Reproduced 1 failure in 8 and 1 in 11 idle runs. Production impact: a row within about 1 ms of a sweep is counted by the next sweep, so nothing is lost. | The seeded `AiInvocation` gets `createdAt` 5 minutes in the past. Assertions unchanged. | 25 consecutive passes, 0 failures. |
| `email-boot-guard.test.ts` | Reproduced: with 16 CPU-bound processes running, the old fixed 15 s child deadline expired with empty output (matches the original failure). Idle it passes in ~4 s per case. | Refusal case now ends on its real signal ("refusing to start") instead of the deadline; deadline raised to 60 s as an upper bound only; assertions unchanged. | Idle 3 of 3 pass (~14 s). **Not proven under heavy load:** with 8 or 16 spinners the two "boots successfully" cases still time out at 60 s. Treat this as a mitigation, not a verified fix. |

Not changed, as instructed: `colors.css`, `--accent-text`, `--sev-high`. The Tailwind guardrail failure (`--sev-high` equals `--accent-text`, #c2410c) remains **awaiting the owner's colour decision**. Open authorization questions (scope narrowing, subset validation, validation before the transaction) were reviewed against `contracts/grant-lifecycle-contract.md`: it has no subsumption rule and does not say where validation runs, so no behaviour was changed.

**Full unit suite re-run (`pnpm test`, log `unit2.log`): exit 1, 21 files / 71 tests failed, 1425 passed, 1971 s. NOT a regression from the fixes.** 16388 `ECONNREFUSED 127.0.0.1:6389` lines. Cause: the Docker Desktop/WSL port relay (`wslrelay`) listener on `127.0.0.1:6389` refuses connections, while `::1` and the LAN address reach the same Redis, and Postgres 5442 on loopback is fine. The tests' Redis URL (`localhost:6389`) resolves to 127.0.0.1, so every queue/Redis-dependent test fails or times out. Restarting the `webaudit-redis` container (AOF + volume, 92 keys intact) did not fix it; fixing it needs Docker Desktop or WSL to be restarted, which I did not do because it would interrupt every container on the machine. `NODE_OPTIONS=--dns-result-order=ipv6first` fixes the DB-only tests (`auth.register` 21/21) but not the Redis ones (`scan-phase-producer` still 5/5 failed). **The unit suite is therefore unverified in this environment** until the relay is healthy; the previous clean-network full run had 4 failures (see §4).

**Side effects:** `webaudit_test` truncated/migrated by the suites (approved); one probe wrote rows to `webaudit_test` (QA run, plus a throwaway 300-row insert that was deleted); the API boot reconciles its capability registry in the dev database `webaudit` ("16 updated"), twice; `webaudit-redis` container restarted once; no migrations; nothing staged or committed.

**Changed files this pass:** `apps/api/tests/contract/auth.register.test.ts`, `apps/api/tests/integration/email-boot-guard.test.ts` (prettier also re-wrapped its `it(` calls), `apps/worker/tests/integration/cost-alerts-sweep.test.ts`, this report, `PROCESS_FOR_THE_APP.md`.

**Still open:** colour decision; relay repair then a full unit re-run; `email-boot-guard` heavy-load behaviour; DEC-034/044/045/048/049; narrowing contract questions. Closure is **not** claimed.

## 8. FRESH verification (2026-10-27 18:14–18:47 local): full unit suite with an isolated, process-local Redis/Postgres setup

Everything below is **fresh**. §§1–7 above are historical and unchanged.

**Isolation used for this one run (no repo/config/infra change):** scratchpad preload `redis-loopback-shim.cjs` via `NODE_OPTIONS=--require` (redirects `localhost`/`127.0.0.1` :6389 to `::1`, and rewrites `SELECT 15` to `SELECT 13` on port-6389 sockets only) plus `DATABASE_URL` pointed at `webaudit_test` for that command. Why both: DB 15 held 12 residue keys including 3 stale `RUNNING_PHASE_1` jobs in the scan-phase `prioritized` set that any test worker would have consumed; and `email-boot-guard` / `secure-cookie-tls-boundary` build child environments from `process.env['DATABASE_URL']` with a fallback to the development database `webaudit`.

| Check | Evidence |
|---|---|
| Smoke test, plain ioredis + BullMQ Queue + BullMQ Worker (blocking connection) configured with `/15` | all landed on DB 13; whole-server client list `{db0: 14, db13: 4}`; none on 15 |
| DB 15 before vs after the full run | per-key `DUMP` digests identical (12 keys); sampler (65 samples, 30 s apart) saw 0 clients on db 15 and a constant 12 keys |
| DB 0, 3, 14 | key counts unchanged (92 / 11 / 20) |
| Dev database `webaudit` | read-only check: latest `Capability.updatedAt` is 06:32:10 UTC (the earlier API restart), before this run's window (15:14–15:47 UTC); no write by this run seen |
| `webaudit_test` | 22 finished migrations; written by the suite (approved) |
| Shim coverage | 1034 `SELECT 15 -> 13` rewrites across 44 processes; **0** `ECONNREFUSED` in the log |
| App health before/after | web `/en` 200 and API `/health` 200 both times |
| Git before/after | 0 staged, 55 entries, HEAD unchanged |

**Command:** `REDIS_SHIM_LOG=… REDIS_SHIM_DB_FROM=15 REDIS_SHIM_DB_TO=13 NODE_OPTIONS="--require <shim>" DATABASE_URL=<webaudit_test> pnpm test` — **exit 1**, 2020 s. **223 files: 221 passed, 2 failed; 1496 tests: 1494 passed, 2 failed, 0 skipped.** Log: scratchpad `unit3.log` (`unit3.clean.log`).

**Remaining failures (classified individually):**
1. `tailwind-migration-guardrails` "light severity tokens remain distinct from accent tokens": **deterministic assertion**; `--sev-high` equals `--accent-text` (#c2410c) in the uncommitted `colors.css`. Awaiting the owner's colour decision; not touched.
2. `adherence-lint` "every ported .tsx file in apps/web/components lints clean": **timeout, deterministic on this machine now** (not Redis, not a defect in the components). The test runs ESLint in-process; cold it takes about 8 s (3 of 3 isolated runs failed at 7.98–8.13 s) against Vitest's default 5 s test timeout. The assertion itself is not the problem: `eslint "apps/web/components/**/*.tsx"` exits 0 (24–37 s wall including process start). The sibling "route files" test passes because ESLint is then warm. The same file already gives its spawn tests an explicit `{ timeout: 20_000 }` for the same reason (comment L13). **Proposed, NOT applied (awaiting approval):** give the first ESLint test an explicit per-test timeout, assertion unchanged.

**Corrections to earlier statements:** the 71 failures of the 09:28 run were Redis relay failures (this run: 0 ECONNREFUSED, 2 failures left). The earlier prediction that `email-boot-guard` and `secure-cookie-tls-boundary` would not inherit the shim was wrong for this run: both passed (37 s and 14 s), and rewrites were logged in 44 processes. Which pids were those children was not individually traced. `email-boot-guard` is therefore green under idle conditions with the shim; its behaviour under heavy CPU load is still not re-verified.

**Side effects of this run:** `webaudit_test` truncated/migrated; **Redis DB 13 now holds 56 keys (2 with expiries) created by the tests** (previously empty), left in place pending your decision; DB 15 untouched; no container, Docker, WSL or process changes; no migrations.

**This is not an infrastructure repair.** `127.0.0.1:6389` still refuses connections; a normal `pnpm test` without the shim will fail again.

## 9. CLOSURE AUDIT (2026-10-27, evening session) — fresh evidence; sections 1–8 above are unchanged history

Start state: `main`, HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`, 0 staged, **55** `git status --short` entries, web 3010 / API 3011 healthy, Postgres up on `127.0.0.1` and `::1` :5442, Redis up on `::1:6389`, **`127.0.0.1:6389` still refuses (relay unrepaired)**. End state: same HEAD, 0 staged, **56** entries (the one new entry is `apps/web/tests/unit/adherence-lint.test.ts`, see 9.2). Dev DB `webaudit` was **not written** (read-only check: migration `20261024235733_add_target_authorization_scope` finished; the three SPEC 007 tables hold 0 rows). Redis DB 15 per-key digest fingerprint was identical before and after the only Redis-touching run (`d0a74ee7acbb`, 12 keys); the old scratchpad shim (DB 15 to 13) was read and smoke-tested first (client landed on db=13), and used for that one run only.

### 9.1 Automated results (all fresh, this session)

| Command | Exit | Result |
|---|---|---|
| `vitest run --project unit` on scope-match, derive-state, authorization-check, authorization-audit, authorization-contracts | 0 | 5 files, **100/100** (DB-free) |
| `vitest run --project adverse` on `authorization.test.ts` + `control-gate.test.ts` | 0 | 2 files, **102/102** (73 + 29), 269 s, `webaudit_test` only, no Redis use |
| `prisma validate` (DATABASE_URL = test DB) | 0 | valid |
| `pnpm --filter @webaudit/api typecheck` | 0 | clean |
| `eslint` on SPEC 007 src + 6 test files + 3 edited historical tests + adherence-lint test | 0 | clean |
| `prettier --check` on the same SPEC 007 files + adherence-lint test | 0 | clean |
| `enum-drift` (packages/types) | 0 | 52/52 |
| `auth.register` x6 (`WEB_URL` unset / :3010 / :3000, 2 each) | 0 | 21/21 every run |
| `cost-alerts-sweep` x25 | 0 | 25/25, 0 failures |
| `email-boot-guard` x3 (shim 15 to 13, `DATABASE_URL` = test DB) | 0 | 3/3 idle; **heavy-load behaviour not re-tested** (mitigation, not a proven fix) |
| `adherence-lint.test.ts` before the change, x3 | 1 | "components" test timed out at 5000 ms in 3/3 (6.7–7.3 s); "route files" test took 4.3–5.1 s and timed out once |
| `adherence-lint.test.ts` after the change, x5 | 0 | 8/8 every run; no `adherence-probe-*` files left behind |
| direct `eslint "apps/web/components/**/*.tsx" "apps/web/app/**/*.tsx"` | 0 | clean (34 s): the timeout was not masking a lint error |
| `tailwind-migration-guardrails` | 1 | still fails (owner decision, see 9.6) |

**Not re-run this session (stated, not implied):** the full unit suite and the full adverse suite. Reason: no application source changed since the full runs earlier today (adverse exit 0, 930 passed / 1 skipped; unit with the shim exit 1, 1494 of 1496), the relay is still unrepaired, and the only edit since is one test file's timeout. The last full unit result therefore stands as 2 failures: adherence-lint (now fixed in isolation) and the colour guardrail (awaiting the owner). The next full run should confirm that.

### 9.2 Changes made this session

Only `apps/web/tests/unit/adherence-lint.test.ts`: `{ timeout: 20_000 }` added to the two glob-lint tests ("components", "route files") plus a 2-line comment. Assertions unchanged. The route-files test is included because it demonstrably timed out for the same cause; the request named only the components test, so say so if you want that narrowed. Pure cold-start timeout: in-process ESLint over a glob takes about 7 s cold against Vitest's 5 s default; the same file already gives its first fixture test a 20 s timeout for the same reason. This report is appended too. Scratchpad-only artifacts (not in the repo): `scratchpad/mut/` (mutant copies and config) and `scratchpad/qa2-probe.mts`.

### 9.3 T026 mutation sensitivity (disposable copies; production source untouched)

Method: mutated copies of `narrow.ts` in the scratchpad, injected through a scratchpad vitest config whose resolver plugin redirects `.../authorization/narrow.js` to the copy. `sha256` of every authorization source file and the adverse test file was identical before and after, and the `git status` entry count did not change during mutation. Command: `vitest run --config <scratchpad config> -t "T026"` (8 T026 tests).

| Mutant | Result |
|---|---|
| M0 identity (proves the redirect is faithful) | exit 0, 8 pass |
| M1 original never revoked | **killed**: 2 failed (`revokedAt` assertion, concurrent-narrow count) |
| M2 original `ScopeDefinition` edited in place | **killed**: 1 failed (old scope no longer deep-equal) |
| M3 `authorization.replaced` audit skipped | **killed**: 2 failed |
| M4 budget ceiling check removed | **killed**: 1 failed ("resolved instead of rejecting") |
| M5 owner predicate dropped from the lookup | **killed**: 1 failed (non-owner/operator NotFound) |
| M6 early "already revoked/expired" pre-check removed | **survived**, an equivalent mutant: the transaction's conditional `updateMany(revokedAt: null, expiresAt > now)` still returns count 0 and throws the same `GRANT_NOT_ACTIVE`; only error precedence versus validation errors could differ. Not a behavioural test gap. |

Conclusion: T026's tests are sensitive to the FR-009/FR-016 invariants (revoke, new scope, no in-place edit, audit, budget ceiling, owner-only). Red-first history still cannot be reconstructed and is **not claimed**.

### 9.4 Fresh manual service-level QA (`qa2-probe.mts`, `webaudit_test` only, database name asserted twice before any write)

20 asserted scenarios, **all PASS**, plus 1 observation. Preconditions: tagged synthetic users and targets (`example.com`, `example.net`, `acme/widgets`); no external target, no scan.

| ID | Scenario | Result |
|---|---|---|
| QA2-A | A valid grant: rows plus `authorization.granted` audit (actor, subjectType, `after.scopeId`, budgets) | PASS |
| QA2-B | B wrong owner vs nonexistent target: same error class and message, nothing written | PASS |
| QA2-C | C control NONE gives `ControlLevelRequiredError`, nothing written | PASS |
| QA2-D1 | D scope escape: `google.com`, `*.com`, `attackerexample.com`, `example.com.attacker.net`, `*.attackerexample.com`, `com`, empty, and a bad *excluded* host all give `SCOPE_NOT_BOUNDED_TO_TARGET`, nothing written | PASS |
| QA2-D2 | D valid variants accepted: `EXAMPLE.COM`, `Staging.Example.Com`, `example.com.`, `*.example.com`, `api.example.com` | PASS |
| QA2-D3 | D repository mismatch refused; web scope on a repository Target gives `SCOPE_KIND_MISMATCH` | PASS |
| QA2-E | E matching through the DB path: `a.example.com` yes; `a.b.example.com` no; bare `example.com` vs wildcard-only no; exact `example.com` yes; excluded `checkout.example.com` no; `/apiary` vs `/api` no; excluded path no; `A.Example.COM.` yes; `a.example.com.evil.net` no; `attackerexample.com` no | PASS |
| QA2-F1 | F PRODUCTION refused with ACTIVE_SECURITY / AUTHENTICATED_WORKFLOW / LOAD_CAPACITY, and in mixed lists | PASS |
| QA2-F2 | F SOURCE_EXECUTION + PRODUCTION accepted (documented exemption) | PASS |
| QA2-F3 | F live environment read: STAGING authorized; reclassified PRODUCTION refused; unclassified refused (`ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`) | PASS |
| QA2-G | G multi-class grant evaluated per class; unlisted class gives `NO_MATCHING_GRANT` | PASS |
| QA2-H | H revocation visible in the same millisecond (no cache) | PASS |
| QA2-I | I expiry: `expiresAt - 1 ms` authorized, `expiresAt` EXPIRED | PASS |
| QA2-J | J operator revoke: one `authorization.revoked_by_operator` row, actor = operator, `before.revokedAt` null, `after.revokedBy` set | PASS |
| QA2-K | K non-owner, forged operator claim, missing id: identical `AuthorizationNotFoundError`; grant stays live | PASS |
| QA2-L | L reclassify: stranger refused; audit `environment.classified` then `environment.reclassified` with correct before/after; one env row | PASS |
| QA2-M1 | M narrow: old grant revoked, old scope row byte-identical, new grant on a new scope, removed host refused | PASS |
| QA2-M3 | M narrowing an already-replaced grant gives `GRANT_NOT_ACTIVE` | PASS |
| QA2-N | N 25 identical checks: one distinct result; grant row and counts unchanged | PASS |
| QA2-O | O 48 audit rows for this run: correct subjectType, actor present, every grant has a `granted` row, every revoked grant has a revoke/replace row | PASS |
| QA2-M2 | **OBSERVATION**: narrowing `{example.com, /docs}` to `{*.example.com, example.com, all paths}` was **accepted** (no subset check) | see S-1 |
| P | Legacy compatibility: no modified file under `apps/api/src`; the 29 control-gate adverse tests pass; `Target` gained exactly the two back-relation fields; web `/ /en /login /signup /pricing /scan /settings /billing` 200; API `/health` 200, `/targets /scans /auth/me` 401 unauthenticated; no non-test consumer of `services/authorization` exists | PASS at HTTP level only (Playwright MCP timed out, so no browser/visual check) |

(`/dashboard`, `/targets`, `/scans`, `/credits` on the web return 404 because no such route directories exist; not defects.)

### 9.5 Quickstart Part A (T030), executed against the code

1 enum values match schema/types (enum-drift 52/52); 2 `AuditLogEntry`, `reconfirmControl`, native arrays reused; 3 migration FKs are only `Target` (x2) and `ScopeDefinition`, none to `TargetVerification`; 4 vacuous; 5 `TargetAuthorization.userId`, `ScopeDefinition` has none, `check.ts` joins the environment through `Target.userId`; 6 no modified file under `apps/api/src`, `Target` diff is exactly the two relation fields; 7 vacuous, no credits/pricing imports; 8 audit payloads hold classes/scope id/budgets/timestamps/actor only. **8/8.**

### 9.6 Open decisions and findings

| ID | Finding | Severity | Class | Owner approval? | Blocks closure? |
|---|---|---|---|---|---|
| S-1 | `narrowAuthorization` accepts a scope that is **not a subset** of the original (QA2-M2). The primary T026 test itself narrows `{example.com}` to `{api.example.com, /v1}`, which is not a subset either. Contract language says "narrow", "smaller Scope", "widening is not a documented operation", but defines no subsumption rule. Impact is bounded: the owner could create the same grant with `createAuthorization`, an operator cannot narrow, and the replacement passes every create precondition. | Low (exploitability) / Medium (contract intent) | Documentation ambiguity, owner decision | Yes | **Yes** (DoD 21) |
| S-2 | `validateGrantRequest` runs before the transaction in `create`/`narrow`. The control-level TOCTOU is **not exploitable today**: `attestedAt` is set once and never cleared, so ATTESTED is a monotonic floor, and nothing in `apps/api/src` deletes a Target (the FK would fail the insert anyway). `narrow`'s original-grant state IS re-checked atomically by the conditional `updateMany`. | Informational | Documentation ambiguity / future-spec concern | No | No |
| S-3 | Origin vs bare host: the contract says scope entries must equal or be a subdomain of the Target's `canonicalValue`, but URL Targets store an origin (`https://example.com`). The implementation compares hostnames (with a bare-host fallback) and fails closed; every test uses the origin form. | Informational | Contract wording | Yes (frozen text) | No |
| S-4 | Scope `ports`/`schemes` are not bounded to the Target's verified origin; boundedness is host-only per the contract. | Informational | Spec design observation / future-spec concern | Awareness | No |
| S-5 | Environment classification is owner self-asserted and re-labelable (audited, owner-only), so FR-015a is only as strong as the owner's honesty. By design. | Informational | By design | No | No |
| S-6 | Wording conflict: scope-matching-contract L64 "empty list = default only" vs data-model/FR-007 "empty schemes = both http and https". Code and unit tests follow FR-007/data-model. | Informational | Documentation ambiguity | Yes (frozen text) | No |
| S-7 | `ARCHIVE` Targets map to the REPOSITORY scope shape (data-model L307) and boundedness requires `repositoryFullName === canonicalValue` (a storage key). No test exercises an ARCHIVE Target. | Low | Missing test + thin contract | Contract guidance needed | No |
| S-8 | No DB-level `CHECK` on budgets/expiry and no `User` FK on `userId`/`grantedBy`/`revokedBy`/`classifiedBy`: invariants hold only through the service layer. | Informational | Design observation | No | No |
| S-9 | **Test-isolation hazard (not SPEC 007 code):** `email-boot-guard`'s child environment falls back to the development database `webaudit` when `DATABASE_URL` is unset in the invoking shell, and its children boot the API against Redis DB 15. A plain `pnpm test` can therefore write to the dev DB (consistent with the earlier "capability registry 16 updated" side effect). Proposed one-line test-only fix: derive the child `DATABASE_URL` from `TEST_DB_URL`. Not applied (outside SPEC 007 authority; it is the owner's edited file). | Medium (infra/test) | Test defect | Recommended | No, but fix before the next full run |
| S-10 | Positive: `revokeAuthorization` re-verifies the operator claim against `User.isOperator` (stricter than the contract); forged claims fail with the same NotFound. | n/a | n/a | n/a | n/a |

**Non-SPEC-007 decision still open: `--accent-text` (#c2410c) equals `--sev-high` (#c2410c).** The guardrail fails any `--sev-*` property whose value equals any `--accent*` property ("must not make severity look like a brand CTA"); only the light theme collides (dark `--accent-text` is #ff7a33). Compliant options, no edit made: (a) darken `--accent-text`, e.g. `#b93c0a` (5.65:1 on white and 5.33:1 on `#fff7ed`, versus 5.18:1 and 4.88:1 now); (b) change `--sev-high` instead; (c) not recommended: weaken or special-case the guardrail. Smallest recommended correction: (a). Also still open: DEC-034/044/045/048/049 (SPEC 008) and the Docker/WSL IPv4 relay repair.

### 9.7 Closure verdict (SPEC 007): **FUNCTIONALLY COMPLETE BUT CLOSURE BLOCKED**

Basis: every task T001–T034 has current evidence (table 9.8); the migration is additive-only and applied; 100 unit/contract and 102 adverse tests pass; T026 is mutation-sensitive; quickstart Part A passes 8/8; fresh service-level QA passes 20/20 with no critical or high defect. Closure is blocked only because (1) the narrowing semantics (S-1) need an owner decision (DoD 21), (2) frozen-contract wording needs owner-approved amendments (S-3, S-6), and (3) T034 is a document-level review of frozen planning text, not code. Separately, and not a SPEC 007 criterion: the global unit suite is red because of the colour token, and no clean full run exists after this session's timeout fix.

### 9.8 Task matrix T001–T034

| Task | Status | Evidence / remaining |
|---|---|---|
| T001 | VERIFIED | Three enums in schema and migration, values match data-model, `ExecutionClass` mirrored in `packages/types` (enum-drift 52/52); no `TargetAuthorizationState` |
| T002 | VERIFIED | `prisma validate` exit 0 |
| T003 | VERIFIED | `TargetEnvironment`, unique on `targetId`, cascade FK, `Target.targetEnvironment` back-relation only |
| T004 | VERIFIED | `ScopeDefinition` with all WEB/REPOSITORY/workflow-layer fields, no `userId` (FR-020) |
| T005 | VERIFIED | `TargetAuthorization` plus both indexes plus `Target.targetAuthorizations`; `Target` diff is exactly the two relation fields |
| T005a | VERIFIED | `prisma validate` exit 0 |
| T006 | VERIFIED | Migration SQL re-read: additive only, no DROP/ALTER of existing tables, no partition SQL; applied to `webaudit` and `webaudit_test` (read-only check). The pre-existing Prisma/partitioning drift is unrelated and untouched |
| T007 | VERIFIED | Barrel exists with module doc-comment |
| T008 | VERIFIED | scope-match 43 tests incl. the wildcard matrix; re-confirmed by QA2-E |
| T009 | VERIFIED | authorization-check 34 tests, all six result variants |
| T010 | VERIFIED | adverse plus QA2-C |
| T011 | VERIFIED | adverse plus QA2-F1/F2 (exemption asserted) |
| T011a | VERIFIED | adverse plus QA2-D1/D2/D3 |
| T012 | VERIFIED | adverse budget ceilings (0, negative, NaN, non-integer, over max) |
| T012a | VERIFIED | unit plus QA2-G |
| T012b | VERIFIED | contract test; barrel read: no ScopeDefinition mutation export |
| T012c | VERIFIED | adverse plus QA2-L |
| T012d | VERIFIED | QA2-L audit before/after |
| T013 | VERIFIED | `scope-match.ts`; T008 plus QA2-E |
| T014 | VERIFIED | `check.ts`; T009 |
| T015 | VERIFIED | `create.ts` preconditions in contract order; T010–T012, T011a |
| T016 | VERIFIED | barrel exports the four functions |
| T017 | VERIFIED | adverse plus QA2-H |
| T018 | VERIFIED | adverse plus QA2-I (exact boundary) |
| T019 | VERIFIED (stub seam only) | `BUDGET_EXHAUSTED` is driven by caller-supplied consumption; no runtime metering exists and none is claimed (SPEC 008) |
| T019a | VERIFIED | unit plus QA2-N |
| T020 | VERIFIED | adverse plus QA2-K |
| T021 | VERIFIED | adverse plus QA2-J |
| T021a | VERIFIED | audit unit test (5) plus QA2-O DB-level shape check |
| T022 | VERIFIED | derive-state 10 tests |
| T023 | VERIFIED | wired in `check.ts`; QA2-H shows no cache |
| T024 | VERIFIED | `revoke.ts`; adverse plus QA2-J/K; idempotency checked earlier (QA-06) |
| T025 | VERIFIED | barrel |
| T026 | VERIFIED (mutation-sensitive; no red-first claim) | 9.3; open contract question S-1 |
| T027 | VERIFIED | contract test (8) plus barrel read; all six functions exported |
| T028 | VERIFIED against the contract text | open: S-1 subset semantics (owner) |
| T029 | VERIFIED | barrel exports plus doc-comment |
| T030 | VERIFIED | Part A 8/8 (9.5) |
| T031 | VERIFIED | API typecheck 0; eslint and prettier on SPEC 007 files 0. Repo-wide `lint:code` exit 1 comes from `.worktrees/` and unrelated untracked files (earlier today, not re-run) |
| T032 | VERIFIED (focused fresh; full suite historical) | fresh 102/102 authorization + control-gate adverse; full adverse exit 0 earlier today with no source change since; **not re-run this session** |
| T033 | VERIFIED | `PROJECT_MAP.md` row 57 lists the service, tables, tests and spec path |
| T034 | IMPLEMENTED BUT UNVERIFIED beyond document level | Spot-check: 008/009/012 cite `isAuthorized` (9/5/14 files) and 012 cites `isInScope` (10 files); 008/009 contain no scope matcher. Still a review of frozen planning text; re-run when 008/009/012 are implemented. Stays ticked per the task's own wording |

### 9.9 Requirement matrix (summary; IDs as present in `spec.md`)

| Requirement | Implementation | Tests | Result |
|---|---|---|---|
| FR-001 / FR-017a / FR-018a environment | `classify-environment.ts` | adverse T012c, audit unit, QA2-L | verified |
| FR-002 / FR-004 no FK to verification; control at least ATTESTED at creation | `create.ts` (`reconfirmControl`) | adverse T010, QA2-C, migration FKs | verified |
| FR-003 / FR-007 / FR-008 / FR-010 scope language, exclusion precedence, matching | `scope-match.ts` | scope-match unit, QA2-E | verified (S-6 wording) |
| FR-005 / FR-006 taxonomy, multi-class | schema, `create.ts` | adverse, QA2-G | verified |
| FR-009 scope immutability | no mutation API; `narrow.ts` | contracts test, T026 and mutant M2 | verified |
| FR-011 budgets, finite duration | `create.ts` limits | adverse T012 | verified |
| FR-012 / FR-013 / FR-014 states, order, live recheck | `derive-state.ts`, `check.ts` | derive-state, check unit, QA2-H/I | verified |
| FR-015 budget exhaustion | `derive-state.ts` stub seam | adverse T019 | verified for the SPEC 007-owned part only; real metering is SPEC 008 |
| FR-015a production restriction (+ SOURCE_EXECUTION exemption) | `create.ts` | adverse T011, QA2-F | verified |
| FR-016 / FR-017 / FR-018 authority, operator reduction, audit | `revoke.ts`, `narrow.ts`, `create.ts` | adverse T020/T021, audit unit, QA2-J/K/O | verified (S-1 open) |
| FR-019 / FR-020 tenant scoping, non-disclosure | all lookups by `(id, userId)` | adverse, QA2-B/K | verified |
| FR-021 zero semantic change to Target/verification/scan creation | schema diff, no `apps/api/src` edits | control-gate adverse 29/29 | verified |
| FR-022 future-spec guidance | docs | T034 | document-level |
| FR-023 no AI judgment | grep of `services/authorization` for AI/LLM/fetch: none | n/a | verified |
| FR-024 decision, not reservation | read-only `AuthorizationCheckDb` | unit, QA2-N | verified |
| SC-001 entities per data-model | schema/migration | review | met |
| SC-002 check contract precise | contract vs code | unit tests | met |
| SC-003 revocation-vs-plan tension answered | `check.ts` fresh derive | QA2-H | met for the service layer |
| SC-004 "zero changes outside spec 007" | n/a | n/a | written for the planning package; implementation necessarily touches schema and services. Wording ambiguity, not a defect |
| SC-005 quickstart Part A | n/a | executed 8/8 | met |
| SC-006 F02/F05/F07 can consume it | n/a | T034 spot-check | document-level |

### 9.10 Next-session handoff (delta)

HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`; 56 entries, 0 staged. Owner actions in priority order: (1) answer S-1, (2) the colour decision (recommended `--accent-text: #b93c0a` in `colors.css`), (3) approve wording amendments S-3/S-6, (4) repair the Docker/WSL relay, (5) decide on Redis DB 13's 54 test keys (untouched). Then: fix S-9, run one full `pnpm test` with the shim and a pinned test `DATABASE_URL`, confirm only the colour test (or nothing) fails, and re-run `pnpm test:adverse` if source changed.

S-1 options. **A (recommended):** document that narrowing is replacement by any Target-bounded scope and that budgets can only decrease; no behaviour change; matches what QA and the adverse suite already assert and closes SPEC 007 cheaply. **B:** enforce a full subset rule; needs a precise subsumption definition over wildcard/exclusion/path/port/scheme/ref, risks false refusals, and the T026 fixture would have to change. **C:** a conservative check (every included host and path prefix of the new scope must be matched by `isInScope` against the original); smaller than B but still a contract change. Fail-closed purity favours B/C; closure risk and the contract's silence on subsumption favour A.

Prohibited without approval: SPEC 008 work; schema or migration changes; editing `colors.css` or any token; touching ports 3000/3001; staging or committing; deleting Redis keys; running anything against `webaudit`.

## 10. OWNER DECISIONS APPLIED AND FINAL CLOSURE (2026-10-27, after the owner's reply)

### 10.1 Owner decisions approved (all recorded; none exceeded)

| Decision | Applied as |
|---|---|
| S-1 Option A | Documentation only. `narrowAuthorization` is documented as replacement by a new Target-bounded scope, no subset algorithm; ownership, control reconfirmation, Target-bounded validation, class/production restrictions, budget ceilings (decrease only), revocation and audit stay mandatory. Implementation untouched. |
| S-3, S-6 | Documentation only: origin-vs-hostname clarification; empty `schemes` = both http and https. No runtime, schema or signature change. Historical text kept; corrections are dated additions. |
| T034 | Re-reviewed (10.4). |
| Token | `--accent-text` light value `#c2410c` to `#b93c0a` after the checks in 10.3. `--sev-high` unchanged. |
| S-9 | Test-database fail-closed guard (10.5). |
| adherence-lint | Both timeouts reviewed and documented (10.6). |

### 10.2 Exact files changed this pass

- `specs/007-.../spec.md` (new "Session 2026-10-27" clarification block), `data-model.md` (canonicalValue representation note), `contracts/grant-lifecycle-contract.md` (narrowing clarification; step 7 canonicalValue note), `contracts/scope-matching-contract.md` (scheme/port wording).
- `apps/web/app/tokens/colors.css` (line 8 value and the ratio in its comment, 5.18:1 to 5.65:1).
- `apps/api/tests/helpers/isolated-database.ts` (new), `apps/api/tests/unit/isolated-database.test.ts` (new, 9 tests), `apps/api/tests/integration/email-boot-guard.test.ts` (imports the guard; `BASE_ENV` uses it; assertions unchanged).
- `apps/web/tests/unit/adherence-lint.test.ts` (comments clarified; same two 20 s timeouts as before).
- This report, `PROCESS_FOR_THE_APP.md`. No other file; no application source, schema or migration. Git: HEAD unchanged, 0 staged, 62 status entries (56 before, +6: two new test files and four SPEC 007 spec files that were previously unmodified).

### 10.3 Token checks (all before the change)

Current values verified (`--accent-text` `#c2410c`; dark `#ff7a33`; `--sev-high` `#c2410c`). References to `--accent-text`: `tailwind.config.ts`, `Sidebar.tsx` (wordmark on `surface-raised`), `InputTabs.tsx`, `Badge.tsx` (accent badge on `#fff3ec`), `Eyebrow.tsx`, `TwoToneHeading.tsx`, plus the two token files. Contrast of `#b93c0a` (old to new): `#ffffff` 5.18 to 5.65; `#fafafa` 4.96 to 5.42; `#f9fafb` 4.96 to 5.41; `#f8faff` 4.96 to 5.42; `#eef3ff` 4.66 to 5.09; `#fff3ec` 4.76 to 5.19; `#fff7ed` 4.88 to 5.33. All are at least 4.5:1 (AA normal text), and every surface improves. Hue is 17 degrees for both old and new (brand `--accent` is 21 degrees), so it remains a deeper, browner orange and is still not the brand CTA colour or `--sev-high`. Guardrail run unmodified: 5/5 pass. Other `#c2410c` hits in the repo are `--sev-high` documentation, unchanged. Caveat: contrast was computed, not eyeballed in a browser.

### 10.4 T034 re-verified (documentation level, 008/009/012)

1. Both call points: 008 `safety-admission-contract.md` L40-42, L67 (fresh `isAuthorized` at admission, errors abort); 009 `execution-plan-contract.md` L26 (plan resolution); 012 contracts active-security, api-discovery, credential-broker, security-reverify, security-scope all cite it. 2. No parallel matcher: no host/path/wildcard comparison logic in 008/009/012 outside `isInScope` references (grep empty). 3. No direct writes to 007 tables; 012 T614 asserts the worker role cannot write `TargetAuthorization`/`ScopeDefinition`. 4. No `Target`/`TargetVerification` additions; 008 `data-model.md` L11 "zero structural changes". 5. 009 defines its own `ExecutionUnitClass` rather than widening 007's enum. 6. Budget counters in 008 are keyed to `targetAuthorizationId` as a scalar. Nothing in 008/009/012 contradicts the narrowing, scheme, or canonicalValue clarifications (grep: no mention of narrowing/replacement, `schemes` defaults, or scope-vs-canonicalValue). The `isAuthorized` positional signature in those plans is within the check contract's own wording ("shape, not a finalized TypeScript interface"), so no correction is needed.

**One stale factual note, NOT edited (outside the approved decisions; frozen and uncommitted 009 file):** `specs/009-core-scan-execution-platform/data-model.md` L14-17 says `enum ExecutionClass` is "not yet present in the real schema.prisma (confirmed by direct grep...)". It is present since SPEC 007 T001. Proposed replacement: "F01's `ExecutionClass` enum is present in `apps/api/prisma/schema.prisma` (SPEC 007, migration `20261024235733`)". The design conclusion (a distinct `ExecutionUnitClass`) is unaffected. Owner question: may I apply that one-sentence correction to 009?

### 10.5 S-9 fix

`helpers/isolated-database.ts`: `assertIsolatedTestDatabaseUrl` fails closed on missing/blank/unparseable URLs, rejects the development database `webaudit` in any URL spelling, and accepts only a name ending in `_test`/`-test`; messages carry the database name, never credentials. `isolatedChildEnv` overrides, never inherits, the ambient `DATABASE_URL`. `email-boot-guard` now builds the child environment from `TEST_DB_URL` (the repo's existing test configuration: `TEST_DATABASE_URL` or its built-in `webaudit_test` default) through that guard. Interpretation to confirm: the shell's `DATABASE_URL` is now ignored for these children, and a plain run with it unset uses the repo's own `webaudit_test` default instead of failing; an unsafe configured value (for example `TEST_DATABASE_URL` naming `webaudit`) fails closed. If you want the test to fail when `TEST_DATABASE_URL` is not explicitly set, that is a one-line change but would make plain `pnpm test` red for this file. Regression coverage: 9 unit tests including missing, blank, dev in four spellings, non-test names, unparseable, no credential leakage, and the ambient-dev override. Live proof: `email-boot-guard` run with `DATABASE_URL` and `TEST_DATABASE_URL` unset passed 3/3 while the dev DB's `Capability` max `updatedAt` (06:32:10) and `AuditLogEntry` count (215) were identical before and after. Not covered: `secure-cookie-tls-boundary` builds children from `process.env['DATABASE_URL']` in the same style; it was not changed (outside the approved scope) and the full run pinned `DATABASE_URL` to `webaudit_test`.

### 10.6 adherence-lint review

Evidence, per test, with the file run in isolation (`-t`, so it is the first ESLint use in the process): components test about 19.5–20.0 s, route-files test about 18.8–19.1 s (2 runs each). In the full file, after the fixture tests have warmed ESLint: components 6.7–7.3 s, route files 4.3–5.1 s (3 runs; it timed out once at 5.07 s). So both tests lint 36-46 files in-process and both exceed the 5 s default; the second needs the same correction because it does the same kind of work and was already at the limit warm. Direct `eslint` exits 0. Global timeouts untouched; assertions untouched. **Limitation:** the isolated cold runs sit at the 20 s ceiling the owner authorized, so a slower machine could still time out when only these tests are run alone; a higher ceiling needs approval.

### 10.7 Final verification (this pass)

| Check | Result |
|---|---|
| Focused unit + contract + guard + enum-drift (7 files) | exit 0, 161/161 |
| Authorization + control-gate adverse | exit 0, 102/102 |
| `prisma validate`, API typecheck, eslint (api tests, SPEC 007 src, edited web/worker tests) | all exit 0 |
| `prettier --check` on changed test files | clean. `colors.css` is flagged, but it fails prettier at HEAD too (pre-existing, not reformatted) |
| T034 | 10.4 |
| `tailwind-migration-guardrails` | 5/5 |
| `adherence-lint` file | 8/8 earlier; isolated runs 4/4 (10.6) |
| `email-boot-guard` | 3/3 with `DATABASE_URL` unset; 3 of 3 passes also earlier under the shim |
| DB isolation | `DATABASE_URL` pinned to `webaudit_test` for the full run; dev DB `webaudit` unchanged (same `Capability` timestamp); Redis DB 15 per-key digest `d0a74ee7acbb` and 12 keys identical before/after; no client was ever on db 15; no keys deleted |
| **Full unit suite** (`pnpm test`, process-local Redis shim 15 to 13, validated by a smoke test this session, `DATABASE_URL` pinned) | **exit 0: 224 files and 1505 tests passed, 0 failed, 1706 s**, 0 `ECONNREFUSED`, 1035 shim rewrites |

Not run: the full adverse suite (no application source changed since its exit-0 run earlier today). Browser testing was not performed (Playwright MCP timed out); web checks were HTTP status only. The Redis shim is a process-local workaround, not an infrastructure repair: `127.0.0.1:6389` still refuses connections, and a plain `pnpm test` without the shim will fail on Redis-dependent tests until the relay is fixed. Redis DB 13 holds test-created keys, left in place.

### 10.8 Requirement and task status after the decisions

All FR/SC rows in 9.9 stand, with S-1/S-3/S-6 now resolved as documentation: FR-009/FR-016 narrowing semantics are explicit; FR-007 scheme default is consistent across spec, data model and contract; SC-004 remains a wording point about the planning package, not an implementation defect. T001-T033 as in 9.8. T034: complete (document-level review of the frozen 008/009/012 plans, one stale 009 note reported). T026 remains mutation-sensitive without any red-first claim.

### 10.9 Remaining limitations (none blocks SPEC 007 closure)

S-7 (ARCHIVE Target scope has no test and thin contract guidance; Low); S-4/S-5/S-8 design observations; `secure-cookie-tls-boundary` DB fallback (above); the 009 stale note awaiting a yes; isolated adherence-lint runs at the 20 s ceiling; unrepaired Redis relay; DEC-034/044/045/048/049 still block SPEC 008. The full-suite pass relied on the shim and a pinned test database.

### 10.10 Closure verdict (SPEC 007): **VERIFIED COMPLETE**

Basis: all 42 tasks have fresh evidence; the migration is reviewed, additive and applied; 102 adverse and 161 focused tests pass; the full unit suite passed (1505/1505) under demonstrated isolation; T026 is mutation-sensitive; quickstart Part A passes; manual service-level QA passed 20/20 with no critical or high defect; the three owner decisions that blocked closure are applied; no unresolved SPEC 007 defect remains. Scope of this claim: SPEC 007's backend service layer only. It does not claim browser or UI testing (none exists for this feature and none was run), end-to-end execution authorization (SPEC 008+), or that the application is production-ready. Project-wide items (Redis relay, SPEC 008 decisions, S-4/S-7/S-8) are tracked separately above and do not gate this verdict.
