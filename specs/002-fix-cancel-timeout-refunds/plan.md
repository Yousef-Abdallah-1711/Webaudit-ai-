# Implementation Plan: Fix Cancellation & Timeout Refund Integrity

**Branch**: `002-fix-cancel-timeout-refunds` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-fix-cancel-timeout-refunds/spec.md`

## Summary

Two independently-confirmed P0 financial-correctness defects in the scan lifecycle, both violating
Constitution Principle VI ("a user MUST NOT be charged for our failures" / cost MUST reconcile), get
fixed in this pass:

1. **P0-CANCEL-1**: a cancelled scan's in-flight capability work runs to completion regardless,
   letting the platform incur real AI-provider cost for a module already refunded to the user as
   undelivered. Fixed with **checkpoint-based cooperative cancellation**: the existing cancel route
   publishes a per-scan Redis pub/sub notification immediately after its guarded state write commits;
   the orchestrator holds an `AbortController` per running scan and checks `signal.aborted` at two
   checkpoints — before starting a capability call, and immediately before persisting a finished one —
   never interrupting a call already mid-execution (out of scope per spec).
2. **P0-TIMEOUT-1**: the timeout sweep computes refunds from a batch snapshot that can go stale
   between being read and being acted on, so a module that finishes mid-sweep is still refunded as
   undelivered. Fixed by moving the refund computation for each candidate scan inside its own DB
   transaction that re-reads `moduleResults` fresh immediately before computing the refund and before
   the guarded terminal-state write — the batch `findMany` becomes a coarse candidate filter only, no
   longer the source of truth for the refund amount.

Both fixes reuse the existing "guarded, state-scoped `updateMany`" pattern already established by
P0-CREDIT-1's fix and the pre-existing cancel route — no new state-transition mechanism is invented.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 22 (existing monorepo toolchain; `--permission` flag
availability on Node 22 is unrelated to this feature but is the reason Node 22 is pinned repo-wide).

**Primary Dependencies**: Express (`apps/api`), BullMQ + ioredis (`apps/worker`), Prisma/PostgreSQL,
`@webaudit/types`, `@webaudit/config`. **No new runtime dependency is introduced** — the cancellation
signal reuses the Redis connection(s) already provisioned for BullMQ/realtime pub/sub; Node's native
`AbortController`/`AbortSignal` (available since Node 16) needs nothing added.

**Storage**: PostgreSQL via Prisma (existing `Scan`, `ModuleResult`, `Issue`, `CapabilityExecution`,
`AiInvocation`, `CreditTransaction`, `CreditAllocation` models — no schema migration required by this
feature; no new columns or tables).

**Testing**: Vitest, `--project adverse` and `--project unit`, against real local Postgres/Redis
(docker-compose) with `AI_MODE=fixtures` — matching this repo's existing convention of not mocking
away the DB/queue boundary for adverse/integration-shaped tests.

**Target Platform**: Existing `apps/api` (Express) and `apps/worker` (BullMQ consumer) server
processes; Linux in production, this dev machine (Windows) for verification.

**Project Type**: Existing web-service monorepo (five deployable units under `apps/`, shared code
under `packages/`) — this feature touches two of the five (`apps/api`, `apps/worker`) plus zero new
packages.

**Performance Goals**: Not a performance feature. The only relevant non-functional bound: publishing a
per-scan cancel notification and checking an `AbortController` at two checkpoints per capability call
must not add measurable latency to the ordinary (non-cancelled) scan path — a Redis `PUBLISH` and an
in-memory boolean check are both sub-millisecond and already within the existing per-module Redis
round-trip budget the orchestrator incurs today (progress publish already does one per module).

**Constraints**: `apps/api` cannot import `apps/worker`'s state machine (existing architectural rule —
the cancellation signal is a pub/sub message, not a shared import, so this holds unchanged). Controllers
≤150 lines, services ≤200 lines (existing repo convention — the new `cancellation.ts` module is sized to
stay under the service ceiling; if the abort-registry logic threatens to exceed it, it splits into a
registry file and a pub/sub-helper file rather than growing past the limit). No fabricated performance
numbers — load-testing coverage is explicitly out of scope and flagged as a pre-existing gap, not
addressed by this feature.

**Scale/Scope**: Two files' worth of production logic changes (`create-scan.ts`/`readiness/create.ts`
already fixed in a prior pass; this feature's surface is `scans.routes.ts`, `orchestrator.ts`,
`timeout.ts`, plus one new small module `cancellation.ts`), two new regression tests, no UI change, no
new user-facing surface, no schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Skills Are Plugins; The Core Stays Closed | No | This feature touches orchestrator/route plumbing, not skill/capability contracts. No skill is named in core code by this change. |
| II. Vendored Forever, Never Fetched | No | No third-party skill code is touched. |
| III. Deterministic Before Probabilistic | No | No change to code-layer-before-AI-layer ordering; the cancellation checkpoint sits *around* that existing ordering, not inside it. |
| IV. No Single Point of AI Failure | No | No change to provider fallback/chain logic. |
| V. Untrusted Code Runs Isolated | No | No sandbox-boundary change. |
| **VI. Every Operation Carries a Metered, Reconciled Cost** | **Yes — this is the principle both defects violate** | Both fixes exist specifically to make this principle hold under two previously-unhandled races (cancel-vs-in-flight-work, and timeout-sweep-vs-concurrent-completion). Gate: neither fix may introduce a *new* way to violate it (e.g., double-refunding, or refunding work that was in fact delivered) — enforced by FR-008/SC-004 and by reusing `refund()`'s existing single-refund-per-debit guarantee unchanged. |
| VII. Verify Narrowly, Rescan Rarely | No | No change to targeted re-verification or readiness-pass logic. |
| **CLAUDE.md non-negotiable: "Every scan-state transition is guarded on the state the caller expects"** | **Yes** | Both fixes must keep every state-changing write as a guarded, state-scoped `updateMany`/transaction — never a bare `update`. Explicit design constraint carried into both approaches below; re-checked in Phase 1's data-model/contracts pass. |
| **CLAUDE.md non-negotiable: "Never charge for our failures"** | **Yes** | Same as Principle VI above — this is the guarantee under repair. |

**Result: PASS.** No violation requires a Complexity Tracking justification — both fixes narrow an
existing gap using patterns (guarded `updateMany`, single-refund-per-debit) this codebase already
established elsewhere; neither invents a new cross-cutting mechanism beyond a per-scan pub/sub
notification channel (justified in research.md as the smallest addition that avoids a DB-polling
alternative's added query load).

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-cancel-timeout-refunds/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cancellation-channel.md
└── tasks.md             # Phase 2 output (/speckit-tasks command — not created here)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   └── routes/
│       └── scans.routes.ts          # MODIFIED: publish cancel notification after guarded updateMany
└── tests/
    └── adverse/
        └── (existing cancel/refund tests remain; no new apps/api-side test — the cancel-mid-flight
           regression test lives in apps/worker, where the orchestrator/checkpoint logic runs)

apps/worker/
├── src/
│   └── orchestrator/
│       ├── orchestrator.ts          # MODIFIED: subscribe to per-scan cancel channel, checkpoint guards
│       ├── cancellation.ts          # NEW: AbortController registry keyed by scanId, pub/sub subscribe/publish helpers
│       └── timeout.ts               # MODIFIED: refund computation moved inside a per-scan transaction with a fresh re-read
└── tests/
    ├── adverse/
    │   └── cancel-mid-flight-no-charge.test.ts   # NEW: P0-CANCEL-1 regression test
    └── integration/
        └── timeout-sweep.test.ts    # MODIFIED (or a new adjacent file): P0-TIMEOUT-1 regression test
```

**Structure Decision**: Existing two-app structure (`apps/api`, `apps/worker`) is unchanged — this is a
targeted fix within the established orchestrator/routes layout, not a new deployable unit or package.
The one new file (`apps/worker/src/orchestrator/cancellation.ts`) lives alongside `state-machine.ts`,
`timeout.ts`, and `emit.ts` — the existing home for orchestrator-wide cross-cutting concerns — rather
than under a new top-level directory.

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 0 (research.md) and Phase 1 (data-model.md, contracts/, quickstart.md).*

Phase 0 surfaced one real deviation from the literal plan input worth re-checking against the gate
above: research.md's Decision 5 found that `refund()`/`refundPartial()`
(`apps/api/src/services/credits/refund.ts`) cannot be nested inside the same Prisma transaction as
`timeout.ts`'s guarded state write (Prisma does not support nested interactive transactions), so the
fix instead re-reads `moduleResults` fresh and computes the refund amount *inside* a new transaction
alongside the guarded `transition()` call, then calls the existing, unmodified `refund()` immediately
after that transaction commits — narrowing the staleness window from "the rest of a 50-scan batch" to
"one scan's own transaction boundary" without touching the money-critical `refund.ts` file at all.

- **Re-check against Principle VI / "never charge for our failures"**: still holds, and holds more
  precisely — the refund amount is now computed from data no staler than the moment of the guarded
  state write, for both defects. No new way to double-refund or under-refund was introduced (`refund()`
  itself, including its own single-refund-per-debit guarantee, is unchanged).
- **Re-check against "every scan-state transition is guarded on the state the caller expects"**: still
  holds — both fixes exclusively use the existing guarded `updateMany`/`transition()` shape; no bare
  `update` is introduced by either fix (data-model.md's "State transitions" section confirms no new
  state or edge is added either).
- **Re-check against "apps/api cannot import apps/worker"**: still holds — the cancellation signal is a
  Redis pub/sub message (contracts/cancellation-channel.md), not a shared import; `apps/api`'s cancel
  route publishes a plain, Zod-validated message and never reaches into `apps/worker`'s module graph.

**Result: PASS, unchanged.** The one deviation from the literal plan input (Decision 5) is a
*smaller*, lower-risk implementation than originally proposed, not a scope or guarantee change — it
avoids modifying a Constitution-Principle-VI-critical file that elevated scrutiny would otherwise
require its own dedicated review pass.

## Complexity Tracking

*No entries — Constitution Check passed with no violations requiring justification, both before and
after design.*
