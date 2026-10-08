# Grant Lifecycle Contract

Per FR-001/FR-004/FR-009/FR-011/FR-016/FR-017/FR-018/FR-018a. The service-layer operations a
future `/scan`-UI extension (U30) or an admin console extension calls to create, revoke, or narrow
a `TargetAuthorization`, and to classify a Target's `TargetEnvironment` — analogous in role to the
existing `control-gate` module's `attestControl`/`startVerification`/`checkVerification` functions.

## `classifyEnvironment` (closure-pass addition — FR-001/FR-018a had no corresponding function)

```text
classifyEnvironment(
  targetId: string,
  actingUserId: string,
  classification: TargetEnvironmentClassification,
) -> TargetEnvironment | NotFoundError | ForbiddenError
```

Preconditions:
1. `targetId` resolves to a Target owned by `actingUserId` (same `findFirst({id, userId})` pattern
   as `createAuthorization`'s precondition 1) — classifying a Target's environment is metadata
   about *that user's own Target*, not a safety override, so unlike `revokeAuthorization` this
   operation has **no operator variant**: an operator who believes a Target is misclassified in a
   way that makes an active-class grant unsafe acts through `revokeAuthorization` on the specific
   grant(s) of concern, not by reclassifying someone else's Target out from under them.

On success: `upsert`s the single `TargetEnvironment` row for that Target (create if none exists,
update in place if one does — per `data-model.md`'s "updated in place, no history row" design),
and writes `environment.classified` (if none existed before) or `environment.reclassified` (if one
did) per FR-018a, with `before`/`after` carrying the previous/new `classification` value.

## `createAuthorization`

```text
createAuthorization(
  targetId: string,
  requestingUserId: string,
  executionClasses: ExecutionClass[],
  scope: ScopeDefinitionInput,
  environmentRestriction: TargetEnvironmentClassification[],
  budgets: { requestBudget: number; concurrencyBudget: number; durationBudget: number },
) -> TargetAuthorization | ValidationError | ControlLevelRequiredError
```

Preconditions, checked in this order (fail on the first unmet one, matching `create-scan.ts`'s own
"refuse before any debit" ordering precedent):
1. `targetId` resolves to a Target owned by `requestingUserId` (`findFirst({ where: { id, userId }
   })` — FR-019's IDOR-closing pattern; a Target owned by someone else is indistinguishable from a
   nonexistent one, same as `reconfirmControl`'s own `target === null` handling).
2. The Target's live-reconfirmed control level (via the existing `reconfirmControl`) is `ATTESTED`
   or stronger (FR-004) — reusing the existing function, not reimplementing its logic.
3. `executionClasses` is non-empty, contains no duplicates, and every value is a recognized
   `ExecutionClass`.
4. `environmentRestriction` is non-empty.
4a. `environmentRestriction` MUST NOT include `PRODUCTION` when `executionClasses` includes any of
   `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, or `LOAD_CAPACITY` (FR-015a) — note
   `SOURCE_EXECUTION` is deliberately exempt from this specific check per FR-015a's closure-pass
   correction (its risk model is Fahes's own isolation boundary, not the target's environment).
5. Each budget field is within FR-011's bounds (`requestBudget` 1-1,000,000; `concurrencyBudget`
   1-1,000; `durationBudget` 1-2,592,000 seconds).
6. `scope.targetKind` matches the Target's `inputType` per `data-model.md`'s validation rule.
7. **Every host/repository entry in `scope` is bounded to the Target itself** — each
   `includedHosts`/`excludedHosts` entry (and each wildcard's base domain) equals the Target's own
   `canonicalValue` or is a subdomain of it; a `REPOSITORY`-kind scope's `repositoryFullName` equals
   the Target's `canonicalValue` exactly. **"Subdomain of `B`" is a dot-boundary suffix check
   only** — candidate `H` qualifies iff `H === B` or `H.endsWith("." + B)` — **never** a bare
   `H.endsWith(B)` (which would wrongly accept `attackerexample.com`) or a reversed
   contains-check (which would wrongly accept `example.com.attacker.net`); see `data-model.md`'s
   validation rules for the same precision stated against the schema. **This comparison MUST apply
   the identical normalization** `contracts/scope-matching-contract.md` defines for runtime
   matching (lowercase, trailing-dot strip, punycode-fold) to both the Scope entry and
   `Target.canonicalValue` before comparing — never a raw, case-sensitive, un-folded comparison —
   so a differently-cased or differently-encoded variant cannot evade this check in either
   direction (found during the closure-pass adversarial review as a natural follow-on to the
   dot-boundary fix: the two checks must share one normalization, not each invent their own). This
   is the single most important precondition in this contract (found during this spec's
   independent adversarial review, and sharpened twice during the closure-pass adversarial review)
   — it is what prevents a grant on a legitimately-owned Target from being used to name an
   entirely different, unverified target as its Scope.

On success: creates the `ScopeDefinition` row (if a matching one does not already exist and the
caller did not pass an existing `scopeId` — the exact dedup-or-create policy is an implementation
choice this contract does not mandate either way, since `ScopeDefinition` rows have no uniqueness
requirement FR-009 imposes beyond immutability-once-referenced), creates the `TargetAuthorization`
row with `userId = requestingUserId`, `grantedBy = requestingUserId`, `grantedAt = now`,
`expiresAt = now + durationBudget`, and writes the `authorization.granted` audit entry (FR-018).

## `revokeAuthorization`

```text
revokeAuthorization(
  authorizationId: string,
  actingUserId: string,
  actingUserIsOperator: boolean,
) -> TargetAuthorization | NotFoundError | ForbiddenError
```

Preconditions:
1. The grant exists and (`actingUserIsOperator` is true) OR (the grant's `userId` equals
   `actingUserId`) — FR-016/FR-017's authority rule. A non-owning, non-operator caller gets the same
   `NotFoundError` a nonexistent grant would (no information disclosure about another user's grant
   existing, matching `reconfirmControl`'s "not the caller's target, or not a target at all... not
   distinguished on purpose" precedent).
2. The grant is not already `REVOKED`/`EXPIRED` (idempotent no-op if so, not an error — matching the
   existing platform's general "re-revoking/re-cancelling an already-terminal thing is a no-op, not
   a failure" posture visible elsewhere in this codebase, e.g. scan cancellation).

On success: sets `revokedAt = now`, `revokedBy = actingUserId`, writes `authorization.revoked`
(self) or `authorization.revoked_by_operator` (operator) per `data-model.md`'s audit table.

## `narrowAuthorization` (FR-016's "replacement, never in-place edit" rule)

```text
narrowAuthorization(
  originalAuthorizationId: string,
  actingUserId: string,
  narrowedScope: ScopeDefinitionInput,
  narrowedBudgets?: { requestBudget?: number; concurrencyBudget?: number; durationBudget?: number },
) -> TargetAuthorization | NotFoundError | ForbiddenError | ValidationError
```

This is sugar over `revokeAuthorization(originalAuthorizationId, actingUserId, false)` followed by
`createAuthorization(...)` with the original grant's `executionClasses`/`environmentRestriction`
and the caller's narrowed `scope`/`budgets` — **never** an in-place field update on the original row
(FR-009). `actingUserIsOperator` is always `false` here: an operator may revoke, but FR-017 forbids
an operator creating or widening a grant, and narrowing-via-replacement is structurally a create.
The new grant's `authorization.granted` audit entry and the original's `authorization.replaced`
entry (`after: { replacedByGrantId }`) are written atomically with the revoke, per `data-model.md`'s
audit table.

**Widening is not a documented operation of this contract.** A user who wants broader Scope,
different budgets, or an additional execution class on an existing grant calls
`createAuthorization` again for a wholly new grant — per FR-013's "multiple grants are never merged"
rule, two independently-scoped grants simply coexist; there is no "widen" operation to design,
because nothing in this spec's model needs one.
