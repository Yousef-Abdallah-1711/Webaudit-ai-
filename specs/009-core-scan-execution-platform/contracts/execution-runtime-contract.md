# Execution Runtime Contract

Per `spec.md` FR-016/FR-017/FR-018/FR-019/FR-021/FR-022/FR-022a/FR-023/FR-024/FR-025/FR-026. How a
`RESOLVED` plan's `ExecutionUnit`s actually get dispatched, isolated, retried, and finalized — the
one sequencing contract every future engine's own dispatch wrapper composes, directly analogous in
role to F07's own `safety-checkpoint-contract.md`.

## Queue placement (FR-017)

Every `ExecutionUnit` whose `executionUnitClass` is `PASSIVE_HTTP`/`SOURCE_STATIC` dispatches onto
the existing, unchanged `webaudit-scan-phase` queue (FR-040). Every other non-`TELEMETRY` class
dispatches onto its own dedicated queue (`plan.md`'s Runtime/Queue Topology: `webaudit-exec-
browser`, `webaudit-exec-crawler`, `webaudit-exec-source-execution`, `webaudit-exec-active-
security`, `webaudit-exec-authenticated-workflow`, `webaudit-exec-load-capacity`). A `TELEMETRY`-
class unit never dispatches onto any queue at all — it is finalized directly at generation time
(there is no execution to run).

## `dispatchExecutionUnit`

```text
dispatchExecutionUnit(executionUnitId: string) -> void  // enqueues; does not block for completion
```

1. Enqueue a job whose payload is **only** `{ executionUnitId }` (FR-018) — never embedded
   configuration, credentials, or content.
2. On pickup, the worker re-reads the full `ExecutionUnit` row from Postgres (never trusts the
   payload as authoritative for anything beyond "which row to re-read").
3. If `requiresSafetyCheckpoint`: call F07's `safetyCheckpoint` (`specs/008-safety-killswitch-
   budget-audit/contracts/safety-checkpoint-contract.md`) with this unit's own
   `targetAuthorizationId`/destination/`idempotencyKey`. `STOP` -> `transitionStatus(..., REFUSED
   or KILLED depending on F07's own reason)`, no process is forked. `PROCEED` -> continue.
4. `transitionStatus(..., DISPATCHED)`, then fork the dedicated child process (FR-019) and
   `transitionStatus(..., RUNNING)`.
5. Arm the parent-side, unconditional `SIGKILL` deadline at `timeoutPolicyMs + fixed margin`,
   independent of the child's own cooperation (FR-019).
6. While `RUNNING`, for any single safety-sensitive action whose own duration may exceed F07's own
   5-second bound, the child calls F07's checkpoint at that cadence (F07's own FR-013, consumed
   unchanged) via an IPC round-trip to the parent (the child itself never holds a direct Postgres
   connection — a deliberate isolation property: a hung or compromised child cannot itself forge a
   checkpoint result, only ask its parent to perform one).
7. On the child's own clean exit (success or a classified failure), or on the parent's `SIGKILL`
   deadline firing first: call `finalizeExecutionUnit` (`runtime-finalization-contract.md`).

## Non-negotiable boundary rules

1. A queue job payload for an `ExecutionUnit` never carries more than its `id` and the minimal
   routing data needed to select a worker pool — never configuration, never a credential, never
   evidence content (FR-018/FR-020).
2. Step 3's checkpoint call is never skipped, cached, or substituted for a direct F01 call — every
   execution class F07's own `FR-026` names goes through this exact sequence, with no private
   equivalent (Constitution Principle VIII, FR-022).
3. Step 5's `SIGKILL` deadline is armed **before** any safety-sensitive action begins and is never
   extended by anything other than this contract's own renewal logic composed with F07's own lease-
   renewal cadence — a hung child cannot itself postpone its own deadline.
4. A unit already in a terminal `status` (`COMPLETED`/`FAILED`/`CANCELLED`/`KILLED`/`REFUSED`/
   `SKIPPED`/`BLOCKED`) is never re-dispatched by this function — a duplicate call for an
   already-terminal unit is a no-op, returning the prior outcome (mirroring F07's own no-
   resurrection guarantee, applied here to this spec's own dispatch layer specifically).
5. No AI judgment may decide steps 3-7's outcomes (FR-046).
