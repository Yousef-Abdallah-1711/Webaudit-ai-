# Contract: Business-Logic Security (Context I, `logic.*`)

## Status / Ownership

**Status**: PLANNING — NOT FROZEN. **Ownership**: Context I (Business Logic Security). Workflows run in E15 `AUTHENTICATED_WORKFLOW` units (`security.auth.*`, plan.md class fill 1-18; mutating steps additionally governed by `mutation-cleanup-contract`); invariants are evaluated by a deterministic, closed predicate evaluator; verdicts are produced parent-side by the Security Check Evaluator over committed Evidence (FR-147).

Per FR-114..FR-118, FR-075 (25 steps everywhere, L13), FR-140, FR-163/FR-164/FR-169 (reverify), FR-119..FR-126, FR-136..FR-141, FR-094 (ladder shape), FR-011, FR-012, FR-055..FR-057, FR-069..FR-077, FR-127..FR-135, FR-148, FR-151..FR-153. Reasons only from the plan.md closed `SEC_*` registry or upstream passthrough.

## Consumers

- Security Check Evaluator (`logic.*` check results), `materializeFinding` (009).
- `security-coverage-contract` (workflow steps executed, invariants evaluated/undefined, cleanup outcomes, FR-143).
- `mutation-cleanup-contract` (every mutating step), `auth-workflow-execution-contract` (E15 unit host, session, budgets).
- `api-discovery-contract.md` (steps reference operations by `apiIdentity`), `authorization-testing-contract.md` (identity/fixture/oracle entities reused; `OWNER_ONLY` overlap, inv. 11).
- `security-reverify-contract` (scenario/step re-run).

## Inputs

All customer-declared, tenant-owned, Target-bound, environment-scoped, versioned data. **No scripts, no regex-from-customer, no code** (FR-115).

```text
BusinessInvariant = { invariantId, version, predicate: PredicateName, args: PredicateArgs,   // closed vocabulary, inv. 3
                      observationRefs[] (obsId), scope: workflowId, severityHint?: LOW|MEDIUM|HIGH (cap table, FR-138; not asset criticality),
                      recordMode: VALUE_RECORDED | CLASS_ONLY, confirmable: bool (set by registry check, not customer) }
WorkflowDefinition = { workflowId, version, environment, targetId, steps: Step[] (1..25), identities[] (<=4), fixtureRefs[] }
Step = { stepId, order, actionCategory: READ|AUTH_LOGIN|AUTH_LOGOUT|FIXTURE_MUTATE|FIXTURE_CLEANUP|NEGATIVE_PROBE,
         operation: apiIdentity, actorIdentityRef, fixtureRef?, requestTemplate (typed slots filled ONLY from fixture-registered data),
         expectedEffect?: {effectObsId}, observations: [{obsId, source: RESPONSE_FIELD|STATE_READBACK|STATUS_CLASS, path, typeClass, recordMode}],
         repeat?: {times: 1..3, actionKey}, sandbox?: SANDBOX_CONFIRMED }
```

- `API_SURFACE` rows for every step operation (`probeEligible`); `FixtureResource`/`TestIdentity` records (authorization-testing-contract.md Inputs).
- Grant: `AUTHENTICATED_WORKFLOW` listed (and `ACTIVE_SECURITY` only if a step is a registry-defined credentialed *crafted* probe, which runs in an E14 unit under the dual-class rule FR-161; v1 logic checks need none); action categories declared per step; `FIXTURE_MUTATE` in scope and per-mutation-class consent for mutating steps (default OFF); environment `STAGING`/`DEVELOPMENT`.
- Broker leases for the identities (<= 4 per unit, FR-051).

## Outputs

- `HTTP_TRANSACTION` (sanitized) and `AUTH_STATE_TRANSITION` per step; **`StepObservation` records** carried inside the `SECURITY_CHECK_RESULT` payload / `PERMISSION_COMPARISON`-free (no new evidence kind): `{obsId, stepId, repeatIndex, statusClass, valueClass, recordedValue? (only VALUE_RECORDED), present: bool, recordMode}`; every persisted predicate result also carries `{predicateId, outcome: TRUE|FALSE|UNDEFINED, evaluatedIn: CHILD, recordMode}` (L15).
- `CLEANUP_RECORD` per mutation (`state` `INTENDED -> SENT -> CONFIRMED | SENT_UNCONFIRMED` or `ABANDONED`, plus `cleanupState` `NOT_REQUIRED | PENDING | REVERTED | RESIDUAL | ACKNOWLEDGED`, FR-120).
- `SECURITY_CHECK_RESULT` per `(invariantId, version)`: `evaluation ∈ {TRUE, FALSE, UNDEFINED}`, verdict, `oracleTier`, `repeatCount`, `cleanupState`, `customerAssertedFixtureSafety: bool`.
- Findings for finding verdicts only (FR-139); `Issue.location = METHOD + https://host/path-template` of the step operation where the violation was observed (FR-145).

## Operations

```text
validateWorkflow(def, apiSurface, fixtures, identities, grants, env) -> WorkflowPlan | Refusal(reason)   // parent-side, pure; refuses before any unit
buildWorkflowUnits(plan) -> ExecutionUnit[]                 // normally 1 E15 unit per workflow (<=25 steps, <=4 identities)
runWorkflow(unit: E15) -> StepObservation[], HTTP_TRANSACTION[], CLEANUP_RECORD[]   // sequential steps; per request FR-055 order
evaluateInvariant(invariant, transientObservations) -> {evaluation: TRUE|FALSE|UNDEFINED, detail: closed enum}  // pure, deterministic; runs IN THE E15 CHILD over transient in-memory observations (FR-116, L15)
verdictFor(persistedPredicateResult, oracleTier, cleanupState, customerAssertion) -> Verdict + reason  // parent-side, inv. 8
onSecurityEvidenceCommitted(...)                           // sole path producing SECURITY_CHECK_RESULT (FR-147), claim first
```

Ordered steps:

1. `validateWorkflow`: step count <= 25 (inv. 1); each `actionCategory` closed and listed in grant scope; each step operation `probeEligible`; no PRODUCTION; every invariant refers to observations that exist in the workflow; every sensitive-endpoint class step is `SANDBOX_CONFIRMED` (inv. 9); repeats within cap (inv. 5); a workflow that is cyclic, over 25 steps, lacks expected outcomes or has a mutation without cleanup is refused `BLOCKED`/`SEC_WORKFLOW_INVALID`. No invariants -> `NOT_TESTED` / `SEC_INVARIANT_UNDEFINED`, and **no unit is created for a workflow with no invariant** (logic checks are verdict-less otherwise).
2. Plan one E15 unit per workflow; claim `IdempotentClaim{scope:"sec-check-execution"}` for each invariant check (FR-147) before readiness; plan units per 009 (`maxAttempts:1`).
3. In the child: lease(s) -> login steps (counts against auth attempts) -> steps in order. For each step execute **exactly** the FR-055 order: scope gate -> LocalBudget -> `safetyCheckpoint` -> write-ahead intent if mutating (each mutation locally reserves 3 request units: the mutation, the cleanup and the verification read, FR-121, L9) -> send -> bounded read -> evaluate declared observation extractors and the invariant predicate in memory (child) -> redact-then-record the predicate id, boolean and `recordMode`-governed values.
4. Repeated steps (`repeat.times` 2..3) are sequential, never concurrent, with the inter-request delay (500 ms) and a checkpoint between each; each repeat has its own claim `sec-probe-attempt` keyed `(…stepId, repeatIndex)`.
5. After the last step run cleanup steps in reverse order of mutation (each `FIXTURE_CLEANUP` is itself a checkpoint call site); verify by readback; write final `CLEANUP_RECORD`s.
6. Parent reads the committed child-evaluated predicate results (after producer units terminal), applies the verdict ladder (inv. 8) and writes `SECURITY_CHECK_RESULT`; the parent never re-evaluates from raw values (none are stored, FR-128/131).

## Invariants

1. **Finite workflows (FR-117, FR-075).** `steps.length <= 25` (the cap is 25 everywhere; there is no larger hard cap, FR-075, L13). No loops, no recursion, no conditionals, no jumps, no step that creates steps. Order is the list order. `repeat` is the only repetition and is capped (inv. 5). A definition violating any of this (or using an unknown predicate / unresolvable observation reference) is refused at `validateWorkflow` with `BLOCKED`/`SEC_WORKFLOW_INVALID`.
2. **Invariants are mandatory (FR-114).** No `BusinessInvariant` (or only an OpenAPI-declared constraint reused as a *trusted application contract*, which maps onto `NON_NEGATIVE`/`EQUALS` over declared schema fields) -> `NOT_TESTED` / `SEC_INVARIANT_UNDEFINED`. Fahes never invents an invariant, never infers "business rules" from traffic, and never uses AI to suggest one at runtime (FR-144; AI may only help the customer *author* data offline, outside the engines).
3. **Closed predicate vocabulary (FR-115).** Exactly nine predicates; evaluation is pure, integer/decimal-exact, locale-free, and independent of wall-clock. Observation values are typed (`DECIMAL(scale)`, `INTEGER`, `ENUM(label)`, `BOOLEAN`, `COUNT`, `OPAQUE_ID`); a type mismatch is `UNDEFINED(TYPE_MISMATCH)`, never `FALSE`. Decimals are compared as exact scaled integers (no floating point, no rounding); a missing observation is `UNDEFINED(OBSERVATION_MISSING)`.

   | Predicate | Args | `TRUE` when | `FALSE` when | `UNDEFINED` when |
   |---|---|---|---|---|
   | `EQUALS` | `a`, `b` (obs refs or customer constants of the same type) | exactly equal (same type, same exact value; strings compared byte-wise in-child, `OPAQUE_ID` by equality only) | not equal | either missing / type mismatch |
   | `NOT_EQUALS` | `a`, `b` | not equal | equal | same as `EQUALS` |
   | `SUM_EQUALS` | `items` (obs set, <= 200 `DECIMAL` of one scale), `total` (obs), `toleranceMinorUnits` (0 default, <= declared small cap by customer, never relative) | `|Σitems − total| <= tolerance` | beyond tolerance | any item/total missing, scale mismatch, count > 200 |
   | `MONOTONIC_STATE_TRANSITION` | `entityKey`, `allowedGraph` (finite directed graph, <= 32 states, <= 128 edges, self-edges implicit) | for the ordered observed state sequence of one entity, every consecutive pair `(s_i, s_{i+1})` with `s_i ≠ s_{i+1}` is an edge of the graph | some consecutive observed pair is not an edge (both states in the graph) | an observed state not in the graph, or < 2 observations |
   | `AT_MOST_ONCE` | `actionKey` | across all executions of steps tagged `actionKey` in the unit (<= 3), the count of executions whose `expectedEffect` observation is true is <= 1 | count >= 2 | the effect observation is missing for any execution |
   | `NON_NEGATIVE` | `obs` (`DECIMAL`/`INTEGER`) at every recording point | all recorded values >= 0 | any value < 0 | no recorded value / type mismatch |
   | `WITHIN_QUOTA` | `actionKey`, `n` (customer integer, allowed 1..2 under the repeat cap) | effect count <= `n` | effect count > `n` | `n` outside 1..2 (unreachable under the bounded repeat cap, reported honestly as untestable) or effect obs missing |
   | `IDEMPOTENT` | `actionKey`, `stateObsRefs[]` (<= 8), `idempotencyIdentity` (customer-declared stable request identity) | with the same identity executed `k` times (2..3): effect count == 1 **and** declared state observations after execution 2..k equal those after execution 1 | effect count >= 2 or any declared state observation differs | observations missing, `k < 2` |
   | `OWNER_ONLY` | `fixtureRef`, `ownerIdentityRef`, `effectObs` | for every step whose actor ≠ owner against that fixture, the effect observation is false (or outcome class DENIED/NOT_FOUND) | some non-owner step shows effect true | effect obs missing for a non-owner step or no non-owner step exists |

4. **Violation definition (FR-116).** `FALSE` is the only evaluation that can yield a finding verdict, and only from recorded observations of an executed, bounded, complete-enough workflow (every observation the predicate needs is present). An unusual-but-possible workflow, an unmodeled state, a missing observation or a type mismatch is `UNDEFINED`, never `FALSE`.
5. **Repeat cap (FR-118).** Duplicate/idempotency/quota invariants use at most **3 total executions** of one `actionKey` per fixture per unit (provisional; equal to the per-fixture mutation ceiling of 3 so the cap cannot be exceeded by mutation counting). Repeats are sequential with checkpoints and pacing; there is no parallel send, no burst, no timing window. **Timing-race / TOCTOU tests are `UNSUPPORTED` in v1** (registry entry without probe definition, FR-010; reason `SEC_PROBE_CLASS_UNSUPPORTED`, L11/L16).
6. **Observation recording and redaction (FR-128, FR-131).** Extractors run inside the child over the unredacted in-memory response; the stored form depends on `recordMode`: `VALUE_RECORDED` is allowed only for fields the customer declares non-sensitive numeric/enum/boolean business values (amounts, counters, states) and is stored as the typed value; `CLASS_ONLY` stores `{present, valueClass, lengthClass}` and the predicate result evaluated in the child (`evaluatedIn: CHILD`). Bodies are never stored (<= 600-char redacted excerpt at most, usually none). Customer records, emails, phones, IDs are never stored as values.
7. **Evaluation placement (FR-116, L15).** Every predicate is evaluated **inside the engine child over transient in-memory observations**; only the predicate id, the boolean outcome and `recordMode`-governed values (`CLASS_ONLY`, or `VALUE_RECORDED` for customer-declared non-sensitive fields) are persisted, marked `evaluatedIn: CHILD`. Because the outcome cannot be replayed from stored facts, an engine-evaluated verdict is **capped at `LIKELY_VULNERABILITY`**; `CONFIRMED` additionally requires a fixture-confined oracle (inv. 8, FR-140).
8. **Verdict ladder.**
   - `CONFIRMED_VULNERABILITY`: `FALSE` **and** the registry check declares `confirmable:true` **and** the violation is observed through a fixture-confined oracle (an independent `STATE_READBACK` observation of fixture state, FR-140) **and** the workflow's mutating endpoints are `SANDBOX_CONFIRMED` fixtures or non-mutating **and** cleanup state is attached (kept even if cleanup failed, FR-123).
   - `LIKELY_VULNERABILITY` (the ceiling for any engine-evaluated verdict without an oracle): `FALSE` from response-only observations, `CLASS_ONLY` or `VALUE_RECORDED` child-evaluated outcomes, or a violated invariant whose fixture oracle was unavailable.
   - `NO_ISSUE_DETECTED`: `TRUE` for every executed invariant, **and** all required cleanup verified; rendered with the FR-137 statement ("no issue detected by N executed workflows/steps of invariant X vN") — never "business logic is secure".
   - `INCONCLUSIVE`: `UNDEFINED` caused by `SEC_SIGNAL_WEAK` (unmodeled state, missing observation after a measured response), `SEC_RESPONSE_AMBIGUOUS` (transport failure), `SEC_CLEANUP_FAILED`/`SEC_CLEANUP_UNVERIFIED`.
   - `NOT_TESTED`: `SEC_INVARIANT_UNDEFINED`, `SEC_FIXTURE_MISSING`, `SEC_PRECONDITION_UNMET`, `SEC_EXPECTATION_MISSING`-equivalents.
   - Never `CONFIGURATION_RISK`/`INFORMATIONAL` unless a registry check defines it (v1 logic checks are finding-or-coverage only).
   - The customer-asserted sandbox is stated in every report for a verdict derived from a `SANDBOX_CONFIRMED` endpoint ("customer-asserted fixture safety", FR-117).
9. **Sensitive-endpoint refusal (FR-117).** Operations whose path/`operationId`/tags match the vendored, versioned sensitive-class list (payment, refund, charge, purchase/checkout/order-submit, inventory/stock adjustment, message/email/SMS/notification send, subscription billing, account deletion, data export) are refused unless the step carries `sandbox: SANDBOX_CONFIRMED` **and** the fixture's registered endpoint maps to the customer's sandbox/fake backend. Fahes cannot verify the assertion (named limitation); the classifier is a heuristic, so refusal also applies when a customer marks `sensitiveClass: true` on any operation. Real payments, refunds, purchases, inventory changes and real-recipient messages are never performed; there is no code path that supplies live payment credentials or recipient addresses.
10. **Mutation governance (FR-119..FR-126).** Every mutating step declares explicit authorization, fixture identity, expected mutation, max mutation count (<= 3/fixture, <= 10/unit), idempotency identity, cleanup method and verification, failure handling, retry (none), residual effects; write-ahead `MutationIntent` before send; cleanup in the same unit (3 request units per mutation: mutation, cleanup, verification read); **no cleanup after any F07 stop or grant revocation**; residual manifest as `CLEANUP_RECORD` state `RESIDUAL`; check `INCONCLUSIVE`. `NO_ISSUE_DETECTED` is forbidden when cleanup failed/unverified (FR-123).
11. **`OWNER_ONLY` vs `authz.*`.** `OWNER_ONLY` evaluates inside a customer workflow with mixed identities; it shares `rootCauseGroup` with the matching `authz.bola.*` check so one Finding is produced per endpoint (FR-141). It never enumerates identifiers (authorization-testing-contract.md inv. 1 applies).
12. **No customer code.** Predicates are not extensible; there is no expression language; no customer-defined function, template evaluation, or regex. A customer who needs an unsupported predicate gets `UNSUPPORTED`/`SEC_PROBE_CLASS_UNSUPPORTED` and no check.
13. **Identity and session rules.** Per-identity isolated `SessionHost`; no mixing of tenants/roles/scans; <= 4 concurrent identities per unit; session artifacts never persisted (FR-042, FR-047). Login attempts per identity <= 3 (hard 5); lockout stops (FR-074).
14. **Fixture-only identifiers** (authorization-testing-contract.md inv. 1): request templates take values only from registered fixture data; no identifier is enumerated or guessed; resources outside fixtures are never requested.

## Safety & Authorization

- **F01**: `AUTHENTICATED_WORKFLOW` grant, non-production only (FR-078); F01 evaluated fresh at plan, dispatch, every request/hop/mutation (FR-003); PRODUCTION/unclassified -> `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`.
- **Action categories**: only the closed 012 set; mutating steps need `FIXTURE_MUTATE` and per-class consent; `FIXTURE_CLEANUP` for cleanup; `securityScopeGate` fail-closed (FR-012).
- **F07**: `safetyCheckpoint` at every `HTTP_REQUEST`, `REDIRECT_HOP`, `LOGIN_ATTEMPT`, `LOGOUT`, `FIXTURE_MUTATION`, `FIXTURE_CLEANUP`, `SESSION_REFRESH` (FR-077); cadence <= 5 s; grant expiry bounds the workflow.
- **Credentials**: broker lease per identity, fail closed (`SEC_BROKER_UNAVAILABLE`).
- Destinations: only authorized hosts through `SecurityHttpClient`/safe-net; cross-origin redirects not followed.
- The real-world side effects the platform must never cause (FR-117, FR-119): payments, refunds, purchases, inventory changes, real emails/SMS/notifications, account deletion, data export of real records.
- AI never defines invariants, evaluates predicates, selects steps or sees bodies/ids (FR-144).

## Failure states

| Condition | Verdict / status | Reason |
|---|---|---|
| No invariant for the workflow | `NOT_TESTED`; no unit | `SEC_INVARIANT_UNDEFINED` |
| Workflow invalid (>25 steps, loop/conditional, lacks expected outcomes, mutation without cleanup, unknown predicate, unresolvable observation ref) | `BLOCKED` | `SEC_WORKFLOW_INVALID` |
| Missing fixture / invalid fixture | `NOT_TESTED` / `BLOCKED` | `SEC_FIXTURE_MISSING` / `SEC_FIXTURE_INVALID` |
| Identity role unmapped / not in grant | `NOT_TESTED` / `BLOCKED` | `SEC_IDENTITY_ROLE_UNMAPPED` / `SEC_IDENTITY_NOT_IN_SCOPE` |
| Sensitive endpoint without sandbox confirmation | `BLOCKED` | `SEC_MUTATION_NOT_PERMITTED` |
| Mutation consent absent / `FIXTURE_MUTATE` not granted | `BLOCKED` | `SEC_CONSENT_MISSING` / `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| PRODUCTION / unclassified | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Credential state failures | `BLOCKED` | `SEC_CREDENTIAL_*`, `SEC_BROKER_UNAVAILABLE`, `SEC_MFA_*` |
| Lockout / 429 | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` / `SEC_RATE_LIMIT_ENCOUNTERED` |
| Local budget exhausted (requests/workflow/mutations/duration/bytes) | `BLOCKED` (remaining steps) | `SEC_BUDGET_LOCAL_*` |
| F07 budget/concurrency/kill/revocation | unit per 009; remaining steps not run | `BUDGET_EXHAUSTED_*`, `KILL_SWITCH_PENDING`, F01 reasons verbatim |
| Step response ambiguous / transport error | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Observation missing or unmodeled state | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` |
| Cleanup failed / unverified | `INCONCLUSIVE` (no `NO_ISSUE_DETECTED`) | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Mutation sent, outcome unknown / residual | FLAG | `SEC_MUTATION_SENT_UNCONFIRMED` / `SEC_RESIDUAL_FIXTURE` |
| Timing-race / flood / burst request, unsupported predicate | `UNSUPPORTED` | `SEC_PROBE_CLASS_UNSUPPORTED` |
| Evaluator threw or overran | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Upstream producer unit not `COMPLETED` | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Feature gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |

## Idempotency & retry

- `maxAttempts: 1`; no step is retried; a repeat is a *test construct*, not a retry, and is bounded by inv. 5. Mutating requests are never retried; `SENT_UNCONFIRMED` after crash/kill/timeout is not re-sent on recovery (write-ahead intent, FR-120); the fixture is flagged residual.
- Per-step-execution claim `sec-probe-attempt` `(planId, checkId, checkVersion, apiIdentity, identityRef, stepId:repeatIndex)` (FR-148); `sec-check-execution` per invariant (FR-147); evidence claims `sec-evidence-write` (FR-135).
- Duplicate-mutation suppression after a worker retry is acceptance-tested (Spec User Story 7).

## Evidence

`HTTP_TRANSACTION` (sanitized), `AUTH_STATE_TRANSITION`, `CLEANUP_RECORD`, `SECURITY_CHECK_RESULT` (with observation summaries), `SECURITY_REPRODUCTION` (confirmed only: ordered step template ids + observed outcome classes + fixture ids; no values beyond declared recordable ones). Fenced writer only; redaction mandatory and value-aware; failure writes `{"_redactionFailed": true}`. Step trace retained at report retention parity; tenant-isolated keys.

## Budgets / limits (F07 vs LOCAL)

- **F07**: requests (E15 <= 150/unit provisional), concurrency (1 in flight per identity), grant expiry; each mutation locally reserves 3 request units (L9).
- **LOCAL — not F07-ledgered** (FR-070): steps <= 25 (no larger cap); per workflow <= 60 requests; per identity <= 100; per endpoint <= 8; repeats <= 3 total executions of an `actionKey`; mutations <= 3/fixture, <= 10/unit; auth attempts <= 3/identity (hard 5); identities <= 4; response read <= 256 KiB; total bytes <= 32 MiB/unit; observation extractors <= 32 per step, items <= 200 per `SUM_EQUALS`; inter-request delay 500 ms (`C3`); E15 `timeoutPolicyMs` 900 000, margin 60 000, `unitBudgetMs` 1 020 000.

## Reverify

`FRESH_MINIMAL_PLAN` (FR-152): re-run the single scenario (or the minimal step window that produced the observation) as a new single-unit plan routed to the 009 REVERIFY path before the legacy resolver (FR-164) with fresh F01 (concrete destination bound from `Issue.location` by `parseSecurityLocation`, method ignored; unbindable => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`, FR-163), fresh F07 admission, fresh broker leases, a **fresh fixture state check** (fixture reset/verified clean before mutating steps) and current mutation consent. `PASSED` only if the invariant evaluated `TRUE` on freshly executed observations with cleanup verified; `FAILED` if `FALSE` again; `INCONCLUSIVE` (closed reasons: credentials, fixture, grant, environment, budget, `SEC_ENDPOINT_GONE`, `SEC_REVERIFY_UNVERIFIABLE`) otherwise, mapped to Issue `UNVERIFIABLE` (FR-164); billing per FR-169 (P14 PROVISIONAL). Never replays a stored request body; prior evidence preserved and linked.

## Boundary rules (MUST NOT)

1. MUST NOT evaluate any predicate outside the nine; MUST NOT execute customer-supplied scripts, expressions, regexes or functions.
2. MUST NOT produce a verdict without a customer-declared invariant (or declared contract constraint); MUST NOT infer rules from traffic or AI.
3. MUST NOT report a violation from a missing/undefined/unmodeled observation or an unusual-but-possible flow.
4. MUST NOT perform real payments, refunds, purchases, inventory changes, real messages/emails/SMS, account deletion or real-data export; MUST NOT supply payment credentials or real recipient addresses.
5. MUST NOT run a race/burst/parallel/timing test, exceed 3 total executions of an `actionKey`, or exceed the workflow/step/mutation limits.
6. MUST NOT mutate without `FIXTURE_MUTATE`, consent, write-ahead intent and a cleanup/verification plan; MUST NOT clean up after a stop; MUST NOT mark `NO_ISSUE_DETECTED` with failed/unverified cleanup.
7. MUST NOT enumerate/guess identifiers or touch resources outside registered fixtures; MUST NOT cross Fahes tenants or targets.
8. MUST NOT run on PRODUCTION/unclassified targets or in `SOURCE_EXECUTION` Guests; MUST NOT use the 011 Provider Port for logic tests.
9. MUST NOT claim the sandbox is real: MUST state "customer-asserted fixture safety".
10. MUST NOT store response bodies, customer records, tokens/cookies or non-declared values; MUST NOT send values to AI.
11. MUST NOT define new reason codes, evidence kinds, classes or FRs.

## Named limitations

- Sandbox/fake-endpoint safety is **customer-asserted** and unverifiable by Fahes (FR-117); a mis-mapped endpoint could cause a real side effect. The sensitive-class refusal heuristic reduces but does not eliminate this.
- Business correctness depends on the customer's invariants; Fahes finds only violations of what was declared (absence of findings is not absence of logic flaws).
- Race conditions, TOCTOU, concurrency-window and timing-based abuse are not tested (`UNSUPPORTED`); duplicate/quota tests are bounded to <= 3 sequential executions, so higher quotas are untestable.
- Child-evaluated predicate outcomes cannot be replayed from stored facts; they cap verdicts at `LIKELY` unless a fixture-confined oracle exists.
- A kill during a mutating request may complete remotely (008 FR-014); no cleanup after stop; residual manifest lists manual actions.
- Multi-service workflows spanning registrable domains are `UNSUPPORTED` in v1.

## FR traceability

FR-114 (invariants required), FR-115 (vocabulary), FR-116 (violation), FR-117 (finite steps, sandbox), FR-118 (bounded repeats, no race), FR-075 (finite DAG), FR-119..FR-126 (mutation/cleanup), FR-011/012 (categories/gate), FR-055..057, FR-069..077, FR-051/FR-042 (sessions), FR-127..135 (evidence), FR-136..141 (ladder/fingerprints), FR-144 (no AI), FR-148 (probe claims), FR-151..153 (reverify), FR-092 (fixtures), FR-140 (confirmation oracle), FR-161 (dual-class, crafted credentialed steps), FR-163/164/169 (reverify binding/routing/billing), FR-165 (no AI findings), FR-121/FR-162 (3 request units; finalizer-written residual manifest).

## Acceptance tests required (named; deterministic; fixture-based; not executed in this pass)

- `T-LOGIC-01-no-invariant-no-verdict`: workflow without invariant => `NOT_TESTED SEC_INVARIANT_UNDEFINED`; no unit; zero requests.
- `T-LOGIC-02-predicate-truth-tables`: for each of the nine predicates a fixed table of observation vectors => exact `TRUE/FALSE/UNDEFINED` (incl. decimal exactness, type mismatch, missing obs, unmodeled state, `WITHIN_QUOTA n=5` untestable).
- `T-LOGIC-03-single-use-code-violated`: fixture shop reusing a discount code on repeat 2 => `AT_MOST_ONCE` `FALSE`, readback oracle, sandbox-confirmed => `CONFIRMED` with customer-asserted statement; repeats <= 3.
- `T-LOGIC-04-order-total-sum`: `SUM_EQUALS` mismatch with `VALUE_RECORDED` => `CONFIRMED` (readback) / `LIKELY` (response-only).
- `T-LOGIC-05-engine-evaluated-cap`: any child-evaluated `FALSE` without a fixture-confined oracle (`CLASS_ONLY` or `VALUE_RECORDED`) => capped `LIKELY`, marked `evaluatedIn: CHILD`, no raw value persisted beyond `recordMode`.
- `T-LOGIC-06-unusual-not-vuln`: unmodeled state and missing observation => `INCONCLUSIVE SEC_SIGNAL_WEAK`, never a finding.
- `T-LOGIC-07-sensitive-endpoint-refused`: payment/refund/purchase/inventory/message operation without `SANDBOX_CONFIRMED` => refused `SEC_MUTATION_NOT_PERMITTED`; network spy zero requests; with confirmation => runs and report states customer-asserted safety.
- `T-LOGIC-08-no-race`: attempt to declare parallel/burst or `repeat.times = 4` => refused at validation (`SEC_WORKFLOW_INVALID`); no concurrent sends possible (single in-flight per identity).
- `T-LOGIC-09-duplicate-after-retry`: worker crash after mutating request sent => recovery does not resend (`SENT_UNCONFIRMED`), `attempts: 1`, fixture residual.
- `T-LOGIC-10-cleanup-failure`: cleanup fails => `INCONCLUSIVE SEC_CLEANUP_FAILED` + residual manifest; no `NO_ISSUE_DETECTED`; violation finding (if any) kept with cleanup state.
- `T-LOGIC-11-kill-no-cleanup`: kill switch mid-workflow => no further requests incl. cleanup; residual manifest; unit `KILLED`.
- `T-LOGIC-12-workflow-limits`: 26 steps / loop / conditional / unknown predicate => refused `SEC_WORKFLOW_INVALID`.
- `T-LOGIC-13-production-refused`: PRODUCTION => `SEC_PRODUCTION_PROHIBITED`; no unit; no lease.
- `T-LOGIC-14-owner-only-dedupe`: `OWNER_ONLY` violation and `authz.bola.*` on same endpoint => one Finding via `rootCauseGroup`.
- `T-LOGIC-15-no-secrets-in-observations`: recorded observations contain no values outside declared-recordable fields; persisted/log/AI scan for credential/body values => zero matches.
- `T-LOGIC-16-reverify-fresh-fixture-state`: reverify re-checks fixture state and consent, issues fresh leases; revoked consent => `INCONCLUSIVE`, never `PASSED`.

## Resolved additions

- Item 1 (reason gap) -> **L11 / L16**: `SEC_PROBE_CLASS_UNSUPPORTED` adopted for timing-race and unsupported predicates.
- Item 2 (25 vs 50) -> **L13 / FR-075**: 25 everywhere.
- Item 3 (repeats) -> **L14 / FR-118**: <= 3 total executions per action key.
- Item 4 (FR-116 vs FR-128/131) -> **L15 / FR-116**: in-child evaluation over transient observations; persisted `recordMode`; engine-evaluated verdict capped `LIKELY`; `CONFIRMED` needs a fixture-confined oracle.
- Workflow validity -> **`SEC_WORKFLOW_INVALID`** (L11); mutation reservation -> **L9/FR-121 (3 units)**; reverify -> **L4/L5/L24/FR-163/164/169**; endpoint gone -> **`SEC_ENDPOINT_GONE`**.

## Open for closure

1. Owner: data-model needs `StepObservation`, `Step.observations`, `repeat`, `sandbox`, `sensitiveClass`, `recordMode` and the vendored sensitive-endpoint class list (Principle II) in Key Entities.
2. Owner: `WITHIN_QUOTA` is testable only for `n` in 1..2 under the 3-execution cap; confirm (alternative raises the cap, conflicting with FR-118).
3. Owner: security-evidence-contract needs a payload schema for the child-evaluated predicate result inside `SECURITY_CHECK_RESULT` (no new evidence kind proposed).
4. Owner: confirm `SEC_WORKFLOW_INVALID` also covers unknown predicate / unresolvable observation reference (registry text names only cyclic, over 25 steps, missing expected outcomes, mutation without cleanup).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Sandbox tripwire (G-24, FR-117)**: sensitive-class workflows require per-run typed re-confirmation; a live-mode indicator in any response aborts `SEC_MUTATION_NOT_PERMITTED`. Test `T-LOGIC-live-mode-abort`.
2. **VALUE_RECORDED bound (F-14, FR-116)**: redactor + PII scan, length/type cap, refused for secret/PII-matching fields.
3. **Canonical workflow schema (F-20)**: `data-model.md` §4.7; the step category list includes `AUTH_RECOVERY_OBSERVE`. `WITHIN_QUOTA` is testable only for n in {1,2} (accepted limitation); `SEC_WORKFLOW_INVALID` covers an unknown predicate or an unresolvable observation reference.
4. Sensitive-class workflows require the interactive `run.sensitive_confirmed` event at dispatch; non-interactive runs refuse (`SEC_CONSENT_MISSING`); the live-mode tripwire is only a backstop (FR-117).
