# Session handoff — SPEC 007 Phases 5–6 (partial; DB verification blocked)

Date: 2026-10-27 · Branch `main` · HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196` (unchanged; nothing staged or committed)
Follows `SESSION_HANDOFF_2026-10-26_SPEC007_PHASE4_COMPLETE.md`.

## 1. Verdict

**PARTIAL.** SPEC 007 is 38 of 42 tasks ticked. Open: T026 and T028 (written/implemented, DB verification blocked), T032 (needs DB), T034 (future-spec follow-up by design).

Authorization used: owner instruction to start "all the next phase tasks … for all the next" of SPEC 007, read as T026–T034, same boundaries as Phase 4 (`webaudit_test` only, no migration, no staging/commit). Not extended to SPEC 008–012.

## 2. Blocker

The Docker daemon was not running (`dockerDesktopLinuxEngine` pipe absent). `resetDb()` runs `prisma migrate deploy` first, so every DB-backed test failed with "Failed to apply Prisma migrations to TEST_DATABASE_URL". Starting Docker/Postgres was outside the authorization, so it was not started. The 8 T026 failures seen are this environment error and are NOT the intended red; T026's real red/green has not been observed.

## 3. Task matrix

| Task | State | Evidence |
|---|---|---|
| T026 narrow adverse tests | OPEN | 8 tests written in `tests/adverse/authorization.test.ts`; typecheck clean; not runnable without Postgres |
| T027 contract surface test | TICKED | red first (`narrowAuthorization` undefined → 2 assertion failures), then green; 5 files / 100 unit+contract tests pass |
| T028 `narrow.ts` | OPEN | implemented; typecheck/eslint/prettier clean; behaviour unverified (needs T026 run) |
| T029 barrel + doc-comment | TICKED | exports verified by T027; module comment lists every export |
| T030 quickstart Part A | TICKED | self-check against the code: no verification link or secret field on the 3 models; `Target` gained only 2 relation fields; schema diff removes 0 lines; `git diff -- apps/api/src` empty (FR-021); enum-drift test 52 pass |
| T031 typecheck + lint | TICKED | `tsc --noEmit` exit 0; `apps/api` has no `lint` script, so `eslint` was run on all authorization files (exit 0) and prettier check clean on them (substitution of the task's literal command) |
| T032 full adverse suite | OPEN | not run (needs DB, ~18 min) |
| T033 PROJECT_MAP row | TICKED | row updated (1-line diff) |
| T034 Part B re-run | OPEN/DEFERRED | requires F02/F05/F07 plans, which do not exist |

## 4. Design decisions in `narrow.ts` (contract silent; fail closed — please review)

- Owner-only, tenant-scoped lookup `(id, userId)`; operator and stranger get the identical NotFound; no operator variant.
- Only a LIVE grant can be narrowed; revoked/expired/concurrently-replaced → new `AuthorizationValidationError` code `GRANT_NOT_ACTIVE`. (Literal contract reading — "sugar over revoke, which is a no-op when terminal" — would re-create a grant from a revoked/operator-revoked one; refused instead.)
- Budgets can only decrease; omitted → original request/concurrency and original REMAINING lifetime (clock never restarts). Higher explicit values → `BUDGET_OUT_OF_RANGE`.
- Scope SUBSET of the original is not verified (no subsumption rule exists in the contract); the new scope still passes every `createAuthorization` check, incl. bounded-to-Target. "Narrow" therefore is not enforced as narrower for scope — owner decision if a subsumption rule is wanted.
- Audit: `authorization.granted` on the new grant and `authorization.replaced` (`after: { replacedByGrantId }`) on the original, no separate `authorization.revoked` row, all in one transaction with the conditional update that ends the original.
- `create.ts` split into `validateGrantRequest` / `insertGrant` / `createAuthorization`; behaviour-preserving but the existing 49+ create/classify adverse tests have NOT been re-run since the split (DB down) — treat as UNVERIFIED until the next run.

## 5. Commands run (2026-10-27)

- `vitest --project unit` on authorization-audit, authorization-check, derive-state, scope-match, authorization-contracts → 5 files, 100 tests pass.
- `pnpm --filter @webaudit/api typecheck` → exit 0. `eslint` (authorization src + tests) → exit 0. `prettier --check` → clean on touched files (two untouched unit files elsewhere in `tests/unit` are flagged, pre-existing, not touched).
- `vitest --project unit packages/types/tests/unit/enum-drift.test.ts` → 52 pass.
- `vitest --project adverse … -t "T026"` → 8 failed, all "Failed to apply Prisma migrations" (environment).
- `docker ps` / `docker exec …` → daemon unreachable. No database contacted this session.

## 6. Files changed this session

New: `authorization/narrow.ts`. Changed: `authorization/{create,errors,index}.ts`, `tests/adverse/authorization.test.ts`, `tests/contract/authorization-contracts.test.ts`, `PROJECT_MAP.md`, `specs/007-…/tasks.md` (5 ticks), `PROCESS_FOR_THE_APP.md`, this file.

## 7. Next steps (in order)

1. Start Docker Desktop and the Postgres/Redis stack; confirm `webaudit_test` reachable and at 22 migrations.
2. `pnpm exec vitest run --project adverse apps/api/tests/adverse/authorization.test.ts apps/api/tests/adverse/control-gate.test.ts --no-file-parallelism` — expect T026 to be green (it cannot show a pre-implementation red now that `narrow.ts` exists; the stub red was never observed because of the blocker), the 65 earlier authorization adverse tests to confirm the `create.ts` split, and control-gate to stay green. Fix any real failure; then tick T026 and T028.
3. T032: `pnpm test:adverse` (~18 min, background). Report every failure with attribution; do not call the unit suite green.
4. T034 when F02/F05/F07 are planned. SPEC 007 is then complete; next specs (008+) remain blocked by owner decisions listed in `PROCESS_FOR_THE_APP.md`.

## 8. Addendum (later 2026-10-27) — blocker cleared, verdict updated

Docker Desktop was started (owner: "start all of this"); Postgres/Redis healthy; `webaudit_test` at 22 migrations (read-only count).
- Authorization + control-gate adverse (serial): **2 files, 102 tests pass** → T026, T028 ticked; the `create.ts` split is confirmed behaviour-preserving by the existing create/classify/revoke tests. Caveat: T026 had no observed pre-implementation red (first real run was after `narrow.ts` existed) and was not mutation-tested.
- T032 `pnpm test:adverse`: **64 files, 930 passed, 1 skipped, exit 0** (1100 s) → ticked.
- **Updated verdict: SPEC 007 = 41 of 42 tasks; only T034 open (deferred by design until F02/F05/F07 are planned). The authorized Phase 5–6 scope is otherwise PASS.** The full unit project was still not run; its four earlier failures remain unattributed.
- Only `webaudit_test` was written; no migration; nothing staged or committed.

## 9. Closure addendum (2026-10-27, later)

Full record: `SPEC007_CLOSURE_MANUAL_QA_2026-10-27.md`. Verified this pass: typecheck exit 0; `pnpm test:adverse` 64 files / 930 passed / 1 skipped, exit 0; `pnpm test` (unit, whole repo) 4 failed / 1491 passed (none in SPEC 007 code, causes classified in the record); 14 independent manual service-level QA scenarios PASS including fault-injected rollback of narrowing. T034 reviewed against the 008/009/012 plans (document-level, PASS) and ticked: SPEC 007 is 42 of 42 tasks. This is task closure only, not release readiness: SPEC 008+ stay blocked by DEC-034/044/045/048/049; the unit suite is not green (tailwind token collision from uncommitted `colors.css`; env-dependent `auth.register`; two intermittent tests with unproven cause).

