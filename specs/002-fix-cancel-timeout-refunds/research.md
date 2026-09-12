# Phase 0 Research: Fix Cancellation & Timeout Refund Integrity

This research pass reads the actual code at the exact call sites both fixes touch, rather than
implementing from the plan's prose alone — two real constraints surfaced that change the
implementation shape from what was originally proposed. Both are recorded below as decisions, not
silently absorbed.

## Decision 1 — Cancellation signal transport: Redis pub/sub, not DB polling or a BullMQ primitive

**Decision**: A per-scan Redis pub/sub channel (e.g. `scan:cancel:${scanId}`), published once by
`apps/api`'s existing cancel route immediately after its guarded `updateMany` commits.

**Rationale**: Polling `scan.state` at every checkpoint would add a DB round trip per capability/module
checkpoint to the ordinary (non-cancelled) path — real, avoidable cost on every scan, for a signal that
almost never fires. Redis pub/sub is already the transport this codebase uses for the identical
shape of problem (progress fan-out, `apps/worker/src/orchestrator/emit.ts` → `apps/api`'s realtime
server) — reusing an established, already-audited pattern (Section 6h of the prior review: persist
before publish, publish failure never throws) is lower-risk than introducing a new mechanism.
A BullMQ-native primitive (e.g. relying on job removal) was rejected because the existing admin queue
service (`apps/api/src/services/admin/queue.service.ts`) already documents, in its own words, that
"removing an active job's queue record does not stop whatever process is mid-execution on it" — BullMQ
has no built-in cooperative-cancellation signal for a running job's own code.

**Alternatives considered**:
- *DB polling at each checkpoint*: rejected — adds a query per checkpoint on every scan, for a signal
  that fires on a small minority of scans.
- *BullMQ job removal / a "cancel" job type*: rejected — does not reach code already executing inside a
  handler; would still need a separate in-process signal, making pub/sub necessary regardless.
- *A shared in-memory flag on the DB row polled via the existing progress-emit machinery*: rejected —
  conflates two different concerns (progress fan-out to clients vs. an internal worker-to-worker
  control signal) and would require every consumer of `ScanEvent` to filter out a message never meant
  for them.

## Decision 2 — Subscription lifetime: scoped to one phase-job execution, not the scan's whole lifetime

**Decision**: The cancellation subscription is created at the top of `handlePhase` (the function
`createPhaseHandler` returns, `apps/worker/src/orchestrator/orchestrator.ts:513`) and torn down in a
`finally` block when that same invocation returns — not held in a registry that outlives one BullMQ job.

**Rationale**: A scan's execution spans multiple phase jobs (`RUNNING_PHASE_1` through
`RUNNING_DOCS`), each a **separate BullMQ job** that can be picked up by any worker process in the
pool — there is no guarantee the same worker process (or even the same Node process) handles two
consecutive phases of one scan. A subscription registered "per scan" and expected to live across
multiple jobs would either leak (if never torn down until a terminal state notification arrives, which
this worker process may never see if a later phase runs elsewhere) or require a separate
cross-process cleanup mechanism that doesn't otherwise exist here. Scoping the subscription to exactly
the lifetime of the one phase-job invocation that needs it avoids both problems: it is created,
possibly fires, and is guaranteed torn down (via `finally`) before `handlePhase` returns, regardless of
success, throw, or an already-lost transition race.

**Alternatives considered**:
- *A module-level, worker-process-wide registry keyed by scanId, populated at worker boot and cleared
  on a terminal-transition observer* (closer to the plan's original phrasing, "cleanup... when a scan
  reaches any terminal state"): rejected — `onTerminalTransition` (`state-machine.ts`) fires only in
  the worker process whose `transition()` call actually won the race, which is not necessarily the
  process that registered the subscription for an earlier phase of the same scan. This would leak a
  subscription on any worker process that started but didn't finish handling a scan's phase.

## Decision 3 — Checkpoint granularity: module-level, at the two points `orchestrator.ts` already has

**Decision**: Two checkpoints inside `runAndPersistModule` (`orchestrator.ts:361-458`):
- **Checkpoint A**, immediately before `runModule(...)` is called (line ~403) — if the scan's
  cancellation has already been signalled, skip calling `runModule` for this module entirely (no
  code-layer execution, no AI-layer call, no vendor cost incurred for a module that hadn't started).
- **Checkpoint B**, immediately before the `db.$transaction(...)` wrapping `persistModuleResult`
  (line ~427) — if cancellation was signalled at any point up to here (including *while* `runModule`
  was running), skip the transaction entirely: no `ModuleResult`, `Issue`, `CapabilityExecution`, or
  `AiInvocation` row is written for that module, and skip the `module:complete` emit.

**Rationale**: `orchestrator.ts`'s unit of concurrent work is one module per `runAndPersistModule` call
(the phase's `Promise.all` at line 598-613 maps one call per requested module, not one call per
individual capability inside a module). All of a module's `CapabilityExecution`/`AiInvocation` rows are
written together, once, in the single transaction at line 427 — so a guard immediately before that
transaction is sufficient to satisfy every functional requirement in spec.md (FR-001/FR-002, and
SC-001/SC-002's "no result, execution record, or cost recorded"): skipping the write means none of
those rows ever exist, regardless of what happened inside `runModule`. Reaching *inside* `runModule`
to abort an individual capability call mid-flight (deeper than `module-runner`/`code-layer.ts`) would be
a materially larger, more invasive change than the spec's own explicit scope boundary calls for
("checkpoint-based... not required to interrupt a check already underway mid-execution" — FR-007) and
is not needed to satisfy any requirement in this spec.

**A clarification worth stating plainly, so it isn't misread later**: Checkpoint B does not undo real
spend already incurred inside `runModule` (e.g., an AI provider call that already completed and was
billed by the vendor before cancellation was discovered) — nothing in this spec's scope claims it does
(FR-007 explicitly accepts this). What Checkpoint B guarantees is that the platform's *own ledger* never
records a result or a cost for a check whose containing scan has already told the user that same
check's credits were refunded as undelivered — closing the data-integrity/reconciliation defect
(SC-004) the original review found, not retroactively cancelling a vendor charge.

**Alternatives considered**:
- *Threading an `AbortSignal` into `module-runner`/`code-layer.ts`'s `containCapabilityCall` for true
  per-capability, mid-execution interruption*: rejected for this spec — explicitly out of scope
  (FR-007), and a strictly larger change (touches `packages/capability-sdk` and every capability
  contract) for no additional requirement this spec asks for.

## Decision 4 — Dependency injection shape for the cancellation mechanism (testability)

**Decision**: A new narrow interface, `CancellationSource`, added to `OrchestratorOptions`
(`orchestrator.ts:197-213`) alongside the existing `publisher: EventPublisher` field — e.g.:
```ts
interface CancellationSource {
  subscribe(scanId: string, onCancel: () => void): () => void; // returns an unsubscribe function
}
```
A real Redis-backed implementation (new file, `apps/worker/src/orchestrator/cancellation.ts`) built the
same way `apps/api`'s realtime subscriber client is (`maxRetriesPerRequest: null`, an explicit `.on
('error', ...)` handler — closing the one minor gap the prior realtime audit found on the worker's
existing publisher client, Section 6h) is wired at worker boot. Tests inject a fake/in-memory
`CancellationSource` that fires `onCancel` synchronously on demand, matching the existing pattern
`EventPublisher`/`ScanEmitter` already establish for this codebase's test suite (a capturing fake, not
a real Redis dependency, for unit-level assertions — the new adverse test for this feature, being a
real-infrastructure test per this project's convention, still exercises the real Redis-backed
implementation end-to-end).

**Rationale**: Matches the codebase's existing DI seam for exactly this class of concern
(`EventPublisher`) rather than inventing a second pattern; keeps `orchestrator.ts`'s own dependency on
"a way to be told this scan was cancelled" testable without a live Redis connection for pure unit
tests, while the dedicated regression test (adverse-tier, per FR-009) still proves the real
implementation end-to-end.

## Decision 5 — Timeout refund staleness fix: re-read fresh in a transaction, then refund unchanged — NOT `refund()` nested inside that same transaction

**This decision corrects the literal plan input against what Prisma actually allows**, found by reading
`apps/worker/src/orchestrator/timeout.ts:121-214` and `apps/api/src/services/credits/refund.ts` directly
rather than assuming the originally-proposed shape would compose.

**What the code actually does today** (`timeout.ts`):
1. `sweepTimedOutScans` batch-reads up to 50 candidate scans' `state` + `moduleResults` in one
   `findMany` (lines 127-137).
2. For each, `terminate()` computes `creditsRefunded` from **that same in-memory snapshot**
   (lines 147-168) — this is the staleness bug: nothing re-reads `moduleResults` between the batch read
   and this computation, and processing the rest of a 50-scan batch can take long enough for a module
   completing elsewhere to be missed.
3. `terminate()` then calls the guarded `transition()` (`state-machine.ts:223-262`, a single
   `updateMany` keyed on `id` + expected `state`) — this guard protects against a **state** race (e.g.
   the scan already completed) but a module finishing does **not** change `scan.state`, so this guard
   does nothing to catch the staleness in step 2.
4. Only if the transition wins does it call `options.refund(...)`, using the amount computed (stale) in
   step 2.

**`transition()` is already composable inside a transaction**: it takes `db: ScanStateStore`, a narrow
structural interface (`scan.updateMany`, `scan.findUnique`) that a Prisma transaction client
(`Prisma.TransactionClient`) satisfies just as well as the top-level `PrismaClient` — so wrapping the
fresh re-read and the guarded `transition()` call in one `db.$transaction(async (tx) => {...})` block,
passing `tx` to `transition`, requires no change to `state-machine.ts` at all.

**`refund()`/`refundPartial()` are not composable the same way — this is the real finding.**
`refund()` (`apps/api/src/services/credits/refund.ts:306-325`) is typed to accept a full `PrismaClient`
and internally calls `refundPartial`, which opens **its own** `db.$transaction(...)` to lock the
relevant `CreditLot` rows `FOR UPDATE` before crediting them back. A `Prisma.TransactionClient` (what
`tx` is, inside an already-open transaction) has no `$transaction` method — Prisma does not support
opening a nested interactive transaction on a client that is itself already inside one. Calling
`refund(tx, ...)` from inside a new outer transaction would fail at the type level, and forcing it past
the type system would fail at runtime.

Given the explicit constraint that money-adjacent code gets elevated scrutiny and that this feature
should not weaken an existing guarantee, **refactoring `refund.ts` to accept an optional pre-opened
transaction client** (so it skips opening its own when one is supplied) is the kind of change that
deserves its own dedicated review, not a rider on this fix. It is also unnecessary: the spec's actual
acceptance criteria (a module that completes *during batch processing* must not be refunded as
undelivered — the race window is "up to the time to process the rest of a 50-scan batch") do not
require the refund *transfer* itself to be atomic with the state transition — only that the **refund
amount** be computed from data no staler than the moment of the guarded state write.

**Decision**: Keep `refund()` exactly as it is today (called after `terminate()`'s transaction commits,
same as now), but restructure `terminate()` so that the fresh re-read, the amount computation, and the
guarded `transition()` call all happen **inside one new transaction**, opened per scan, immediately
before that scan is finalized:
```
await db.$transaction(async (tx) => {
  const fresh = await tx.scan.findUniqueOrThrow({ where: { id: scan.id }, select: { moduleResults... } });
  creditsRefunded = refundForUndelivered({ ...computed from fresh, not from the batch snapshot });
  moved = await transition(tx, { scanId: scan.id, from: scan.state, to: 'TIMED_OUT', extra: {...} });
});
if (moved.moved && creditsRefunded > 0) await options.refund({ scanId, credits: creditsRefunded, reason });
```
This narrows the staleness window from "however long it takes to process the rest of a 50-scan batch"
down to "the gap between one transaction's commit and the immediately-following `refund()` call for
that same scan" — a single-scan, single-await gap, not a cross-batch one — which is what the spec's
User Story 2 / Acceptance Scenario 1 and Edge Cases actually describe and what its regression test
(FR-009: inject a `ModuleResult` write between the batch read and this scan's own refund
transaction) exercises.

**Alternatives considered**:
- *Refactor `refund()`/`refundPartial()` to accept an optional external transaction client*: rejected
  for this pass — real, legitimate future work, but a separately-reviewable change to a
  Constitution-Principle-VI-critical file, not required to satisfy this spec's acceptance criteria, and
  against the "smallest production-grade fix" convention this repository states explicitly.
- *Wrap the batch `findMany` itself in a long-lived transaction covering the whole sweep*: rejected —
  would hold a transaction open for the duration of processing up to 50 scans, a much larger blast
  radius (lock contention, transaction timeout risk) for no benefit the spec requires.

## Decision 6 — No new runtime dependency

Both fixes are implementable with what this monorepo already has: `ioredis` (already a dependency, for
BullMQ and the existing realtime publisher) for the cancellation channel, and Prisma's existing
`$transaction` API for the timeout fix. No package is added.
