# Session handoff — SPEC 007 Phase 4 (US2) complete

Date: 2026-10-26 · Branch `main` · HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196` (unchanged; nothing staged or committed)
Supersedes nothing. Prior records: `SESSION_HANDOFF_2026-10-25.md` (pre-Phase-3) and `SESSION_HANDOFF_2026-10-25_SPEC007_PHASE3_COMPLETE.md`.

## 1. Verdict

**PASS for the authorized slice (T017–T025).** Every acceptance criterion below has executed evidence. Not claimed: the full unit project and the full adverse suite were not run in this session (T032 owns the latter).

Authorization quoted from the owner: "You have my authorization to proceed with SPEC 007 Phase 4, T017–T025, including the direct-implementation exception because `/codex-delegate` is unavailable", with `webaudit_test`-only truncate/`migrate deploy` approved. Codex was not re-probed.

## 2. Baseline before → after

| | Before | After |
|---|---|---|
| HEAD / branch | `e425773…` / `main` | unchanged |
| `git status --short` entries | 49 | 51 (+2 new untracked test files) |
| Staged | none | none |
| Tracked diff | 31 files +393/−43 (before this session's `tasks.md` ticks) | 31 files (`tasks.md` was already modified; now +11 checkbox flips) |
| SPEC 007 tasks | 22 / 20 / 42 | 33 / 9 / 42 |
| `.specify/feature.json` | SPEC 011 | untouched |
| `pnpm-lock.yaml` | modified (unrelated) | untouched, not reverted |

## 3. Tasks and evidence

| Task | Evidence | Red status |
|---|---|---|
| T017 revoke bites on next check | adverse "T017" ×3 (incl. sibling grant stays usable) | red: stub rejected (`revokeAuthorization is not implemented`) |
| T018 expiry distinct from revoke | adverse "T018" ×2; `derive-state.test.ts` boundary | **characterization** (inline expiry already existed) |
| T019 BUDGET_EXHAUSTED stub | unit seam ×7 + `derive-state.test.ts` ×10; adverse "T019" ×2 | red: unit 10 assertion failures; adverse DB-level is characterization (check.ts already wired when run) |
| T019a side-effect-free | unit: deep-frozen rows, Proxy db throwing on any non-read access, identical repeat results, harness self-check | **characterization** (existing FR-024 test already covered most) |
| T020 non-owner = nonexistent | adverse "T020" ×3 (incl. forged operator flag, unclaimed DB operator) | red: stub |
| T021 operator revoke audit | adverse "T021" ×3 + idempotency ×3 (incl. concurrent double revoke → 1 audit row) | red: stub |
| T021a audit row shape | `tests/unit/authorization-audit.test.ts` ×5 | revoke rows red (3 failures); `granted`/`environment.*` characterization |
| T022 `derive-state.ts` | implemented; `derive-state.test.ts` | — |
| T023 wire into `check.ts` | existing 24 tests unchanged and green + new seam tests | — |
| T024 `revoke.ts` | implemented; adverse + audit tests green | — |
| T025 barrel | `authorization-contracts.test.ts` T025 test; `deriveState` intentionally not exported | — |

## 4. Commands and results (all 2026-10-26)

- Unit red: `pnpm exec vitest run --project unit …authorization-check… …derive-state…` → 10 failed / 33 passed (assertion failures).
- Adverse red: `… --project adverse …authorization.test.ts --no-file-parallelism -t "T017|T018|T019|T020|T021|idempotent on terminal"` → 13 failed / 3 passed.
- Green unit/contract: authorization-audit, authorization-check, derive-state, scope-match, authorization-contracts → **5 files, 97 tests pass**.
- Green adverse + regression: `pnpm exec vitest run --project adverse apps/api/tests/adverse/authorization.test.ts apps/api/tests/adverse/control-gate.test.ts --no-file-parallelism` → **2 files, 94 tests pass** (208 s, exit 0).
- `pnpm --filter @webaudit/api typecheck` → exit 0 (the API tsconfig includes `tests/**`, so test files are typechecked; `PrismaClient` → `AuthorizationCheckDb` assignability is now exercised by `isAuthorized(testDb, …)` — previously UNVERIFIED, now verified at type level and at run time).
- `eslint` and `prettier --check` on touched files → clean.
- The unit glob (`vitest.workspace.ts`) includes `apps/api/tests/unit/**`, so `authorization-audit.test.ts` runs in the unit project.

## 5. Files changed (this slice)

New: `apps/api/src/services/authorization/{derive-state,revoke}.ts`, `apps/api/tests/unit/{derive-state,authorization-audit}.test.ts`.
Changed: `authorization/{check,index}.ts`; `tests/unit/authorization-check.test.ts` (fixture gained `requestBudget`/`concurrencyBudget`; no assertion changed); `tests/adverse/authorization.test.ts`; `tests/contract/authorization-contracts.test.ts`; `specs/007-…/tasks.md` (11 ticks); `PROCESS_FOR_THE_APP.md`; this file.

## 6. Database actions

Only `webaudit_test` (`localhost:5442`) was contacted for writes: `resetDb()` truncation and `prisma migrate deploy` (22 migrations, nothing pending). Target verified before running: `TEST_DATABASE_URL` unset → helper default `…/webaudit_test`; a read-only count query showed 22 finished migrations. `webaudit`, `zz_review_fk`, `postgres` untouched. No migration created or edited, no `migrate dev`/`db push`/reset, no `prisma generate`.

## 7. Design decisions recorded (owner-approved unless noted)

- Consumption seam: `isAuthorized` input `consumption?: ReadonlyMap<grantId, {requestsConsumed, concurrencyInUse}>`; exhausted when `>=` the grant budget; absent data = never exhausted; malformed supplied data fails closed (implementation choice, within the approval's "fail closed" posture). Production enforcement stays SPEC 008.
- Ordering: revoked/expired refuse immediately; scope, then environment; `BUDGET_EXHAUSTED` last (matches `REFUSAL_DEPTH` and FR-013(e); differs from the `data-model.md` pseudocode order, recorded here rather than editing the spec).
- Operator status re-read from `User.isOperator` in the revoke transaction; a claim without database backing is ignored; no contract conflict found (stricter than the contract sketch, which takes a bare boolean).
- Operator revoking their own grant = `authorization.revoked`.
- `deriveState` produces no `GRANTED` (the data model defines no future-dated start).
- Revoked-by-concurrent-winner returns the committed row and writes no second audit row.

## 8. Remaining ambiguities and deferred work

Unchanged and not resolved: origin-vs-bare-host spec wording (handoff 2026-10-25 §8A); empty include lists admit nothing; empty `schemes` = both; empty `ports` = standard port; `(db, input)` signatures; `actingUserIsOperator` still in the signature (kept for contract fidelity). Deferred: real budget metering (SPEC 008); `narrowAuthorization` (T028) will call `revokeAuthorization` with `actingUserIsOperator: false` and must audit `authorization.replaced` atomically — `revoke.ts` currently opens its own transaction, so T028 will need a transaction-joinable variant or a shared inner function (design point for Phase 5).

Known failures not attributed: the four unit-suite failures from the Phase 3 closeout (tailwind guardrail caused by uncommitted `colors.css`; adherence-lint timeout; gated-check-partial; auth.register) — **not re-run and not baselined**.

## 9. Next eligible phase

SPEC 007 **Phase 5 (US3), T026–T029**: depends on `revoke.ts` and `create.ts` (both done); T026 is an adverse test, T027 a contract test extending `authorization-contracts.test.ts`, T028 `narrow.ts`, T029 barrel + doc-comment. Needs separate owner authorization (and `webaudit_test` write approval for T026). Then Phase 6 polish (T030–T034; T032 runs the full adverse suite; T033 edits `PROJECT_MAP.md`). Not started.
