# Kill-Switch Contract

Per FR-010/FR-011/FR-012/FR-013/FR-014/FR-015/FR-016. Defines how a stop is triggered, how it propagates,
and how escalation and no-resurrection are guaranteed.

## `triggerStop`

```text
triggerStop(
  scope: SafetyScope,              // EXECUTION | SCAN | GRANT | TARGET | TENANT | PLATFORM
  scopeId: string,                 // executionId | scanId | targetAuthorizationId | targetId | userId | "platform"
  triggeredBy: string,             // userId, operator's userId, or "SYSTEM"
  reason: KillSwitchReason,        // data-model.md enum
) -> KillSwitchState | ForbiddenError
```

Preconditions:
1. If `triggeredBy` is not an operator and not `SYSTEM`: `scope` MUST be `EXECUTION` or `SCAN`, and the
   caller MUST own the Target/Scan/grant the scope resolves to (the same `(id, userId)` tenant-scoped
   lookup F01's own grant-lifecycle contract already uses) — an ordinary user MAY cancel their own work,
   never another tenant's, and MAY NOT trigger `TARGET`/`TENANT`/`PLATFORM` scope directly (those require
   operator or `SYSTEM` authority, FR-011).
2. If `triggeredBy` is an operator: any scope is permitted, platform-wide included (**Clarifications
   2026-10-07**: multi-scope operator authority — execution, grant, target, tenant, or platform-wide —
   confirmed as this spec's working design precisely so an operator can respond to a live incident at its
   actual blast radius).
3. `SYSTEM` triggers (FR-016's environment-reclassification reaction, FR-012's automatic revocation
   reaction) are always scoped to `GRANT` or `EXECUTION` — the automatic safety policy this spec itself
   runs never escalates its own scope beyond the specific grant/execution the triggering condition
   concerns.

On success:
- `upsert`s the `KillSwitchState` row for `(scope, scopeId)` — if one already exists in `REQUESTED`/
  `ACKNOWLEDGED` state, this call is an idempotent no-op returning the existing row unchanged (no duplicate
  "stop requested" record for the same key, per the Edge Cases' "stop requested twice" case); if none
  exists, or the existing one is already `STOPPED` (a new incident against previously-stopped-and-since-
  resumed work, which this spec's own FR-015 does not actually allow for the *same* execution identity but
  which a *new* execution under the same grant could legitimately need), creates/replaces it with
  `state: REQUESTED`, `requestedAt: now`.
- Writes an `ExecutionAuditEvent` with `eventType: STOP_REQUESTED`, `actorId: triggeredBy`.
- Publishes on every Redis channel matching `(scope, scopeId)` per `research.md` R4's channel-naming
  scheme — best-effort; the Postgres write above is already durable and authoritative regardless of
  whether any subscriber receives the publish.

## `acknowledgeStop` / `recordStopped` (called by the execution unit's own checkpoint, FR-013)

```text
acknowledgeStop(executionId: string, scope: SafetyScope, scopeId: string) -> void
recordStopped(executionId: string, scope: SafetyScope, scopeId: string) -> void
```

Called by the checkpoint contract (`safety-checkpoint-contract.md`) when an execution unit observes a
pending stop and ceases further safety-sensitive action (`acknowledgeStop`), and again once it has fully
exited — no further work, budget released, workspace/session cleanup complete (`recordStopped`). Each call
is idempotent (repeating it after the state is already `ACKNOWLEDGED`/`STOPPED` is a no-op) and each
transition writes its own `ExecutionAuditEvent` (`STOP_ACKNOWLEDGED`/`STOPPED`).

## Escalation (FR-014)

If no `acknowledgeStop` call is observed within 5 seconds of `requestedAt` (FR-013's bound), the execution
unit's own hosting process (the worker, or the sandbox host for a sandboxed capability) MUST itself trigger
escalation: for a sandboxed capability, the existing unconditional `SIGKILL`-on-every-outcome-path
mechanism (`apps/sandbox-runner`, per `research.md` R7); for in-process work, abort the composed
`AbortSignal` (`research.md` R6) and treat any further result from that work as untrusted and unpersisted.
Escalation writes its own `ExecutionAuditEvent` (`eventType: ESCALATED`) distinct from the original
`STOP_REQUESTED` event, and sets `KillSwitchState.escalatedAt`. **This contract does not guarantee a true
hung worker process is itself force-terminated** — that is an explicit, named dependency on F04's future
process-topology design (`research.md` R7); this contract guarantees only that Fahes's own safety state
(budget, trust in the result) stops acting on the work, not that the underlying OS process necessarily
exits immediately in every case.

## No-resurrection guarantee (FR-015)

Every call into the Safety Admission contract (and every checkpoint call, per `safety-checkpoint-contract.
md`) for a given `executionId` MUST check `KillSwitchState` for `(EXECUTION, executionId)` first. If that
row's `state` is `STOPPED`, the call refuses unconditionally — a BullMQ redelivery, a stale worker's
delayed resume, or a duplicate dispatch for the same `executionId` can never proceed past this check,
regardless of what budget or authorization state would otherwise allow.

**The specific "new worker owns the same execution while the old worker is still alive" vector is not
closed by this check alone** (that check only helps once the execution has actually reached `STOPPED` —
it does nothing while both workers believe the work is still legitimately running) — it is closed by
`AdmissionLease`'s own `holderToken` fencing instead (`spec.md` FR-006a, `data-model.md`'s `AdmissionLease`
note): a superseded worker's next lease renewal fails, which `safety-checkpoint-contract.md` requires it to
treat as an immediate stop. These are two different mechanisms for two different moments — `KillSwitchState`
for "work that has been told to stop," `holderToken` fencing for "work that has been silently superseded
without ever being told anything" — found as a necessary distinction during this spec's own independent
adversarial review, not originally separated this precisely.

## Non-negotiable boundary rules

1. The Postgres `KillSwitchState` write is always authoritative; the Redis publish is always best-effort.
   A checkpoint that never receives a Redis message still observes the stop at its own next poll
   (FR-013's 5-second bound provides the ceiling on how stale that poll can be).
2. `triggeredBy`'s authority (precondition 1-3 above) is checked on every `triggerStop` call, never cached
   or assumed from a prior call.
3. This contract MUST NOT itself decide whether a stop is *warranted* for `SYSTEM`-triggered cases beyond
   the two named conditions (FR-012's revocation reaction, FR-016's environment-reclassification reaction)
   — it does not grow a general-purpose automatic-safety-policy engine; a future spec that needs a new
   automatic trigger condition names it explicitly as an amendment to this contract's `SYSTEM` precondition.
4. Every state transition (`REQUESTED`/`ACKNOWLEDGED`/`STOPPED`/escalation) writes exactly one
   `ExecutionAuditEvent` — never zero (an unaudited safety transition), never more than one per transition
   (double-counting).
