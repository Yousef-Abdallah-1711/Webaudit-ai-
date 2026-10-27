# Contract: Authorization Testing (Context G, `authz.*`)

## Status / Ownership

**Status**: PLANNING — NOT FROZEN. **Ownership**: Context G (Authorization Testing Domain). Checks are registry definitions (`authz.*`, FR-146) evaluated parent-side over `PERMISSION_COMPARISON` Evidence; requests are sent by E15 `AUTHENTICATED_WORKFLOW` (baseline/login) and E14 `ACTIVE_SECURITY` (cross-identity request) units, linked by `ExecutionDependency` ordering-only edges (FR-062; plan.md D5; 009 `execution-unit-contract.md` §"One ExecutionUnit per (class, engine)" which names exactly this IDOR example and leaves edge direction to the consuming engine spec).

Per FR-091..FR-097, FR-062, FR-161 (dual-class rule), FR-163/FR-164/FR-169 (reverify), FR-094, FR-096, FR-092, FR-095, FR-097, FR-093, FR-030, plus FR-003, FR-012, FR-055, FR-069..FR-077, FR-119..FR-126, FR-136..FR-141. Reasons only from the plan.md closed `SEC_*` registry or upstream passthrough.

## Consumers

- Security Check Evaluator (`onSecurityEvidenceCommitted`) producing `SECURITY_CHECK_RESULT`; `materializeFinding` (009) for finding verdicts.
- `security-coverage-contract` (roles/identities tested; resource-ownership pairs tested, FR-143).
- `mutation-cleanup-contract` (mutating authz probes, FR-096).
- `api-security-check-contract.md` (inventory/probe eligibility of the operation under test; delegates authorization-boundary families here).
- `security-reverify-contract` (one pair re-run, FR-152).

## Inputs

- Customer-registered data (tenant-owned, Target-bound, environment-scoped; Key Entities): `TestIdentity` (one `TestRole`, <= 1 active credential per kind, FR-030), `CredentialReference` (opaque `credentialBindingRef` only in units), `FixtureResource`, `AuthorizationExpectation`.
- `API_SURFACE` row(s) for the operations under test (`probeEligible:true`, api-discovery-contract.md).
- Grant: `AUTHENTICATED_WORKFLOW` **and** `ACTIVE_SECURITY` listed; `includedAccountRefs`/`includedRoles`/`includedActionCategories` (semantics defined by 012; enforced by `securityScopeGate`, FR-012); environment `STAGING`/`DEVELOPMENT`.
- Broker leases per identity (FR-031..035); never in plan/unit/queue payload.

```text
FixtureResource   = { fixtureId, ownerIdentityRef, environment, targetId, locatorTemplate (operation + fixed identifier slot value held ONLY as registered data),
                      oracle: { kind: MARKER_FIELD | MARKER_ABSENCE_SHAPE | STATE_READBACK | NONE, markerRef },
                      resetMethod, maxMutations (<=3), sandboxAsserted? }
AuthorizationExpectation = { expectationId, subject: {role | identityRef}, operation: apiIdentity | declaredOperationKey,
                      fixtureOwnerIdentityRef, expected: ALLOW | DENY | DENY_OR_NOT_FOUND, version }
PairTest          = { checkId, checkVersion, actorIdentityRef, fixtureId, operation, expectationId, kind: HORIZONTAL | VERTICAL | TENANT_BOUNDARY | FUNCTION_LEVEL }
ObservedOutcomeClass = ALLOWED (2xx) | DENIED (401/403 or auth-redirect class) | NOT_FOUND (404/410) | CLIENT_ERROR_OTHER (other 4xx) | SERVER_ERROR (5xx) | NO_RESPONSE
ShapeOracleResult    = MARKER_PRESENT | MARKER_ABSENT | STATE_CHANGED | STATE_UNCHANGED | ORACLE_UNAVAILABLE
```

The oracle `markerRef` is a customer-declared inert marker (a field name/value class the fixture owner's data is known to carry); the **value** is never stored in Evidence or sent to Fahes UI: only the boolean result and the `markerRef` id are recorded (FR-131).

## Outputs

- `PERMISSION_COMPARISON` Evidence per pair: `{pairId, checkId+version, kind, actorRole, ownerRole, operation(apiIdentity), expectedClass, observedClass, shapeOracleResult, baselineValid:bool, evidenceRefs[], fixtureRef (id only), cleanupRef?, requestCount}`.
- `AUTH_STATE_TRANSITION` (baseline logins; auth-session contract) and sanitized `HTTP_TRANSACTION`.
- `SECURITY_CHECK_RESULT` verdicts (FR-094): `CONFIRMED_VULNERABILITY | LIKELY_VULNERABILITY | INCONCLUSIVE (SEC_FIXTURE_LIMITATION | …) | UNSUPPORTED | NO_ISSUE_DETECTED | NOT_TESTED | BLOCKED`.
- `CLEANUP_RECORD` for mutating probes; `SECURITY_REPRODUCTION` for `CONFIRMED` (request template + observed outcome class + fixture ids only).
- Findings: `Issue.location = METHOD + https://host/path-template` (FR-145); fingerprint parts include `identityRole` and `probeFamily` (FR-141).

## Operations

```text
planAuthzPairs(expectations, fixtures, identities, apiSurface, grants, env) -> AuthzPlan{pairs: PairTest[], skipped[{pair, reason}]}   // parent-side, pure
buildAuthzUnits(plan) -> ExecutionUnit[]  // per identity E15 baseline unit(s) + E14 cross-identity unit(s) + ExecutionDependency edges (ordering only)
runBaseline(unit: E15) -> AUTH_STATE_TRANSITION + PERMISSION_COMPARISON(baseline)                  // login each identity; owner reads own fixture (oracle must be observable)
runCrossIdentity(unit: E14) -> HTTP_TRANSACTION + PERMISSION_COMPARISON                            // actor identity (own lease/session) targets fixture owned by another identity
evaluateAuthz(committedComparison[]) -> SECURITY_CHECK_RESULT[]                                    // pure/synchronous; decision table (inv. 7)
```

Ordered steps:

1. `planAuthzPairs`: for each expectation row, resolve operation (`probeEligible`), actor identity, fixture, owner. Reject unresolved rows with the closed reason (inv. 3). Dedupe pairs by `(checkId, actorIdentityRef, fixtureId, operation)`.
2. `buildAuthzUnits`: one `AUTHENTICATED_WORKFLOW` unit per owner/actor identity group (<= 4 identities per unit, FR-051) running login + owner baseline; one `ACTIVE_SECURITY` unit per ordered batch of cross-identity pairs. `ExecutionDependency` edge `baseline -> cross-identity` gates **ordering and baseline validity only** (FR-062): the dependent unit starts only after baseline units are terminal `COMPLETED`; at its start it reads the committed baseline `PERMISSION_COMPARISON` (`baselineValid`) via tenant-scoped Evidence read — it receives **no session, token, cookie jar or lease** from the baseline unit. Each unit obtains its own broker lease (FR-035, 009 invariants on per-unit lease).
3. Per request FR-055/FR-190 order: Phase A reads incl. `securityScopeGate(identityRef, role, actionCategory, destination)` -> Phase B `LocalBudget.reserve` -> Phase C `safetyCheckpoint(consumes{request:true})` -> write-ahead intent if `C2` -> send via `SecurityHttpClient` -> bounded read -> redact-then-record. **Dual-class rule (FR-161, L2):** the E14 cross-identity request is credentialed *and* crafted (`NEGATIVE_PROBE`), so it is checkpointed twice: primary `safetyCheckpoint(ACTIVE_SECURITY, consumes{request:true})` and secondary `AUTHENTICATED_WORKFLOW` with `consumes{request:false, concurrency:false}`; either `STOP` aborts. E15 baseline requests (login, owner reads, uncrafted replays of a customer-declared fixture operation) are single-class `AUTHENTICATED_WORKFLOW`. 009 plan resolution checks only the unit's primary class, so a missing secondary-class grant surfaces at dispatch as `BLOCKED` (AR-10 RECOMMENDED).
4. Evaluate with the decision table (inv. 7) parent-side after producer units are terminal; claim `sec-check-execution` per FR-147; claim before readiness query.

## Invariants

1. **Fixture-only identifiers (FR-092).** Every object identifier in a request comes from `FixtureResource.identifiers` rendered through the fixture's `locatorTemplate`; response-derived identifiers are never used and a collection locator is refused unless the fixture declares `collection:true` with a maximum size. The engine has no operation that accepts an identifier from elsewhere; a render step that would use an unregistered identifier is refused (`SEC_FIXTURE_INVALID`, request never sent). No incrementing, sequencing, neighboring-ID, dictionary or range logic exists (enumeration is `C5`).
2. **Single Fahes tenant and Target (FR-097).** Identities, credentials and fixtures must share the same `userId` (Fahes tenant), the same `Target` and environment. Tenant-boundary checks use two customer-registered *application tenants* (data partitions inside the customer's own application) within that one Fahes tenant/Target; Fahes never tests across Fahes tenants, and the broker refuses cross-tenant leases (FR-032).
3. **Pre-conditions with closed reasons.** No `AuthorizationExpectation` row -> `NOT_TESTED` / `SEC_EXPECTATION_MISSING`; no fixture -> `NOT_TESTED` / `SEC_FIXTURE_MISSING`; fixture failing validation (wrong target/env/owner, expired, over `maxMutations`) -> `BLOCKED` / `SEC_FIXTURE_INVALID`; identity without role -> `NOT_TESTED` / `SEC_IDENTITY_ROLE_UNMAPPED`; only one identity or no second-owner fixture for a pairwise check -> `INCONCLUSIVE` / `SEC_FIXTURE_LIMITATION`; identity/role outside grant -> `BLOCKED` / `SEC_IDENTITY_NOT_IN_SCOPE`.
4. **Pairwise comparison uses status class AND a shape oracle (FR-093).** Status is mapped to an `ObservedOutcomeClass`; the shape oracle (`MARKER_PRESENT/ABSENT`, `STATE_CHANGED/UNCHANGED`) is evaluated inside the child over the **unredacted in-memory body**, producing only the boolean; the body is then redacted/minimized (FR-128). Status alone never yields `CONFIRMED`.
5. **Baseline validity.** A pair is evaluable only if the owner's baseline (owner reads/acts on own fixture with the same operation) observed `ALLOWED` and the oracle (`MARKER_PRESENT` or `STATE_CHANGED/UNCHANGED` as applicable). Otherwise the pair is `INCONCLUSIVE` / `SEC_FIXTURE_LIMITATION` (baseline invalid), never `NO_ISSUE_DETECTED`.
6. **Vertical/BFLA rule (FR-095).** The actor is only a customer-registered *low-privilege* identity, attempting only operations the customer lists as privileged for that role in the expectation matrix. An admin/high-privilege identity is used **only as fixture owner** (and for owner baseline/readback), never as the actor, and Fahes never requests or uses an administrative credential the customer has not registered for that purpose (`SEC_CREDENTIAL_MISSING`/`SEC_IDENTITY_NOT_IN_SCOPE` otherwise). A privileged *mutating* operation under test is `C2` (inv. 9).
7. **Decision table (deterministic; FR-094):**

   | expected | observed class | shape oracle | baselineValid | Verdict | Reason / note |
   |---|---|---|---|---|---|
   | DENY / DENY_OR_NOT_FOUND | ALLOWED | `MARKER_PRESENT` or `STATE_CHANGED` | yes | `CONFIRMED_VULNERABILITY` | check `confirmable:true`; `SECURITY_REPRODUCTION` attached |
   | DENY / DENY_OR_NOT_FOUND | ALLOWED | `ORACLE_UNAVAILABLE` (oracle kind NONE) | yes | `LIKELY_VULNERABILITY` | status-only evidence stated |
   | DENY / DENY_OR_NOT_FOUND | ALLOWED | `MARKER_ABSENT` / `STATE_UNCHANGED` | yes | `NO_ISSUE_DETECTED` | scoped statement: "fixture marker not returned/changed" |
   | DENY | DENIED | any | yes | `NO_ISSUE_DETECTED` | executed pair only |
   | DENY | NOT_FOUND | any | yes | `NO_ISSUE_DETECTED` for `DENY_OR_NOT_FOUND`; for strict `DENY` -> `INFORMATIONAL` (leaks existence semantics; no exploit claim; L18, no reason code) | |
   | DENY / DENY_OR_NOT_FOUND | SERVER_ERROR / NO_RESPONSE / CLIENT_ERROR_OTHER | any | any | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
   | ALLOW | DENIED / NOT_FOUND | any | yes | `INFORMATIONAL` (expectation mismatch, not a vulnerability) | L18 / FR-094 |
   | any | any | any | no | `INCONCLUSIVE` | `SEC_FIXTURE_LIMITATION` |
   | any | 429 / `Retry-After` | - | - | `BLOCKED` | `SEC_RATE_LIMIT_ENCOUNTERED` |

   A pair for which the check class is unsupported in this target type -> `UNSUPPORTED` / `SEC_UNSUPPORTED_TARGET_TYPE`.
8. **Check taxonomy (ids).** `authz.bola.*` (object-level, horizontal), `authz.bfla.*` (function-level, vertical), `authz.rbac.*` (role matrix), `authz.tenant.*` (tenant boundary), `authz.horizontal.*`, `authz.vertical.*`. Each declares `classification` (mechanically computed: read pairs are `C3`/`C1`-composite; mutating pairs `C2`), `sideEffects[]`, `confirmable`, `rootCauseGroup`.
9. **Mutating authorization probes (FR-096).** Require `FIXTURE_MUTATE` in grant scope, per-mutation-class consent (default OFF), `FixtureResource.maxMutations`, write-ahead `MutationIntent`, cleanup `FIXTURE_CLEANUP` with verification readback (owner reads fixture state), and follow `mutation-cleanup-contract` unchanged. `NO_ISSUE_DETECTED` is forbidden if cleanup failed/unverified (FR-123); a `CONFIRMED`/`LIKELY` finding is kept with cleanup state attached. No cleanup after a stop (FR-122); residual manifest emitted.
10. **ExecutionDependency direction.** Baseline units precede the cross-identity unit. The edge never passes data other than ordering; a baseline unit that did not reach `COMPLETED` (it ended `REFUSED`, `FAILED`, `CANCELLED` or `KILLED`) leaves the dependent unit `BLOCKED` through 009 `finalizeExecutionUnit` step 5 (one level, naming the baseline in `blockedByExecutionUnitId`) and the check `BLOCKED` / `SEC_UPSTREAM_PRODUCER_FAILED`. `SKIPPED` is written only by 009 plan resolution for a false unit precondition (`skippedReason`) and is **never** used for a failed baseline or any other runtime outcome. A baseline unit that ends `COMPLETED` with `baselineValid` false (for example a login that was `BLOCKED`) does not block the dependent unit: the dependent starts, reads the committed `baselineValid` and ends `COMPLETED` with the affected checks `BLOCKED` / `SEC_UPSTREAM_PRODUCER_FAILED`. Edges are additive-only after `RESOLVED` (009 execution-unit inv. 5).
11. **Session isolation (FR-042).** Each identity has an isolated `SessionHost` jar; the actor identity's jar never holds the owner's credentials; units never share a jar. Evidence stores cookie names/flags only (FR-047).
12. **Never touch third-party data (FR-092).** If an in-scope response references resources outside registered fixtures, they are recorded as observation facts (class/count) and never requested; an identifier discovered in a response and not validated against the fixture template is discarded.
13. **Lockout/rate-limit.** Auth attempts per identity <= 3 (hard 5); lockout/429 stops that identity/endpoint for the scan (`SEC_ACCOUNT_LOCKOUT_RISK`, `SEC_RATE_LIMIT_ENCOUNTERED`); no retry to get past it (FR-073/074).
14. **`NO_ISSUE_DETECTED` wording (FR-137).** Always "no issue detected by N executed pairs of check X vN across I identities / F fixtures"; never "authorization is secure".
15. **Coverage honesty.** Pairs planned/executed/skipped(reason), identities and roles actually exercised, and fixture-limitation counts are reported (FR-143); a scan with 1 identity yields `SEC_FIXTURE_LIMITATION` everywhere and the module `DEGRADED`.

## Safety & Authorization

- **F01**: both `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW` grants required (one grant listing both, or two grants, FR-161); PRODUCTION/unclassified refused at plan time, broker, scope gate and dispatch (FR-078; `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`). Per-class independent checks (007 FR-006); grants never combined.
- **Action categories**: baseline `AUTH_LOGIN`, `AUTH_LOGOUT`, `READ`; cross-identity read pair `NEGATIVE_PROBE`; mutation `FIXTURE_MUTATE`, `FIXTURE_CLEANUP`. `securityScopeGate` refuses an identity/role/category outside the grant's `includedAccountRefs/Roles/ActionCategories` when listed (FR-011, FR-012; named limitation: enforced by 012, not F01).
- **F07**: every login, request, redirect hop, mutation and cleanup is a `safetyCheckpoint` (FR-077); a mutation locally reserves **3** request units: the mutation, the cleanup and the verification read (FR-121, L9). After any stop: no further admission, no cleanup attempt.
- **Credentials**: leases via broker per unit; fail closed on `SEC_BROKER_UNAVAILABLE`; no secret in plan/unit/queue/log/Evidence/AI (FR-024).
- Destinations: from `API_SURFACE` authority + fixture locator only, each passed through `isInScope` + safe-net (FR-079); cross-origin redirects not followed (FR-081).
- AI never chooses pairs, identifiers, verdicts, or sees fixture identifiers beyond redacted classes (FR-144).

## Failure states

| Condition | Verdict / status | Reason |
|---|---|---|
| Missing expectation row | `NOT_TESTED` | `SEC_EXPECTATION_MISSING` |
| Missing fixture | `NOT_TESTED` | `SEC_FIXTURE_MISSING` |
| Fixture invalid (wrong target/env/owner, expired, locator mismatch) | `BLOCKED` | `SEC_FIXTURE_INVALID` |
| Identity has no role | `NOT_TESTED` | `SEC_IDENTITY_ROLE_UNMAPPED` |
| Single identity / no second owner / baseline invalid | `INCONCLUSIVE` | `SEC_FIXTURE_LIMITATION` |
| Identity/role not in grant | `BLOCKED` | `SEC_IDENTITY_NOT_IN_SCOPE` |
| Action category not granted | `BLOCKED` | `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| Mutation consent missing / mutation refused | `BLOCKED` | `SEC_CONSENT_MISSING` / `SEC_MUTATION_NOT_PERMITTED` |
| PRODUCTION / unclassified | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Credential missing/expired/revoked/rejected/rate-limited/scope-invalid | `BLOCKED` | `SEC_CREDENTIAL_*` (FR-036) |
| MFA challenge on identity | `BLOCKED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` / `SEC_MFA_TIMEOUT` |
| Lockout signal | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` |
| 429/`Retry-After` | `BLOCKED` | `SEC_RATE_LIMIT_ENCOUNTERED` |
| Local budget exhausted | `BLOCKED` | `SEC_BUDGET_LOCAL_*` |
| F07 admission refused / kill | unit per 009; pair `BLOCKED` | `BUDGET_EXHAUSTED_REQUEST`, `BUDGET_EXHAUSTED_CONCURRENCY`, `KILL_SWITCH_PENDING` verbatim; F01 reasons verbatim |
| Broker unreachable | `BLOCKED` | `SEC_BROKER_UNAVAILABLE` |
| Baseline unit not `COMPLETED` (dependent unit status `BLOCKED`, never `SKIPPED`) | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Baseline unit `COMPLETED` but `baselineValid` false (dependent unit starts and ends `COMPLETED`) | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Redirect off scope | observation | `SEC_REDIRECT_OUT_OF_SCOPE` |
| 5xx/timeout/transport error | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Cleanup failed / unverified | `INCONCLUSIVE` (no `NO_ISSUE_DETECTED`) | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Mutation sent, outcome unknown | FLAG; fixture residual | `SEC_MUTATION_SENT_UNCONFIRMED` / `SEC_RESIDUAL_FIXTURE` |
| Operation unsupported target type | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE` |
| Evaluator threw or overran | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Secondary-class (`AUTHENTICATED_WORKFLOW`) checkpoint refused at dispatch for an E14 credentialed request | `BLOCKED` | F01 reason verbatim (FR-161) |
| Feature gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |

## Idempotency & retry

- Pair identity `(planId, checkId, checkVersion, apiIdentity, actorIdentityRef, fixtureId, probeIndex)` -> FR-148; claim `sec-probe-attempt` before each cross-identity send; a recovered unit never resends a pair whose `SENT` intent exists; `C2` steps use write-ahead `MutationIntent` (`state` `INTENDED -> SENT -> CONFIRMED | SENT_UNCONFIRMED`, or `ABANDONED` when never sent, plus `cleanupState` `NOT_REQUIRED | PENDING | REVERTED | RESIDUAL | ACKNOWLEDGED`, FR-120).
- `maxAttempts: 1`; no retry of any non-idempotent request; an idempotent read retry at most once (LOCAL), consuming budget with a new `idempotencyKey` (FR-057).
- Lease replay denied (`SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`); recovery obtains a new attempt/lease only where idempotence is proven (FR-035).
- Evidence writes claim `sec-evidence-write` (FR-135); `evaluateAuthz` claims `sec-check-execution` first (FR-147).

## Evidence

`PERMISSION_COMPARISON` (primary), `AUTH_STATE_TRANSITION`, sanitized `HTTP_TRANSACTION` (names/status/shape only), `CLEANUP_RECORD`, `SECURITY_CHECK_RESULT`, `SECURITY_REPRODUCTION` (confirmed only). Fixture identifiers appear as ids/classes, never values; marker values never stored; redaction pre-pass registers every credential/session/CSRF token value in play as a known secret before the first request (FR-128). Redaction failure -> `{"_redactionFailed": true}` (FR-129). Evidence written only through the fenced wrapper (FR-058).

## Budgets / limits (F07 vs LOCAL)

- **F07-authoritative**: requests (E14 <= 300/unit, E15 <= 150/unit provisional), concurrency (<= 2 / 1 per identity), grant expiry.
- **LOCAL (not F07-ledgered, FR-070)**: per endpoint <= 8; per identity <= 100; per workflow <= 60; **per pair <= 6 requests** (baseline read, actor request, optional readback, optional cleanup; **provisional, new**, see additions); auth attempts <= 3/identity (hard 5); mutations <= 3/fixture, <= 10/unit; response read <= 256 KiB; total bytes <= 32 MiB/unit; redirects 0 cross-origin/<= 3 planned same-origin hops; inter-request delay 500 ms (`C3`) / 250 ms (`C1`); identities <= 4/unit; unit time: E15 `timeoutPolicyMs` 900 000 (+60 000 margin), E14 600 000 (+60 000).

## Reverify

`FRESH_MINIMAL_PLAN` single-pair re-run (FR-152), routed to the 009 REVERIFY path before the legacy resolver (FR-164), as **one E14 unit** in which every credentialed request carries the dual-class checkpoint (FR-161, L2; no separate E15 unit): fresh F01 (concrete destination bound from `Issue.location` by `parseSecurityLocation`, method ignored; unbindable => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`, FR-163), fresh F07 admission, **fresh broker leases** for both identities (revalidating existence, expiry, revocation, version), fresh baseline read, one actor request; mutating reverify needs current consent and a fresh fixture state check. `PASSED` only when the executed pair observed the expected deny with a valid baseline; `INCONCLUSIVE` (`SEC_CREDENTIAL_*`, `SEC_FIXTURE_INVALID`, `SEC_FIXTURE_LIMITATION`, `SEC_ENDPOINT_GONE` when the operation no longer exists, upstream reasons verbatim, `SEC_REVERIFY_UNVERIFIABLE`) otherwise, mapped to Issue `UNVERIFIABLE` (FR-164); billing per FR-169 (P14 PROVISIONAL); original findings/evidence preserved and linked.

## Boundary rules (MUST NOT)

1. MUST NOT enumerate, guess, increment, derive or scrape object identifiers, or request any resource not registered as a `FixtureResource` (or validated same-unit fixture response).
2. MUST NOT access, test, or infer anything about third-party data, other Fahes tenants, or resources of the customer outside registered fixtures.
3. MUST NOT use an administrative or any identity as *attacker* other than the customer-registered low-privilege one; MUST NOT request or create credentials.
4. MUST NOT pass a session, token, jar or lease between units; MUST NOT use `ExecutionDependency` as a data channel.
5. MUST NOT decide a verdict from status code alone, or `CONFIRMED` without `confirmable:true` and a fixture-confined oracle; MUST NOT use AI for any decision.
6. MUST NOT report `NO_ISSUE_DETECTED` when baseline invalid, cleanup failed/unverified, or pair not executed; MUST NOT render "secure".
7. MUST NOT mutate without `FIXTURE_MUTATE`, consent, write-ahead intent and cleanup verification; MUST NOT clean up after a stop.
8. MUST NOT retry non-idempotent requests, race, flood, or exceed per-pair/endpoint limits; MUST NOT continue after lockout/429.
9. MUST NOT run against PRODUCTION/unclassified targets or on `SOURCE_EXECUTION` Guests.
10. MUST NOT store marker values, identifiers' raw values beyond fixture ids, credentials, or full bodies.

## Named limitations

- Correctness depends on the customer-declared `AuthorizationExpectation` matrix and fixture oracle; a wrong matrix produces wrong comparisons (Fahes does not infer roles or expectations, FR-030).
- Authorization implemented via filtering (200 with empty/other data) is detected only when an oracle is declared; with `NONE` the best outcome is `LIKELY` for allow-class responses.
- `CONFIRMED` is limited to fixture-confined proof; broader exposure cannot be confirmed without unsafe activity (capped, `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` flag where applicable).
- Action-category/account/role enforcement is by 012's `securityScopeGate` and conformance tests, not F01 (AR-1 optional hardening).
- A kill during a mutating request may complete remotely (008 FR-014); fixture marked `RESIDUAL_UNKNOWN`.
- Cross-domain (different registrable domain) authorization flows and authenticated-browser authorization tests are `UNSUPPORTED` in v1.

## FR traceability

FR-091 (scope of checks), FR-092 (fixture-only), FR-093 (matrix + oracle), FR-094 (outcomes), FR-095 (vertical), FR-096 (mutating), FR-097 (tenant boundary), FR-062 (composite units), FR-030 (roles), FR-011/012 (categories/gate), FR-051 (<= 4 identities), FR-055/057/069..077 (request path/budgets), FR-119..126 (mutation/cleanup), FR-136..141, FR-145, FR-148, FR-151..153, FR-127..135, FR-161 (dual-class), FR-163/164/169 (reverify binding/routing/billing), FR-122/FR-162 (residual manifest by finalizer), FR-165 (no AI findings).

## Acceptance tests required (named; deterministic; fixture-based; not executed in this pass)

- `T-AUTHZ-01-bola-confirmed`: fixture API with deliberate BOLA; expectation DENY, observed ALLOWED, marker present, baseline valid => `CONFIRMED`; `SECURITY_REPRODUCTION` holds only template+class.
- `T-AUTHZ-02-bfla-confirmed-readback`: low-priv identity invokes privileged mutating op on admin-owned fixture; owner readback shows change => `CONFIRMED`; cleanup verified; request count <= per-pair limit.
- `T-AUTHZ-03-status-only-likely`: oracle kind NONE, ALLOWED => `LIKELY`, never `CONFIRMED`.
- `T-AUTHZ-04-filtering-secure`: 200 with marker absent, baseline valid => `NO_ISSUE_DETECTED` with scoped statement; baseline invalid => `INCONCLUSIVE SEC_FIXTURE_LIMITATION`.
- `T-AUTHZ-05-single-identity`: one identity => every pair `INCONCLUSIVE SEC_FIXTURE_LIMITATION`; module `DEGRADED`; zero cross-identity requests.
- `T-AUTHZ-06-no-unregistered-id`: request renderer given an unregistered identifier / a response-derived id not matching the fixture template => refused `SEC_FIXTURE_INVALID`; network spy shows zero requests outside fixtures; no incrementing logic present.
- `T-AUTHZ-07-admin-never-attacker`: matrix attempting admin as actor => refused; admin appears only as owner.
- `T-AUTHZ-08-composite-ordering-only`: ordering edge present, dependent unit holds no baseline session/lease (own lease issued), baseline unit `REFUSED`/`FAILED`/`CANCELLED`/`KILLED` => dependent unit `BLOCKED` (never `SKIPPED`, with `blockedByExecutionUnitId`), check `BLOCKED SEC_UPSTREAM_PRODUCER_FAILED`; baseline `COMPLETED` with `baselineValid` false => dependent unit `COMPLETED`, affected checks `BLOCKED SEC_UPSTREAM_PRODUCER_FAILED`.
- `T-AUTHZ-09-tenant-boundary-same-fahes-tenant`: fixtures from a different Fahes tenant/Target rejected `SEC_FIXTURE_INVALID`; broker denies cross-tenant lease.
- `T-AUTHZ-10-scope-gate-category-matrix`: each action category absent from grant => `SEC_ACTION_CATEGORY_NOT_GRANTED`; identity/role outside `includedAccountRefs/Roles` => `SEC_IDENTITY_NOT_IN_SCOPE`; internal gate error fail-closed `SEC_SCOPE_GATE_ERROR`.
- `T-AUTHZ-11-mutation-cleanup-failure`: cleanup fails => `INCONCLUSIVE SEC_CLEANUP_FAILED`, residual manifest, finding (if any) kept with cleanup state; no `NO_ISSUE_DETECTED`.
- `T-AUTHZ-12-kill-during-pair`: kill switch => no further request or cleanup, residual manifest, unit `KILLED`, leases destroyed.
- `T-AUTHZ-13-lockout-429`: lockout/429 on actor => identity/endpoint stops, `BLOCKED`, no retry.
- `T-AUTHZ-14-crash-no-duplicate`: crash after `SENT` => recovery does not resend; fixture flagged `SEC_MUTATION_SENT_UNCONFIRMED`.
- `T-AUTHZ-15-production-refused`: PRODUCTION => `SEC_PRODUCTION_PROHIBITED` at plan, broker, scope gate; zero units.
- `T-AUTHZ-16-no-secret-leak`: scan of all persisted/log/queue/AI-prompt surfaces for registered credential/marker values => zero matches.
- `T-AUTHZ-17-reverify-fresh-leases`: reverify issues new leases and baseline in a single E14 unit with dual checkpoints; revoked credential => `INCONCLUSIVE SEC_CREDENTIAL_REVOKED`; never `PASSED`.
- `T-AUTHZ-18-dual-class-checkpoint`: cross-identity request checkpointed under both classes; secondary `STOP` aborts the request; grant lacking `AUTHENTICATED_WORKFLOW` => `BLOCKED` at dispatch; E15 baseline uses a single checkpoint.

## Resolved additions

- Item 1 (ALLOW expected / DENIED observed) -> **L18 / FR-094**: `INFORMATIONAL` (or `INCONCLUSIVE`/`SEC_FIXTURE_LIMITATION` if baseline invalid).
- Item 2 (2xx, marker absent, valid baseline) -> **L18 / FR-094**: scoped `NO_ISSUE_DETECTED`.
- Item 3 (credentialed crafted request class) -> **L2 / FR-161**: E14 unit with dual-class checkpoint; reverify = single E14 unit; AR-10 RECOMMENDED.
- Item 6 (strict `DENY` with 404) -> **L18 / FR-094**: `INFORMATIONAL`, no reason code required.
- Mutation request units -> **L9 / FR-121**: 3. Reverify -> **L4/L5/L24**, endpoint gone -> **`SEC_ENDPOINT_GONE`**.

## Open for closure

No item is open. The per-pair request limit is decided in Consolidated repairs item 4 and the oracle vocabulary in item 2 (`FixtureResource.markerSpec`, data-model 4.6).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Cross-identity replay is crafted (G-11)**: it runs in an E14 unit under dual-class checkpointing (FR-161); same-identity baseline reads run in E15.
2. **Oracle (G-17, F-3)**: `FixtureResource.markerSpec`; marker >= 16 characters, registered in the exact-value registry; `CONFIRMED` needs the marker present for the actor **and** absent in the actor's negative-control read for the pair. Test `T-AUTHZ-marker-field-name-not-enough`.
3. **Identifiers (G-27)**: only `FixtureResource.identifiers`; response-injected identifiers and collection locators refused. Test `T-AUTHZ-06` extended.
4. **Per-pair limit**: 6 requests for read-only pairs (baseline, probe, negative control); a mutating pair follows the mutation contract (3 reserved units per mutation) within 9 requests.
5. **Reverify**: single E14 unit with dual checkpoint (L2).
6. Identifiers come only from `FixtureResource.identifiers`; response-derived identifiers are never used.
7. Every request of an authorization pair passes the admission order (FR-190) and the egress gate (FR-175, FR-199); the cross-identity request is an E14 dual-class request (FR-161); the secondary-class checkpoint grant id is compared with the gate's secondary-class grant id (FR-195).
