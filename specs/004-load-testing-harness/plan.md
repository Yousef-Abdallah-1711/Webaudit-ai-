# Implementation Plan: Load-Testing Harness and Concurrency Verification

**Branch**: `004-load-testing-harness` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-load-testing-harness/spec.md`

## Summary

No load-testing harness exists anywhere in this repository, and the original full-workflow review's
staged-concurrency plan (1→60 audits) was never run — the last open item that review left. This builds
a real k6-based harness (k6 run via Docker — no local binary, confirmed working in this environment)
driving the actual golden-path workflow (target → quote → scan → poll to completion) against a locally
running `apps/api`+`apps/worker`, at increasing concurrency, and records real measurements. No product
code changes; every number in the final report traces to an actual run, and any stage that can't
safely be run is marked UNVERIFIED with a reason rather than estimated.

## Technical Context

**Language/Version**: k6 JavaScript (k6's own ES2015-ish runtime, not Node) for the load scripts;
existing TypeScript/tsx for a small Prisma-based seed script, matching `scripts/seed.ts`'s own
convention.

**Primary Dependencies**: `grafana/k6` Docker image (already pulled, confirmed working — no new local
binary or package). No new dependency on the product itself.

**Storage**: The existing local Postgres (5442)/Redis (6389) this repo's `docker-compose.yml` already
defines — no new datastore. k6's own JSON summary output, written to `load-testing/results/`, is the
new artifact this feature introduces.

**Testing**: N/A in the traditional sense — this *is* the testing artifact. Its own correctness is
validated by running stage 1 first and confirming the golden path genuinely completes before trusting
any higher-stage number (spec.md's own Independent Test for User Story 1).

**Target Platform**: This dev machine, Windows, via Docker Desktop. `k6` inside its container reaches
the host-run `apps/api` via `host.docker.internal` (Windows/Mac Docker Desktop resolves this
automatically; `--network host` — the Linux-only alternative — does not apply here).

**Performance Goals**: The subject of measurement, not a constraint on the harness itself: this
repo's own stated targets (~5 min typical full audit, ~60 concurrent audits, ~99% report delivery) are
what gets checked against real numbers, not assumed.

**Constraints**: No product code changes (spec.md FR-005). `AI_MODE=fixtures` only — already set in
the existing `.env`, confirmed before writing this plan. A seeded, already-verified test user is
required because real registration requires email confirmation, which has no real inbox in a load
test — bypassing that via direct DB seeding (mirroring `scripts/seed.ts`'s own Prisma-based approach)
is the only way to reach the real scan workflow without a product change. A target's default
`controlLevel: NONE` is sufficient for every real vendored capability to actually run — confirmed by
reading every `packages/capabilities-vendored/*/capability.manifest.json`, all of which declare
`"requiredControlLevel": "NONE"` — so no control-gate verification dance is needed to get genuine
capability execution timing.

**Scale/Scope**: A new top-level `load-testing/` directory (scripts, a seed script, a runbook, a
results directory, a report) — zero changes to `apps/`, `packages/`, or `infrastructure/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Applies? | Assessment |
|---|---|---|
| I–VII (skills/vendoring/deterministic/AI-failure/sandbox/cost/verify-narrowly) | No | This is external testing tooling exercising the product's existing HTTP surface, not a change to the product's own architecture or guarantees. |
| "Never charge for our failures" / cost metering | Indirectly relevant | The harness must not cause real spend — `AI_MODE=fixtures` guarantees the executor's own two-vendor fixture chain is used, never a real provider. Re-confirmed as a runtime check in Phase 1, not just an assumed env setting. |
| Constitution's "third-party fetched at runtime" prohibition | N/A to this work | That principle governs *product* capability code (vendored, not fetched at runtime); a load-testing tool run via Docker during development is tooling, not a shipped capability — same category as this repo's own existing dev-only Docker Compose services. |
| CLAUDE.md "Do not weaken a guarantee to make a feature ship" | Yes, by extension | If a stage reveals a real product limit (e.g. a connection-pool ceiling), the correct response is to report it, not to raise the limit inside this work to force a passing number — spec.md FR-005 already states this; re-affirmed here as the plan's own discipline. |

**Result: PASS.** No violation requires justification — this is testing infrastructure operating
entirely from outside the product's own boundary, using only its existing, already-safe test mode
(`AI_MODE=fixtures`).

## Project Structure

### Documentation (this feature)

```text
specs/004-load-testing-harness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── golden-path-workflow.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
load-testing/
├── RUNBOOK.md                      # NEW — operator procedure, including the contention check
├── REPORT.md                       # NEW — written after real runs; no numbers before that
├── seed-test-user.ts               # NEW — Prisma-based, mirrors scripts/seed.ts's own style
├── scripts/
│   ├── golden-path.js              # NEW — the k6 scenario + custom metrics
│   └── lib/
│       └── api-client.js           # NEW — shared register/login/quote/scan/poll helpers
└── results/                        # NEW — one subfolder per stage actually run, raw k6 JSON + notes
```

**Structure Decision**: A new top-level directory, sibling to `apps/`/`packages/`/`infrastructure/`,
matching how `infrastructure/` already holds non-application-code operational material
(`docker-compose.yml`, `deploy.md`). Nothing under `apps/` or `packages/` changes.

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 0 (research.md) and Phase 1 (data-model.md, contracts/, quickstart.md).*

- **Re-check against "no product code changes"**: still holds — every design decision (seeded user,
  per-VU distinct target, one k6 script with per-stage invocations) works entirely against the
  product's existing, unmodified HTTP surface. Nothing in `apps/`/`packages/` is touched.
- **Re-check against "never charge for our failures"/no real spend**: still holds — `AI_MODE=fixtures`
  is a pre-existing `.env` setting this plan depends on but does not set; the runbook will state it as
  a checked prerequisite, not something the harness itself configures (so it can't silently drift to a
  live-spend mode).
- **Re-check against "report a real limit, don't patch around it"**: the design explicitly plans for
  this (research.md Decision 2's note that a concurrency-entitlement ceiling below a stage's size is a
  finding, not something to work around) — reinforced, not weakened, by design.

**Result: PASS, unchanged.**

## Complexity Tracking

*No entries — Constitution Check passed with no violations requiring justification, both before and
after design.*
