# Runtime Finalization Contract

Per `spec.md` FR-023/FR-024/FR-025/FR-021. The one function that closes out an `ExecutionUnit` —
whatever its outcome — idempotently, classifying its failure (if any) correctly, and releasing any
F07 resources it held. Directly analogous in role to F07's own `safety-admission-contract.md`'s own
release-is-idempotent guarantee, extended here to this spec's own `ExecutionUnit` row.

## `finalizeExecutionUnit`

```text
finalizeExecutionUnit(
  executionUnitId: string,
  idempotencyKey: string,     // must match the unit's own current idempotencyKey (FR-025) — a stale key is rejected
  outcome:
    | { kind: "COMPLETED" }
    | { kind: "FAILED", failureClass: FailureClass, detail?: unknown }    // research.md R9's classification, already computed by the caller
    | { kind: "CANCELLED" }                                               // F07 USER_CANCELLATION
    | { kind: "KILLED", f07Reason: KillSwitchReason }                     // F07's other reasons
    | { kind: "REFUSED", reason: string },                                // never admitted at all
) -> ExecutionUnit
```

## Required behavior

1. If this `(executionUnitId, idempotencyKey)` pair has already been finalized: return the prior
   recorded outcome, unchanged — no re-finalization, no double release of any held F07 lease
   (`research.md` R6, mirroring F07's own FR-007 idempotent-release guarantee).
2. If a held F07 `AdmissionLease` exists for this unit: release it via F07's own release operation
   (`specs/008.../contracts/safety-admission-contract.md`'s companion release function) — this
   function never leaves a lease dangling past its own unit's terminal state.
3. `transitionStatus` (`execution-unit-contract.md`) to the terminal status implied by `outcome`'s
   `kind`, setting `failureClass` only for `FAILED`, and recording the specific F07 reason for
   `KILLED` in the unit's own audit-adjacent fields (not duplicating F07's own
   `ExecutionAuditEvent`, which F07's own mechanisms already write independently — this function
   does not write to F07's audit table itself).
4. Write the final `progressSnapshot` (if the engine reported one) inside this same transaction —
   the last durable progress write for a unit and its terminal-status write are atomic together,
   so a reader never observes a terminal status with stale/missing final progress.
5. If this unit has unresolved dependents (`ExecutionDependency` rows naming it as
   `dependsOnExecutionUnitId`) and `outcome.kind` is not `COMPLETED`: `transitionStatus` each
   direct dependent to `BLOCKED` (FR-010), naming this unit via `blockedByExecutionUnitId` —
   propagating only one level per call (a dependent's own dependents are handled when *that* unit's
   own finalization — to `BLOCKED` — runs the identical step 5, so the propagation reaches every
   downstream unit through repeated application, not a single recursive sweep).

## Non-negotiable boundary rules

1. This function MUST be the only code path that transitions an `ExecutionUnit` to a terminal
   status — no engine, queue handler, or other code writes `status` directly (Constitution
   Principle VIII).
2. A unit already in a terminal status is never re-finalized by a second call with a *different*
   outcome — only an identical-idempotency-key retry is accepted (as a no-op returning the prior
   result); a genuinely new attempt (a new `idempotencyKey`, per FR-024's proven-idempotence gate)
   is a new row-level `attempt` increment, not a mutation of the terminal row.
3. This function MUST fail closed: an internal error partway through steps 1-5 rolls back the
   entire transaction — never a half-finalized unit (e.g. lease released but status not yet
   updated).
4. No AI judgment may decide a finalization outcome, a lease-release decision, or a `BLOCKED`
   propagation (FR-046).
