# Quickstart: Validating a Future Child Spec Against This Architecture

This feature produces no running system, so there is no "run the app" quickstart. Instead, this is
the validation guide a future spec author or reviewer runs against **any child spec** claiming to
build on Fahes Scan Platform Architecture v2, before that child spec is allowed to proceed past
its own `/speckit-plan`.

## Prerequisites

- The child spec's own `spec.md`, `plan.md`, and (if it exists yet) `tasks.md`.
- This feature's `plan.md` (Reuse/Extend/New Matrix, Execution-Class Matrix, Safety &
  Authorization Model), `data-model.md`, and `contracts/`.
- `.specify/memory/constitution.md` v1.2.0 or later.

## Validation steps

1. **Execution-class contract check.** Open the child spec's declared execution class(es). Confirm
   each one fills every field of `contracts/execution-class-contract-template.md` — if the class
   matches one of the nine already filled in `plan.md`'s Execution-Class Matrix, confirm the child
   spec did not silently redefine any of that class's ten fields without justification. **Expected
   outcome**: pass/fail per field, zero blanks.

2. **Reuse/Extend/New consistency check.** For every existing subsystem the child spec touches
   (queue, credits, readiness, capability-SDK, sandbox-runner, AI layer), confirm its classification
   matches `plan.md`'s Reuse/Extend/New Matrix, or the child spec explicitly justifies a different
   classification with new repository evidence. **Expected outcome**: no unexplained
   classification drift.

3. **Authorization-is-not-ownership check.** If the child spec's execution class is anything beyond
   `PASSIVE_HTTP`/`SOURCE_STATIC`/`BROWSER`/`CRAWLER`, confirm the child spec requires a
   `TargetAuthorization` grant distinct from `TargetVerification`/Ownership Verification, per
   Constitution Principle X. **Expected outcome**: a FAIL here blocks the child spec unconditionally
   — this is the single most safety-critical check in this list.

4. **Untrusted-code-isolation check.** If the child spec's execution class is `SOURCE_EXECUTION` (or
   involves running any customer-supplied code), confirm it proposes container/VM-grade isolation
   (or equivalent proven containment) and explicitly does NOT reuse `apps/sandbox-runner` as-is, per
   Constitution Principle XI. **Expected outcome**: a FAIL here blocks the child spec
   unconditionally.

5. **Tenant-isolation check.** For every new entity the child spec's own `data-model.md` proposes,
   confirm it is scoped to `userId`/`scanId` (or an equivalent tenant key) at creation, per
   Constitution Principle XIII. **Expected outcome**: zero unscoped new entities.

6. **Migration/backward-compatibility check.** Confirm the child spec's own plan states, explicitly,
   that it introduces no behavior change to any scan that does not select its new capability (per
   this feature's FR-024/FR-025). If the child spec proposes a genuinely incompatible change to a
   shared contract, confirm it designs its own compatibility adapter per FR-026 rather than
   proposing a cutover. **Expected outcome**: additive-only, or an explicit, justified adapter.

7. **Metering-scope check.** If the child spec's execution class is anything other than
   `LOAD_CAPACITY` or `SOURCE_EXECUTION`, confirm it proposes flat per-domain pricing, not variable/
   metered pricing, per the 2026-10-07 Clarifications' narrow-scope decision (FR-020). **Expected
   outcome**: metered pricing proposed only for the two classes explicitly scoped for it.

8. **Observability-without-leakage check.** Confirm the child spec's observability plan (duration,
   queue wait, resource usage, failures, cost, engine health) does not expose customer secrets,
   credentials, or raw payloads, per FR-023. **Expected outcome**: pass/fail against each
   observability field the child spec proposes to emit.

## Dry-run validation note (2026-10-07)

As `tasks.md` T015, these eight steps were run against this master feature's own `plan.md`/
`data-model.md` (a self-referential dry run, since this quickstart is designed for a *child* spec
— applying it to the parent is a sanity check, not its intended use). Result: all eight pass.
Checks 2 is trivially satisfied (there is no separate child classification to compare against —
`plan.md`'s Reuse/Extend/New Matrix *is* the source, not a derivative of it); checks 1, 3, 4, 5, 6,
7, 8 each pass against concrete content (the Execution-Class Matrix's ten columns per row; the
Safety & Authorization Model's strict two-entity separation; the `SOURCE_EXECUTION` row's
container/VM-grade requirement; `data-model.md`'s tenant-scoping on every new entity; FR-024/025/
026; FR-020's narrow metering scope; FR-023's enumerated observability allow-list, respectively).
No fix was required as a result of this dry run — it confirms the checklist itself is usable
against real content, which is what T015 set out to verify.

## Expected overall outcome

A child spec that passes all eight checks is ready for `/speckit-tasks` within its own feature
directory. A child spec that fails checks 3 or 4 is blocked unconditionally regardless of how
complete the rest of its planning is — these two checks encode the two highest-severity safety
principles this master architecture exists to enforce (Constitution Principles X and XI).
