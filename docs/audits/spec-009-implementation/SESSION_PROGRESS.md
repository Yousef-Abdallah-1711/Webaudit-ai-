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
| `storage/retention.ts` call to `enforceArtifactRetention`, scheduling `reclaimOrphanedArtifacts` | functions exist and tested; not wired (retention uses an array transaction; converting it risks the legacy suite) |
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
The complete serial unit run is **not finished** at the time of writing: it takes hours here even on a throwaway tmpfs Postgres (1569 tests, each resetting ~70 partitioned tables). Last observed state of the run against the throwaway database: **295 passed, 0 failed** (partial; the run was still in progress). The earlier parallel run on the shared database (38 failures) failed on DB-hook timeouts from contention; the failing file passed when run alone. **The full unit suite, the adverse suite and Playwright have NOT been re-run to completion after this change** — that remains an open verification gate (DoD gate 26, PARTIAL). What was run to completion: planning/runtime/evidence/dispatch (215 tests), worker sweep/gate/legacy timeout/orchestrator subsets (40), enum drift.

## Git
Pushed with a normal push: local `main` = `origin/main` = `2265019` (verified with `git ls-remote`). Owner working-tree files were not staged.
