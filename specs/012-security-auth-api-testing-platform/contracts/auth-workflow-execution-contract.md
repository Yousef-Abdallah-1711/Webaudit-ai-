# Contract: Authenticated Workflow Execution (Engine E15, class `AUTHENTICATED_WORKFLOW`)

Per FR-005, FR-041..FR-052, FR-053..FR-063, FR-069..FR-077, FR-086..FR-097, FR-114..FR-118, FR-119..FR-126, FR-127..FR-135, FR-161, FR-162, FR-163, FR-164, FR-166, FR-171. How E15 hosts one `AUTHENTICATED_WORKFLOW` `ExecutionUnit`: a bounded, stateful, multi-step, multi-identity workflow with explicit expected outcomes, isolated sessions, controlled fixture mutations, recovery after interruption and deterministic teardown. Shares the request pipeline, `SecurityHttpClient`, fenced writer, retry, pacing and cancellation rules of `active-security-execution-contract.md` (referred to below as "the E14 contract") by reference and states only the differences. Does not redefine the credential broker, session host internals or mutation state machine: see the broker contract (`issueCredentialLease`, `confirmLeaseDestroyed`), `auth-session-contract.md` (SessionHost), `test-identity-contract.md` and `mutation-cleanup-contract.md`.

## Status / Ownership

- Owning spec: 012, Context F/G/I execution via E15 (`engineId` family `security.auth.*`); session lifecycle belongs to Context C. Code: `apps/worker/src/security/` (unit host, workflow interpreter), `packages/security-engine/` (SessionHost, LocalBudget, scope gate, fenced writer). Nothing is created by this planning pass.
- Status: planning contract, NOT frozen. Activation gated by SG1, SG3, SG4, SG5, SG6, SG7, SG9, SG10 and flag `FAHES_SECURITY_AUTHENTICATED` (default off) plus tenant allowlist. Authenticated testing is passive-first (P7): E15 ships last.
- Class contract fill: plan.md "Execution Class: AUTHENTICATED_WORKFLOW" is authoritative.

## Consumers

- 009 `resolvePlan` / dispatch worker (queue `webaudit-exec-authenticated-workflow`), `computePlanDeadline`, the security check dispatcher (reads `AUTH_STATE_TRANSITION`, `PERMISSION_COMPARISON`, `HTTP_TRANSACTION`, `CLEANUP_RECORD`), `securityCoverageSummary` (auth states exercised, roles/identities tested, pairs, steps), the reverify resolver, and the E14 unit that depends on E15 baseline units (FR-062).

## Inputs

- Queue payload exactly `{ executionUnitId }`; the worker re-reads the unit through `sec_peek_unit` before the claim and `sec_unit_context` after it (FR-201(j)).
- `ExecutionUnit.configuration` = `{ workflowRef: { id, version }, identityRefs[] (<= 4, TestIdentity ids), expectationRef?, invariantRefs[], fixtureRefs[], localLimits }` and `credentialBindingRef` (the SHA-256 digest of the unit's sorted `credentialBindings` list `[{testIdentityId, credentialReferenceId}]`, ids only, carried in `configuration.x012.credentialBindings` and covered by the unit MAC; the set of identities in the list equals `identityRefs`, MA-03). No URL values, bodies, headers or secrets.
- `WorkflowDefinition` (customer-declared, versioned data): see "Workflow step model". `AuthorizationExpectation` and `BusinessInvariant` records are referenced, never embedded with secrets. `FixtureResource` records supply every object identifier (FR-092).
- Broker lease(s) (per identity) delivered parent-to-child over IPC, memory only.

## Outputs

- `AUTH_STATE_TRANSITION` (state names, cookie names/flags/lifetimes, token type and length class; never values, FR-047), `PERMISSION_COMPARISON`, sanitized `HTTP_TRANSACTION`, `CLEANUP_RECORD` Evidence. No Findings, no verdicts (registry decides).
- Progress snapshot (below) and a final `progressSnapshot` committed atomically with the terminal status.

## Operations

```text
dispatchAuthWorkflowUnit(executionUnitId) -> void                 // 009 handler on webaudit-exec-authenticated-workflow
validateWorkflow(def: WorkflowDefinition, limits) -> OK | WorkflowInvalid
runWorkflowChild(unit, leases, ipc) -> UnitOutcome
executeStep(step: WorkflowStep, ctx: UnitCtx) -> StepResult        // reuses E14 per-request pipeline per request
reportProgress(unitId, snapshot: { stepsTotal, stepsDone, state, waitingOn? }) -> void
onUnitExpired(unit) -> TERMINATED | PENDING
```

### Dispatch (differences from E14 contract "Dispatch and 009 integration")

1. Steps 1-5 of the E14 contract "Dispatch and 009 integration" are identical and are executed first: U-1 step 0 (unclaimed, database-verified `sec_refuse_unclaimed_unit`); `sec_claim_unit_host`; guard as claim owner on flag, PRODUCTION `SEC_PRODUCTION_PROHIBITED`, unclassified `SEC_ENVIRONMENT_UNCLASSIFIED`, `SEC_ENGINE_DISABLED`; input manifest and `PlanStepTable`; dispatch `safetyCheckpoint` with `executionClass: AUTHENTICATED_WORKFLOW`, `consumes{concurrency:true}` (L39); F07 refusal verbatim; `PLANNED->ADMITTED` through `sec_transition_unit`; VAB and DAP; `ADMITTED->DISPATCHED`, fork and `DISPATCHED->RUNNING`. Every refusal before `RUNNING` after the claim is `sec_finalize_unit(REFUSED, reason)` and the unclaimed U-1 step-0 refusal is `sec_refuse_unclaimed_unit` (never `KILLED`, never a bare transition; FR-195, FR-201).
2. **After `RUNNING`** the parent requests one broker lease per identity (`issueCredentialLease(executionUnitId, purpose, attempt, testIdentityId)`; the principal is derived from the authenticated connection, never an argument), sequentially, each re-validated by the broker, which issues only for a `RUNNING` unit (FR-032, FR-201). Any denial -> every step needing that identity is `BLOCKED` with the closed reason (`SEC_CREDENTIAL_*`, `SEC_BROKER_UNAVAILABLE`, `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`, `SEC_IDENTITY_NOT_IN_SCOPE`, `SEC_IDENTITY_ROLE_UNMAPPED` -> `NOT_TESTED`); if no step can run, the unit is finalized `COMPLETED` through `sec_finalize_unit` with every check `BLOCKED` (the unit is already `RUNNING`; 009 has no `RUNNING->REFUSED` edge). A lease `expiresAt` is clamped to `min(timeoutPolicyMs + hardStopMarginMs remaining, 30 min)` and is never re-leased (FR-033, L8, P12).
3. The parent armed `SIGKILL` at `timeoutPolicyMs + hardStopMarginMs` before any request (E14 step 5); it passes the leases to the child over IPC. The child creates one isolated `SessionHost` jar per identity (FR-042).
4. Host loop (parent, <= 5 s): periodic liveness `safetyCheckpoint` with `consumes{request:false, concurrency:false}` (L39; consumes no F07 unit), lease liveness check against the broker for every live lease, deadline/scan-terminal read (database clock), progress publication. A revoked lease, revoked grant, kill switch or expiry triggers teardown immediately (FR-039, FR-043).

### Workflow step model (FR-075, FR-117)

```text
WorkflowDefinition = { id, version, identities: IdentitySlot[] (1..4), steps: WorkflowStep[] (1..25; the cap is 25 everywhere, L13),
                       edges: [stepId -> stepId] (finite acyclic DAG), expectations?, invariants? }
WorkflowStep = { stepId, action: "LOGIN"|"LOGOUT"|"REFRESH"|"READ"|"NEGATIVE_PROBE"|"FIXTURE_MUTATE"|"FIXTURE_CLEANUP"|"RECOVERY_OBSERVE"|"WAIT_MFA_FIXTURE",
                 actionCategory (closed set FR-011), identitySlot, endpointIdentity, requestTemplateRef,
                 fixtureRef?, expectedOutcome: ExpectedOutcome, onUnexpected: "STOP_BRANCH"|"CONTINUE_INDEPENDENT",
                 mutation?: MutationDeclaration (FR-119), maxRequests (<= 8) }
ExpectedOutcome = { statusClasses[], oracle?: OracleRef (fixture marker present/absent, shape), invariantRefs[] }
```

`validateWorkflow` rejects (before any request; a structural problem is `BLOCKED` `SEC_WORKFLOW_INVALID`, L11; fixture-related problems are `BLOCKED` `SEC_FIXTURE_INVALID`): a cycle or unbounded loop construct; > 25 steps (no larger cap exists); > 4 identity slots; a step without `expectedOutcome`; a step whose `actionCategory` is not in the closed set or not matching `action`; a `FIXTURE_MUTATE` step without a `MutationDeclaration` and a matched `FIXTURE_CLEANUP` step or fixture-reset reference (all `SEC_WORKFLOW_INVALID`); a step referencing an object identifier not in the fixture registry; a step on a payment/refund/purchase/inventory/messaging endpoint not mapped to a `SANDBOX_CONFIRMED` fixture endpoint (FR-117); a destination not parameterized from authorized inputs. **Dual-class split (FR-161, L2)**: E15 issues credentialed requests that carry no crafted element (login/logout/refresh, observation reads, same-identity reads and workflow steps) under a single `AUTHENTICATED_WORKFLOW` checkpoint; a cross-identity replay is always a `NEGATIVE_PROBE` (E14 dual-class, FR-008/FR-161). A credentialed *crafted* request (a `NEGATIVE_PROBE` such as a cross-identity or validation-boundary probe) is NOT executed by E15: it is rendered into a linked E14 unit (FR-062) whose requests are dual-class checkpointed (`active-security-execution-contract.md`, per-request pipeline step 5). Steps execute in a topological order fixed at validation; a probe family iterates only a finite registry-declared list. Repeats for duplicate-action/idempotency/quota invariants are bounded (<= 3) and sequential, never concurrent (FR-118).

Every step has an **explicit expected outcome**; an outcome that differs but is benign is `INCONCLUSIVE`, never a finding (FR-089); a differing outcome with an invariant evaluated `false` on recorded redacted observations is the only path to a finding (FR-116). A step with `onUnexpected: STOP_BRANCH` skips its dependants as `NOT_TESTED` `SEC_PRECONDITION_UNMET`.

### Per-step execution (`executeStep`)

1. Resolve the identity slot to its `SessionHost` jar; steps never share jars across identities.
2. For each request the step needs, run the E14 per-request pipeline unchanged: `securityScopeGate` -> `LocalBudget.reserve` -> pacing -> `safetyCheckpoint(consumes{request:true, concurrency:false})` -> (mutation intent for `FIXTURE_MUTATE`) -> `SecurityHttpClient` send with `AbortSignal` -> bounded read -> redact/claim/write via the fenced wrapper. **Every mutating step independently satisfies F01 + F07**: its own scope gate (`FIXTURE_MUTATE` listed, consent present), its own checkpoint, its own budget; no workflow gains permission because it is labeled a test and no earlier `PROCEED` is reused (FR-003, FR-005).
3. Compare observed to expected; record `AUTH_STATE_TRANSITION` for login/logout/refresh/expiry/MFA-challenge-observed states, `PERMISSION_COMPARISON` for expectation matrix pairs (status class AND response-shape oracle, never status alone, FR-093).
4. Update progress; evaluate checkpoints at <= 5 s cadence while a step or wait is in flight.

### Session isolation and no session passing (FR-041, FR-042, FR-062)

- One `SessionHost` per `(executionUnitId, attempt, testIdentityId)`; execution-local, never persisted or serialized. Two identities in a unit use two jars; sessions never mix tenants, roles, environments, browser profiles or scans.
- A composite test (e.g. IDOR needing two identities and a crafted request) becomes one unit per class linked by an `ExecutionDependency` edge that gates **ordering and baseline validity only** (e.g. do not run the cross-identity probe if the identity baseline login unit did not end `COMPLETED` with a successful baseline). **No session, cookie, token or lease is passed between units**; each unit obtains its own lease and jar from the broker. This resolves 006 `decisions.md` l.160 (no composite class). Baseline-unit failure propagates `BLOCKED` to dependents through `finalizeExecutionUnit` step 5; dependents are recorded `BLOCKED` with the upstream reason.
- Session renewal re-logins only with the identity's own credential or refresh token, each counting against the auth-attempt limit, never beyond lease/unit/grant bounds (FR-044). Customer `SESSION_FIXTURE` credentials carry a declared `expiresAt` and are never extended (FR-050).

### Auth check hooks (examples only; the catalogue belongs to the registry, FR-086..FR-090)

E15 provides primitives the registry's `auth.*` checks compose: login with explicit expected outcome (e.g. `auth.login.failure-behavior`), session creation and cookie-flag capture (`auth.session.cookie-flags`), logout then reuse of the pre-logout credential (`auth.session.logout-invalidation`), expired-session handling, session-fixation indicator by in-host hash comparison of pre/post-login identifiers recording only the boolean and cookie name (FR-049), CSRF fixture comparison (same fixture request with/without token or origin against a non-mutating or fixture-confined endpoint, FR-108), recovery-flow structure observation only with a customer recovery fixture (`SEC_SIDE_EFFECT_FIXTURE_MISSING` otherwise; no real mailbox, FR-088), MFA enforcement observations (FR-090), and a single differential pair for authentication-error uniformity on registered identities only. E15 implements no password guessing, credential stuffing, token guessing or brute force (`C5`, FR-087); a check id cited here is an example, not part of this contract.

### MFA (FR-090; v1 modes only)

Supported: identities with MFA disabled/exempt in the test environment and customer-provided pre-established session fixtures with a declared expiry. A challenge encountered is recorded as an observation `AUTH_STATE_TRANSITION(MFA_CHALLENGE_OBSERVED)`; no bypass is attempted; the step is `BLOCKED` `SEC_MFA_CHALLENGE_UNSUPPORTED`. A `WAIT_MFA_FIXTURE` step (waiting for a customer fixture window) is a polling loop with checkpoints every <= 5 s, timeout 120 s, retry limit 1, session continuity only inside the unit; expiry -> `BLOCKED` `SEC_MFA_TIMEOUT`. The wait consumes no request unit but does consume unit time.

### Progress reporting

The child reports `{stepsTotal, stepsDone, stepsBlocked, currentState: LEASE_ISSUED|LOGGING_IN|ACTIVE|RENEWING|WAITING_ON_MFA_FIXTURE|LOGGING_OUT|DESTROYED, waitingOn?: "MFA_FIXTURE"|"RATE_LIMIT_PAUSE"|"INTER_REQUEST_DELAY"}` to the parent over IPC (a 012-internal shape); the parent maps it onto 009's tick `{label, completedUnits?, totalUnits?, indeterminate?}` (`label` = the state name, `completedUnits` = `stepsDone`, `totalUnits` = `stepsTotal`) and the free-form `progressSnapshot` JSON per 009 progress-event-contract. **Verified (L36)**: 009 defines no state or `waitingOn` vocabulary, so `currentState`/`waitingOn` are 012-introduced names carried inside `label`/`progressSnapshot`; they require no 009 enum change. Events carry unit id, check id, outcome class and state **names** only: no URLs with query values, headers, bodies, identity emails or fixture identifiers (plan.md field 17). A waiting state is progress, not a stall: the host loop keeps checkpointing.

### Lockout and side-effect rules (FR-073, FR-074, FR-088)

Auth attempts per identity <= 3 (hard max 5), counted by the local budget before each `LOGIN_ATTEMPT`/login-type `SESSION_REFRESH`; a failed login with the registered credential is `BLOCKED` `SEC_CREDENTIAL_REJECTED` after exactly one attempt and never retried (User Story 3 scenario 1). A lockout signal (423, login `Retry-After`, "account locked" body class) blocks all further authentication for that identity in the scan (`SEC_ACCOUNT_LOCKOUT_RISK`); 429/`Retry-After` pauses the endpoint+identity for the rest of the unit (`SEC_RATE_LIMIT_ENCOUNTERED`). The `sideEffects[]` of each step's check (lockout, email, SMS, state change) are enforced: a step with an undeclared or unfixtured side effect is not run (`SEC_SIDE_EFFECT_FIXTURE_MISSING`, `NOT_TESTED`).

### Recovery after interruption (FR-045, FR-046, FR-120)

1. Write-ahead intents for every `FIXTURE_MUTATE` step (see `mutation-cleanup-contract.md`) are durable before the send; `attempts: 1` means a crashed unit is never re-dispatched.
2. A recovered/swept unit never reuses a prior attempt's session, lease or jar. The broker revokes leases of terminal units; a server-side session that cannot be confirmed destroyed is recorded in `CLEANUP_RECORD` as `SESSION_UNCONFIRMED` with its expected natural expiry (FR-046). For stopped/killed/cancelled/expired units this record, and the residual manifest, are written by the parent-side SECURITY finalizer from durable `MutationIntent` rows, not by the unit (FR-162; the unit's fenced writer refuses post-stop writes).
3. Steps with a durable result are not re-executed; `SENT` mutation intents without result are `SENT_UNCONFIRMED`, flagged `SEC_MUTATION_SENT_UNCONFIRMED`, and the fixture is residual; non-mutating steps with no recorded result are `INCONCLUSIVE` `SEC_RESPONSE_AMBIGUOUS` (no retry: E15 steps are not `idempotent`-declared by default). An `IdempotentClaim` with no `resultRef` older than `timeoutPolicyMs + hardStopMarginMs` is stale and re-claimable only by a conditional `UPDATE`; stale-claim recovery never re-sends a probe or mutation whose durable intent is `SENT` or later (FR-166).

### Timing (FR-061; provisional until measured)

`timeoutPolicyMs = 900000` (setup, per-identity lease acquisition and login, steps, MFA wait, mutation cleanup, logout, persistence, teardown, finalization); `hardStopMarginMs = 60000`; `queueWaitAllowanceMs = 60000`; `maxAttempts = 1`; `unitBudgetMs = 1 x (900000 + 60000 + 60000) = 1020000`; `dispatchThresholdMs = 960000`. A step that cannot complete within the remaining unit time minus a teardown reserve (logout + cleanup of declared mutations) is not started (`SEC_BUDGET_LOCAL_DURATION`); cleanup budget for declared mutations is reserved up front (time and 3 request units per mutation: mutation, cleanup, verification read; L9).

### U-1 obligations (scan-deadline-contract.md)

1. `onUnitExpired(unit) -> TERMINATED | PENDING`: returns `TERMINATED` **only after** (a) child confirmed dead, (b) every identity's jar disposed and zeroized best-effort, and (c) `confirmLeaseDestroyed(leaseId)` has succeeded for **every** lease issued to the unit. Any lease not provably destroyed -> `PENDING` (unit keeps its F07 lease; next sweep retries; after `hardStopMarginMs` past the deadline `FAILED`/`TRANSIENT_INFRASTRUCTURE` detail `TERMINATION_UNCONFIRMED`, operator alert).
2. Hosting-failure backstop (F1; data-model 4.10F crash matrix, AR-22, activation blocked until approved and implemented; the child also exits at the absolute hard TTL and on loss of its parent channel): broker lease absolute expiry <= dispatch + `timeoutPolicyMs + hardStopMarginMs` (<= 30 min, L8), broker sweep revokes leases of terminal units, parent `SIGKILL` deadline; no persistent child state.
3. Module-result finalizer: E15 writes none; the SECURITY finalizer (`security-check-registry-contract.md`) covers non-`COMPLETED` producers.
4. Fenced evidence wrapper for every unit-produced write ("fence first, claim second, write third", one transaction); a write rejected by the fence is annotated with the FLAG `SEC_STALE_EVIDENCE_REJECTED`; a test proves no E15 path uses generic `recordEvidence`.
5. Finalize guard (live lease + deadline not passed) before `finalizeExecutionUnit`.
6. Teardown on every exit path inside the unit's own `timeoutPolicyMs`: logout attempted only if admission is still obtainable (`safetyCheckpoint` `PROCEED`, `LOGOUT` call site); otherwise local invalidation and flag `SEC_SESSION_NOT_SERVER_INVALIDATED`.

### Cancellation, kill, crash

As E14 contract, plus: user cancel -> `CANCELLED`, safety stop -> `KILLED`; after any stop no request is issued (no logout, no cleanup); jars dropped; broker lease marked `REVOKED`/destroyed; residual sessions and fixtures listed in `CLEANUP_RECORD` (written by the parent finalizer, FR-162); in-flight requests may complete remotely; cancellation does not reverse issued requests (FR-124); user cancellation is an F07 stop so no cleanup is attempted and the UI/report warns that residual fixture state may remain (FR-171, U30 dependency).

### Failure classification

A step observing 401/403/200/500 is evidence; the unit ends `COMPLETED`. `FAILED` is used only when no probe/step of the unit completed (FR-059, L28); `TARGET_UNAVAILABLE` only when no step could complete because the target broke. A mid-run revocation (credential or grant) ends the unit `COMPLETED` with the remaining steps `BLOCKED` when at least one step completed, else `FAILED`. Failed login with a registered credential is `BLOCKED` (never `FAILED`, never PASS). Engines never set `failureClass`.

## Invariants

1. Every request satisfies the E14 per-request pipeline order; every mutating step passes its own scope gate, checkpoint and budget.
2. Workflow is a validated finite DAG with <= 25 steps (no larger cap), <= 4 identity slots, an explicit expected outcome per step.
3. Each identity has its own `SessionHost` jar; no cookie/token is shared across identities or units; no lease is shared across units.
4. Auth attempts per identity <= 3 (hard 5); after a lockout signal zero further attempts for that identity.
5. No request is issued after an F07 stop, grant revocation or deadline; no cleanup or logout either.
6. At unit end (any path) no live jar exists and every lease is `REVOKED`/destroyed or the unit is non-terminal (`PENDING`).
7. `onUnitExpired` returns `TERMINATED` only after all leases are confirmed destroyed.
8. No raw secret, session token or cookie value appears in evidence, logs, progress, queue payload or the unit row.
9. Identifiers in requests come only from `FixtureResource.identifiers` (FR-092); response-derived identifiers are never used in v1.
10. A step whose required fixture, expectation or invariant is missing yields no verdict above `NOT_TESTED`.

## Safety & Authorization (F01 / F07 / production)

F01 grant listing `AUTHENTICATED_WORKFLOW` (non-production only, 007 FR-015a); categories `AUTH_LOGIN`, `AUTH_LOGOUT`, `READ`, optionally `FIXTURE_MUTATE`/`FIXTURE_CLEANUP`, plus `AUTH_RECOVERY_OBSERVE` for recovery fixtures; identity/role limited to grant `includedAccountRefs/Roles` via `securityScopeGate` (semantics enforced by 012, not F01). Fresh F01/F07 per step via `safetyCheckpoint`; the broker independently re-validates unit, lease, plan, grant, environment, tenant, target, identity and kill switch at every lease issue (FR-032). A verified domain alone never authorizes credential use, mutation or privilege tests (FR-005). Vertical tests use only a registered low-privilege identity; an admin identity is only a fixture owner, never an attacker (FR-095). A tenant-boundary test uses two customer-registered tenant fixtures inside one Fahes tenant/Target (FR-097). Authenticated browsing is unsupported (FR-048).

## Failure states

| Condition | Unit status | Check verdict | Reason code |
|---|---|---|---|
| U-1 step 0 refusals | `REFUSED` | `BLOCKED` | `SCAN_DEADLINE_EXPIRED/_INSUFFICIENT`, `SCAN_CANCELLED`, `SCAN_FAILED` |
| PRODUCTION / unclassified | `REFUSED` | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| F01/F07 refusal at the dispatch checkpoint (before `RUNNING`) | `REFUSED` (never `KILLED`) | `BLOCKED` | verbatim upstream reason |
| Broker down (lease requested after `RUNNING`) | `COMPLETED` | `BLOCKED` | `SEC_BROKER_UNAVAILABLE` |
| Credential missing/expired/revoked/rejected/rate-limited/scope-invalid | `COMPLETED` | `BLOCKED` | `SEC_CREDENTIAL_MISSING/_EXPIRED/_REVOKED/_REJECTED/_RATE_LIMITED/_SCOPE_INVALID` |
| Credential revoked mid-run (lease revoked at checkpoint) | `COMPLETED` if >= 1 step completed, else `FAILED` (L28) | remaining steps `BLOCKED` | `SEC_CREDENTIAL_REVOKED` |
| Workflow structurally invalid (cycle, > 25 steps, no expected outcome, mutation without cleanup) | `COMPLETED` (no request sent) | `BLOCKED` | `SEC_WORKFLOW_INVALID` |
| Evidence write rejected by fence | n/a | FLAG on check | `SEC_STALE_EVIDENCE_REJECTED` |
| Grant expires mid-run | stop at next checkpoint | `BLOCKED` | `SEC_SESSION_GRANT_EXPIRED` / `EXPIRED` verbatim |
| Session establish failed / expired | `COMPLETED` | `BLOCKED` | `SEC_SESSION_ESTABLISH_FAILED` / `SEC_SESSION_EXPIRED` |
| MFA challenge / MFA timeout | `COMPLETED` | `BLOCKED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` / `SEC_MFA_TIMEOUT` |
| Unsupported credential kind (detected at lease issue, after `RUNNING`) | `COMPLETED` | `UNSUPPORTED` | `SEC_UNSUPPORTED_CREDENTIAL_KIND` |
| Lockout / rate limit | `COMPLETED` | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` / `SEC_RATE_LIMIT_ENCOUNTERED` |
| Fixture missing / invalid / insufficient identities | `COMPLETED` | `NOT_TESTED` / `BLOCKED` / `INCONCLUSIVE` | `SEC_FIXTURE_MISSING` / `SEC_FIXTURE_INVALID` / `SEC_FIXTURE_LIMITATION` |
| No expectation / invariant / role / side-effect fixture | `COMPLETED` | `NOT_TESTED` | `SEC_EXPECTATION_MISSING` / `SEC_INVARIANT_UNDEFINED` / `SEC_IDENTITY_ROLE_UNMAPPED` / `SEC_SIDE_EFFECT_FIXTURE_MISSING` |
| Mutation not permitted (consent/category/sandbox) | `COMPLETED` | `BLOCKED` | `SEC_MUTATION_NOT_PERMITTED` / `SEC_CONSENT_MISSING` / `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| Mutation sent unconfirmed after crash | `FAILED` (`TRANSIENT_INFRASTRUCTURE`) | `INCONCLUSIVE` + flag | `SEC_MUTATION_SENT_UNCONFIRMED` |
| Cleanup failed/unverified | `COMPLETED` | `INCONCLUSIVE` | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Local budget exhausted | `COMPLETED` | `BLOCKED` | `SEC_BUDGET_LOCAL_*` |
| Ambiguous response / expected outcome benign mismatch | `COMPLETED` | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Baseline unit not `COMPLETED` (dependent) | `BLOCKED` | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Kill / cancel | `KILLED` / `CANCELLED` | unexecuted `BLOCKED` | F07 reason verbatim |
| Termination unconfirmed | `FAILED` (`TERMINATION_UNCONFIRMED`) | affected `BLOCKED` | `TERMINATION_UNCONFIRMED` verbatim |

## Idempotency & retry

`maxAttempts: 1`. Per-request `sec-probe-attempt` claims (identity = `(planId, checkId, version, endpointIdentity, identityRef, probeIndex)`), `sec-evidence-write` for every write, and write-ahead mutation intents provide duplicate suppression after recovery. Lease triple `(credentialVersionId, executionUnitId, attempt)` is unique (FR-035); a second issue is denied `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`. No login, logout, refresh or mutating request is ever retried; no `STOP` is retried.

## Evidence

`AUTH_STATE_TRANSITION { fromState, toState, identityRole, cookieNames, cookieFlags, lifetimeClass, tokenType, tokenLengthClass, credentialVersionId, expectedOutcome, observedOutcomeClass }`; `PERMISSION_COMPARISON { expectation, observedClass, oracleResult, identityRoles, fixtureOwnerRole }`; `HTTP_TRANSACTION` as in the E14 contract; `CLEANUP_RECORD` per `mutation-cleanup-contract.md`. All redacted with exact-value registration of every credential and newly issued token before the first request (FR-128); redaction failure writes `{"_redactionFailed": true}`; a secret found in a response is recorded only as `{kind, location, lengthClass}` (FR-131). No session artifacts, screenshots or HAR (FR-047, FR-133).

## Budgets / limits

- **F07-authoritative**: request count (cumulative per grant), concurrency leases, grant expiry. 012 ceilings (provisional): <= 150 requests/unit; 1 in-flight per identity; <= 4 identities per unit.
- **LOCAL - not F07-ledgered**: workflow steps <= 25 (cap is 25 everywhere); per workflow <= 60 requests; per identity <= 100; per endpoint <= 8; auth attempts <= 3/identity (hard 5); mutations <= 3/fixture, <= 10/unit; retries 0 (no step is `idempotent`-declared by default); redirect depth 0 cross-origin/<= 3 planned same-origin hops; body read <= 256 KiB; total bytes <= 32 MiB/unit; MFA timeout 120 s, retry 1; delay 500 ms (`C3`)/250 ms (`C1` reads). Pre-checked before send; each mutation reserves 3 request units (mutation, cleanup, verification read; L9).

## Reverify

Fresh minimal plan re-running one scenario step or the whole scenario (FR-151/FR-152); fresh F01 (`destination = Issue.location`), F07 admission, a **new** broker lease (revalidating existence, expiry, revocation and credential version), new session; mutating reverify requires current per-class consent and a fresh fixture-state check; a missing/expired credential, fixture, grant, or changed environment yields `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`, never `PASSED`; `INCONCLUSIVE` maps to Issue state `UNVERIFIABLE` (FR-164). `Issue.location` is bound to a concrete destination by `parseSecurityLocation`, otherwise `SEC_REVERIFY_UNVERIFIABLE` (FR-163).

## Boundary rules (MUST NOT)

1. MUST NOT pass a session, cookie, token or lease between units.
2. MUST NOT let any workflow or step run without its own scope gate, checkpoint and budget; MUST NOT treat a test label as permission.
3. MUST NOT guess, create, harvest, stuff or brute-force credentials or tokens; MUST NOT attempt MFA bypass.
4. MUST NOT exceed the step/identity/attempt/mutation limits or accept an unbounded loop.
5. MUST NOT send any request (including logout and cleanup) after an F07 stop, grant revocation or deadline.
6. MUST NOT touch a resource not registered as a fixture or enumerate identifiers.
7. MUST NOT trigger real email/SMS, payments, refunds, purchases, inventory or messaging outside a `SANDBOX_CONFIRMED` customer fixture endpoint.
8. MUST NOT persist cookie jars/tokens or capture authenticated screenshots/HAR; MUST NOT use authenticated browser state.
9. MUST NOT return `TERMINATED` from `onUnitExpired` before every lease is confirmed destroyed.
10. MUST NOT hold the KEK/data keys or a DB connection in the child; MUST NOT write secrets to disk/env/queue/log.
11. MUST NOT execute customer code, call a model, or use an admin identity as an attacker.
12. MUST NOT run against PRODUCTION or unclassified targets.

## Named limitations

- Server-side sessions cannot always be confirmed destroyed after a stop (`SEC_SESSION_NOT_SERVER_INVALIDATED`, `SESSION_UNCONFIRMED`).
- Zeroization is best-effort in a garbage-collected runtime; short leases compensate.
- "Customer-asserted fixture safety": Fahes cannot verify that a payment/messaging fixture endpoint is truly a sandbox.
- MFA only via exempt accounts or pre-established session fixtures; no TOTP, SMS/email OTP or human-assisted checkpoints.
- Requests in flight at kill/cancel may complete remotely and are not reversed.
- The scope gate (accounts, roles, categories) is enforced by 012 code and tests, not F01; byte/attempt/mutation limits are local, not F07-ledgered.
- `timeoutPolicyMs` and `M` are provisional pending calibration.

## FR traceability

FR-005 (ownership != authorization); FR-041..FR-052 (SessionHost, isolation, expiry, teardown, crash, concurrency, `onUnitExpired`); FR-053..FR-063; FR-069..FR-077; FR-086..FR-090 (auth catalog hooks, MFA); FR-091..FR-097 (authorization pairs, fixtures, vertical, tenant); FR-114..FR-118 (invariants, finite workflows, sandbox fixtures, bounded repeats); FR-119..FR-126 (mutation and cleanup by reference); FR-127..FR-135; FR-151..FR-154; FR-059 (failure classification); FR-161 (dual-class split: crafted credentialed requests belong to linked E14 units); FR-162 (residual manifests by the parent finalizer); FR-163, FR-164 (reverify location binding and routing); FR-166 (claim staleness); FR-171 (cancellation residue warning).

## Acceptance tests required (deterministic, fixture-based; not executed in planning)

- `T-E15-dag-validation`: cycle, 26 steps (`SEC_WORKFLOW_INVALID`), 5 identities, missing expected outcome, missing cleanup for a mutation each rejected pre-request.
- `T-E15-session-isolation`: two identities, two jars; a cookie from A never appears in a request for B; no value crosses units; a cross-tenant cookie leak fixture fails the run.
- `T-E15-composite-ordering-only`: ACTIVE dependent unit obtains its own lease; baseline failure yields `BLOCKED` dependents; session never serialized.
- `T-E15-bad-password`: exactly one attempt, `SEC_CREDENTIAL_REJECTED` `BLOCKED`, no retry, never PASS.
- `T-E15-lockout-and-429`: lockout signal blocks further auth for that identity; 429 pauses endpoint+identity.
- `T-E15-mutation-needs-own-checkpoint`: each `FIXTURE_MUTATE` step performs its own gate/checkpoint/budget; consent OFF yields `SEC_CONSENT_MISSING` with zero requests.
- `T-E15-mfa-challenge-and-timeout`: challenge -> `SEC_MFA_CHALLENGE_UNSUPPORTED`; fixture wait expires at 120 s -> `SEC_MFA_TIMEOUT`; checkpoints continue during wait; progress shows `WAITING_ON_MFA_FIXTURE`.
- `T-E15-lease-revoked-midrun`: revocation detected at next checkpoint (<= 5 s); steps blocked `SEC_CREDENTIAL_REVOKED`; jar dropped.
- `T-E15-grant-expiry-midrun`: session invalidated locally, lease revoked, no PASS.
- `T-E15-kill-no-logout-no-cleanup`: stop mid-workflow issues zero further requests, residual manifest, `SEC_SESSION_NOT_SERVER_INVALIDATED`.
- `T-E15-onUnitExpired-gating`: `PENDING` until all leases destroyed then `TERMINATED`; unconfirmed path yields `TERMINATION_UNCONFIRMED` alert.
- `T-E15-crash-recovery`: crash after mutation send -> `SENT_UNCONFIRMED`, no re-send, no whole-unit retry, new attempt never reuses lease (`SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`).
- `T-E15-secret-free-surfaces`: no registered secret in queue payload, unit row, progress, logs, evidence, AI prompt fixtures.
- `T-E15-production-refusal`: PRODUCTION/unclassified refused at plan, broker, gate, dispatch.

## Resolved additions

- Item 1 (no code for structurally invalid workflow) -> L11: `SEC_WORKFLOW_INVALID` (BLOCKED). Applied in `validateWorkflow` and Failure states.
- Item 4 (progress vocabulary) -> VERIFIED (L36) against `specs/009-core-scan-execution-platform/contracts/progress-event-contract.md`: 009 tick is `{label, completedUnits?, totalUnits?, indeterminate?}` plus free-form `progressSnapshot` JSON (`data-model.md`); no 009 state/`waitingOn` names exist; 012's names ride inside `label`/`progressSnapshot`.
- Item 5 (mid-run revocation criterion) -> L28/FR-059: `COMPLETED` when >= 1 probe/step completed, else `FAILED`.
- L2/FR-161 (crafted credentialed requests move to linked E14 units), L3/FR-162, L8 (lease cap min(timeout+margin, 30 min)), L9 (3 reserved units), L13 (step cap 25 everywhere), L39 (dispatch/liveness consumes), FR-163/164, FR-166, FR-171 applied above.

## Open for closure

No item is open. The `STOP_BRANCH` dependant reason, the identities-versus-in-flight reading and the `NEGATIVE_PROBE` vocabulary are decided in Consolidated repairs items 2 and 3 and in the registry contract (accepted `SEC_PRECONDITION_UNMET`).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Canonical workflow schema (F-20)**: `data-model.md` §4.7 `WORKFLOW_DEFINITION` is the single step schema; this contract references it.
2. **E15 step vocabulary (resolves the open question)**: E15 steps use `actionCategory ∈ {READ, AUTH_LOGIN, AUTH_LOGOUT, AUTH_RECOVERY_OBSERVE, FIXTURE_MUTATE, FIXTURE_CLEANUP}`; **`NEGATIVE_PROBE` is E14-only** (crafted credentialed requests run in E14 under FR-161).
3. **Local-limit labels and in-flight (F-19)**: E15 in-flight is 1 per identity (local); identities per unit <= 4 (FR-051 reading: concurrent jars, one in-flight request per identity).
4. **Lease liveness, host CAS, child confinement, time, restore**: as active-security-execution-contract items 2-4, 10 and broker items 4 and 6.
5. **Per-request key**: E15 uses the same per-request idempotency key rule (FR-072).
6. **Sensitive-class workflows (FR-117)** require the `run.sensitive_confirmed` event at dispatch; non-interactive runs refuse (`SEC_CONSENT_MISSING`).
7. E15 uses the same egress gate (step reference frames, FR-200), admission order, fail-closed matrix, HostileTextExecutor, child stdio policy and unit-host claim as `active-security-execution-contract.md` (FR-175, FR-190, FR-174, FR-194, FR-195, FR-199); every login and refresh is reserved (`reserveAuthAttempt`, Phase B), marked SENT immediately before the first byte and resolved afterwards (FR-191).
