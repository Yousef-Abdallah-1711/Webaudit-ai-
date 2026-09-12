# Quickstart: Validating the Cancellation & Timeout Refund Fixes

## Prerequisites

- Local Postgres + Redis running (`pnpm run services:up`, or confirm the existing `webaudit-postgres`/
  `webaudit-redis` docker containers are already up — this repo's convention, not a new requirement).
- `AI_MODE=fixtures` (no live provider spend — this repo's existing test convention).
- Dependencies installed (`pnpm install`), Prisma client generated (`pnpm run db:generate`) — no new
  migration to run; this feature adds no schema change.

## Scenario 1 — P0-CANCEL-1: cancelling mid-flight leaves no phantom result or cost

Run the new regression test directly:

```bash
pnpm vitest run --project adverse apps/worker/tests/adverse/cancel-mid-flight-no-charge.test.ts --no-file-parallelism
```

**Expected**: the test constructs a scan with a capability whose resolution is deliberately delayed,
triggers a cancellation while that capability is in flight, and asserts:
- no `ModuleResult`, `Issue`, `CapabilityExecution`, or `AiInvocation` row exists for that module after
  the delayed capability eventually resolves;
- the scan's `state` is `CANCELLED` and stays `CANCELLED` (the phase never advances past it);
- the credits already refunded for that module by the cancel route are not additionally
  double-refunded or clawed back.

**Manual/exploratory variant** (optional, to see it end-to-end against the real HTTP+queue stack): start
`apps/api` and `apps/worker` locally, create a scan whose selected modules include a slow capability,
call `POST /scans/:id/cancel` while it's running, then inspect the `Scan`/`ModuleResult` rows for that
scan directly via `pnpm run db:studio` — confirm no new `ModuleResult` row appears for the module that
was in flight at cancellation time.

## Scenario 2 — P0-TIMEOUT-1: a module finishing during the sweep is not refunded as undelivered

Run the new/modified regression test directly:

```bash
pnpm vitest run --project unit apps/worker/tests/integration/timeout-sweep.test.ts --no-file-parallelism
```

**Expected**: the test seeds a candidate scan for the sweep, then — using a test hook or timing control
that lands a `ModuleResult` write for that scan *between* the sweep's initial candidate-selection query
and that specific scan's own refund/transition step — asserts the resulting refund amount reflects the
module as delivered (not refunded), and that the scan still correctly transitions to `TIMED_OUT`.

## Scenario 3 — No regression in the existing suites

```bash
pnpm test:adverse
pnpm test
pnpm run lint
pnpm run typecheck
```

**Expected**: identical pass/fail counts to the pre-fix baseline recorded in
`docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md` Section 5 (`pnpm test:adverse`:
810/811 with 1 pre-existing skip, plus 2 new tests from this feature, all green; `pnpm test`: the same
7 pre-existing environmental failures — caused by this machine's own live dev Redis, unrelated to this
feature — unchanged in cause and count). Any *new* failure beyond that baseline is a real regression
from this feature and must be fixed before this work is considered done.

## What this quickstart deliberately does not cover

- **Load/concurrency behavior under either fix** — no k6 or load-testing harness exists in this repo
  (confirmed by repository-wide search during the originating review). This is a pre-existing gap,
  flagged, not fabricated around.
- **The realtime WebSocket replay-on-reconnect gap** — explicitly out of scope for this feature
  (spec.md Edge Cases / Assumptions).
