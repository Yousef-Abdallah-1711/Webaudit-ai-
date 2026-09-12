# Phase 1 Data Model: Fix Cancellation & Timeout Refund Integrity

**No Prisma schema migration is required by this feature.** Every entity below already exists in
`apps/api/prisma/schema.prisma`; this feature changes *when* and *under what guard* certain writes to
them happen, not their shape.

## Existing persisted entities this feature reads/writes (unchanged shape)

- **Scan** — read: `id`, `state`, `chargedCredits`, `requestedModules`, `startedAt`. Written (both
  fixes): `state` (via the existing guarded `updateMany`/`transition()` pattern only — no new field).
- **ModuleResult** — read fresh (Fix 2) instead of from a stale in-memory snapshot. Not written by
  either fix directly, but Fix 1's Checkpoint B (Section "Decision 3", research.md) determines whether
  a *new* row is written at all for a module whose scan was cancelled before this checkpoint.
- **Issue**, **CapabilityExecution**, **AiInvocation** — same as ModuleResult: Fix 1's Checkpoint B
  governs whether these are written for a module, as a single atomic batch inside
  `persistModuleResult`'s existing transaction (unchanged internals) — this feature only adds a guard
  in front of that call, never inside it.
- **CreditTransaction** / **CreditAllocation** — read/written only via the existing `refund()` function
  (`apps/api/src/services/credits/refund.ts`), called with no change to its own internals or call
  signature by either fix (see research.md Decision 5 for why `refund()` itself is deliberately left
  untouched).

## New, non-persisted concepts this feature introduces

### CancellationSignal (ephemeral — a Redis pub/sub message, never stored)

| Field | Type | Notes |
|---|---|---|
| `scanId` | string (cuid) | The scan being cancelled. Also encoded in the channel name itself (`scan:cancel:${scanId}`), so the payload is small and the channel is the primary routing key. |
| `reason` | `'user_cancelled'` | Fixed literal for now — the only production caller is the user-facing cancel route. Kept as a field (not omitted) so a future caller (e.g. an admin force-cancel) can reuse the same channel/message shape without a breaking change. |
| `at` | ISO 8601 timestamp | When the API process published the signal — for logging/diagnostics only; never used to make a correctness decision (the guarded DB transition is the only source of truth for "did this cancellation actually take effect"). |

Validated with a Zod schema at the point it's published and at the point it's received (matching this
project's "validate at every boundary" convention) — see `contracts/cancellation-channel.md`.

### CancellationSource (an interface, not a data entity — the DI seam from research.md Decision 4)

```ts
interface CancellationSource {
  /** Registers interest in one scan's cancellation for the life of the caller's own work.
   *  Returns an unsubscribe function; callers MUST call it when they stop caring
   *  (e.g. in a `finally` block when a phase-job handler returns). */
  subscribe(scanId: string, onCancel: () => void): () => void;
}
```

No implementation detail beyond this interface belongs in the data model — the real (Redis-backed) and
fake (in-memory, test-only) implementations are an implementation concern for `tasks.md`.

## State transitions this feature touches (no new states, no new edges)

Both fixes write to `Scan.state` exclusively through paths that already exist in
`apps/worker/src/orchestrator/state-machine.ts`'s `ALLOWED` table:

- Fix 1 (cancellation) does not add a new state or a new edge — `CANCELLED` is already reachable from
  every non-terminal state, written by `apps/api`'s existing cancel route exactly as today. This
  feature only changes what the **worker** does once it discovers that write (skips further
  persistence/cost recording at its two checkpoints), never how or when the `CANCELLED` write itself
  happens.
- Fix 2 (timeout refund) does not add a new state or edge either — `TIMED_OUT` is already reachable
  from every sweepable state via the same `transition()` call used today; this feature only moves the
  *refund amount computation* inside the same transaction as that already-existing guarded write.

## Relationships / cardinality (unchanged)

`Scan 1—N ModuleResult`, `ModuleResult 1—N Issue`, `ModuleResult 1—N CapabilityExecution`,
`CapabilityExecution 1—N AiInvocation`, `Scan 1—N CreditTransaction`, `CreditTransaction 1—N
CreditAllocation` — all exactly as they exist in `schema.prisma` today. This feature's entire
correctness question is about **ordering and atomicity of reads/writes against these existing
relationships**, not their structure.
