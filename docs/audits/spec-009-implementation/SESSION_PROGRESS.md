# SPEC 009 — session progress and continuation handoff

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
