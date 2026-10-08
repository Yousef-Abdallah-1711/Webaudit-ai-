# Authorization-Check Contract

Per FR-013/FR-014 and Constitution Principle X, this is the one function every future execution
engine (and F02's `ScanPlan` resolver, and F04's dispatch-time re-check) calls to answer "is this
specific execution class, against this specific destination, authorized right now" — never a
private, engine-specific reimplementation of this logic.

## Signature (shape, not a finalized TypeScript interface — that belongs to whichever spec first
implements it, per this spec's own charter of defining contracts, not code)

```text
isAuthorized(
  targetId: string,
  userId: string,
  executionClass: ExecutionClass,
  destination: WebDestination | RepositoryDestination,
  now: DateTime,
) -> AuthzResult
```

- `WebDestination`: `{ host, path, scheme, port }` — already resolved/normalized per FR-008's
  normalization rule by the caller before this function is invoked; this contract does not itself
  fetch, redirect-follow, or DNS-resolve anything (that remains the calling engine's/safe-net's job).
- `RepositoryDestination`: `{ repositoryFullName, ref, path }`.
- `AuthzResult`: the six-variant result shape defined in `data-model.md`'s "FR-013's
  authorization-check contract" section.

## Two mandatory call points (FR-014)

1. **Plan-resolution time** (F02's `ScanPlan` resolver): called once per requested execution class
   to decide whether the plan may even be resolved as `Resolved` rather than `Refused` (per the
   parent spec's own Execution-plan lifecycle diagram). The specific grant id(s) that returned
   `AUTHORIZED` are snapshotted onto the `ScanPlan` by reference (an id), never by copying the
   grant's content.
2. **Dispatch time, immediately before each unit of work** (F04's Execution Runtime calls this;
   F04 does not own the check's logic, only the obligation to call it before dispatch): called
   again, fresh, for the same `(targetId, executionClass, destination)` triple — **not** a read of
   the plan-resolution-time result. A grant revoked between steps 1 and 2 causes step 2 to return
   `REFUSED`/`REVOKED` even though step 1 returned `AUTHORIZED` for the same inputs; this is the
   correct, intended behavior per FR-014, not a race condition to be "fixed" by caching.
   **This contract does not, by itself, stop already-dispatched work that is currently running** —
   it only governs whether the *next* call (the next request, the next workflow step, the next
   dispatch) is authorized. Physically interrupting in-flight work is F07's kill-switch mechanism
   (FR-014's closure-pass addition), a different concern from this contract's decision function.

## Non-negotiable boundary rules (carried over from `contracts/shared-platform-contracts.md`'s
pattern, restated here for engine authors who may read this file without reading that one)

1. This function MUST NOT read `TargetVerification`/`ControlLevel` for any purpose other than the
   one-time FR-004 precondition at *grant creation* (which is a different call path entirely — this
   contract is the *usage-time* check, called only after a grant already exists).
2. This function MUST NOT combine two different grants' Scope, budget, or Environment restriction
   to jointly satisfy one check (FR-013's "never combined across grants" rule) — if grant A covers
   the right Scope but grant B has the right budget, the check still returns refused unless one
   single grant satisfies every condition.
3. A caller MUST treat every `REFUSED` variant as equally final for that call — there is no
   "soft refuse, retry automatically" semantics anywhere in this contract; a retry is only ever a
   fresh call with different inputs (e.g. after the user is prompted to narrow their request to
   something actually in scope), never an automatic re-attempt of the same inputs.
4. This function MUST fail closed on any internal error (a database read failure, a malformed grant
   row) — an error MUST surface as `REFUSED`/`NO_MATCHING_GRANT` or an explicit thrown error the
   caller cannot mistake for `AUTHORIZED`, never as a default-permit.
5. **This function is a decision, not a reservation (FR-024, closure-pass addition).** It MUST be
   implemented as a pure read with no side effect — it MUST NOT itself decrement a request-budget
   counter, acquire a concurrency lease, or otherwise consume any part of the grant it just
   evaluated. A caller that needs atomic "check-and-consume" semantics (to prevent two concurrent
   callers both passing the check against the last remaining unit of budget) obtains that from
   F07's budget-enforcement hooks, which combine the decision and the consumption into one atomic
   operation — this function alone never provides that atomicity, and MUST NOT be mistaken for
   providing it.
6. **An `AUTHORIZED` result for one destination never authorizes a different destination**,
   including a redirect target, a cross-origin resource load, a crawl-frontier expansion, or the
   next step of a multi-step workflow — each requires its own fresh call (FR-010, FR-024).
