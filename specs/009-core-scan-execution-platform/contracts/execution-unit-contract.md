# Execution Unit Contract

Per `spec.md` FR-012/FR-013/FR-014/FR-015. The generic, cross-engine shape every future engine
spec (E10-E17) declares its own work against — the Execution-Class Contract Template's (006's own
`execution-class-contract-template.md`) direct, concrete realization at the unit level.

## Shape (restated from `data-model.md`, field purposes only)

```text
ExecutionUnit = {
  id, scanPlanId, userId,
  targetId, targetAuthorizationId?,         // null iff executionUnitClass needs no F01 grant
  executionUnitClass, engineId,
  configuration,                             // per-caller config, Json — this engine's own shape
  priority, timeoutPolicyMs, retryPolicy,    // FR-023/FR-024
  requiresSafetyCheckpoint,                  // computed, never caller-set — data-model.md validation rule
  idempotencyKey, status, attempt,
  blockedByExecutionUnitId?, skippedReason?, failureClass?,
  evidenceContractRef?, credentialBindingRef?, costMicros,
  progressSnapshot?, progressIndeterminate,
  createdAt, dispatchedAt?, startedAt?, completedAt?,
}
```

## Generation rules (called by `execution-plan-contract.md`'s own step 4 — not a separately
invocable function; stated here because the *shape* this produces is this contract's own charter)

- One `ExecutionUnit` per (domain's required execution class, engine) pair the resolved
  configuration implies — a domain requiring two classes (e.g. the master-prompt's own
  IDOR-testing example, needing both `AUTHENTICATED_WORKFLOW` and `ACTIVE_SECURITY`) generates one
  unit per class, linked by an `ExecutionDependency` edge in the direction the *engine's own
  declared template* specifies (this contract does not itself decide which of the two runs first —
  that is the consuming engine spec's own unit-consumption-policy declaration, per F07's own
  FR-019 deferral, extended here to plan-generation shape).
- A unit whose own precondition (an engine-declared, side-effect-free predicate over
  `ScanConfiguration` — the unit-level generalization of today's existing `canRun`) evaluates
  `false` is never created as `PLANNED` — it is recorded `SKIPPED` directly, with `skippedReason`,
  exactly mirroring Constitution Principle I's existing "false means skipped, never failed" rule,
  generalized from the capability level to the unit level.
- A `CRAWLER`-class (or future frontier-driven class's) unit MAY declare a `discoveryBudget` (part
  of its own `configuration`) bounding how many runtime-discovered child units it may create
  (`spec.md`'s own Clarifications) — each child unit so created is itself a full `ExecutionUnit`
  row, additive to the plan's graph, independently subject to its own fresh F01/F07 checks
  (FR-022a) and its own `idempotencyKey`.

## `transitionStatus`

```text
transitionStatus(
  executionUnitId: string,
  from: ExecutionUnitStatus,  // guarded — a lost race is a no-op, mirroring state-machine.ts's own contract
  to: ExecutionUnitStatus,
  extra?: { blockedByExecutionUnitId?, skippedReason?, failureClass? },
) -> ExecutionUnit | TransitionRejected
```

Only the transitions in `data-model.md`'s state diagram are valid (`execution-runtime-contract.md`
owns the authoritative transition table); an attempted transition outside that table is rejected,
never silently coerced to the nearest valid state.

## Non-negotiable boundary rules

1. No engine may set its own `failureClass` — that is `research.md` R9's classification function's
   exclusive responsibility, computed by the owning worker's finalization code, never accepted as
   an engine's own self-report (Constitution Principle III's existing attribution-assignment
   precedent, generalized).
2. No engine may set `requiresSafetyCheckpoint` directly — it is computed once, at generation time,
   from `executionUnitClass` alone (`data-model.md`'s validation rule), so it can never silently
   drift from F07's own `FR-026` class list.
3. A unit's `configuration` MUST NOT carry a raw credential/session secret (FR-020) — only an
   opaque `credentialBindingRef`.
4. `idempotencyKey` MUST be derived deterministically from `(this unit's own id, attempt)` by the
   owning worker — never freshly minted per dispatch attempt for what is logically the same retry
   (FR-025, mirroring F07's own FR-008 requirement of its callers).
5. A unit's own dependency edges, once the plan is `RESOLVED`, are never edited — only additive
   runtime-discovered child units (with their own fresh edges) may be created afterward, per the
   generation rules above.
