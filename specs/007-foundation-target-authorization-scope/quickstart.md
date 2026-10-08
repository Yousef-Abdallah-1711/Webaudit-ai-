# Quickstart: Validating This Spec, and Validating a Future Consumer Against It

This feature produces no running system in this planning pass (no migration is run — see
`spec.md`'s Assumptions and SC-004), so there is no "run the app" quickstart. This file instead
serves two audiences, matching this spec's own User Story 3: a reviewer validating *this* spec's
own package, and a future child spec (F02, F04, F05, F07, or an engine spec) validating itself
against this spec's contracts before proceeding past its own `/speckit-plan`.

## Part A — Validating this spec's own package (self-check, run once, now)

Reuses the parent spec's own eight-step quickstart (`specs/006-scan-architecture-v2/quickstart.md`)
against this spec's `plan.md`/`data-model.md`, per this spec's SC-005:

1. **Execution-class contract check**: this spec's `ExecutionClass` enum (6 values) each need a
   home in the parent's own Execution-Class Matrix — confirmed: all six (`BROWSER`, `CRAWLER`,
   `SOURCE_EXECUTION`, `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, `LOAD_CAPACITY`) already have
   rows there; this spec does not redefine any of their ten contract fields, only the Authorization
   layer those rows already point to. PASS.
2. **Reuse/Extend/New consistency**: this spec reuses `AuditLogEntry` (R3), the `reconfirmControl`
   pattern (R4), and native Postgres arrays (R5) — each justified in `research.md` against the
   parent's own Reuse/Extend/New Matrix philosophy. No existing subsystem classification from the
   parent's matrix is contradicted. PASS.
3. **Authorization-is-not-ownership check**: FR-002/FR-004 — `TargetAuthorization` has no FK to
   `TargetVerification`; the only interaction is a one-time precondition check at grant *creation*,
   never a structural reference. PASS (this is the check a FAIL on would block this spec
   unconditionally, per the parent quickstart's own rule).
4. **Untrusted-code-isolation check**: not applicable — this spec defines no `SOURCE_EXECUTION`
   engine logic, only that `SOURCE_EXECUTION` is one of the `ExecutionClass` values a grant may
   name; the isolation mechanism remains E13's decision, untouched here. PASS (vacuously).
5. **Tenant-isolation check**: `TargetAuthorization` carries `userId` (FR-019); `TargetEnvironment`/
   `ScopeDefinition` inherit tenant scope through their owning `Target`/`TargetAuthorization`
   (FR-020) — zero unscoped new entities. PASS.
6. **Migration/backward-compatibility check**: FR-021 states, explicitly, zero *semantic* changes
   to `Target`/`TargetVerification`/any existing control-gate function signature or any existing
   scan-creation path, limited to exactly two Prisma-required, business-meaning-free structural
   back-relation fields on `Target` — proven necessary (not assumed) by this spec's own closure-
   pass `prisma validate` run; see `data-model.md`'s Prisma feasibility note. PASS.
7. **Metering-scope check**: not applicable — this spec defines budgets' *shape* (FR-011) but no
   pricing; F06 (Credits/Metering) owns whether/how a budget translates to a price, unaffected by
   this spec's narrow-metering-scope inheritance from the parent's FR-020. PASS (vacuously).
8. **Observability-without-leakage check**: this spec's audit entries (FR-018) carry
   `executionClasses`/`scopeId`/budgets/timestamps/actor — no credential, payload, or secret field
   anywhere in `TargetAuthorization`/`ScopeDefinition`/`TargetEnvironment`. PASS.

**Result**: 6 applicable checks pass; 2 are vacuously satisfied (no `SOURCE_EXECUTION` engine or
metering logic exists in this spec to check). Matches SC-005.

## Part B — Validating a future child spec against this spec's contracts

A future spec (F02, F04, F05, F07, or an engine spec for `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/
`LOAD_CAPACITY`/`SOURCE_EXECUTION`) that claims to build on this spec should confirm:

1. It calls `contracts/authorization-check-contract.md`'s `isAuthorized` at **both** mandatory call
   points (plan-resolution time AND dispatch time) — citing only one is incomplete per FR-014.
2. It does not invent a parallel Scope-matching implementation — it calls
   `contracts/scope-matching-contract.md`'s `isInScope` (directly, for per-step checks like crawl-
   frontier expansion, or indirectly via `isAuthorized`) rather than writing its own host/path
   comparison logic.
3. If it needs to create, revoke, or narrow a grant (most engine specs will not — that is a user-
   facing/API-layer concern, likely U30's), it uses `contracts/grant-lifecycle-contract.md`'s three
   operations rather than writing directly to the `TargetAuthorization` table.
4. It does not add a field to `Target` or `TargetVerification` to make its own authorization check
   more convenient — if it believes it must, per this spec's own FR-002/the parent's Constitution
   Principle X, it stops and raises a proposed amendment rather than silently diverging.
5. If its execution class is not one of this spec's six `ExecutionClass` values, it extends the enum
   additively (per `data-model.md`'s own extension note) and justifies why with new evidence, rather
   than reusing an existing value loosely to avoid a schema change.
6. **(Closure-pass addition.)** It does not treat an `AUTHORIZED` result as a resource reservation
   (FR-024) — if it needs atomic check-and-consume budget semantics, it builds on F07's
   budget-enforcement hooks, not on repeated calls to `isAuthorized` alone. F04-layer specs in
   particular confirm they call `isAuthorized` at dispatch time (FR-014) but implement actual
   budget/concurrency accounting through F07, not inside their own dispatch loop independently.

**Expected overall outcome**: a consuming spec that fails check 1, 4, or 6 is blocked
unconditionally, matching this spec's own inheritance of the parent's
"Authorization-is-not-ownership" severity bar — these encode exactly the invariants Foundation
Spec 01 exists to protect.
