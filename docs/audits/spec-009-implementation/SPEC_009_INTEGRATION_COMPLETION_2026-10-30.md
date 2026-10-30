# SPEC 009 production integration — completion report, 2026-10-30

**Verdict: PARTIALLY COMPLETE.** N01 (flag-gated, default OFF) is implemented and verified; N02 preserved; N03 and N04 partial; N05, D01, V03–V09 not done; V01 produced a blocking finding (G-4). SPEC 009 is not closed and no production cutover happened. Evidence tags: [DEV] run on this machine in this session.

## A. Executive summary
Owner decisions A–E are recorded (DEC-071..075). Passive units are now completed by the orchestrator through a dedicated database function; `POST /scans` accepts an optional validated `profile`; the SPEC 009 plan path is behind `SCAN_EXECUTION_PLANS=on` (default OFF). A real HTTP lifecycle with the flag ON passes end to end. Non-passive execution (SPEC 010–012), real R2, least-privilege runtime logins, REVERIFY-by-plan, load/coverage/visual/failure-injection work remain open.

## B. Starting git state
`main` = `origin/main` = `896b3c606e1c`, ahead/behind 0/0 after `git fetch`. Owner files preserved (pnpm-lock.yaml local hunks, audit-sweep.mjs, auth-state.mjs, frontend-design/, showcase-*).

## C. Approved decisions
DEC-071 passive completion · DEC-072 profile selection · DEC-073 flag default OFF · DEC-074 billing preserved · DEC-075 emulator approved for local testing. Record and the reconciled conflict (the old "only TELEMETRY completes from PLANNED" text) are in `docs/audits/fahes-master-audit/final-planning/DECISION_AMENDMENT_2026-10-30_SPEC009_INTEGRATION.md`. DEC-032/062 remains the open billing-policy dependency.

Delegation: Codex `gpt-6-luna` was rejected on this login (`model_not_found`) in the previous session segment and the condition is unchanged; CLAUDE.md permits direct implementation when delegation is technically impossible. Implemented directly and re-verified with real gates. Owner awareness requested.

## D. Task results
| Task | Status | Evidence |
|---|---|---|
| T-U1-10 | Open (unchanged) | needs production-engine termination and deployed clock evidence |
| N01 | Done, flag-gated | sections E, J, K, L |
| N02 | Verified, preserved | the 9 boundary/boot tests still pass in the full run; nothing rewritten |
| N03 | Partial | coverage endpoint now exercised on a flag-ON scan; report/UI do not consume it |
| N04 | Partial | HTTP recovery and no-resurrection verified (3 tests); WebSocket reconnect ordering unverified |
| N05 | Not started | needs engine specs for non-passive reverify classes |
| V01 | Not completed; finding G-4 | see K |
| V02 | Partial | flag-ON lifecycle through the report and coverage; cancel/refund not driven |
| V03–V09 | Not started | V06 needs a deployed environment; V07 needs k6 |
| D01 | Not started | emulator approved but not provisioned in this session; real R2 stays open |

## E. N01 integration
- `profile?` on `POST /scans` (default `PASSIVE_BASELINE`; malformed/unknown → 422 `UNSUPPORTED_PROFILE`; flag off or needs a non-passive engine → 422 `PROFILE_UNAVAILABLE`; both refused before any debit). Clients never name engines, classes or grants.
- Flag ON: after the scan row and debit and before enqueue, the INITIAL plan is persisted; a plan refusal refunds in full and fails the scan (existing enqueue-failure pattern, reason `scan:plan-refused`).
- At the plan-unit barrier the worker calls `completePassiveUnits`; the barrier then continues exactly once.
- No production engine was registered; the API registry stays the passive baseline.
- Rollback: unset the flag; new scans take the legacy path, scans that already hold a plan finish through the same barrier. Tested: flag-OFF identity and plan-less scans (contract tests); the unset-then-finish case is covered by design, not by a dedicated test.

## J. Database changes
One forward-only migration `20261031000000_spec009_passive_unit_completion`: narrows the guard trigger (passive `PLANNED→COMPLETED` only under a transaction-local flag set by the new function), adds `fahes_complete_passive_unit(unit, idempotencyKey)` (SECURITY DEFINER, owner `fahes_owner`, EXECUTE only to `fahes_orchestrator`, prerequisites in SQL), grants `fahes_owner` column SELECT on `ModuleResult`. Tested on the disposable database; the existing 11-status transition-table test still passes unchanged.

## K. Security verification [DEV]
`passive-completion-roles.test.ts`, 20 tests on real LOGIN roles: only orchestrator-capable logins may execute; api/worker/host/operator/no-role are denied; completes on module COMPLETE/DEGRADED, refuses on FAILED/NOT_APPLICABLE (reason recorded), defers on PENDING/RUNNING/missing, on unmet dependency, cancelled/not-started/expired scan, non-passive class, stale idempotency key, missing domain; idempotent replay; direct COMPLETED writes by every runtime login are rejected even with the flag set by the caller; raw superuser writes without the flag stay rejected. Tenant isolation on plan creation (404, nothing written). **Finding G-4:** in the isolated database no runtime login holds legacy-table grants, and the documented production worker login (`fahes_worker_exec` only) can execute neither the finalizer nor the new function, so the compose pattern cannot run the flag-ON path under least privilege. Not changed (provisioning decision). The barrier's own reads in that test therefore use the fixture client; only the completion runs on a real login.

## L. Runtime integration [DEV]
`apps/web/tests/e2e/first-audit.execution-plans.spec.ts`: in-process API + worker, real PostgreSQL, Redis/BullMQ, fixtures AI mode, flag ON: register → login → target → quote → create (plan with 2 units) → phases → passive completion → master → COMPLETED → report with score and issues → coverage (2 completed, 0 not). Fixture database login, not least privilege.

## M. Failure injection, N. Object storage, P. Visual, Q. Performance, R. Coverage
Not run. D01 emulator not provisioned; no emulator claim is made. No real-R2 claim.

## O. Browser acceptance
No new Chromium acceptance was run in this segment beyond the Playwright suite (see S). The 3-viewport smoke from 2026-10-30 (see the recovery handoff) predates the changes; web code is unchanged.

## S. Regression results [DEV] (isolated PostgreSQL :5461, Redis :6399)
| Check | Result |
|---|---|
| Typecheck | 30/30 |
| ESLint on touched files, `lint:adherence`, Prettier on touched files, `git diff --check` | clean |
| Unit/contract/integration | 246 files. First full run: 244 passed, 2 worker files failed because I set `EXEC_TEST_REDIS` as a URL instead of `host:port` (my environment error). Those files rerun correctly with the two new worker files: 3 files, 42/42 passed. Remaining tests of the full run: 1,875 passed, 24 skipped, 0 failed |
| Adverse | 74 files, 1,173 passed, 1 skipped (baseline 73/1,153: +1 file, +20 tests) |
| Playwright | 94 passed, 0 failed (27.4 min; 93 baseline + the new flag-ON spec) |
| Prisma validate / migration | migration applied fresh to the disposable database by the test harness (36 migrations) |

## T/U. Matrix and 28-gate DoD (recounted, no status change)
No requirement or gate met its full acceptance criteria on this evidence: FR-039 stays PARTIAL (not consumed by report/UI), FR-027/027a stay PARTIAL (reconnect ordering), FR-029 stays PARTIAL (reverify still legacy). FR 49: 2 / 28 / 16 / 0 / 3; SC 8: 2/5/1; DoD 28: **11 PASS / 17 PARTIAL / 0 FAIL / 0 BLOCKED**. Task ledger: N01 closed (flag-gated), N03/N04/V02 partial, the rest open.

## V/W. Remaining dependencies and owner decisions
External: real R2 credentials (or emulator provisioning), a deployed environment with NTP evidence, k6. SPEC 010–012: non-passive engines, dispatch hook, REVERIFY classes, T-U1-10 production termination. Owner decisions: which login holds `fahes_orchestrator`/finalize in production (G-4); DEC-032/062 billing of non-passive outcomes; live rollout approval for `SCAN_EXECUTION_PLANS`; awareness of the Codex-model exception.

## X. Git
Commits and remote verification are listed in the final message after push.

## Y. Next recommended
Resolve G-4 (provisioning), then V01 with real processes, V03–V05, D01 against an emulator, N03 report/UI, N04 reconnect ordering; SPEC 010 for the first non-passive engine.
