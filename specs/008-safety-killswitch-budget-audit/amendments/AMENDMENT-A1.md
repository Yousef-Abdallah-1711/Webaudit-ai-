# SPEC 008 Amendment A1 (FINAL — owner-delegated technical amendment, 2026-10-28)

> **Status**: applied by implementation. Approved *directions*: DEC-045/048/049/044 Option A (owner, 2026-10-28). The contract *text* below and every deviation recorded in `f02-role-privilege-design.md` §13 are owner-delegated technical decisions, not earlier owner answers. Frozen files were **not rewritten**; each carries an appended "Amended by A1" pointer. Where this amendment and a frozen file differ, this amendment governs (deviations from the draft: F-02 §13).

Dated 2026-10-28. Implements the approved directions DEC-045 (A), DEC-048 (A), DEC-049 (A), DEC-044 (A) as
contract text. The frozen files (`contracts/*.md`, `data-model.md`, `spec.md`) are **not edited**; on sign-off this
amendment is applied by a follow-up commit that adds an "Amended by A1" pointer to each affected frozen file. Until
then the frozen text governs and **no implementation of A1 behaviour may start**. Each change cites the decision.

## 1. `safety-admission-contract.md` (DEC-045 A)

1. `userId` and `now` are **removed from the argument list**. `userId` is derived from `Target.userId` for `targetId`
   (inside the transaction); `now` is the database clock (`clock_timestamp()`); a caller cannot supply either.
   `executionClass`, `destination` remain caller-supplied (validated by `isAuthorized`) until SPEC 009 supplies a
   claimed unit from which they are derived (then wrappers derive them; see F-02 §6).
2. `requestAdmission` takes the caller's transaction handle: `requestAdmission(tx, args)`. It MUST NOT open a nested or
   separate transaction when one is supplied; when none is supplied it opens exactly one. Steps 1–5 all execute on that
   transaction. Failure rolls back the **caller's** transaction scope for the writes it made (savepoint per call), and
   returns `REFUSED/INTERNAL_ERROR`.
3. Step order is amended to: derive identity → advisory scope locks (shared) → kill-switch check under those locks →
   `isAuthorized` (TS) → `BudgetCounter FOR UPDATE` → ceilings → inserts. (Lock order is DEC-050-pending, F-02 §7.)
4. A SQL function `f07_admit` re-verifies ownership, non-revocation, non-expiry and ceilings and is the only writer.
5. Idempotency unchanged (`@@unique`), plus the replayed result is reconstructed from the stored row (same
   `leaseId`/`holderToken` only for the *same* acquisition; a re-acquisition after reclaim gets a fresh token).

## 2. `safety-checkpoint-contract.md` + new `releaseLease` (DEC-045 A)

1. `releaseLease` is now specified (it was "not separately respecified"):
   - `releaseLeaseByToken(tx, leaseId, holderToken)` — holder path, idempotent.
   - `releaseLeasesByExecution(tx, executionId)` — **token-free**, by authority (finalizer/sweep), idempotent,
     counter-correcting (`activeConcurrency` decremented once per lease actually released/reclaimed in this call),
     joinable to the caller's transaction (finalization = one transaction: unit terminal write + release + audit).
   - Both write exactly one `BUDGET_RELEASED` audit event per lease changed; a repeat call changes nothing and writes
     nothing.
2. `safetyCheckpoint` receives the transaction handle where the caller is transactional; the 5-second cadence rule is
   unchanged. A failed renewal remains an immediate stop (FR-006a).

## 3. `data-model.md` (DEC-044/045/048/049)

1. `AdmissionLease` gains nullable `scanId`, `targetId` (additive) so SCAN/TARGET/TENANT/PLATFORM-scope liveness can be
   verified by the reconciler. Zero change to any F01/core model (R9 preserved: still scalar columns, no `@relation`).
2. CHECK `consumedRequests >= 0`, `activeConcurrency >= 0`; partial index on live leases.
3. Table ownership/privileges: tables owned by `fahes_owner`; no runtime role has direct DML (F-02 §3–§4).

## 4. `kill-switch-contract.md` (DEC-048 A, DEC-049 A)

1. **Finalizer acknowledgement**: `acknowledgeStopByAuthority(tx, executionId)` — called inside the terminalization
   transaction; moves **only** the `(EXECUTION, executionId)` row `REQUESTED→ACKNOWLEDGED` (final: broader-scope rows are
   advanced only by the reconciler, F-02 §13 delta 2). Idempotent; audit `STOP_ACKNOWLEDGED` once.
2. **Reconciler** (new maintenance job, 60 s cadence): for rows in `REQUESTED/ACKNOWLEDGED` — advances
   `REQUESTED→ACKNOWLEDGED` when no live in-scope lease exists and `now - requestedAt >= ack_grace` (30 s,
   provisional); advances `ACKNOWLEDGED→STOPPED` only after re-verifying, in the same transaction and under the lock
   order, that no live in-scope lease exists. Never a pure timeout transition. Idempotent, safe under concurrent
   instances (`FOR UPDATE SKIP LOCKED`).
3. **`recordStopped` precondition (DEC-049)**: the caller MUST be the reconciler or the host after full exit, and the
   function itself verifies "no live lease in scope" before writing `STOPPED`; the earlier wording "after budget
   released" is satisfied by that verification rather than by caller assertion.
4. **Fail closed while unresolved**: admission continues to refuse with `KILL_SWITCH_PENDING` for any scope key in
   `REQUESTED/ACKNOWLEDGED`. Broad-scope `STOPPED` rows do not block (unchanged; contradiction C-05 stays recorded).
5. Known evidence limit: until SPEC 009 supplies `ExecutionUnit` status, leases are the only liveness evidence; leaseless
   running units are covered only by their own checkpoint ack. Documented in F-02 §8.

## 5. `execution-audit-contract.md` (DEC-045 A, DEC-068-pending)

1. Audit rows for transactional operations are written in the same transaction (rule 2, unchanged) — now by the
   definer functions for SQL-originated events. A rolled-back operation leaves no audit row.
2. SQL-originated events carry fixed structural payloads only (key allow-list, size cap); TS-originated payloads are
   redacted by `@webaudit/redaction` before the call. No SQL-level redaction claim (F-02 §5).

## 6. Not changed

Escalation exception (audit rule 2a), `holderToken` fencing, no-resurrection guarantee, budget ceilings owned by F01,
tenant isolation by `userId` re-derivation, execution budgets distinct from user credit billing.
