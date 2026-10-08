# Safety Admission Contract

Per FR-001/FR-002/FR-003/FR-005 and the race F01's own FR-024 names and assigns to this spec. This is the
one function every future execution engine calls immediately before any safety-sensitive action — never a
private, engine-specific reimplementation, and never a bare call to F01's `isAuthorized` followed by a
separate, non-atomic consumption step.

## Signature (shape, not a finalized TypeScript interface — implementation belongs to whichever spec first
builds it, per this spec's own charter of defining contracts, not code)

```text
requestAdmission(
  targetId: string,
  userId: string,
  executionClass: ExecutionClass,       // F01 enum
  destination: WebDestination | RepositoryDestination,  // F01 shape, already normalized by the caller
  executionId: string,                  // the execution unit on whose behalf this call is made
  idempotencyKey: string,                // caller-supplied; see FR-008
  consumes: { request: boolean; concurrency: boolean },  // which budget dimension(s) this action needs
  now: DateTime,
) -> AdmissionResult

AdmissionResult =
  | { outcome: "GRANTED", grantId: string, leaseId?: string, holderToken?: string }  // leaseId/holderToken present iff consumes.concurrency (FR-006a)
  | { outcome: "REFUSED", reason: F01AuthzRefusalReason_NonBudget }  // F01's own REVOKED/EXPIRED/OUT_OF_SCOPE/
                                                                      // ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED
                                                                      // reasons pass straight through; its
                                                                      // BUDGET_EXHAUSTED is NOT in this set — see step 2
  | { outcome: "REFUSED", reason: "BUDGET_EXHAUSTED_REQUEST" }
  | { outcome: "REFUSED", reason: "BUDGET_EXHAUSTED_CONCURRENCY" }
  | { outcome: "REFUSED", reason: "KILL_SWITCH_PENDING", scope: SafetyScope, scopeId: string }
  | { outcome: "REFUSED", reason: "INTERNAL_ERROR" }             // fail-closed, FR-005
```

## Required internal sequence (every implementation MUST perform these steps, in this order, inside one
Postgres transaction)

1. Check `KillSwitchState` for every scope key applicable to `executionId` (execution/scan/grant/target/
   tenant/platform, per `data-model.md`'s "Fast-read checkpoint query"). Any `REQUESTED` or `ACKNOWLEDGED`
   row refuses immediately with `KILL_SWITCH_PENDING` — **before** even calling F01's `isAuthorized`, since
   a pending stop is a more urgent refusal reason than any authorization/budget state.
2. Call F01's `isAuthorized(targetId, userId, executionClass, destination, now)` fresh — never a cached or
   previously-obtained result (F01 FR-024). **Per spec.md FR-005a, with the ordering correction found during
   this spec's own independent adversarial review**: F01's own `isAuthorized` reads this spec's
   `BudgetCounter` (a plain, non-locked, advisory read) to compute its own `BUDGET_EXHAUSTED` verdict — that
   read may be stale **in either direction** (it may say "exhausted" when a concurrent release just freed a
   unit, not only "fine" when it is actually exhausted). Because of this, **this contract treats F01's own
   `BUDGET_EXHAUSTED` result as equivalent to `AUTHORIZED` for the purpose of proceeding to step 3** —
   it is *never* refused at this step on that basis alone. Only F01's other four refusal reasons
   (`REVOKED`/`EXPIRED`/`OUT_OF_SCOPE`/`ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`/`NO_MATCHING_GRANT`) are
   passed straight through as an immediate `REFUSED`, unchanged — none of those five depend on this spec's
   own counter, so none of them carry the staleness problem `BUDGET_EXHAUSTED` does. Step 3's lock-guarded
   check, not this advisory read, is what actually decides a budget-related outcome; treating F01's
   advisory "exhausted" as a hard gate here would let a momentarily-stale read produce a spurious refusal
   for a request that step 3's authoritative check would have correctly granted.
3. If step 2 returned `AUTHORIZED` or F01's own `BUDGET_EXHAUSTED` (per the correction above): lock the
   grant's `BudgetCounter` row (`SELECT ... FOR UPDATE`).
   Check `consumedRequests + (consumes.request ? 1 : 0) <= requestBudget` and
   `activeConcurrency + (consumes.concurrency ? 1 : 0) <= concurrencyBudget` (both from F01's grant row,
   read-only here — this contract never modifies F01's own `TargetAuthorization` fields). Either check
   failing refuses with the corresponding `BUDGET_EXHAUSTED_*` reason.
4. Only if steps 1-3 all pass: insert the `BudgetConsumption` row (if `consumes.request`) and/or the
   `AdmissionLease` row (if `consumes.concurrency`, generating a fresh `holderToken` per FR-006a),
   increment `BudgetCounter`'s corresponding counter(s), and commit. Return `GRANTED` with the grant id
   and (if applicable) the new lease id and its holder token — the caller MUST present that exact token on
   every subsequent renewal (`kill-switch-contract.md`'s sibling lease-renewal operation).
5. Any error at any step (a database failure, `isAuthorized` itself throwing) aborts the transaction and
   returns `REFUSED`/`INTERNAL_ERROR` — never a partially-applied reservation, never a default grant.

## Non-negotiable boundary rules

1. This function MUST be the only code path that writes `BudgetConsumption`/increments `BudgetCounter`/
   creates an `AdmissionLease` — no engine may reserve or consume budget through any other path, per
   Constitution Principle VIII.
2. This function MUST NOT modify any F01 entity (`TargetAuthorization`, `ScopeDefinition`,
   `TargetEnvironment`) — it reads `TargetAuthorization`'s budget ceilings and calls `isAuthorized`, nothing
   else.
3. A duplicate call with the same `(targetAuthorizationId, idempotencyKey)` pair — a BullMQ redelivery, a
   caller's own retry — MUST return the same `AdmissionResult` as the original call, without consuming a
   second unit of budget (FR-008). This is enforced structurally by the `@@unique` constraint on the
   consumption/lease tables, not by the caller remembering not to retry.
4. This function MUST fail closed (FR-005): any internal error surfaces as `REFUSED`/`INTERNAL_ERROR`,
   never as `GRANTED`.
5. A `GRANTED` result for one destination/action never grants a different one — exactly as F01's
   `isAuthorized` already establishes for its own `AUTHORIZED` result (FR-024 of F01); each safety-sensitive
   action calls this contract fresh.
6. This function is synchronous with respect to its own transaction (the caller does not proceed past it
   until a definitive `GRANTED`/`REFUSED` result is returned) — there is no "optimistically proceed, reconcile
   later" mode anywhere in this contract.
