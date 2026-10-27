# Session Handoff — 2026-10-25

Audit and documentation only. Nothing in this file authorizes implementation. Repository files are the source of truth; where this report and a file disagree, the file wins and the discrepancy belongs in §19. Verified at 2026-10-25T00:14Z (UTC, local clock) against HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`. Claims not re-checked in this audit are labelled **RECORDED** (from `PROCESS_FOR_THE_APP.md` or earlier output) or **UNVERIFIED**. No credentials, connection URL or secret appears here.

Labels: **VERIFIED** = checked in the repository or by a read-only command during this audit. **RECORDED** = stated in a repository document, evidence not re-run. **UNVERIFIED** = no evidence found.

---

## 1. Executive Summary

- The project is Fahes / WebAudit AI (pnpm monorepo). The active workstream is **SPEC 007** (`specs/007-foundation-target-authorization-scope/`, "F01 — Target / Environment / Ownership / Authorization / Scope"), Stage 1 of the dependency-ordered plan in `PROCESS_FOR_THE_APP.md` §4.
- **Phases 1 and 2 of SPEC 007 are complete at schema level**: T001–T007 including T005a (8 of 42 tasks ticked, 34 open — VERIFIED by counting `tasks.md`). Phase 3 (User Story 1, T008+) has **not started**.
- The T006 migration `20261024235733_add_target_authorization_scope` exists on disk and was applied to the local Docker database `webaudit` (apply and post-apply checks are RECORDED; file and task tick are VERIFIED).
- **What exists is schema only.** Three enums, three models, a migration and an empty `services/authorization/` barrel. There is **no authorization enforcement**: no `isAuthorized`, `createAuthorization`, `classifyEnvironment`, scope matcher, tests for them, or callers. The generated Prisma client has not been regenerated (VERIFIED: the generated client has zero references to `TargetAuthorization`).
- A **pre-existing Prisma-vs-partitioning drift** makes any future `prisma migrate dev` emit SQL that would undo the partitioning of `AiInvocation` and `CapabilityExecution`. T006 avoided it by hand-trimming. It is unresolved and unrelated to SPEC 007.
- **Everything is uncommitted** (43 status entries, nothing staged). Planning is not closed: readiness gates A–F all NOT PASSED (RECORDED, `IMPLEMENTATION_READINESS_GATES.md`).
- Next eligible task: **T008** (and the parallel US1 test tasks T009–T012d) once the owner authorizes Phase 3. Details in §13.
- `.specify/feature.json` points at SPEC **011**, not 007 (VERIFIED). This is a known, deliberate non-change; see §19.

---

## 2. Current Repository Baseline (VERIFIED, 2026-10-25T00:14Z)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `e42577304a2ccec873b30bbbf1d712e6348f6196` (commit date 2026-10-08, short `e425773`) |
| `git status --short` entries | **43** |
| Staged | none (`git diff --cached --stat` empty) |
| Tracked diff | 29 files, +376 / −29 (`git diff --stat`) |
| `.specify/feature.json` | `{"feature_directory": "specs/011-source-backend-database-testing-platform"}`, unmodified in git status |

**Modified tracked files (29):** `CLAUDE.md`; `apps/api/prisma/schema.prisma`; 15 files under `apps/web/` (admin pages, tokens, components, `tailwind.config.ts`); `packages/types/src/domain.ts`; `packages/types/tests/unit/enum-drift.test.ts`; `specs/007-…/tasks.md`; 10 files under `specs/009-core-scan-execution-platform/`.

**Untracked (14 paths):** `PROCESS_FOR_THE_APP.md`; `apps/api/prisma/migrations/20261024235733_add_target_authorization_scope/`; `apps/api/src/services/authorization/`; `apps/web/audit-sweep.mjs`; `apps/web/auth-state.mjs`; `docs/audits/fahes-master-audit/` (includes this report); `docs/audits/frontend-design/`; `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/`; `specs/009-…/contracts/scan-deadline-contract.md`; `specs/011-source-backend-database-testing-platform/`; `specs/012-security-auth-api-testing-platform/`.

**Which diffs belong to this session's work.** The SPEC 007 and process work touched exactly: `apps/api/prisma/schema.prisma` (+107, no deletions), `packages/types/src/domain.ts` (+25), `packages/types/tests/unit/enum-drift.test.ts` (+10), `specs/007-…/tasks.md` (8 checkboxes: 8 insertions, 8 deletions; seen in the tracked diff), `CLAUDE.md` (a new "Master process document" section), and the untracked `PROCESS_FOR_THE_APP.md`, `authorization/index.ts`, the migration directory and `docs/audits/fahes-master-audit/**` planning files. Everything else in the working tree (the `apps/web/**` changes, the 10 `specs/009` edits, `specs/011`, `specs/012`, `showcase-*`, `.mjs` helpers) pre-dates this work and is not owned by it (RECORDED: pre-existing at session start; the unrelated-diff hash `830c403760ab9895` stayed constant across the session).

**Difference from the last recorded baseline** (43 entries; tracked diff 29 files, +375/−28 before the T006 tick): the entry count matches. The tracked diff is now +376/−29, exactly the T006 checkbox tick. For history: the end of slice 1 had 40 entries, the end of T003–T007 had 42 (adding the `authorization/` barrel and the process-document regeneration), and the T006 migration directory made 43. The session-start snapshot of the continued conversation already showed `PROCESS_FOR_THE_APP.md` and `apps/api/src/services/authorization/` as untracked, so "before this session" in this report means the commit `e425773` baseline plus the pre-existing unrelated dirt.

---

## 3. Project Architecture and Scope (VERIFIED from `PROCESS_FOR_THE_APP.md` §2, `PROJECT_MAP.md`, `AGENTS.md`; code layout re-checked)

- **Product:** Fahes (WebAudit AI): website audit platform being extended into "Scan Platform v2" (SPECs 006–012): per-target authorization, safety/kill-switch/budget, a unified scan/execution lifecycle, and web, source, and security testing engines.
- **Stack:** pnpm 9 monorepo, Node ≥22, Turbo; Next.js 15 web (`apps/web`), Express API with Prisma/Postgres (`apps/api`), BullMQ/Redis worker (`apps/worker`), `packages/{types,config,safe-net,…}`. `apps/probe-pool` is a library only; `apps/sandbox-runner` is the installed-capability sandbox, not the SPEC 011 Execution Plane (RECORDED).
- **SPEC set:** 001–005 legacy baseline (implemented, not re-verified); 006 master architecture; **007** authorization foundation; 008 safety/budget; 009 execution platform (+ uncommitted U-1 amendment); 010 web testing; 011 source/backend testing; 012 security testing.
- **Governing rules:** root `CLAUDE.md` (entry point, mandatory Codex delegation with a direct-implementation exception when delegation is impossible), `AGENTS.md`, `.specify/memory/constitution.md` v1.2.0 (Principle X: ownership ≠ authorization), `PROCESS_FOR_THE_APP.md` (living guide, never overrides a canonical contract).
- **Delegation fact:** Codex rejected the configured model (`gpt-6-luna`, `model_not_found`) twice on 2026-10-24. All implementation this session was done directly under explicit, scoped owner authorization. **Do not infer a standing exception.**

---

## 4. Current SPEC and Phase

- **Active SPEC:** 007. **Phase:** Phases 1 and 2 done; between Phase 2 and Phase 3 (User Story 1 / MVP). Phase 3 awaits owner authorization (RECORDED; no authorization for T008+ was given in this session — VERIFIED by absence in `tasks.md` and the process log).
- **Project-level stage:** Stage 1 of 6 (`PROCESS_FOR_THE_APP.md` §4). Stage 2 (DB role design + SPEC 008) is blocked by Level 1 decisions DEC-034, 044, 045, 048, 049, G-03 approval and EV-01.
- **Phase exit evidence (007 tasks.md):** Phase 1 checkpoint: enums exist, schema validates (T001, T002 ticked). Phase 2 checkpoint, "schema migrated; `apps/api/src/services/authorization/` exists as an empty shell" (tasks.md lines near T007): migration file exists (VERIFIED), applied (RECORDED), barrel exists (VERIFIED).
- **007 spec header:** "Planning complete — frozen" (RECORDED). The 007 directory is tracked; only `tasks.md` is modified.

---

## 5. SPEC 007 Task-by-Task Status

Counted from `specs/007-foundation-target-authorization-scope/tasks.md`: **8 ticked, 34 open, 42 total** (VERIFIED). Task IDs include suffix tasks (T005a, T011a, T012a–d, T019a, T021a).

| Task | Definition (short) | Ticked | Evidence | Level |
|---|---|---|---|---|
| T001 | Add `ExecutionClass`, `TargetEnvironmentClassification`, `ScopeTargetKind` enums to `schema.prisma` | ✔ | enums present in schema (+24 lines at slice 1); mirrored in `packages/types/src/domain.ts` (`EXECUTION_CLASSES`, `TARGET_ENVIRONMENT_CLASSIFICATIONS`, `SCOPE_TARGET_KINDS`) and registered in `enum-drift.test.ts` (`MIRRORED`) | schema + type mirror |
| T002 | `prisma validate` after enums | ✔ | RECORDED: valid; drift test red→green, 52/52 | validation |
| T003 | `TargetEnvironment` model + `Target.targetEnvironment` | ✔ | model in schema; migration creates table with unique index on `targetId` | schema |
| T004 | `ScopeDefinition` model | ✔ | migration creates table; no `userId` column (FR-020) | schema |
| T005 | `TargetAuthorization` + `Target.targetAuthorizations` | ✔ | migration creates table, `(targetId,userId)` and `userId` indexes, FKs | schema |
| T005a | `prisma validate` after T003–T005 | ✔ | RECORDED valid; re-run valid after migration apply (RECORDED) | validation |
| T006 | Generate, review, apply migration | ✔ | migration file VERIFIED; apply and post-apply checks RECORDED (§6) | migration |
| T007 | Empty `services/authorization/` barrel | ✔ | file VERIFIED: comment plus `export {};` | scaffold |

**Not done and must not be read as done:** implementation, enforcement, tests for authorization behaviour, DB-backed suites, `prisma generate`, production readiness. T008–T042 (34 tasks) are unticked. Per the task file, the remainder breaks down as Phase 3 (US1: T008–T016 incl. T011a, T012a–d), Phase 4 (US2: T017–T025 incl. T019a, T021a), Phase 5 (US3: T026–T031), Phase 6 polish (T032–T034 and related). The exact task-by-task list stays in `tasks.md`; do not copy it here.

---

## 6. T006 Migration: Evidence and Final State

**File (VERIFIED):** `apps/api/prisma/migrations/20261024235733_add_target_authorization_scope/migration.sql`, untracked, 13 SQL statements, sha256 prefix `e24b5f79cb00f267`. It sorts after `20260923010000_issue_fixable`. Migrations on disk: 22 directories plus `migration_lock.toml`.

**Content (VERIFIED by reading the file in this session's earlier turns and by the 13-statement count):** three `CREATE TYPE` enums; `CREATE TABLE` for `TargetEnvironment`, `ScopeDefinition`, `TargetAuthorization`; four indexes (`TargetEnvironment_targetId_idx`, unique `TargetEnvironment_targetId_key`, `TargetAuthorization_targetId_userId_idx`, `TargetAuthorization_userId_idx`); three foreign keys (Target→TargetEnvironment cascade, Target→TargetAuthorization cascade, ScopeDefinition→TargetAuthorization restrict). No `DROP`, no `UPDATE`, no `DELETE`, no change to `Target`'s columns.

**How it was produced (deviation from the documented workflow).** `prisma migrate dev --create-only` refused to run in the non-interactive shell (created nothing). The file was written from Prisma's `migrate diff --from-schema-datasource … --to-schema-datamodel … --script` output, minus three unrelated operations (owner-approved removal):
1. Replacing the composite primary key on `AiInvocation`.
2. Replacing the composite primary key on `CapabilityExecution`.
3. Re-adding `AiInvocation_executionId_fkey`.

A diff against the HEAD schema (no 007 changes) showed the same three, so the drift pre-dates SPEC 007.

**Applied (RECORDED, `PROCESS_FOR_THE_APP.md` §10 "T006 outcome"):** `pnpm exec prisma migrate deploy --schema apps/api/prisma/schema.prisma` from the repo root, exit 0, one migration applied. After: `migrate status` "up to date", 22 migrations; `_prisma_migrations` 22 rows all finished, none rolled back; enums, columns, indexes and FKs matched the file; `AiInvocation_partitioned_pkey` and `CapabilityExecution_partitioned_pkey` still present; `AiInvocation_executionId_fkey` still absent; fresh `migrate diff` showed only the same three pre-existing operations; `prisma validate` valid. Spec check: indexes, cascades and the scope relation match `data-model.md` (the scope relation has no `onDelete`, i.e. RESTRICT).

**Other evidence:**
- Pre-apply backup: `pg_dump` custom format, 443,469 bytes, 713 TOC entries, written outside the repo (scratchpad of this Claude session; the file existed at audit time — VERIFIED, size matches). It is session-scoped temp storage and may be cleaned up; copy it somewhere durable if it matters.
- Database identity (RECORDED, re-checked once at 40 min uptime): local `postgres:16-alpine` container `webaudit-postgres`, 16.14, not a replica, database `webaudit`, host port 5442. No fresh DB query was run in this audit.
- `tasks.md` T006 ticked (VERIFIED).

**Limits:** reversibility not verified (Prisma has no down migration; manual rollback = drop the three tables and three enums). The new SQL was never replayed on a scratch/shadow database. No DB-backed test suite was run. The Prisma client was not regenerated.

---

## 7. Chronological Record of This Session

Dates are 2026-10-24 to 2026-10-25. Earlier phases (audit, remediation, planning) are summarized in `PROCESS_FOR_THE_APP.md` §6/§11 and not repeated.

1. **Master process document.** `PROCESS_FOR_THE_APP.md` (generated; generator and validation scripts live in the Claude session scratchpad, outside the repo) and a "Master process document" section in `CLAUDE.md`. VERIFIED present.
2. **Slice 1 (T001, T002, enum mirroring).** Two Codex dispatches failed (`model_not_found`). Owner authorized direct implementation. Done test-first for the drift test (red → green, 52/52).
3. **T003–T005a, T007.** Owner authorized direct implementation of exactly these; T006 excluded. Schema models added; barrel created; `prisma validate`, drift test, `apps/api` typecheck, eslint, prettier passed (RECORDED).
4. **T006 attempts.** Owner selected database `webaudit` and authorized T006 subject to safety gates. Two attempts stopped at the Docker gate (Linux engine unavailable).
5. **Docker start.** Owner asked to start Docker. Docker Desktop (installed at `C:\Program Files\Docker\Docker\Docker Desktop.exe`) was launched; engine ready in ~15 s (server 29.3.1); `pnpm services:up` started/confirmed postgres (5442), pgbouncer (6452), redis (6389), all healthy. No Prisma command run.
6. **Safety gates.** Effective `DATABASE_URL`: root `.env`, loaded because Prisma runs from the repo root (`pnpm --filter @webaudit/api` runs from `apps/api` where no `.env` exists). Parsed target: localhost:5442, database `webaudit`, schema `public`, no TLS. Read-only identity query via `docker exec` passed; `migrate status` up to date (21). Backup taken.
7. **Drift discovery.** Read-only `migrate diff` showed three unrelated operations (§6). Work stopped; owner approved hand-trimming.
8. **Migration file created** from the diff output; checks: preview identical, one pending migration, `prisma validate` valid, database unchanged (21 rows in `_prisma_migrations`).
9. **Final pre-apply checks and apply.** Owner approved. Re-verified identity, connection, SQL identity with the reviewed file and the spec. Applied with `migrate deploy`; verified; ticked T006; updated `PROCESS_FOR_THE_APP.md`.
10. **This audit** (read-only, plus this report and a minimal process-document update).

### Decisions and authorizations (distinct from proposals)
- Docker must be used for the local DB; no alternative Postgres. (Owner instruction.)
- Target database for T006 = `webaudit` (owner-selected; local development database).
- Identity must be verified before migration work; T006 only after gates pass. (Owner instruction.)
- Three unrelated operations excluded from the T006 migration. (Owner approval, 2026-10-25.)
- Apply only after final checks. (Owner approval, 2026-10-25.)
- No staging or committing authorized at any point; the owner commits.
- Not decisions: the recommendation to track the drift separately, the suggestion to regenerate the Prisma client, and any view on T008 sequencing are proposals only.

### New technical findings
- Docker Desktop was simply not running; starting it resolved the blocker (no reinstall or config change).
- Service ports: Postgres 5442, PgBouncer 6452 (profile `pooled`, container healthy), Redis 6389. Prisma must use 5442 directly, not PgBouncer.
- `prisma migrate dev` refuses non-interactive shells; `migrate deploy` is the non-interactive path.
- `prisma migrate status` reports "up to date" even though the schema has the partition drift: status checks migration history, not schema equivalence.
- Test DB default: `localhost:5442/webaudit_test` (`apps/api/tests/helpers/db.ts`, RECORDED). The server also holds `webaudit_test` and `zz_review_fk`. The T006 migration was applied to `webaudit` **only**; whether `webaudit_test` has it is UNVERIFIED (see §10 risk R4).

### Deferred (out of scope)
T008–T042; SPEC 008–012; `prisma generate`; DB-backed tests; any commit; fixing the partition drift; the long-running Master Prompt.

---

## 8. Files and Artifacts Changed

Application/schema (all uncommitted):
- `apps/api/prisma/schema.prisma` (+107)
- `apps/api/prisma/migrations/20261024235733_add_target_authorization_scope/migration.sql` (new)
- `apps/api/src/services/authorization/index.ts` (new)
- `packages/types/src/domain.ts` (+25), `packages/types/tests/unit/enum-drift.test.ts` (+10)

Governance/docs:
- `specs/007-foundation-target-authorization-scope/tasks.md` (8 checkboxes only)
- `CLAUDE.md` (new section)
- `PROCESS_FOR_THE_APP.md` (new; regenerated several times; updated by this audit)
- `docs/audits/fahes-master-audit/final-planning/SESSION_HANDOFF_2026-10-25.md` (this file)

Outside the repo: pre-apply `pg_dump` and generation/validation scripts in the Claude session scratchpad (`C:\Users\Yousef\AppData\Local\Temp\claude\c--Users-Yousef-Desktop-Projects-motakamel\94bc68a5-8e8c-4d67-a38a-c50be7792e69\scratchpad\`); both are disposable-location and not part of the project.

Planning artifacts that already existed and were not regenerated by this audit: `docs/audits/fahes-master-audit/{MASTER_AUDIT_REPORT.md, NEXT_AGENT_HANDOVER.md (2026-10-19, earlier audit-session handover), …}`, `remediation/`, `final-planning/` (10 files) and `final-planning/phase-2/` (6 files).

---

## 9. Database and Docker State

- **Docker (VERIFIED 2026-10-25T00:14Z):** engine reachable; containers `webaudit-postgres`, `webaudit-pgbouncer`, `webaudit-redis` up 40 minutes, all healthy. `restart: unless-stopped` is set on at least postgres and redis; whether Docker Desktop auto-starts on boot is UNVERIFIED.
- **Database `webaudit` (RECORDED):** 22 applied migrations, all finished; three new tables and three enums present; partition keys intact. **UNVERIFIED now:** no fresh query was run in this audit (instructed to avoid reconnecting beyond existing evidence).
- **Other databases on the server:** `postgres`, `webaudit_test`, `zz_review_fk`. Unknown contents; do not touch.
- **Sanitized connection facts:** source = repo-root `.env`; host localhost; port 5442; database `webaudit`; schema `public`; TLS none; password never recorded.
- **Note:** `.env.production.example` points at `postgres:5432/webaudit` inside the Docker network; production is a separate environment and was never contacted.

---

## 10. Known Risks and Technical Debt

| ID | Risk | Evidence / handling |
|---|---|---|
| R1 | **Prisma schema vs partitioned tables drift.** Schema does not model the composite PKs of `AiInvocation`/`CapabilityExecution` (created by `20260914231000_partition_operational_telemetry`) nor the intentionally dropped `AiInvocation_executionId_fkey`. Any `prisma migrate dev` will want to emit SQL that undoes partitioning. `migrate status` will not warn. | Pre-existing at HEAD (proved by diff against the HEAD schema). Not fixed. Every future migration must be diffed and trimmed, or the schema reconciled in a separately approved task. |
| R2 | T006 SQL never replayed on a clean database; not reversible by tooling. | Rollback = manual drop of 3 tables and 3 enums; no test of this. |
| R3 | Prisma client not regenerated: new models are invisible to TypeScript. | Generated client has 0 references to `TargetAuthorization`. T008+ code touching Prisma needs `prisma generate` (not yet authorized; no database effect). |
| R4 | `webaudit_test` (where DB-backed tests run) may lack the new migration; adverse tests would fail for the wrong reason. | UNVERIFIED. Test helper applies migrations (`tests/helpers/db.ts`, RECORDED) — confirm before the first DB-backed 007 test. |
| R5 | No DB-backed test suite run since the migration; no `pnpm test:adverse`; no repo-wide typecheck/lint/full unit run. | Baseline CI-style evidence absent (F-01a not done; no CI exists, DEC-067). |
| R6 | Schema models ≠ enforcement. FR-004/FR-013/FR-019/FR-020 etc. are untested; nothing consumes the models. | Do not report SC-001…SC-006 as met. |
| R7 | `Target` back-relation fields and enum mirrors are uncommitted; a stray `git checkout`/reset would lose the only copy of slice work. | Preservation rules in §16. |
| R8 | `PROCESS_FOR_THE_APP.md` is generated from scripts in a session scratchpad that may disappear; the file itself is the surviving copy. | Edit it directly; do not rely on regeneration. |
| R9 | Pre-existing risks from planning: 28 contradictions (12 blocking), 69 decisions mostly open, U-1 uncommitted, SPEC 011/012 untracked. | See §11, §12. |

---

## 11. Open Decisions

For SPEC 007 itself: **none** (Packet 0, `phase-2/SPEC_IMPLEMENTATION_PACKETS.md`: "No unresolved required decision"; verified no DEC reference in 007 `tasks.md`).

Project-level (RECORDED, `DECISION_REGISTER.md`, `phase-2/OWNER_DECISIONS_TO_CLOSE.md`, `PROCESS_FOR_THE_APP.md` §6): 69 decisions; 20 `OWNER DECISION REQUIRED`, 18 `RECOMMENDED — OWNER APPROVAL REQUIRED`, 2 `BLOCKED BY MISSING EVIDENCE` (Gate B). Level 1 decisions that gate SPEC 008/009: DEC-034, 044, 045, 047, 048, 049, 051, 066. Other standing ones: DEC-031 (006 approval/freeze dates), DEC-018 (commit execution), DEC-067 (CI). Not touched this session.

Authorization questions the owner must answer before the next implementation step (new, process-level):
1. Authorize **Phase 3 (T008+)** and how far (e.g. tests T008–T012d first, or one task at a time).
2. Authorize **`prisma generate`** (needed before Prisma-typed 007 code compiles).
3. Authorize **applying the migration to `webaudit_test`** if DB-backed adverse tests are to run, and whether the test DB is migrated automatically (R4).
4. Decide whether/when to handle the **partition drift** (R1) — required before any further migration.
5. Commit policy: the owner commits; decide when to commit the 007 slice and in what grouping, given 29 unrelated tracked changes.

---

## 12. Contradictions and Cross-SPEC Dependencies

- 28 recorded contradictions (12 blocking: C-01, 13–17, 19, 21, 22, 25, 27, 28), none in SPEC 007's own contracts (RECORDED: `CONTRADICTION_LEDGER.md`; Packet 0: "Unresolved contract changes: none required").
- **007 → 008:** 007 does not depend on 008. `BUDGET_EXHAUSTED` consumption is stubbed by T019 and enforced downstream (F07). 008 depends on 007 plus Level 1 decisions.
- **007 → 009/010/011/012:** all depend on 007's `isAuthorized`/`isInScope` surface (T016 export). 012 additionally needs DEC-033, 037, 040, 044, 045, 046, 055, 061.
- **Proposed corrections recorded:** F-03 has no decision prerequisite (backlog lists DEC-034/F-02 wrongly) — `phase-2/EXECUTION_SEQUENCE.md`.
- **Discrepancies found by this audit** (documents vs reality; the `PROCESS_FOR_THE_APP.md` items were corrected minimally in the same pass as this report, see §19):
  - §3 (007 entry) says "tracked, unmodified" — `tasks.md` is modified.
  - §10 Git bullet says 24 modified files (+215/−21) and "Docker not running"; actual is 29 files (+376/−29) and Docker running.
  - §10 "What the next session must do first" still says "do not begin T003".
  - §4 "Immediate safe tasks" still lists F-03 slice 1 as pending.
  - `final-planning/phase-2/FIRST_IMPLEMENTATION_GATE.md` says "35 entries untouched" and that T003+ need a database; both are historical (written 2026-10-24) and left unedited as evidence.

---

## 13. Remaining Tasks and Next Eligible Task

**Remaining (SPEC 007):** 34 tasks, T008–T042 (VERIFIED count). Project backlog: 53 tasks, of which F-03 (007) is IN PROGRESS; all others NOT STARTED or BLOCKED (RECORDED).

**Next eligible: Phase 3 / User Story 1 test tasks T008, T009, T010, T011, T011a, T012, T012a, T012b, T012c** (all marked `[P]`: parallel with each other), followed by implementation T012d, T013, T014, T015, T016. Eligibility reasoning from `tasks.md` "Phase Dependencies": US1 "depends only on Foundational"; Foundational (Phase 2) is complete. T013 may start once T008 exists and has been seen failing (TDD); T014 depends on T013.

**Entry conditions the next session must satisfy first (none authorized yet):**
1. Owner authorization for Phase 3 (and for direct implementation, since Codex model `gpt-6-luna` is rejected; do not guess another model).
2. `prisma generate` authorized and run so tests/code compile against the new models (R3).
3. For DB-backed tests (T010–T012c adverse tests live in `apps/api/tests/adverse/authorization.test.ts`): Docker healthy and `webaudit_test` migrated (R4) — decide how, with owner approval.
4. Baseline: run the narrow existing suites first and record the result (control-gate adverse suite must stay green; `enum-drift` test passes).
5. Each test fails for the intended reason before its implementation (test-first per `tasks.md`).

**Next milestone after 007 (not to start):** Stage 2 — DB role design + SPEC 008 (F-02, S-01…S-05), blocked by Level 1 decisions and G-03.

---

## 14. Readiness Gates (RECORDED, `IMPLEMENTATION_READINESS_GATES.md`, last evaluated 2026-10-24 against the same HEAD)

| Gate | Status | Changed by this session? |
|---|---|---|
| A — Source and authority complete | NOT PASSED | no |
| B — Owner decisions resolved | NOT PASSED | no |
| C — Cross-spec contracts consistent | NOT PASSED | no |
| D — Tasks complete enough to execute | NOT PASSED | no (007 list is executable; 009/010 lists absent, G-08) |
| E — Runtime evidence available | NOT PASSED | partial: 007 now has schema + migration, but no tests/runtime evidence |
| F — Safe rollout and recovery defined | NOT PASSED | no |

Planning closure: **not closed**. The SPEC 007 exit gate ("all 007 tasks done with red→green evidence; no 008/009 files touched; diff reviewed; owner decides on commit", Packet 0) is **not met**: 34 tasks remain.

---

## 15. What Must Not Be Repeated

- Do not re-run Codex with `gpt-6-luna`, and do not guess a replacement model; do not stop solely because delegation fails if direct work is authorized — but only for the authorized scope.
- Do not regenerate `gen_final_planning.py` outputs (would overwrite the original final-planning files). Do not re-run SpecKit Analyze or anything that rewrites `.specify/feature.json`.
- Do not re-apply or re-generate the T006 migration. Do not run `prisma migrate dev` (it will emit the partition-drift SQL). Do not use `migrate reset` or `db push`.
- Do not use `pnpm --filter @webaudit/api exec prisma …` expecting the root `.env`; it runs from `apps/api` where no `.env` exists (the placeholder-URL form is for `validate` only).
- Do not re-do slice 1, T003–T007 or the T006 gates "to be safe"; re-verify cheaply (file reads, `migrate status`) instead.
- Do not print `.env` contents or any connection URL.

## 16. What Must Not Be Modified

- Pre-existing dirty/untracked work: `apps/web/**` changes, the 10 `specs/009-…` edits, `specs/009-…/contracts/scan-deadline-contract.md`, `specs/011-…`, `specs/012-…`, `showcase-*`, `apps/web/*.mjs`, `docs/audits/frontend-design/`.
- Canonical SPEC/contract/ADR text (only task-state checkboxes in `tasks.md` may change, and only when verified).
- `.specify/feature.json`; `.env*`; Docker volumes and containers (no delete/prune/recreate); other databases on the server (`webaudit_test` only with explicit approval; `zz_review_fk` and `postgres` never).
- The applied migration folder (immutable once applied; any change needs a new migration).
- `docs/reference/` (generated). Previously written planning files in `final-planning/` and `phase-2/` (evidence; supersede by new dated files).
- Git: no `add -A`, `clean`, `reset --hard`, `stash -u`, `checkout -- .`; nothing staged or committed unless the owner asks.

---

## 17. Exact Startup Procedure for a New Claude Code Session

1. Read `CLAUDE.md`, `AGENTS.md`, `PROCESS_FOR_THE_APP.md` (all), then **this report**. Read `PROJECT_MAP.md` only for the code area touched.
2. `git rev-parse HEAD` (expect `e42577304a2c…`), `git branch --show-current` (`main`), `git status --short` (expect ~43 entries), `git diff --cached --stat` (expect empty). If different, explain the difference before acting.
3. Open `specs/007-foundation-target-authorization-scope/tasks.md`; count ticks (expect 8 ticked / 34 open); read T008–T016, the three `contracts/*.md`, `data-model.md`, `spec.md` FR list.
4. Confirm the migration file exists and `PROCESS_FOR_THE_APP.md` §10 matches; run `pnpm exec prisma migrate status --schema apps/api/prisma/schema.prisma` **only if** the owner has allowed DB reads (it is read-only). Do not print the URL.
5. `docker info` / `docker ps`: if Docker is down, start Docker Desktop and `pnpm services:up` (documented command; no volume/container deletion).
6. Ask the owner for explicit authorization of the next slice (§11) and state the exact scope before editing.
7. Write the brief/plan, implement test-first, run the narrowest checks, report each criterion pass/fail/unverified, update `PROCESS_FOR_THE_APP.md` (§3 007 entry, §5 ledger, §10, §11), stop; the owner commits.

---

## 18. Recommended Next Execution Step

Author the long-running Master Prompt (separate step, owner-reviewed) scoped to **SPEC 007 Phase 3 slice A: tests T008, T009 and the implementation they pin (T013 scope matcher, T014 `isAuthorized`)** — pure-function, DB-free work — before the DB-backed tasks (T010–T012c, T015). Reasons: the first slice needs no database and no Prisma client regeneration if types are kept to plain interfaces, which keeps risk R1/R3/R4 off the critical path; DB-backed work can follow once `prisma generate` and the `webaudit_test` migration are authorized. This is a recommendation, not an authorization.

---

## 19. Evidence Gaps and Unverified Claims

- **UNVERIFIED:** current contents of the live `webaudit` database (no query run in this audit); whether `webaudit_test` has the T006 migration; Docker auto-start on boot; whether the pre-apply dump restores cleanly (only its size and TOC listing were checked); whether `apps/api` typecheck/lint still pass after the migration (last recorded pass was before it; no code changed since).
- **RECORDED, not re-run in this audit:** the apply command result, post-apply catalog checks, `prisma validate` after apply, the slice-1 and T003–T007 check outputs (drift test 52/52, typecheck exit 0, eslint/prettier exit 0).
- **No log files exist** for these commands; the only durable record of their outputs is `PROCESS_FOR_THE_APP.md` §10 plus this report. The conversation transcript is in `C:\Users\Yousef\.claude\projects\c--Users-Yousef-Desktop-Projects-motakamel\94bc68a5-8e8c-4d67-a38a-c50be7792e69.jsonl`.
- **`.specify/feature.json` (VERIFIED)** targets SPEC 011, while the active task is SPEC 007. Not a bug to fix silently: SpecKit commands read it for the "current feature"; `/speckit-implement` was invoked in this session with the 007 directory passed explicitly and without running the prerequisites script. The file is git-ignored (`.specify/.gitignore` line 6), so it never appears in `git status` and a commit cannot protect it. Decide with the owner whether to retarget it; do not rewrite it as a side effect.
- `PROCESS_FOR_THE_APP.md` §3 007 entry says "tracked, unmodified" (stale; `tasks.md` is modified). Corrected in the same pass as this report where safe.
- **Path labels:** `apps/api/tests/adverse/authorization.test.ts`, `check.ts` and `create.ts` under `services/authorization/` are *planned* by `tasks.md` and do not exist yet. Other bare names in this report (`enum-drift.test.ts`, `tests/helpers/db.ts`, `tailwind.config.ts`, `authorization/index.ts`) are shorthand for existing files at the full paths given elsewhere in the report; a path check on this file found no other missing path.
- Original Prisma `migrate dev --create-only` was not exercised; the migration's byte-equivalence to what that command would produce (minus the three operations) is believed but UNVERIFIED.

---

## 20. Handoff Checklist

- [x] HEAD, branch, status, staged state captured (§2)
- [x] SPEC 007 task counts verified from `tasks.md` (8/34/42)
- [x] T006 file and tick verified; apply evidence labelled RECORDED
- [x] Drift risk recorded with evidence and non-fix (R1)
- [x] Open decisions and new authorization questions listed (§11)
- [x] Gates A–F status recorded (§14)
- [x] Must-not lists (§15, §16)
- [x] Startup procedure (§17)
- [ ] Owner review of this report
- [ ] Owner decisions in §11
- [ ] Next Master Prompt authored (next step, not done)

---

## Inputs Required for the Next Long-Running Master Prompt

**Exact phase and active SPEC.** SPEC 007, Phases 1–2 complete, Phase 3 (US1, T008–T016) not started; project Stage 1 of 6. Uncommitted work: 43 status entries on `main` at `e42577304a2c…`.

**Next eligible task and entry conditions.** Phase 3 test tasks T008–T012c (parallel) then T012d, T013–T016. Entry conditions: owner authorization of Phase 3 scope and of direct implementation; `prisma generate` authorized and run; for DB-backed adverse tests, Docker healthy and `webaudit_test` migrated with owner approval; baseline of existing suites recorded; each test seen failing for the intended reason first. Dependencies inside Phase 3: T013 after T008 exists; T014 after T013; T015 after its tests; T016 exports after T012d–T015. US2 (T017+) depends on US1's `check.ts`/`create.ts`.

**Authoritative files to read first.** `CLAUDE.md`, `AGENTS.md`, `PROCESS_FOR_THE_APP.md`, this report; `specs/007-foundation-target-authorization-scope/{tasks.md, spec.md, data-model.md, plan.md, research.md, quickstart.md, contracts/{scope-matching,authorization-check,grant-lifecycle}-contract.md, checklists/authorization-safety.md}`; `.specify/memory/constitution.md` (Principle X); `apps/api/src/services/control-gate/` (parallel structure, FR-004 reconfirm); `docs/audits/fahes-master-audit/final-planning/phase-2/{SPEC_IMPLEMENTATION_PACKETS.md (Packet 0), SPEC_EXECUTION_PROTOCOL.md, EXECUTION_SEQUENCE.md}`.

**Task-by-task rules.** One task or one tightly bounded slice per authorization; test-first; narrowest relevant checks (`vitest run --project unit …`, `pnpm --filter @webaudit/api run typecheck`, eslint/prettier on touched files, enum-drift test); never claim an unrun check passed; distinguish environment blockers from implementation failures; report each acceptance criterion pass/fail/unverified; after verification tick only the task's own checkbox and update `PROCESS_FOR_THE_APP.md` (§3 007 entry, §5 ledger, §10, §11) with commands and results; stop at the slice boundary; the owner commits.

**Owner decisions needed before implementation proceeds.** §11 items 1–3 (Phase 3 authorization; `prisma generate`; test-database migration). Item 4 (drift handling) is needed before **any** further migration. Item 5 (commit grouping) before the first commit.

**Risks needing special handling.** R1 (partition drift) on every migration; R3 (client not generated); R4 (test DB state); R6 (schema ≠ enforcement — never report SC-001…SC-006 met until tests prove them); FR-019/FR-020 (lookups by `id` must filter by `userId`; `ScopeDefinition` has no `userId`); the stubbed `BUDGET_EXHAUSTED` input (T019) must remain a stub, with no 008 code.

**Constraints.**
- *Git:* no staging, no commits, no destructive commands; preserve all dirty/untracked files; capture `git status` before editing and re-compare hashes of unrelated diffs after.
- *Migrations:* none without explicit approval; always preview with `prisma migrate diff` and trim unrelated partition operations; never `migrate dev` non-interactively, `migrate reset` or `db push`.
- *Docker/DB:* local Docker only (postgres 5442, redis 6389, pgbouncer 6452); verify database identity (`current_database()`, port, container) before any DB write; never print credentials; no container/volume deletion; test DB `webaudit_test` only with approval.
- *Delegation:* `CLAUDE.md` requires Codex delegation; the configured model is rejected; direct implementation only under explicit scoped owner authorization.

**Stop and ask (do not guess) when:** a canonical contract conflicts with another source or with the task text; a task needs a decision not in the register; a migration or DB command would touch anything other than the authorized database; Prisma proposes SQL beyond the task's scope; a check fails for a reason that isn't the intended red; the working tree differs from §2 in a way the session can't explain; or the requested work crosses into T-numbers or SPECs not authorized.
