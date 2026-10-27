# First Implementation Gate

Date 2026-10-24 · HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`. Nothing here starts work.

## Answers
**Can any task begin now without waiting for decisions?** Yes, with one non-decision condition: **your explicit authorization (A0-1)**. The smallest code task is **F-03 slice 1 = SPEC 007 tasks T001–T002 plus mirroring the three new enums in `packages/types`**. Documentation/evidence tasks that need no decision and edit no canonical spec — EV-06, EV-08, G-07, G-10 — could start too, and F-01a (baseline evidence) with authorization.

**Smallest prerequisite decision set for slice 1:** empty. Evidence:
1. `specs/007-foundation-target-authorization-scope/spec.md`, `plan.md`, `research.md`, `data-model.md` contain no open owner decision (search for provisional/owner decision/TODO found only prose uses of "unresolved" describing resolved items).
2. `tasks.md` T001 adds enums only; T002 runs `prisma validate` (no database).
3. 007 does not depend on 008: T019 permits stubbing budget consumption and `data-model.md:360` assigns consumption enforcement to F07 ("DOWNSTREAM RUNTIME ENFORCED").
4. No 008/009 symbol is referenced by T001/T002.
5. `apps/api/prisma/schema.prisma` and `packages/types/src/domain.ts` are unmodified in the working tree (`git status`), so the change is isolated.
6. The three enums are fixed by 007's own data model (`ExecutionClass`: BROWSER, CRAWLER, SOURCE_EXECUTION, ACTIVE_SECURITY, AUTHENTICATED_WORKFLOW, LOAD_CAPACITY), so no design is chosen by the implementer.

**Discrepancy that changes the task (new evidence):** `packages/types/tests/unit/enum-drift.test.ts` ("accounts for every enum in the schema") fails when a new Prisma enum is neither mirrored in `packages/types/src/domain.ts` (registered in `MIRRORED`) nor recorded in `NOT_MIRRORED`. T001 as written does not mention this, so the slice must include it. Choice (implementation decision, category F): mirror the three enums as const arrays in `domain.ts` and register them in `MIRRORED`, following AGENTS.md "Share domain types through packages/types" — unless review finds they should stay API-internal, in which case `NOT_MIRRORED` with a reason is acceptable. Baseline status of that test is **UNVERIFIED** (no test was run).

## Slice 1 definition
- Scope: `apps/api/prisma/schema.prisma` (3 enums only, text exactly per 007 `data-model.md`); `packages/types/src/domain.ts` (+ mirror consts); `packages/types/tests/unit/enum-drift.test.ts` (register mirrors); `pnpm --filter @webaudit/api exec prisma validate`.
- Non-goals: any model, migration, service, `Target` back-relation fields (T003/T005), `TargetEnvironment`/`ScopeDefinition`/`TargetAuthorization`, `isAuthorized`, anything in 008/009/012, database roles.
- Acceptance: (1) `prisma validate` passes; (2) enum members exactly per `data-model.md`; (3) `enum-drift` test passes (run first on the unchanged tree to record the baseline); (4) `git diff` touches only the three files above; (5) no migration is generated (DB needed from T006; the Docker daemon is currently not running — `docker ps` failed to connect — so T003+ need a Postgres first).
- Reversibility: revert three files; no database state.
- Risk (UNVERIFIED): the schema is ahead of migrations until T006; no test comparing schema to migrations was found (`apps/api/tests/helpers/db.ts` applies migrations only).

## Must not begin yet
F-02 adoption, S-01…S-05 (need DEC-044/045/048/049, G-03), CORE-* (need DEC-047/051/066 and 008), E-* (need their SPEC gates), B-* (need DEC-032/061), G-01/G-02/G-08 (spec edits and commits need DEC-066/DEC-018), F-01b (needs DEC-067 and F-01a), EV-01/02/03/05/07 (need owner/provider/environment input), and 007 T003–T042 (T003+ need a database; run only after slice 1 is reviewed).

## How to start (after A0-1)
Per `CLAUDE.md` implementation is delegated to `/codex-delegate` (Codex CLI present: `codex-cli 0.154.0`; model `gpt-6-luna`, reasoning `high`). Suggested brief (text only; not executed):
```
/codex-delegate Implement SPEC 007 slice 1 only, test-first, in C:\Users\Yousef\Desktop\Projects\motakamel.
Read first: specs/007-foundation-target-authorization-scope/{tasks.md T001-T002,data-model.md enum blocks}, packages/types/tests/unit/enum-drift.test.ts, AGENTS.md.
Do: (1) run `pnpm exec vitest run --project unit packages/types/tests/unit/enum-drift.test.ts --no-file-parallelism` and record the baseline result; (2) add ExecutionClass, TargetEnvironmentClassification, ScopeTargetKind to apps/api/prisma/schema.prisma exactly per data-model.md (enums only); (3) mirror them in packages/types/src/domain.ts and register in MIRRORED in the drift test (or record in NOT_MIRRORED with a reason); (4) run `pnpm --filter @webaudit/api exec prisma validate` and the drift test.
Do not: add models, migrations, services, or touch 008/009/012 files, apps/web, specs, or any unrelated change. Do not stage or commit. Report each acceptance criterion as pass/fail/unverified with the command output.
```
Claude then re-verifies the diff and re-runs the two commands itself; the owner decides on committing.
