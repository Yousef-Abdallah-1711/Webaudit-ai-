# Contract: API Security Checks (Context H, `api.*`)

## Status / Ownership

**Status**: PLANNING — NOT FROZEN. **Ownership**: Context H (API Security Testing Domain), checking half. Check definitions live in the vendored Security Check Registry (`packages/security-registry/`, FR-146); static checks are evaluated parent-side; active probes are executed by E14 `ACTIVE_SECURITY` units (`security.active.*`, plan.md class fill 1-18).

Per FR-101, FR-102, FR-103, FR-104, FR-100, FR-006..FR-012, FR-066, FR-067, FR-070..FR-077, FR-106 (pointer), FR-110 (pointer), FR-136..FR-141, FR-146..FR-150. Reasons only from the plan.md closed `SEC_*` registry or upstream passthrough.

## Consumers

- Security Check Evaluator (`onSecurityEvidenceCommitted`, FR-147) for the static families; `apps/worker/src/security/` E14 unit host for the active families.
- `probe-family-contract.md` (CORS, injection/XSS/CSRF, security-config semantics and ladders are owned there; this contract applies them *per operation*).
- `authorization-testing-contract.md` (owns BOLA/BFLA/tenant checks; `api.authz.*` ids are *not* defined here).
- `security-coverage-contract` (`securityCoverageSummary`: probe families executed, endpoints tested/skipped).
- `security-reverify-contract` (`reverifyBehavior: FRESH_MINIMAL_PLAN`, FR-152, one probe family per plan).

## Inputs

- `API_SURFACE` rows (api-discovery-contract.md): only rows with `probeEligible:true` feed active families; all rows feed static families.
- The stored OpenAPI `ApiDescriptionDocument` (FR-168; operation schema, security schemes, response schemas, versioning) — read by pointer from `API_SURFACE.sourceRefs`.
- Passive HTTP Evidence (`HTTP_TRANSACTION`, `HAR`) already captured, for passive observations.
- `ProbeDefinition` records from the registry (versioned, vendored; closed alphabet, inv. 7).
- Active grant context: F01 verdict for `ACTIVE_SECURITY` (plus `AUTHENTICATED_WORKFLOW` when the probe carries a credential, FR-161), action categories (`READ`, `NEGATIVE_PROBE`; `FIXTURE_MUTATE` only for declared mutating probes), environment classification, optional `credentialBindingRef` (only for probes that need an identity; see `authorization-testing-contract.md`).
- Customer operation declarations: `ApiOperationDeclaration` records (data-model 4.9C, FR-192): `declaredClass` `READ_ONLY | FIXTURE_CONFINED`, `fixtureResourceId?`, `protectedMarkerRef?` (a `FixtureResource` marker used as confirmation oracle), `unsafeMethodAcknowledged`; they enter the unit as `OPERATION_DECLARATION` manifest items (FR-200).

## Outputs

- `SECURITY_CHECK_RESULT` per `(checkId, checkVersion, apiIdentity[, probeIndex])` with the 012 verdict set (FR-136): `CONFIRMED_VULNERABILITY | LIKELY_VULNERABILITY | CONFIGURATION_RISK | INFORMATIONAL | NO_ISSUE_DETECTED | INCONCLUSIVE | NOT_TESTED | BLOCKED | UNSUPPORTED`.
- `HTTP_TRANSACTION` Evidence (sanitized; request metadata, status, header names, body **shape**, FR-128/130) from E14.
- Findings via 009 `materializeFinding` for the four finding verdicts only (FR-139), `Issue.location = METHOD + https://host/path-template` (FR-145).
- Coverage facts: probes planned / executed / skipped per operation with reasons.

## Operations

```text
planApiProbes(apiSurfaceRows, grants, env, registry, localLimits) -> ApiProbePlan                  // parent-side, pure; probe-eligibility gate inside
evaluateStaticApiChecks(apiSurfaceRows, apiDescriptionDocument) -> SECURITY_CHECK_RESULT[]                    // C0, no request
runApiProbes(unit: ExecutionUnit{ACTIVE_SECURITY}, plan: ApiProbePlan) -> HTTP_TRANSACTION[]        // E14 child; one request = scope gate -> LocalBudget -> safetyCheckpoint -> send
evaluateActiveApiChecks(committedEvidence, plan) -> SECURITY_CHECK_RESULT[]                         // parent-side, pure/synchronous over committed Evidence (FR-147)
renderProbe(probeDef, operation, indexSeed) -> RenderedRequest | ProbeRefusal                       // deterministic; destination parameterized from authorized inputs only (FR-149)
```

Ordered steps (`planApiProbes`):

1. For each `API_SURFACE` row and each registered check applicable to the operation (`targetApplicability`), compute the check **classification mechanically** from the probe definition (FR-007): no crafted request => `C0`; crafted read-only => `C1`; state-changing => `C2` (fixture-confined only); credential use => `C3` (see authorization contract); a credentialed *crafted* request is executed by E14 under the dual-class rule (FR-161: primary `ACTIVE_SECURITY` + secondary `AUTHENTICATED_WORKFLOW` checkpoint, both classes must be granted), whereas the unauthenticated probes in this contract carry no credential and use the single `ACTIVE_SECURITY` checkpoint. A declared class that differs is a registry load error, not a plan-time decision.
2. **Probe-eligibility gate (inv. 1)** in order; first failing step records the skip with its reason and stops processing that probe.
3. Cap probes per operation (inv. 8); order deterministically by `(checkId, probeId)`; excess probes are dropped as `BLOCKED`/`SEC_BUDGET_LOCAL_ENDPOINT` (coverage-visible).
4. Group eligible probes into `ACTIVE_SECURITY` units (unit templates from Context A, FR-001/FR-002); one unit configuration lists `(checkId+version, apiIdentity, probeIndex, identityRef?)` plus the input manifest `configuration.x012.inputs` (FR-200: the `API_SURFACE_ROW`s, description documents, operation declarations, fixture, role and identity versions, security-config versions and the registry version this unit's steps derive from, each with its content digest and the `rootDigest` covered by the unit MAC as `inputsRootDigest`) — no payload strings. The Plan Resolver computes the manifest at resolution from **persisted** `API_SURFACE` rows only (evidence produced during this plan is never an input, FR-063) and refuses cross-tenant, newer-than-resolution or stale items; the **parent** verifies every digest over the raw bytes before parsing, renders the `PlanStepTable` from the registry and the verified inputs at unit start and the child only names steps (FR-066, FR-200).

Ordered per-request steps in the E14 child follow FR-055/FR-190 exactly (Phase A reads incl. scope gate, Phase B `LocalBudget.reserve`, Phase C `safetyCheckpoint`, mutation intent if `C2`, `SecurityHttpClient` send, bounded read, redact-then-record). This contract adds no step.

## Check catalog (families, id prefixes, class, evidence, ladder)

Every id is `api.<family>.<name>`; `version` per FR-150. `C0` = static/spec-based or passive; `C1+` = active. A family's active and static halves are **separate check ids** so coverage can state "static executed, active blocked".

| Family | Prefix | Static half (C0) | Active half (C1+) | Default max verdict | Owner of ladder |
|---|---|---|---|---|---|
| Auth enforcement | `api.auth.*` | write op without declared security; undefined/unknown scheme; weak scheme declared (`http` basic over non-TLS server) | unauthenticated request to op the spec says requires auth (credential absent) | static: `CONFIGURATION_RISK`; active: `LIKELY`, `CONFIRMED` only with fixture marker oracle (`confirmable:true`) | this contract |
| Authorization boundaries | `authz.*` (not `api.*`) | - | pairwise identities | per authz contract | `authorization-testing-contract.md` |
| Request validation | `api.val.*` | missing constraints on user-supplied fields (no `maxLength`/`maximum`/enum) | closed-alphabet boundary/wrong-type/extra-property/unexpected-content-type | static: `INFORMATIONAL`/`CONFIGURATION_RISK`; active: `CONFIGURATION_RISK` (accepted invalid input), `LIKELY` never | this contract |
| Response data exposure | `api.exp.*` | response schema declares sensitive-named fields (classifier) for unauth/low-priv ops | observed response shape vs declared schema; sensitive-class value flags (redacted) | `CONFIGURATION_RISK`; `LIKELY` if sensitive class observed in an op declared public/low-priv | this contract |
| Excessive data exposure | `api.exp.excess-*` | schema `additionalProperties` open + sensitive name classes | observed fields not in declared schema | `CONFIGURATION_RISK` | this contract |
| Error handling | `api.err.*` | error schema absent/inconsistent | disclosure classes in error bodies (stack-trace shape, framework banner, internal path class, engine name) | `CONFIGURATION_RISK`; `INFORMATIONAL` for banner only | this contract + `probe-family-contract.md` signature rules |
| Security headers | `api.hdr.*` | - | passive: API responses already observed | `CONFIGURATION_RISK` | this contract; value parsing shared with `sec.cfg.*` (no duplicate finding, inv. 12) |
| CORS | `api.cors.*` | spec `x-` / servers hints only (informational) | passive C0 from observed responses; crafted-Origin C1 | HIGH cap | `probe-family-contract.md` (FR-110) |
| Rate-limit observation | `api.rl.*` | spec declares no limit documentation | **passive only**: rate-limit headers on ordinary responses | `INFORMATIONAL` | this contract (FR-103); active = `UNSUPPORTED` |
| Schema violations | `api.schema.*` | spec internally inconsistent (example vs schema shape, not values) | response vs declared schema (type/required/enum classes) | `INFORMATIONAL` (quality) / `CONFIGURATION_RISK` when violation exposes data class | this contract |
| Unsafe defaults | `api.unsafe.*` | server `http://` only, no auth scheme at all, wildcard server variable, debug/admin-named paths documented, verbose methods (TRACE) listed | `OPTIONS`/`Allow` observation only if passive | `CONFIGURATION_RISK` | this contract |
| Resource ownership | `authz.*` | - | fixture pairs | per authz contract | `authorization-testing-contract.md` |
| API versioning risks | `api.ver.*` | deprecated and current versions both exposed; unversioned alongside versioned; deprecated op still declares weaker auth | observe whether deprecated version path responds (a `READ` probe against an in-scope, eligible deprecated operation only) | `CONFIGURATION_RISK` | this contract |

Verdict ladder (all `api.*`):

- `CONFIRMED_VULNERABILITY` **only** where the registry entry declares `confirmable:true` and the oracle (fixture marker returned to an identity/credential-less request) matches (FR-140); never from status code alone, never from AI.
- `LIKELY_VULNERABILITY`: evidence-backed behavioral contradiction of the declaration without an oracle (e.g. unauthenticated 2xx on an op declared as requiring auth, response-shape non-error).
- `CONFIGURATION_RISK`: static or observed weak configuration with no exploit claim; severity cap per check, `<= HIGH`, MEDIUM for most (FR-138).
- `INFORMATIONAL`: observation worth recording; severity `INFO`.
- `NO_ISSUE_DETECTED`: only for executed probes/checks, rendered with the FR-137 statement ("no issue detected by N executed probes of check X vN against E endpoints"); never PASS/secure.
- `INCONCLUSIVE`: `SEC_SIGNAL_WEAK` (unrecognized response class), `SEC_RESPONSE_AMBIGUOUS` (transport error/timeouts/redirect not followed), 3xx to out-of-scope recorded as observation.
- Not finding verdicts (`NOT_TESTED/BLOCKED/UNSUPPORTED`): coverage only (FR-139).

## Invariants

1. **Probe-eligibility gate (FR-100, FR-003, FR-013).** An operation is probe-eligible for an active check iff, evaluated in this order: (a) `API_SURFACE.scopeVerdict == IN_SCOPE`; (b) Target environment is `STAGING`/`DEVELOPMENT` (PRODUCTION/unclassified => `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`); (c) F01 grant lists `ACTIVE_SECURITY` (`UNAUTHORIZED_CLASS` => `SEC_API_NOT_AUTHORIZED`, F01 reason as `upstreamReason`); (d) required action category listed (`SEC_ACTION_CATEGORY_NOT_GRANTED`); (e) feature flag/gates on (`SEC_ENGINE_DISABLED`); (f) if the probe is mutating: consent for the mutation class, `fixtureConfined:true`, `FIXTURE_MUTATE` in scope (`SEC_CONSENT_MISSING` / `SEC_MUTATION_NOT_PERMITTED`); (g) local budgets (`SEC_BUDGET_LOCAL_*`). Eligibility is re-evaluated at dispatch and per request (FR-003); no result is cached across actions.
2. **Static before active.** A `C0` check never emits a request and never depends on an active check's outcome. An active check is never required for a static verdict. Static results exist in production; active checks do not.
3. **HTTP method is not the classification (FR-007).** `GET` operations are not assumed safe: an operation declared `FIXTURE_CONFINED`/state-changing by the customer is `C2`. `POST` is not assumed destructive: a customer-declared `READ_ONLY` search POST (with `unsafeMethodAcknowledged`) is `C1`. An operation with **no** current `ApiOperationDeclaration` is treated as potentially mutating for **every** method, including `GET`/`HEAD`/`OPTIONS`: active probes are **refused** (`SEC_MUTATION_NOT_PERMITTED`, coverage-visible), never silently downgraded. Static checks still run.
4. **Probe definitions are data (FR-066).** A `ProbeDefinition` is `{probeId, version, family, targetParameterSelector, alphabetClass, expectedObservation, oracle?, abortConditions[], idempotent, mutates}`. No code, no templates evaluated at runtime, no downloaded corpus. The renderer substitutes only into declared slots and enforces `maxRequestBytes`/`maxHeaderCount` (FR-067).
5. **No fuzzing (FR-102).** No random mutation, no seed-driven value generation, no corpus, no iteration beyond the finite registry list. Rendered values are deterministic functions of `(probeId, operation schema)`.
6. **Closed harmless alphabet** (v1; classes only, no literal payloads are specified in this contract): `ABSENT_OPTIONAL` (omit an optional field), `EMPTY_VALUE` (empty string/array/object where the type allows), `MAXLEN_MINUS_ONE` and `MAXLEN_PLUS_ONE` (boundary around the schema `maxLength`/`maxItems`, capped at 1 024 elements/characters; absent constraint => no length probe, recorded as static finding input), `NUMERIC_BOUNDARY_MINUS_ONE/PLUS_ONE` (around schema `minimum`/`maximum` only when declared; **proposed**, see additions), `WRONG_TYPE` (a value of a different JSON type from the declared one), `EXTRA_PROPERTY` (one additional inert property named from a fixed token `fh<ID>`), `UNEXPECTED_CONTENT_TYPE` (request content type different from those declared). A probe may combine exactly one alphabet class with otherwise-valid baseline values; injection/XSS canary classes are owned by `probe-family-contract.md` and are not part of this alphabet.
7. **Probe lint (registry load, SG6).** The loader rejects any probe whose values are not generated from the classes above, whose destination is not parameterized from authorized inputs (`API_SURFACE.apiIdentity` host), that lacks `abortConditions`, that includes a time-delay primitive, file/network reference or command-separator construct, or that mutates without cleanup (FR-149).
8. **Max probes per operation: 8 (provisional, FR-102).** The per-endpoint local request limit is also 8 (plan.md §Budgets) and a baseline request, if needed, counts toward it; therefore planned probes + baseline <= 8 per operation per unit. Overflow is dropped in deterministic order and recorded `SEC_BUDGET_LOCAL_ENDPOINT` (never silently).
9. **Rate-limit probing is passive-only (FR-103).** `api.rl.*` reads rate-limit/`Retry-After` headers and 429s from ordinary or already-sent probe responses; no request is ever sent to elicit a limit. An *active* rate-limit probe is a `UNSUPPORTED` registry entry with no probe definition (FR-010). Any 429/`Retry-After` observed during an active probe pauses that endpoint+identity for the unit (`SEC_RATE_LIMIT_ENCOUNTERED`, FR-073) and the remaining probes for it are `BLOCKED`.
10. **Response exposure on redacted shapes (FR-104).** `api.exp.*` evaluates `{fieldPath, jsonTypeClass, valueClassFlags[], lengthClass}` extracted by a parse-then-redact step in the child; the sensitive-field classifier is vendored/versioned (name classes: credential-like, token-like, personal-id-like, payment-like, internal-id-like; value classes from `@webaudit/redaction` detectors). Values are never stored; a "sensitive value observed" fact is `{kind, location, lengthClass}` only (FR-131).
11. **Response bodies are untrusted data** (FR-134): parsed with bounded depth/size; never interpreted; never rendered as HTML; never sent to AI unredacted.
12. **Non-duplication.** `api.hdr.*`/`api.cors.*` observations on a response already assessed by `sec.cfg.*` (probe-family-contract) share a `rootCauseGroup`; every check in the group passes the group's canonical `checkId` to `fingerprintOf` (parts exclude `checkId`, L6/FR-141) and yields **one** Finding; 010 SEO/Web checks are not duplicated (FR-109).
13. **Redirects.** Active probes use the 012 redirect policy (FR-081): cross-origin hops are never followed; a same-origin hop is followed only as a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation (FR-200(e)), fully re-admitted, and consumes budget; a hop out of scope records `SEC_REDIRECT_OUT_OF_SCOPE` as an observation.
14. **Ordering invariant of request path** per FR-055 is unchanged and tested by the engine contract; this contract adds the planner-side requirement that the planned request count never exceeds the unit's local limits.
15. **Retention of evidence** follows FR-132; query strings are redacted to names only.

## Safety & Authorization

- **F01**: `ACTIVE_SECURITY` grant required for every `C1+` check (FR-008); PRODUCTION prohibited unconditionally (007 FR-015a, FR-078). `securityScopeGate(identityRef?, role?, actionCategory, destination)` runs before each F07 checkpoint (FR-012). Unauthenticated probes use `NEGATIVE_PROBE`; read-only observation uses `READ`.
- **F07**: every request, redirect hop and mutating step is a `safetyCheckpoint` call site (FR-077); F07 is authoritative for requests and concurrency (<= 2 in flight for E14, <= 300 requests/unit; FR-069/plan.md §Budgets).
- **Production**: only static and passive families (`api.*` `C0`) execute; all `C1+` halves are `BLOCKED` with `SEC_PRODUCTION_PROHIBITED`; module result `DEGRADED` (FR-142).
- Destination for every request = `API_SURFACE` authority passed `isInScope` + safe-net layers 1-4 (FR-079); no destination is taken from response content or `servers[]` alone (FR-083).
- Mutation: any step that could change state is C2 via `mutation-cleanup-contract` (write-ahead intent, cleanup verification); default OFF.
- AI is excluded from probe selection, rendering, verdict and severity (FR-065, FR-144).

## Failure states

| Condition | Verdict / status | Reason |
|---|---|---|
| Production / unclassified target | `BLOCKED` (active halves) | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Op in inventory but not probe-eligible (class not granted) | `BLOCKED` | `SEC_API_NOT_AUTHORIZED` (+ F01 reason verbatim as detail) |
| Op `OUT_OF_SCOPE` | skipped; `BLOCKED` | F01 `OUT_OF_SCOPE` verbatim or `SEC_DESTINATION_PROHIBITED` |
| Action category not in grant | `BLOCKED` | `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| Mutating/undeclared-method probe refused | `BLOCKED` | `SEC_MUTATION_NOT_PERMITTED` or `SEC_CONSENT_MISSING` |
| Scope gate internal error | `BLOCKED` | `SEC_SCOPE_GATE_ERROR` |
| Local request/endpoint/bytes/duration limit hit | `BLOCKED` (remaining probes) | `SEC_BUDGET_LOCAL_REQUESTS` / `_ENDPOINT` / `_BYTES` / `_DURATION` |
| F07 budget/concurrency/kill | unit ends per 009; probe `BLOCKED` | `BUDGET_EXHAUSTED_REQUEST`, `BUDGET_EXHAUSTED_CONCURRENCY`, `KILL_SWITCH_PENDING` verbatim |
| 429/`Retry-After` | endpoint+identity paused | `SEC_RATE_LIMIT_ENCOUNTERED` |
| Redirect out of scope | observation; not followed | `SEC_REDIRECT_OUT_OF_SCOPE` |
| safe-net refusal | `BLOCKED` | `SEC_SAFE_NET_REFUSED` |
| Timeout/reset/TLS error/ambiguous body | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Unrecognized or generic response | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` |
| No committed evidence for a static check input | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| Spec/inventory refused upstream | `BLOCKED` | `SEC_API_SPEC_*` / `SEC_API_SURFACE_INCOMPLETE` (flag) |
| Active rate-limit / fuzz / race request class requested (and command/template/path-traversal/deserialization/NoSQL active probes, L16) | `UNSUPPORTED` | `SEC_PROBE_CLASS_UNSUPPORTED` |
| Evaluator threw or overran | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Parent-side analysis budget exhausted | `BLOCKED` | `SEC_ANALYSIS_BUDGET_EXHAUSTED` |
| Unsupported API type | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE` |
| Producer unit not `COMPLETED` | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Credential missing/expired/revoked/rejected for identity-bearing probe | `BLOCKED` | `SEC_CREDENTIAL_*` (FR-036) |
| Confirmation would need unsafe activity | verdict capped at `LIKELY`; FLAG | `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` |
| Engine flag/gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |

A measured result (401/403/200/400/500) is `COMPLETED` evidence, never a unit `FAILED` (FR-059).

## Idempotency & retry

- Probe execution identity `(planId, checkId, checkVersion, apiIdentity, identityRef?, probeIndex)` (FR-148); per-probe claim `sec-probe-attempt` before send, so a recovered unit never re-sends a probe whose `SENT` record exists. Check-result claim `sec-check-execution` per FR-147. Evidence write claims per FR-135.
- Retry: `maxAttempts: 1` for E14 units (FR-057). A request retry is allowed only for `C0/C1` probes with `idempotent:true`, <= 1 retry (LOCAL), consuming F07 budget and a fresh `idempotencyKey`; `C2` is never retried.
- Replay of a worker task or duplicate event writes no new rows.

## Evidence

`HTTP_TRANSACTION` (sanitized: method, path *template*, parameter names, status, header names with flagged values only, body shape/length class, <= 600-char redacted excerpt, FR-128), `SECURITY_CHECK_RESULT`, `API_SURFACE` (read), `SECURITY_REPRODUCTION` only for `CONFIRMED` (request template + observed outcome class, never a working exploit, FR-130). Findings carry a `confirmationLimitation` field when the ladder capped the verdict. Redaction: mandatory, value-aware pre-pass, failure writes `{"_redactionFailed": true}` (FR-129).

## Budgets / limits (F07 vs LOCAL)

- F07: requests per grant, concurrency leases, duration via grant expiry; E14 ceiling 300 requests/unit, <= 2 in flight (provisional).
- LOCAL (labeled "LOCAL - not F07-ledgered", FR-070): <= 8 probes/requests per operation (including baseline); per unit <= 300; body read <= 256 KiB; total response bytes <= 32 MiB/unit; redirect depth 0 cross-origin / <= 3 planned same-origin hops; inter-request delay 250 ms (C1); retries <= 1 (idempotent only); length-probe cap 1 024; unit `timeoutPolicyMs` 600 000 + margin 60 000. Local limits are pre-checked before each send.

## Reverify

`reverifyBehavior: FRESH_MINIMAL_PLAN` (FR-152): new single-unit plan routed to the 009 REVERIFY path before the legacy resolver (FR-164); fresh F01 with a concrete destination bound from `Issue.location` by `parseSecurityLocation` (method ignored; unbindable => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`, FR-163); fresh F07 admission; re-derive the one operation from the current `ApiDescriptionDocument`; run only the one probe (or static recheck) that produced the finding; never replay a stored request. `PASSED` only if the executed probe observed the secure behavior; `FAILED` if observed again; `INCONCLUSIVE` (`SEC_ENDPOINT_GONE` if the operation no longer exists; `SEC_REVERIFY_UNVERIFIABLE` if it could not execute or the location is unbindable; or the specific upstream/`SEC_*` reason) if credentials expired, grant expired, environment changed or budget exhausted. Static findings reverify parent-side against the new `ApiDescriptionDocument` with no request. Mutating reverify needs current consent (FR-152). `INCONCLUSIVE` maps to Issue `UNVERIFIABLE` (FR-164). Reverify billing follows FR-169 (P14 PROVISIONAL).

## Boundary rules (MUST NOT)

1. MUST NOT send any request to an operation that is not probe-eligible, or to any host other than the operation's authorized authority.
2. MUST NOT fuzz, randomize, iterate corpora, or use any alphabet class outside the closed list.
3. MUST NOT actively probe rate limits, flood, race, or send more than the per-operation cap.
4. MUST NOT assume method safety (GET harmless / POST destructive) or probe an undeclared state-changing operation.
5. MUST NOT store response values, example values, tokens, cookies or full bodies; MUST NOT treat a sensitive-name field as a leaked value without an observed value-class flag.
6. MUST NOT mark `CONFIRMED` without `confirmable:true` and a fixture-confined oracle; MUST NOT derive confidence from AI.
7. MUST NOT report `NO_ISSUE_DETECTED` without the executed-scope statement; MUST NOT render PASS/secure.
8. MUST NOT follow cross-origin redirects, forward credentials off-origin, or accept a destination from response content.
9. MUST NOT enumerate or guess identifiers, or reference resources outside fixtures (authz contract owns pairs).
10. MUST NOT define a new reason code, evidence kind, execution class or FR; MUST NOT duplicate 010 checks.

## Named limitations

- Spec-based checks reflect the declaration; behavior is verified only for eligible, executed probes.
- Unauthenticated-access `CONFIRMED` is possible only when the customer registers a fixture marker; otherwise `LIKELY` at most.
- Schema validation uses the declared schema; undeclared behavior (gateway rewrites, per-tenant schemas) can cause `INCONCLUSIVE`.
- Value-class detection is heuristic (pattern/entropy); a sensitive value of an unrecognized class is missed, and a decoy can be flagged (hence `CONFIGURATION_RISK` cap).
- Per-endpoint cap of 8 and no fuzzing mean this is bounded verification, not penetration testing; coverage statements say so.
- Active rate-limit, race, OAST, fuzzing and GraphQL/gRPC/SOAP/WebSocket remain `UNSUPPORTED`.

## FR traceability

FR-101 (static vs active), FR-102 (alphabet, <= 8), FR-103 (rate-limit), FR-104 (shapes), FR-100 (eligibility), FR-006..FR-012 (classification/gate), FR-066/067 (probe data/limits), FR-069..077 (budgets), FR-081..083 (redirects/destinations), FR-136..141 (ladders/fingerprints), FR-146..150 (registry), FR-151..153 (reverify), FR-161 (dual-class credentialed crafted requests), FR-163/164/169 (location binding, routing, billing), FR-165 (no AI findings), FR-168 (`ApiDescriptionDocument`), FR-127..135 (evidence), FR-109/110 (headers/CORS pointers), FR-065/144 (no AI).

## Acceptance tests required (named; deterministic; fixture-based; not executed in this pass)

- `T-API-CHK-01-static-only-in-production`: PRODUCTION target => static `api.*` verdicts exist; every active half `BLOCKED SEC_PRODUCTION_PROHIBITED`; zero requests.
- `T-API-CHK-02-eligibility-order`: table-driven fixture covering each gate step (a)-(g) returns the documented reason; later steps not evaluated after the first failure.
- `T-API-CHK-03-unauth-access-ladder`: fixture op spec'd as auth-required answering 2xx without credential: no marker => `LIKELY`; fixture marker returned => `CONFIRMED` (`confirmable:true`); 401/403 => `NO_ISSUE_DETECTED` with scope statement.
- `T-API-CHK-04-probe-cap-8`: op with 12 eligible probes => 8 planned (baseline counted), 4 recorded `SEC_BUDGET_LOCAL_ENDPOINT`.
- `T-API-CHK-05-alphabet-lint`: loader rejects a probe with an out-of-class value, a time-delay primitive, a file/network reference, a missing `abortConditions`, a mutating probe without cleanup, and a destination not parameterized from `API_SURFACE`.
- `T-API-CHK-06-no-fuzz-determinism`: two plan builds yield byte-identical rendered requests; no entropy source referenced.
- `T-API-CHK-07-rate-limit-passive`: no request is issued to elicit a limit; 429 mid-probe pauses endpoint+identity, rest `BLOCKED SEC_RATE_LIMIT_ENCOUNTERED`; active rate-limit entry is `UNSUPPORTED` with no code path.
- `T-API-CHK-08-exposure-redacted-shapes`: response containing a token-like value => evidence holds only `{kind, location, lengthClass}`; raw value absent from every persisted/log surface.
- `T-API-CHK-09-method-not-class`: GET declared state-changing => C2 path; undeclared POST => probes refused `SEC_MUTATION_NOT_PERMITTED`, static checks still run.
- `T-API-CHK-10-redirect-out-of-scope`: 302 to a foreign host => not followed, `SEC_REDIRECT_OUT_OF_SCOPE` observation, no credential forwarded.
- `T-API-CHK-11-cors-header-dedupe`: same root cause via `api.cors.*` and `sec.cfg.*` => single Finding by `rootCauseGroup`.
- `T-API-CHK-12-probe-replay-after-crash`: recover after `SENT` record => probe not re-sent; claim honored.
- `T-API-CHK-13-measured-401-completed`: 401/403/500 observations end the unit `COMPLETED`, not `FAILED`.
- `T-API-CHK-14-class-mismatch-rejected`: registry entry declaring `C0` whose probe is crafted => loader rejects (FR-007).
- `T-API-CHK-15-reverify-minimal`: reverify issues exactly one probe, fresh F01/F07, never a stored request; operation removed from spec => `INCONCLUSIVE SEC_ENDPOINT_GONE`; `Issue.location` unbindable to a concrete destination => `INCONCLUSIVE SEC_REVERIFY_UNVERIFIABLE`; both map to Issue `UNVERIFIABLE`.

## Resolved additions

- Item 1 (reason-code gap) -> **L11 / L16**: `SEC_PROBE_CLASS_UNSUPPORTED` adopted (active rate-limit, fuzzing, race, command/template/path-traversal/deserialization/NoSQL active probes); failure table updated.
- Item 5 (`rootCauseGroup` naming) -> **L6 / FR-141**: group canonical `checkId` is what every member passes to `fingerprintOf`; inv. 12 updated.
- Item 6 (CORS ownership) -> delegation to probe-family-contract stands (FR-110 owns CORS semantics); no change.
- OpenAPI storage -> **L21 / FR-168**; reverify -> **L4/L5/FR-163/FR-164**, endpoint gone -> **`SEC_ENDPOINT_GONE`**, billing -> **L24/FR-169**; credentialed crafted requests -> **L2/FR-161**.

## Open for closure

No item is open. The earlier questions (alphabet extension, baseline inside the 8-probe cap, and the operation-declaration entity) are resolved by Consolidated repairs items 2 and 3 (`ApiOperationDeclaration`, data-model 4.9C).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Invariant 3 corrected (G-10, X4)**: an undeclared operation is potentially mutating for **every** method; the contract no longer exempts undeclared GET/HEAD/OPTIONS. Active probes require a current customer `ApiOperationDeclaration` (`READ_ONLY` or `FIXTURE_CONFINED`, FR-192). Test `T-API-undeclared-GET`.
2. **Probe budget**: the baseline request counts inside the 8-probe per-operation cap (accepted); the `NUMERIC_BOUNDARY_*`/`EMPTY_VALUE` alphabet extension is accepted as provisional.
3. **Operation declarations (B-10, FR-192).** `ApiOperationDeclaration` (data-model 4.9C) is the entity that enables active probes: `READ_ONLY` or `FIXTURE_CONFINED` (the latter needs fixture, marker ref and per-class consent). Without a current declaration the operation is potentially mutating for every method and receives only static checks. The earlier 'open item: entity not defined' is closed. A baseline-vs-probe change of the declared marker ends the check `INCONCLUSIVE` (`SEC_MUTATION_NOT_PERMITTED`) and flags the declaration for review. Tests: `T-API-undeclared-GET`, `T-API-declared-readonly-probed`, `T-API-declared-readonly-marker-changed`, `routes.mass-assignment-conformance` (declaration DTO).
4. **READ_ONLY limitations (FR-192).** `READ_ONLY` is an unverifiable customer assertion; without a `protectedMarkerRef` there is no tripwire and reports say "customer-asserted read-only, unverified"; probes use only GET/HEAD/OPTIONS unless `unsafeMethodAcknowledged` (consent class `READONLY_UNSAFE_METHOD`) is present, then at most 4. Test `api.read-only-no-marker-labelled-unverified`.
