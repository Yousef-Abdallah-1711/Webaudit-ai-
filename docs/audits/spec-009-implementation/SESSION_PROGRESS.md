# SPEC 009 — session progress

Last updated 2026-10-29. Repo HEAD at session start `a1034fa` = `origin/main`.

## Milestone 1 — gates and baseline (done)
- DEC-047 / DEC-051 / DEC-066 verified **not approved** (register + search). Not marked approved anywhere. `DECISION_PACKET.md` is the owner's one-line answer sheet.
- `REQUIREMENT_DELTA_MATRIX.md`, `DEFINITION_OF_DONE.md`, `IMPLEMENTATION_BACKLOG.md` written.

## Milestone 2 — decision-free planning code (done, verified)
- `apps/api/src/services/planning/{graph,plan-deadline,index}.ts`, export `@webaudit/api/planning` in `apps/api/package.json`.
- 62 unit tests (`apps/api/tests/unit/planning/`): contract worked examples (2 390 000 / 2 330 000 / 10 760 000), ceiling and grant boundaries, brute-force critical-path property, Lemma property, 20 000-deep chain, DAG/cycle properties. 4/4 mutants killed, sources restored.
- Prettier, ESLint, `tsc --noEmit` (apps/api): clean.
- Full unit suite: run the project way (`--no-file-parallelism`); result recorded below. (A first run with parallel files timed out DB hooks on the shared test DB; the same file passes alone and serially — environmental contention, not caused by the new pure modules, which touch no DB.)

## Not done / blocked (reason)
Schema (CORE-01), resolver, runtime, finalization, claim/CAS, fencing, evidence/artifacts, T-U1-1,3–10: blocked on DEC-047/051/066 (+ DEC-056/057/058/064 not approved for 009). No speculative migration was written.
D-1 (browser pool): not closable by SPEC 009 alone (needs SPEC 010 BROWSER engine). Dev role isolation: dev stack still runs as superuser `webaudit`; no least-privilege claim is made.
Chrome QA / failure injection / load: not started — no runtime surface exists yet to exercise.

## Next exact task
1. Owner answers `DECISION_PACKET.md` (DEC-047, DEC-051; then v6 text for DEC-066).
2. Meanwhile independent: P9-A05 `ScanConfiguration` zod schema, P9-C01 failure classifier, P9-X02 concurrency harness, P9-X03 non-superuser provisioning script.
3. After approvals: P9-A10 migrations (fresh/upgrade/rollback verified as in 008), then resolver → runtime → U-1 wiring.

## Continuation handoff
Working tree also contains the owner's unrelated changes (`pnpm-lock.yaml` hunks, `apps/web/audit-sweep.mjs`, `auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-*`) — never stage them. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Normal push only.

## Commits
(filled in below after delivery)
