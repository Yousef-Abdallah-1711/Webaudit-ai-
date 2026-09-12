# Quickstart: Running the Load-Testing Harness

## Prerequisites

- Docker running, with `grafana/k6` pulled (`docker pull grafana/k6:latest` if not already present).
- `docker compose -f infrastructure/docker-compose.yml up -d` (Postgres on 5442, Redis on 6389) —
  already running is fine.
- A working `.env` at the repo root with `AI_MODE=fixtures` and real `DATABASE_URL`/`REDIS_URL`/
  `ENCRYPTION_KEY`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`WORKSPACE_BASE_DIR` (this repo already has
  one for local dev).
- `apps/api` and `apps/worker` started for real (`pnpm --filter @webaudit/api start`,
  `pnpm --filter @webaudit/worker start`, or the monorepo's own `dev` scripts) — not the test suite,
  the actual long-running processes, since this exercises the real HTTP/queue surface.
- `npx tsx load-testing/seed-test-user.ts` run once against that same database.

## Scenario 1 — Confirm the harness itself works (stage 1)

```bash
docker run --rm -v "$(pwd)/load-testing/scripts:/scripts" \
  -e BASE_URL=http://host.docker.internal:3001 -e STAGE_VUS=1 \
  grafana/k6 run /scripts/golden-path.js --summary-export=/scripts/../results/stage-1/summary.json
```

**Expected**: one iteration completes, `scan.state` reaches `COMPLETED` (or another terminal state),
and `load-testing/results/stage-1/summary.json` exists with real numbers in it.

## Scenario 2 — Run the staged plan

See `load-testing/RUNBOOK.md` for the full, exact procedure, including the contention check required
before stages 40 and 60 (spec.md FR-009). Each stage is one invocation like Scenario 1's, with
`STAGE_VUS` set to 5, 10, 20, 40, then 60 in turn, each writing its own `results/stage-<n>/summary.json`.

## Scenario 3 — Read the results

`load-testing/REPORT.md` states, per stage actually run, the measurements from `data-model.md`'s
`StageResult`, any stage marked UNVERIFIED with its reason, and one final verdict against this
project's own stated ~5-minute/~60-concurrent/~99%-delivery targets.

## What this quickstart deliberately does not cover

- Running against anything other than this local dev environment — there is no deployed environment to
  point this at, and spec.md never asked for one.
- Guaranteeing all six stages will actually run — spec.md's own success criteria (SC-002/SC-003) accept
  a genuine partial result over a fabricated complete one.
