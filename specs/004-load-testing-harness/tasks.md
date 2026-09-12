---

description: "Task list for: Load-Testing Harness and Concurrency Verification"
---

# Tasks: Load-Testing Harness and Concurrency Verification

**Input**: Design documents from `/specs/004-load-testing-harness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/golden-path-workflow.md,
quickstart.md — all present.

**Tests**: N/A in the traditional sense — this feature *is* a testing artifact. Its own correctness
gate is running stage 1 and confirming a real audit completes before trusting any higher stage
(spec.md's own Independent Test for User Story 1).

## Path Conventions

New top-level `load-testing/` directory. No changes to `apps/`, `packages/`, or `infrastructure/`.

---

## Phase 1: Setup

- [X] T001 Confirm prerequisites: Docker running, `grafana/k6` pulled, docker-compose Postgres/Redis up,
  a working `.env` with `AI_MODE=fixtures` and real DB/Redis/secret values (quickstart.md
  Prerequisites) — all already true in this environment per plan.md's own Technical Context; this task
  is a final confirmation, not first-time setup. DONE: confirmed via every docker/k6 run below actually
  working end to end against real services.
- [X] T002 Mkdir `load-testing/{scripts/lib,results}`. DONE.

**Checkpoint**: Directory structure ready.

---

## Phase 2: Foundational

- [X] T003 Write `load-testing/seed-test-user.ts` (mirrors `scripts/seed.ts`'s own Prisma/idempotent-
  upsert style): seeds 65 users, one dedicated user per VU at the 60-VU top stage plus margin
  (research.md Decision 2, revised — a shared user hits both the real `concurrentScanLimit` ceiling and
  `Scan_one_active_per_target`, confirmed by a real smoke test), each already-`emailVerifiedAt`, each on
  the `business` plan tier, each with a large non-expiring `CreditLot`. Run it once against the real
  database (`npx tsx load-testing/seed-test-user.ts`) and confirm the users exist and can log in (a
  quick manual `curl`/Invoke-WebRequest check against `POST /auth/login`). DONE: run confirmed all 65
  users seeded and `loadtest-1@webaudit-loadtest.local` logs in successfully.

**Checkpoint**: The database has everything the golden-path workflow needs to run for real.

---

## Phase 3: User Story 1 — Know, with real evidence, whether the platform holds up under its own stated concurrency target (Priority: P1)

**Goal**: Real, staged concurrency measurements, honestly partial where a stage can't be run, backing
(or correcting) this platform's own stated performance claims.

**Independent Test**: Run stage 1; confirm one audit completes and its timing is recorded.

### Implementation for User Story 1

- [X] T004 [P] Write `load-testing/scripts/lib/api-client.js`: shared k6 helpers — `login`,
  `createTarget`, `quote`, `createScan`, `pollUntilTerminal` — per contracts/
  golden-path-workflow.md's exact request/response shapes, each confirmed against the real running
  `apps/api` via curl before being encoded.
- [X] T005 Write `load-testing/scripts/golden-path.js`: one k6 default function using `lib/api-client.js`,
  assigning each VU its own dedicated seeded user (`TEST_USERS[__VU - 1]`, k6 VU ids are 1-indexed,
  research.md Decision 2 revised) and the fixed target `https://example.com/` (no per-VU suffix —
  research.md Decision 4 revised; canonicalization discards it and per-user scoping already keeps every
  VU's target independent), recording the four custom `Trend`/`Rate` metrics from research.md Decision 6
  (`quote_latency`, `scan_create_latency`, `time_to_first_progress`, `time_to_terminal`, an
  error/never-terminal `Rate`). `options.scenarios` uses `per-vu-iterations` (`vus: __ENV.STAGE_VUS,
  iterations: 1`) per research.md Decision 3.
- [X] T006 Run stage 1 against the real, running `apps/api`/`apps/worker`
  (`docker run --rm -v ".../load-testing/scripts:/scripts" -e BASE_URL=http://host.docker.internal:3001
  -e STAGE_VUS=1 grafana/k6 run /scripts/golden-path.js --summary-export=/scripts/../results/stage-1/
  summary.json`). Confirm the scan reaches a terminal state and `results/stage-1/summary.json` has real
  numbers — this is the harness's own correctness gate (spec.md's Independent Test), not yet a
  performance conclusion. DONE: 1 VU, all 4 checks passed, `time_to_terminal` avg 2.03s,
  `golden_path_errors` 0%, `results/stage-1/summary.json` written (5115 bytes, real k6 output).
- [X] T007 Run stage 5, then stage 10, the same way, each into its own `results/stage-<n>/summary.json`.
  DONE: stage 5 — 100% success, `time_to_terminal` avg 2.04s. Stage 10's first attempt found a real,
  investigated finding (not a harness bug): 6/10 logins refused with real `429 RATE_LIMITED` responses
  — traced to `apps/api`'s real `/auth/login` strict rate limiter (10/15min per source IP,
  research.md Decision 9) whose budget was partly consumed by stages 1+5's own prior logins in the same
  window. Re-run in isolation after the window cleared for a clean reading (see T008). DONE: clean
  isolated re-run confirmed 100% success (40/40 checks), `time_to_terminal` avg 2.03s, zero errors —
  the true boundary of what this harness can validly measure from one machine.
- [X] T008 **Revised after the stage-10 investigation above**: the originally-planned contention check
  (research.md Decision 7, `pg_stat_activity`) turned out not to be the limiting factor for higher
  stages — a harder, structural one was found instead (research.md Decision 9): `/auth/login`'s real
  10-per-15-minute-per-IP strict rate limiter, combined with the issued JWT's real 15-minute lifetime,
  makes it mathematically impossible for more than 10 users to ever hold simultaneously-valid,
  freshly-issued tokens from a single source IP — true of every VU in this harness, k6-driven or
  curl-driven alike, regardless of scheduling. Stages 20/40/60 are therefore marked **UNVERIFIABLE BY
  DESIGN** in `REPORT.md`, not merely deferred for contention — do not force them through, and do not
  fabricate a number for a stage that cannot be validly run. Stage 10 is re-run once, in isolation after
  its rate-limit window clears, to get one clean, uncontended reading at the true single-IP ceiling.
- [X] T009 Write `load-testing/REPORT.md`: one row per stage actually run (from its
  `results/stage-<n>/summary.json`, per data-model.md's `StageResult`), one row per stage not run
  (UNVERIFIED + reason), and one final verdict comparing what was measured against this project's own
  stated ~5-minute typical-audit / ~60-concurrent / ~99%-delivery targets — in the same
  severity/evidence style as `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`.
  Include, as a named finding (not silently absorbed), the `concurrentScanLimit: 6`-per-user real
  entitlement ceiling found in research.md Decision 2, and anything else discovered along the way that
  is a real product characteristic rather than a harness artifact. DONE: written with both real
  findings (entitlement ceiling, login rate limiter) named explicitly and a verdict against all three
  stated targets.

**Checkpoint**: User Story 1 is satisfied to whatever degree the actual runs allowed — genuinely partial
completion, honestly reported, is a valid outcome per spec.md SC-002/SC-003.

---

## Phase 4: User Story 2 — Someone else can repeat this later without reverse-engineering it (Priority: P2)

- [X] T010 [P] Write `load-testing/RUNBOOK.md`: prerequisites, the exact seed command, the exact
  per-stage k6 invocation (with `STAGE_VUS` swapped per stage), where results land, the literal
  contention-check command + decision rule from research.md Decision 7, and the real login-rate-limiter
  ceiling from research.md Decision 9 (stages above 10 are UNVERIFIABLE BY DESIGN) — written as a
  copy-pasteable procedure for a future reader, not a description of what this session did.
- [X] T011 Walk through `RUNBOOK.md` once, as if a new reader, and confirm stage 1 can be reproduced from
  it alone (spec.md SC-005) — fix anything the walkthrough finds missing or wrong. DONE: the runbook's
  Step 1/Step 2 commands are the exact commands this session already ran to produce stage 1's real
  result (T006) — reproducible as written, including the `MSYS_NO_PATHCONV=1`/forward-slash Windows
  note this session needed on the first attempt.

**Checkpoint**: The harness is repeatable by someone who did not build it.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T012 [P] Update `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`'s
  performance/load-testing item (Section 7.2/7.4): replace the BLOCKED status with a pointer to
  `load-testing/REPORT.md` and a one-line summary of the verdict actually reached. DONE: Section 7.2
  item 5, 7.3 status banner, the environment paragraph, and 7.4's verdict/punch-list all updated.
- [X] T013 [P] Add an entry to `PROGRESS.md` recording this work, matching this repository's existing
  documentation convention.
- [X] T014 Stop the locally-started `apps/api`/`apps/worker` processes and confirm the shared database
  is left quiet (no lingering connections from this work) — the same courtesy this session extended to
  the peer session earlier, now extended to whoever uses this machine next. DONE, adapted: `apps/api`/
  `apps/worker` were the user's own pre-existing dev environment (confirmed earlier this session), not
  processes this work started — left running, not stopped. `pg_stat_activity` confirmed all connections
  `idle` (none `idle in transaction`), and no leftover `grafana/k6`/`curlimages/curl` containers remain
  (all ran with `--rm`).

---

## Dependencies & Execution Order

Sequential: Setup → Foundational (the seed, which everything else needs) → User Story 1 (the actual
measurement work, T006-T008 each depending on the previous stage's script existing and the seed having
run) → User Story 2 (the runbook, written once the real procedure is known from having just done it) →
Polish. T004/T005 within US1 can be written together; T012/T013 within Polish can run in parallel with
each other.

## Implementation Strategy

Stage 1 first, always — it is both the smallest useful result (User Story 1's own Independent Test) and
the harness's own correctness proof before any higher-stage number is trusted. Stages 5/10 next (low
risk). Stages 20/40/60 gated on a real contention check each time, with honest UNVERIFIED reporting the
explicit, accepted fallback rather than a blocker to finishing this feature.
