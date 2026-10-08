# Quickstart: Validating Foundation Spec 07

This feature produces no running system in this planning pass, so there is no "run the app" quickstart.
This is the validation guide a future implementer or reviewer runs against this spec's own package, and
the guide a future engine spec (E13/E14/E15/E16) runs to confirm it may build against this spec.

## Part A — This spec against the parent architecture's own 8-step child-spec checklist

Per `specs/006-scan-architecture-v2/quickstart.md`, reused here exactly as F01 reused it (that document's
own stated purpose: run it against *any* child spec claiming to build on the master architecture).

1. **Execution-class contract check** — N/A to this spec directly: F07 defines no new `ExecutionClass`
   value and no engine-level contract fields; it defines the shared *safety* contract every execution
   class's engine must call. Pass by inspection: this spec does not silently redefine any of F01's
   `ExecutionClass` enum values or their ten per-class contract fields.
2. **Reuse/Extend/New consistency check** — this spec's own `research.md` classifies every touched
   subsystem (credit-ledger locking pattern → EXTEND; `admission-gate.ts`'s Lua-ZSET pattern → not reused
   as the authority, EXTEND of the *technique*, not the mechanism; `AuditLogEntry` → NOT reused for
   `ExecutionAuditEvent`, a new table, with the distinction justified; `cancellation.ts`'s pub/sub →
   EXTEND; sandbox-runner's SIGKILL → REUSE/generalize). **Expected outcome**: pass — every classification
   traces to a specific file/line cited in `research.md`.
3. **Authorization-is-not-ownership check** — this spec never reads `TargetVerification`/`ControlLevel`
   anywhere; it only ever calls F01's `isAuthorized`, which already enforces this separation. **Expected
   outcome**: pass.
4. **Untrusted-code-isolation check** — N/A: this spec designs no execution engine and no isolation
   mechanism; it generalizes the *reach* of the existing sandbox's SIGKILL pattern (triggered by a
   kill-switch escalation, not a new isolation boundary) without touching the isolation boundary itself.
   **Expected outcome**: pass (not applicable, no isolation claim made).
5. **Tenant-isolation check** — every new entity (`BudgetCounter`, `AdmissionLease`, `BudgetConsumption`,
   `KillSwitchState` for non-platform scopes, `ExecutionAuditEvent`) carries or re-derives a `userId` at
   creation/query time, per `data-model.md`'s validation rules. **Expected outcome**: pass, zero unscoped
   entities (the `PLATFORM` scope's `KillSwitchState` row is deliberately cross-tenant by design, since a
   platform-wide stop is inherently not tenant-scoped — noted explicitly here rather than silently passing).
6. **Migration/backward-compatibility check** — FR-026 states explicitly that this spec applies only to
   execution classes requiring F01's `TargetAuthorization` (none of which are runnable engines yet);
   today's `PASSIVE_HTTP`/`SOURCE_STATIC` cancellation/timeout/credit paths are untouched. **Expected
   outcome**: pass, additive-only.
7. **Metering-scope check** — N/A: this spec enforces budgets, it does not define pricing; F06 (not yet
   planned) owns metering. **Expected outcome**: pass (not applicable).
8. **Observability-without-leakage check** — `ExecutionAuditEvent.payload` is redacted before persistence
   (FR-024); the event-type taxonomy itself (admission/budget/stop events) carries no secret material by
   construction. **Expected outcome**: pass.

## Part B — This spec's own three User Stories, as validation scenarios

### B1: Concurrency oversell race (User Story 1)

1. Create a `TargetAuthorization` grant (F01) with `concurrencyBudget: 1`.
2. Issue two `requestAdmission` calls for that grant/execution class, each with `consumes.concurrency:
   true` and a distinct `executionId`/`idempotencyKey`, dispatched as close to simultaneously as the test
   harness allows (the same concurrency-race test shape `apps/api/tests/adverse/
   credits-debit-refund-race.test.ts` already uses for the structurally identical lot-locking problem).
3. **Expected outcome**: exactly one call returns `GRANTED` with a `leaseId`; the other returns `REFUSED`
   with `BUDGET_EXHAUSTED_CONCURRENCY`. Never both, never neither.
4. Release the granted lease; issue a third call. **Expected outcome**: the third call now succeeds,
   proving release correctly frees the slot.

### B2: Revocation-to-stop propagation (User Story 2)

1. Grant an authorization, obtain a `GRANTED` admission for a simulated execution unit, and have that unit
   begin a loop that calls the checkpoint contract once per second (well within the 5-second bound).
2. Revoke the grant (F01's `revokeAuthorization`).
3. **Expected outcome**: `triggerStop` fires automatically (FR-012), scoped to `GRANT`; the simulated
   execution unit's next checkpoint (within 5 seconds) returns `STOP` with reason tracing back to the
   revocation; `KillSwitchState` reaches `ACKNOWLEDGED` within the same window; no further
   `BudgetConsumption` row is written for that execution after the stop.
4. Redeliver the same (now-stopped) execution's underlying job. **Expected outcome**: refused immediately
   at the `KillSwitchState` check, before any admission/budget logic runs (FR-015).

### B3: Audit reconstruction with redaction (User Story 3)

1. Run a simulated execution through: an admission refusal (budget exhausted), a granted execution whose
   simulated response payload contains a fake session cookie value, and a kill-switch stop.
2. Query `ExecutionAuditEvent` for the relevant `targetAuthorizationId`/`executionId`.
3. **Expected outcome**: three distinguishable events are found (`ADMISSION_REFUSED`, at least one
   budget/execution event, `STOPPED` or `ESCALATED`); the fake cookie value does not appear in any
   `payload` field in raw form; the stop event's reason is distinguishable from a user-cancellation event
   (none occurred in this scenario) and from an operator-emergency-stop event (also none occurred).

## Expected overall outcome

A future implementation that passes Part A's 8 checks and Part B's 3 scenarios (plus the adversarial
scenarios enumerated in `spec.md`'s Edge Cases and cross-referenced in SC-004) is ready for
`/speckit-tasks` within this feature directory, and is the dependency E13/E14/E15/E16 need satisfied
before each of those engine specs may proceed past its own `/speckit-plan`, per Constitution Principle XIV
and `specs/006-scan-architecture-v2/roadmap.md`'s "no engine or domain spec begins `/speckit-implement`...
before F07 is itself implemented" rule for the four highest-risk classes.
