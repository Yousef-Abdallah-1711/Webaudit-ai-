# Progress Event Contract

Per `spec.md` FR-027/FR-027a. How an `ExecutionUnit`'s progress reaches both durable storage (a
bounded snapshot) and the UI (ephemeral, high-frequency ticks) without violating the "no DB
transaction per tick" bound.

## `emitProgress` (ephemeral — called by the child process, at whatever cadence its own engine
logic produces a meaningful update)

```text
emitProgress(
  executionUnitId: string,
  tick: { label: string, completedUnits?: number, totalUnits?: number, indeterminate?: boolean },
) -> void  // fire-and-forget; never awaited by the caller's own main work loop
```

Published over the existing Redis-backed WebSocket delivery path
(`apps/worker/src/orchestrator/emit.ts`'s pattern, generalized to a per-`executionUnitId` channel)
— never written to Postgres directly by this function.

## `snapshotProgress` (durable — called by the parent worker, throttled)

```text
snapshotProgress(executionUnitId: string, tick: ProgressTick, now: DateTime) -> void
```

1. If `ExecutionUnit.status` is already terminal: reject and log an anomaly (FR-027a) — never
   apply.
2. If the unit's last `progressSnapshot` write was less than this platform's own fixed throttle
   interval ago, and this tick is not itself a status-transition boundary: drop the write (the
   ephemeral channel already delivered it to any live UI listener; the durable snapshot only needs
   the *latest* state, not every intermediate one).
3. Otherwise: `UPDATE` (never `INSERT` — one row per unit, last-write-wins)
   `progressSnapshot`/`progressIndeterminate` in place.

## Non-negotiable boundary rules

1. `snapshotProgress` never fabricates a percentage when `totalUnits` is genuinely unknown —
   `progressIndeterminate: true` is set instead, and any UI consuming this contract MUST render that
   honestly (an indeterminate indicator, never a guessed bar) — master-prompt §17's explicit
   requirement.
2. Neither function is itself part of the `ExecutionUnit` finalization transaction
   (`runtime-finalization-contract.md`) — progress is informational, never authoritative for
   whether a unit is actually done (only `transitionStatus` to a terminal state is authoritative).
3. The ephemeral channel is never read back as a source of truth by any server-side code — it is a
   one-way delivery mechanism to live UI listeners only, exactly matching the constitution's
   "Redis... never a system of record" rule.
4. No AI judgment may synthesize, summarize, or alter a progress tick's content before delivery
   (FR-046) — a progress tick is a direct, unmediated report of what the engine's own code observed.
