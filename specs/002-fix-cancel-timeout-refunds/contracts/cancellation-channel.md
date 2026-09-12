# Contract: The per-scan cancellation channel

This is the one new internal interface this feature introduces (everything else reuses existing
contracts unchanged). It is internal to `apps/api` (publisher) and `apps/worker` (subscriber) — not a
public API, not exposed to `apps/web`.

## Channel naming

```
scan:cancel:${scanId}
```

One channel per scan, matching the existing convention `packages/types/src/events.ts`'s `scanRoom()`
already establishes for realtime progress rooms ("derived, never client-supplied — a client that could
name its own room could name someone else's"). Only `apps/api`'s cancel route ever publishes to a given
scan's channel, and only after that route's own guarded `updateMany` has already committed
`state: CANCELLED` — so a subscriber that receives a message is guaranteed the DB write already landed
(publish-after-persist, matching this codebase's existing "progress is persisted before it is
published" invariant for the realtime layer).

## Message schema (Zod, validated on publish and on receipt)

```ts
import { z } from 'zod';

export const cancellationSignalSchema = z.object({
  scanId: z.string().min(1),
  reason: z.literal('user_cancelled'),
  at: z.string().datetime(),
});

export type CancellationSignal = z.infer<typeof cancellationSignalSchema>;
```

A message that fails validation on receipt is logged and discarded — it MUST NOT crash the subscribing
worker process, and MUST NOT be treated as a cancellation (fail closed: an unparseable message does not
cancel a scan; the guarded state-machine write is the only thing that ever actually cancels a scan —
this channel is a *hint to check*, not the authority).

## Publisher contract (`apps/api`)

- **When**: exactly once, immediately after `POST /scans/:id/cancel`'s existing guarded `updateMany`
  reports `count: 1` (i.e., this request's cancellation actually won — a request that finds the scan
  already terminal MUST NOT publish, since nothing changed).
- **What**: `PUBLISH scan:cancel:${scanId} <cancellationSignalSchema JSON>`.
- **Failure handling**: a publish failure (Redis unreachable) MUST NOT fail the cancel request or roll
  back the already-committed state write — the route has already told the caller the cancellation
  succeeded (200), and the worker discovering the cancellation at its next natural checkpoint (a phase
  boundary transition losing its guard, exactly as happens today with no signal at all) remains a
  correct, if slower, fallback. This is a best-effort accelerant, not a required delivery guarantee —
  matching this codebase's existing "a publish failure never fails the underlying work" convention
  (`emit.ts`).

## Subscriber contract (`apps/worker`)

- **When**: `handlePhase` subscribes to `scan:cancel:${data.scanId}` at the start of its own
  invocation, and unsubscribes in a `finally` block before returning (see research.md Decision 2 — the
  subscription's lifetime is exactly one phase-job execution, never longer).
- **On receipt**: sets a local flag (or aborts a scoped `AbortController`) checked at Checkpoint A and
  Checkpoint B inside `runAndPersistModule` (research.md Decision 3). Receiving a signal for a scan
  this process is not currently handling a phase for (e.g. a stale/duplicate message, or a message for
  a scan already finished) is a silent no-op.
- **Guarantee this contract does NOT make**: it does not guarantee a cancellation is discovered before
  any given checkpoint — a message can arrive after Checkpoint A already let a module start, or after
  Checkpoint B already persisted a result moments earlier. This is expected and correct (FR-002: already
  -recorded results are never retroactively touched) — the contract only guarantees that once a signal
  *is* observed by a checkpoint, that checkpoint's guard fires.
