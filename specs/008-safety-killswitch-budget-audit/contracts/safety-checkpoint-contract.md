# Safety Checkpoint Contract

Per FR-018/FR-019. The one reusable call every future execution engine makes at dispatch time and at every
safety-sensitive action within an already-running execution unit — the shared sequencing contract that
composes the Safety Admission contract and the Kill-Switch contract so no engine re-implements this
sequence independently (Constitution Principle VIII).

## Signature

```text
safetyCheckpoint(
  executionId: string,
  targetId: string,
  userId: string,
  executionClass: ExecutionClass,
  destination: WebDestination | RepositoryDestination,
  idempotencyKey: string,
  consumes: { request: boolean; concurrency: boolean },
  abortSignal: AbortController,   // the execution unit's own composed controller, research.md R6
) -> CheckpointResult

CheckpointResult =
  | { outcome: "PROCEED", grantId: string, leaseId?: string }
  | { outcome: "STOP", reason: AdmissionResult["reason"] | "KILL_SWITCH_PENDING" }
```

## Required behavior

1. Call `requestAdmission` (`safety-admission-contract.md`) with the given arguments. Its internal sequence
   already performs the kill-switch pending-check first (that contract's own step 1).
2. If the result is `REFUSED` for any reason: call `abortSignal.abort()` on the caller-supplied controller
   (ensuring every outbound call already composed with this signal, per `research.md` R6, is interrupted),
   return `{ outcome: "STOP", reason }`. The caller MUST treat `STOP` as final for this call — no implicit
   retry of the same destination/action.
3. If the result is `GRANTED`: return `{ outcome: "PROCEED", grantId, leaseId }`. The caller proceeds with
   its safety-sensitive action, and — if it holds a `leaseId` — is responsible for calling this spec's
   release operation (`safety-admission-contract.md`'s companion `releaseLease`, not separately
   respecified here beyond noting it exists and is idempotent per FR-007) once that action completes.
4. **Cadence requirement (FR-013)**: for any single safety-sensitive action whose own execution may exceed
   5 seconds (e.g. a slow page load under `BROWSER`, a long-running authenticated workflow step), the
   calling engine MUST invoke this checkpoint (or a lighter-weight "is a stop pending" sub-check that
   shares the same `KillSwitchState` read, without re-running full admission) at least once every 5 seconds
   of that action's own wall-clock duration — not merely once at the action's start.

## Non-negotiable boundary rules

1. No future execution engine may call F01's `isAuthorized` directly for a safety-sensitive action without
   going through this checkpoint (and therefore through `requestAdmission`) — direct calls bypass budget
   enforcement and kill-switch pending-checks entirely, defeating this spec's entire purpose.
2. This contract does not decide *what counts as* one safety-sensitive action for any given execution
   class (FR-019) — each engine's own child spec declares its unit-consumption policy; this contract only
   defines what must happen once that policy identifies an action as safety-sensitive.
3. A `STOP` result is terminal for that specific call. The calling engine's own retry logic (if any) for a
   transient, non-safety failure (a network blip) MUST NOT reuse a `STOP` result's semantics — a `STOP` is
   never retried with the same `idempotencyKey` expecting a different outcome, because nothing about the
   underlying kill-switch/budget/authorization state changed by retrying.
