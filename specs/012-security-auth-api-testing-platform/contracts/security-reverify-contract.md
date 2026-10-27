# Contract: Security Finding Reverify

Per FR-151, FR-152, FR-153, FR-154, FR-161 (dual-class single-unit authz reverify), FR-163 (location binding), FR-164 (routing and INCONCLUSIVE to UNVERIFIABLE), FR-165 (no AI findings), FR-169 (billing) (plus FR-003, FR-007, FR-035, FR-036, FR-057, FR-078, FR-123, FR-125, FR-140, FR-145, FR-148, FR-160). Consumes 009 `resolvePlan(kind: REVERIFY)` and the 009 U-1 deadline contract unchanged. Reason codes: closed SEC_* registry or upstream (F01/F07/009) verbatim.

## Status / Ownership

- Status: planning contract, NOT frozen.
- Ownership: 009 owns plan resolution, unit lifecycle and the REVERIFY authorization sequence (destination bound from `Issue.location`, FR-163). 012 owns per-finding-type planning rules, parameter derivation from the finding, outcome interpretation and the router that separates 012 findings from legacy ones. 007/F01 and 008/F07 own every authorization and admission decision. The existing `apps/worker/src/reverify/runner.ts` (`runReverification`) is unchanged and is used only for legacy passive capability findings.
- Pattern: mirrors 011 `source-reverify-contract.md` (fresh plan, fresh authorization, preserve evidence, `UNVERIFIABLE` never `RESOLVED`, rename guard, historical evidence kept).

## Consumers

- The reverify entry point (API assert-fixed route and worker) for `Issue` rows whose `checkId` namespace is 012-owned; the Issue state machine (`ASSERTED_FIXED -> RESOLVED | OPEN | UNVERIFIABLE`, `packages/types/src/domain.ts`); `recordVerificationAttempt`; `security-coverage-contract.md`; SPEC 014.

## Inputs

- The `Issue` (id, `fingerprint`, `checkId`, `location`, originating `scanId`, `moduleResult`), its `SECURITY_CHECK_RESULT` (check version, `scopeKey`, `identityRole?`, `probeFamily`, `fixtureResourceId?`, `expectationId?`, `apiIdentity`), and its preserved Evidence. Only **identifiers and parameters** are read from them; no request bytes, no payload and no credential are ever read from stored Evidence (stored Evidence is already redacted and could not rebuild an exploit).
- Fresh state at reverify time: the Target's current environment, current grants, current `CredentialReference`/`CredentialVersion`, current `TestIdentity`/`TestRole`, current `FixtureResource`, `AuthorizationExpectation`, `BusinessInvariant`, current Security Check Registry, current `AdvisorySnapshot`.
- Every read filters by owning tenant `(id, userId)`; a non-owner gets NotFound indistinguishable from nonexistent.

## Outputs

A fresh `ScanPlan(kind: REVERIFY, reverifyIssueId)` with its own `scanPlanId`; fresh `ExecutionUnit`(s); fresh Evidence and a fresh `SECURITY_CHECK_RESULT`; a `ReverifyResult`; an Issue state update by `recordVerificationAttempt`/`materializeFinding` (the only writers); historical evidence preserved and linked.

## Operations

```text
type ReverifyOutcome = "PASSED" | "FAILED" | "INCONCLUSIVE"           // FR-153
// maps to existing VerificationOutcome: PASSED->PASSED, FAILED->FAILED, INCONCLUSIVE->UNVERIFIABLE (Issue.state UNVERIFIABLE)
type ReverifyResult = { outcome: ReverifyOutcome, reasonCode?: "SEC_REVERIFY_UNVERIFIABLE",
                        underlyingReason?: string /* SEC_* or upstream verbatim */, freshEvidenceIds: string[], resolvedPlanId?: string }

routeReverify(issue) -> "SECURITY_012" | "LEGACY_RUNNER"              // by checkId namespace
parseSecurityLocation(location: string) -> { method: string, origin: string, pathTemplate: string } | null
bindDestination(parsed, fixtureBindings) -> {host, path, scheme, port} | null   // concrete F01 destination; method ignored (F01 destinations carry no method); null => INCONCLUSIVE SEC_REVERIFY_UNVERIFIABLE (FR-163)
resolveSecurityReverifyPlan(issueId, now) -> ScanPlan                  // wraps 009 resolvePlan(kind: REVERIFY)
interpretReverify(freshResult: SecurityCheckResult, original: Issue) -> ReverifyResult
```

Ordered steps:

1. **Route**. Namespaces `sec`, `auth`, `authz`, `api`, `logic`, `dep` (plan.md registry id families) go to the 012 path; every other namespace (`headers`, `ssl`, `owasp`, `redaction`, `dependency`, `bundle`, `meta`, `content`, `css`) goes to the unchanged legacy `runReverification`. The router MUST run **before** `resolveReverifyCapability` (FR-164), whose namespace lookup returns `null` for a 012 id and would silently convert it to `UNVERIFIABLE` (`apps/worker/src/reverify/resolve-check.ts`).
2. **Eligibility**: the Issue must be `ASSERTED_FIXED` (else the job is stale: no-op, no charge). `parseSecurityLocation` and `bindDestination` must succeed (location precision, below; failure => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`, FR-163) and the check id+major version must still be registered with a `reverifyBehavior` of `FRESH_MINIMAL_PLAN`; otherwise result `INCONCLUSIVE` (`SEC_REVERIFY_UNVERIFIABLE`, underlying `SEC_PRECONDITION_UNMET`).
3. **Build config**: exactly one domain/execution class (009 rule 3), no profile, units per the finding-type table below; `credentialBindingRef` (opaque) only; parameters derived from identifiers.
4. **`resolvePlan(REVERIFY)`** (009): fresh `isAuthorized(targetId, userId, class, destination = bindDestination(parsed) (concrete {host,path,scheme,port}, no method), now)` for any non-passive class (no cached result, 007 FR-024); `computePlanDeadline` (U-1); any refusal returns the upstream reason verbatim with no units and no fallback to the old plan or credentials (FR-154).
5. **Dispatch** each unit through the normal 009 runtime: dispatch-time deadline check, **fresh F07 `requestAdmission`** and `safetyCheckpoint` per action. `attempts: 1`.
6. **Fresh broker lease** (non-passive): `issueCredentialLease(executionUnitId, ...)` re-validates in one transaction existence, expiry, revocation, current `CredentialVersion` (the current `ACTIVE` version is used and its id recorded; an old lease or version is never reused), identity within the grant's `includedAccountRefs`, non-production environment, tenant/target binding (FR-032, FR-035). A denial maps per the failure table.
7. **Run the minimal probe**: the engine executes the single probe family of the registered check (current definition of the same major version) with the control/baseline requests the check declares. It never replays recorded requests.
8. **Evaluate** parent-side (`onSecurityEvidenceCommitted` for the REVERIFY plan, new claim keys with the new `scanPlanId`), producing a fresh `SECURITY_CHECK_RESULT`.
9. **Interpret** via `interpretReverify` (invariants below) and call `recordVerificationAttempt` (only writer of `RESOLVED`, only on `PASSED`). Link new Evidence with `IssueEvidenceLink` through `materializeFinding`; originals stay.
10. Teardown, residual/cleanup handling, lease destruction exactly as a normal unit (FR-045, FR-052).

## Reverify strategies per finding type (FR-152)

| Finding type | Check families | Class (REVERIFY unit) | Fresh inputs | What re-runs (one probe family) | `PASSED` when | `FAILED` when |
|---|---|---|---|---|---|---|
| Security header | `sec.cfg.*` header/CSP/HSTS/CORS-passive/disclosure | `PASSIVE_HTTP` (no F01 call; ownership as today) | fresh GET of `Issue.location` URL | the single header check over fresh `HTTP_TRANSACTION` | fresh result `NO_ISSUE_DETECTED` on a successful response (status 2xx/3xx) | any finding verdict again for the same fingerprint |
| TLS-visible | `sec.cfg.*` scheme/HSTS/cert-visible facts from the fetch | `PASSIVE_HTTP` | fresh fetch | single fact check; real TLS handshake checks are `NOT_TESTED`/`UNSUPPORTED` (`SEC_TLS_INSPECTION_UNAVAILABLE`) so a finding needing them cannot exist and cannot be `PASSED` | `NO_ISSUE_DETECTED` | finding again |
| Cookie | `sec.cfg.*`/`auth.*` cookie flags | `PASSIVE_HTTP` if the cookie is set on an ordinary response; `AUTHENTICATED_WORKFLOW` if issued only by login | fresh response (and fresh login) | cookie-attribute check on fresh `Set-Cookie` metadata (values redacted) | flags now correct on the same cookie name | flags still wrong |
| Auth session | `auth.session.*` (logout invalidation, fixation, expiry handling, CSRF-session) | `AUTHENTICATED_WORKFLOW` | fresh lease; one scenario | the single scenario (login -> exercise -> logout -> reuse) within <= 3 login attempts | expected outcome observed (e.g. pre-logout token rejected) with the control step succeeding | issue observed again |
| Authorization | `authz.*` (BOLA/BFLA/tenant/vertical) | **One `ACTIVE_SECURITY` unit** in which every credentialed request carries the dual-class checkpoint (FR-161, L2; secondary `AUTHENTICATED_WORKFLOW` with `consumes{request:false, concurrency:false}`; both classes must be granted, AR-10 RECOMMENDED) | fresh leases for each identity, current `AuthorizationExpectation`, `FixtureResource` bindings | the single cell of the matrix (actor x operation x fixture owner) plus the owner control read | observed `DENIED`/`NOT_FOUND` per expectation **and** owner control read `ALLOWED` | `ALLOWED` again (oracle marker returned/modified => `CONFIRMED` class, status-only => `LIKELY` class) |
| API validation | `api.*` | `ACTIVE_SECURITY` | `API_SURFACE` entry for the operation from the current stored spec/source surface; fixture/identity if needed | the single probe family for that operation (<= 8 probes) | validation behaves as expected on all family probes | indicator again |
| Business logic | `logic.*` | `AUTHENTICATED_WORKFLOW` | current `BusinessInvariant` version, fresh fixture state check, **current mutation consent** | the single scenario/invariant, bounded repeats (<= 3), cleanup + verification | invariant holds **and** cleanup verified | invariant evaluates `false` again |
| Dependency advisory | `dep.*` | `SOURCE_STATIC` (011 dependency observer, fresh snapshot) + parent-side matcher | fresh lockfile `DEPENDENCY` evidence; `AdvisorySnapshot` same-or-newer than the original | match of that package/advisory only | no longer matched (version moved outside affected range, or advisory withdrawn in a not-older snapshot, noted) | still matched |

## Location precision requirement (FR-145, 009 risk #2)

`Issue.location` for HTTP findings is `"<METHOD> <origin><pathTemplate>"` (`security-finding-contract.md`). `parseSecurityLocation` accepts only that grammar. The F01 destination is a concrete `{host, path, scheme, port}` built from the URL part (the method is ignored, FR-163), with `{}` template segments bound to concrete values from the finding's recorded fixture/declared example (`fixtureResourceId`/`FixtureResource.locatorTemplate`); an unbound or unbindable template yields `INCONCLUSIVE` (`SEC_REVERIFY_UNVERIFIABLE`, underlying `SEC_FIXTURE_MISSING` where the cause is a missing fixture). A finding whose location is not in the canonical grammar (legacy origin-only locations, or a hand-edited row) is not security-reverifiable and is never checked against the Target origin instead (that would authorize the wrong thing). Passive findings use a concrete page URL (no template) and are bound as-is.

## Outcome rules

1. `PASSED` requires all of: the fresh unit ended `COMPLETED`; the check executed its full declared probe family; the check's **control/baseline** condition held (the owner/legitimate request still works, so the secure result is not an artifact of a broken endpoint); the fresh result is `NO_ISSUE_DETECTED`; for `C2` checks the cleanup is verified (FR-123); same fingerprint identity re-evaluated.
2. `FAILED` when the fresh result is any finding verdict whose fingerprint equals the Issue's fingerprint (the issue is observed again; confidence may differ and is recorded). A finding at a different fingerprint is not evidence of a fix and does not mean `PASSED`.
3. `INCONCLUSIVE` (Issue -> `UNVERIFIABLE`) in every other case, always with `reasonCode: SEC_REVERIFY_UNVERIFIABLE` and an `underlyingReason`. A reverify that could not execute is never `PASSED`, and `UNVERIFIABLE` is never reported as `RESOLVED`.
4. A user assertion alone never changes state to `RESOLVED`; the only inbound edge is a `PASSED` outcome (`ISSUE_STATE_TRANSITIONS`).
5. Idempotent replays give the same outcome for the same fresh evidence.

## Invariants

1. Every REVERIFY plan is built by `resolvePlan(kind: REVERIFY)` with exactly one domain/class family per finding type (table) and no profile; refusal fails closed to `REFUSED` with the upstream reason.
2. F01 is evaluated freshly with `destination` derived from `Issue.location`; no grant snapshot, lease or admission from the original scan is reused.
3. Fresh broker lease per unit; the lease triple `(credentialVersionId, executionUnitId, attempt)` is unique; the original lease is never reused; the current ACTIVE credential version is recorded by id only.
4. No request is built from stored evidence; probe bytes come only from the registry's harmless alphabet at the finding's check major version.
5. Mutation budgets (`maxMutations` per fixture and per unit, FR-125) and per-class consent are re-applied from zero and from the **current** grant; missing consent yields `SEC_CONSENT_MISSING` (underlying) and `INCONCLUSIVE`.
6. Original Evidence and prior findings are preserved and linked, never overwritten or deleted.
7. Reverify consumes the same F07 admission, checkpoints, local budgets, kill-switch, deadline and cleanup rules as a normal unit; `attempts: 1`; a started request is never auto-retried; a recovered unit never re-sends a mutation whose `SENT` intent exists.
8. A 012-namespace finding is never routed to the legacy runner; a legacy-namespace finding is never routed to the 012 path.
9. Production: an active/authenticated reverify against a PRODUCTION or unclassified target is refused (`SEC_PRODUCTION_PROHIBITED`/`SEC_ENVIRONMENT_UNCLASSIFIED` or F01 `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`); passive reverify in production is allowed.
10. `PASSED` is impossible without a successful control step.
11. Reverify never widens beyond the finding's single probe family and the check's declared control requests.

## Safety & Authorization

Fresh F01 (class + destination), fresh `securityScopeGate` (identity, role, action category, destination) before each F07 checkpoint, fresh F07 admission; the old grant's content is never copied (009 references grants by id). A refused reverify returns the upstream reason verbatim (FR-154). The reverify never holds a credential outside the broker lease, never writes a secret to Evidence, and AI takes no part in plan or outcome (FR-144). Cancellation/kill behave as in the class contracts: no cleanup after a stop, residual manifest, `INCONCLUSIVE`.

## Failure states

| Condition | Result | Reason code (`underlyingReason`) |
|---|---|---|
| Grant expired / revoked / absent for the class | plan `REFUSED`; the Issue state is unchanged (Consolidated repairs item 2); the upstream reason is returned verbatim | upstream verbatim: `EXPIRED` / `REVOKED` / `NO_MATCHING_GRANT` (+ `SEC_REVERIFY_UNVERIFIABLE`) |
| New plan deadline exceeds ceiling / grant expires before deadline | plan `REFUSED` | `PLAN_DEADLINE_EXCEEDS_CEILING` / `GRANT_EXPIRES_BEFORE_DEADLINE` verbatim |
| Environment now PRODUCTION or unclassified (active class) | refused | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` / F01 `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED` |
| Credential expired | `INCONCLUSIVE` | `SEC_CREDENTIAL_EXPIRED` |
| Credential revoked / deleted | `INCONCLUSIVE` | `SEC_CREDENTIAL_REVOKED` / `SEC_CREDENTIAL_MISSING` |
| Target rejected the credential | `INCONCLUSIVE` | `SEC_CREDENTIAL_REJECTED` |
| Broker unreachable | `INCONCLUSIVE` (fail closed, no direct vault read) | `SEC_BROKER_UNAVAILABLE` |
| Identity role changed or unmapped | `INCONCLUSIVE` | `SEC_IDENTITY_ROLE_UNMAPPED` / `SEC_PRECONDITION_UNMET` |
| Fixture missing / fails validation / residual state | `INCONCLUSIVE` | `SEC_FIXTURE_MISSING` / `SEC_FIXTURE_INVALID` |
| Expectation or invariant missing now | `INCONCLUSIVE` | `SEC_EXPECTATION_MISSING` / `SEC_INVARIANT_UNDEFINED` |
| Mutation consent no longer enabled | `INCONCLUSIVE` | `SEC_CONSENT_MISSING` / `SEC_MUTATION_NOT_PERMITTED` |
| Budget exhausted (F07 or local) | `INCONCLUSIVE` | `BUDGET_EXHAUSTED` / `BUDGET_EXHAUSTED_REQUEST` / `SEC_BUDGET_LOCAL_*` |
| Rate limit / lockout signal | `INCONCLUSIVE`; no retry | `SEC_RATE_LIMIT_ENCOUNTERED` / `SEC_ACCOUNT_LOCKOUT_RISK` |
| Endpoint gone (control request 404/410, operation absent from current surface) | `INCONCLUSIVE`, never `PASSED` | `SEC_ENDPOINT_GONE` |
| `Issue.location` not parseable / not bindable to a concrete in-scope destination | `INCONCLUSIVE` (Issue `UNVERIFIABLE`) | `SEC_REVERIFY_UNVERIFIABLE` (FR-163) |
| Secondary-class (`AUTHENTICATED_WORKFLOW`) checkpoint refused at dispatch for a dual-class unit | `INCONCLUSIVE` | F01 reason verbatim (FR-161) |
| No usable advisory snapshot | `INCONCLUSIVE` | `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` |
| Evaluator threw or overran | `INCONCLUSIVE` | `SEC_EVALUATION_ERROR` |
| Transport error / ambiguous | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Check retired or major version changed | `INCONCLUSIVE` | `SEC_PRECONDITION_UNMET` |
| Advisory snapshot older than original / stale (freshness measured from `sourceRetrievedAt`, FR-170) | `INCONCLUSIVE` | `SEC_ADVISORY_STALE` |
| Cleanup failed/unverified | `INCONCLUSIVE`; a re-observed finding is still `FAILED` | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Kill / cancel / deadline during the unit | `INCONCLUSIVE` | `KILL_SWITCH_PENDING` / `SCAN_CANCELLED` / `SCAN_DEADLINE_EXPIRED` verbatim |
| Engine disabled by flag/gate | `INCONCLUSIVE` | `SEC_ENGINE_DISABLED` |
| Platform defect (unit `FAILED` ENGINE_DEFECT, infra exhausted) | `ERRORED` (existing `VerificationOutcome`), not `PASSED` | none |

## Idempotency & retry

Plan resolution is idempotent per `reverifyRequestKey = (issueId, assertedFixedAt)` so a double click or redelivered job yields one plan. Unit keys derive from `(executionUnitId, attempt)`; evidence/claims (`sec-evidence-write`, `sec-check-execution`, `sec-probe-attempt`) begin with the REVERIFY plan's `scanPlanId`, so keys never collide with the original scan or across tenants. `attempts: 1`; no automatic retry of a started request; a worker crash after a mutating send leaves `SENT_UNCONFIRMED` and the reverify ends `INCONCLUSIVE`. Repeating a reverify with unchanged target state yields the same outcome.

## Evidence

Fresh `HTTP_TRANSACTION`, `AUTH_STATE_TRANSITION`, `PERMISSION_COMPARISON`, `CLEANUP_RECORD`, `ADVISORY_MATCH`, `SECURITY_CHECK_RESULT` through `security-evidence-contract.md` (value-aware redaction with the fresh lease's values registered). Artifacts use `scanId = originScanId` (009 `createArtifact` is caller-supplied; same convention as 011) so retention follows the origin scan. Prior Evidence stays; `IssueEvidenceLink` rows are added only by `materializeFinding`.

## Budgets / limits

- F07-authoritative: requests, concurrency, duration (grant expiry) exactly as for a normal unit; reverify consumes one concurrency lease per unit.
- LOCAL - not F07-ledgered, provisional and tighter than a normal unit (allowed, may be tightened without amendment): <= 30 requests per REVERIFY unit; <= 8 probes of the one family; <= 3 login attempts per identity (hard max 5); <= 1 mutation per fixture; <= 3 repeats for duplicate-action invariants; redirect depth and body caps unchanged; plan deadline per U-1 (`resolvedAt + deadlineMs`).

## Boundary rules (MUST NOT)

1. MUST NOT reuse a prior authorization, grant snapshot, admission, lease, session, credential version or Evidence as proof.
2. MUST NOT replay a stored exploit, request or payload; MUST NOT read secrets from stored Evidence.
3. MUST NOT widen the plan beyond one probe family and the check's declared control requests.
4. MUST NOT report `PASSED` when the reverify did not execute, when the control step failed, when cleanup is unverified, or when the endpoint is gone.
5. MUST NOT report `UNVERIFIABLE`/`INCONCLUSIVE` as `RESOLVED`; MUST NOT let a user assertion resolve an Issue.
6. MUST NOT fall back silently to the old plan, old credentials or the legacy runner after a refusal; MUST return the upstream reason verbatim.
7. MUST NOT use the Target origin as the F01 destination when `Issue.location` is imprecise; MUST refuse instead.
8. MUST NOT modify or route 012 findings through `runReverification`/`resolveReverifyCapability`; MUST NOT modify the legacy runner.
9. MUST NOT run active/authenticated reverify against PRODUCTION or unclassified targets.
10. MUST NOT mutate a fixture without current per-class consent and a fresh fixture-state check.
11. MUST NOT delete or overwrite original Evidence or findings.
12. MUST NOT let AI influence plan, probe, authorization or outcome.

## Named limitations

1. `PASSED` means the executed probe family, with a working control request, observed the expected secure behavior at that moment. It is not proof the whole endpoint or application is secure.
2. Time-dependent or data-dependent vulnerabilities may not reproduce on fixtures; a `PASSED` can be a false negative within the fixture's confines.
3. A fixed finding on an endpoint whose control request cannot be established (fixture removed, role changed) stays `UNVERIFIABLE`; customers must re-register fixtures.
4. Authorization findings originally produced by two linked units reverify as one E14 unit with dual-class checkpoints (FR-161); if the grant lacks either class the finding is `UNVERIFIABLE`.
5. Mutating reverify depends on customer-asserted fixture safety (FR-117) and on cancellation not reversing already-issued requests (FR-124).
6. A check whose definition moved to a new major version cannot be compared by fingerprint; its old findings are `UNVERIFIABLE` until re-found by a new scan.
7. Billing (FR-169, P14 PROVISIONAL): REVERIFY plans follow the legacy `REVERIFY_COST` semantics (charge at resolution; refund only for platform failure or refusal before execution) until F06; whether a customer-side `INCONCLUSIVE` (expired credential, missing fixture) is refunded is an owner decision.

## FR traceability

FR-151 (new minimal plan, fresh F01/F07/lease/evidence/budgets, preserve), FR-152 (per-type strategies via `reverifyBehavior`, no stored exploit, consent for mutation), FR-153 (outcomes and closed reasons), FR-154 (upstream verbatim, no fallback, legacy runner unchanged), FR-145 (location precision), FR-003/FR-078 (fresh authorization, production), FR-123 (cleanup), FR-125 (mutation counts), FR-148 (probe claims), FR-160 (parallel run), FR-161 (dual-class single-unit reverify), FR-163 (location binding), FR-164 (routing before the legacy resolver; INCONCLUSIVE -> Issue `UNVERIFIABLE`), FR-165 (no AI), FR-169 (billing), FR-170 (advisory freshness anchor).

## Acceptance tests required (named, deterministic, fixture-based; not executed in planning)

| Test | Fixture | Expected |
|---|---|---|
| `reverify.route.namespace-split` | issues with `sec.*`, `auth.*`, `headers.*`, `owasp.*` ids | 012 ids -> new path; legacy ids -> unchanged `runReverification`; `resolveReverifyCapability` never sees 012 ids |
| `reverify.legacy-runner-unchanged` | existing runner test suite | passes byte-identically |
| `reverify.plan.single-family-no-profile` | each finding type | plan has one class family, no profile; deadline computed |
| `reverify.f01.fresh-destination-from-location` | finding at `GET https://h/api/orders/{}` | F01 called with bound concrete URL, not Target origin; no cached result |
| `reverify.location.imprecise-refused` | legacy origin-only location on a 012 id, or a template that cannot be bound | `INCONCLUSIVE`, `SEC_REVERIFY_UNVERIFIABLE`; no F01 call on origin; method never passed to F01 |
| `reverify.authz.single-e14-dual-checkpoint` | BOLA finding, both classes granted / only one granted | one E14 unit, every credentialed request dual-checkpointed; missing class => `INCONCLUSIVE` with F01 reason verbatim |
| `reverify.endpoint-gone` | operation removed / control 404 | `INCONCLUSIVE` underlying `SEC_ENDPOINT_GONE`; Issue `UNVERIFIABLE` |
| `reverify.refusal.verbatim` | grant expired / revoked / none | `EXPIRED`/`REVOKED`/`NO_MATCHING_GRANT` surfaced verbatim; no fallback |
| `reverify.lease.fresh-and-revalidated` | credential rotated, then revoked, then expired | uses new version id; revoked/expired => `INCONCLUSIVE` with `SEC_CREDENTIAL_*`; old lease never reused |
| `reverify.lease.triple-unique` | replay lease request | `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED` |
| `reverify.no-blind-replay` | stored evidence contains old probe metadata | engine request bytes come from registry only; spy shows no stored bytes sent |
| `reverify.passed.requires-control` | endpoint returns 404 for owner control | `INCONCLUSIVE`, never `PASSED` |
| `reverify.passed.header-fixed` | header now present | `PASSED`, Issue -> `RESOLVED` only via `recordVerificationAttempt` |
| `reverify.failed.same-fingerprint` | BOLA still allowed with oracle | `FAILED`, Issue -> `OPEN`, new evidence linked, original kept |
| `reverify.different-fingerprint-not-fixed` | finding re-emitted at different fingerprint | not `PASSED` |
| `reverify.mutating.needs-consent` | consent disabled since original | `SEC_CONSENT_MISSING` underlying, `INCONCLUSIVE`, zero mutation |
| `reverify.mutating.fresh-budget-and-fixture-check` | fixture residual/changed | `SEC_FIXTURE_INVALID`, `INCONCLUSIVE` |
| `reverify.mutating.cleanup-unverified` | cleanup fails after clean probe | `INCONCLUSIVE`, not `PASSED` |
| `reverify.env-reclassified-production` | target now PRODUCTION | active refused; passive allowed |
| `reverify.budget-exhausted` | local request limit hit | `INCONCLUSIVE` with budget code |
| `reverify.kill-switch-midway` | stop during probe | `INCONCLUSIVE`, no further request, residual manifest if mutating |
| `reverify.idempotent-double-assert` | double click / redelivered job | one plan, one outcome |
| `reverify.advisory.snapshot-same-or-newer` | older snapshot offered | `INCONCLUSIVE`; newer-snapshot withdrawn advisory => `PASSED` with note |
| `reverify.check-major-changed` | registry moved to next major | `INCONCLUSIVE`, `SEC_PRECONDITION_UNMET` |
| `reverify.evidence-preserved` | any outcome | original Evidence/links untouched; new links added |
| `reverify.tenant-isolation` | cross-tenant issue id | NotFound indistinguishable |

## Resolved additions

- **R-1** -> **L2 / FR-161**: authorization reverify is one E14 unit with dual-class checkpoints; no two-unit REVERIFY plan needed; AR-10 RECOMMENDED.
- **R-2** -> **L4 / FR-163**: `parseSecurityLocation` + concrete destination binding, method ignored; unbindable => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`.
- **R-3 (part)** -> **L11**: `SEC_ENDPOINT_GONE` adopted.
- **R-4** -> **L5 / FR-164**: `INCONCLUSIVE` maps to existing Issue state `UNVERIFIABLE`; routing before the legacy resolver; no new enum value.
- **R-5** -> **L24 / FR-169 / P14 PROVISIONAL**.
- Advisory freshness -> **L32 / FR-170**; `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` and `SEC_EVALUATION_ERROR` adopted (**L11**).

## Open for closure

1. Owner: "check retired / major version changed" has no dedicated code and reuses `SEC_PRECONDITION_UNMET` (accepted, Consolidated repairs item 2); "environment changed" reuses `SEC_PRODUCTION_PROHIBITED`/`SEC_ENVIRONMENT_UNCLASSIFIED`/F01 reason. Confirm or add codes.
2. Owner: `reverifyRequestKey = (issueId, assertedFixedAt)` is proposed; 009 defines no idempotency key for REVERIFY plans.
3. Owner: the tighter reverify local caps (30 requests per unit, etc.) are provisional additions to plan.md Budgets; confirm or drop.
4. Owner: P14 sub-decision (refund of customer-side `INCONCLUSIVE`).
(A refused reverify plan leaves the Issue state unchanged: decided in Consolidated repairs item 2.)

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Limits (G-35, FR-184)**: per-issue cooldown and a daily cap, sharing the identity's rolling login-attempt window.
2. **Issue state rule**: a REFUSED reverify plan leaves the Issue state unchanged; a RESOLVED plan that executes to `INCONCLUSIVE` sets `UNVERIFIABLE` (FR-164). A retired or major-changed check reuses `SEC_PRECONDITION_UNMET` (accepted).
3. **Composite findings**: reverify of a cross-identity finding is a single E14 unit with dual-class checkpointing; the plan-level check covers the primary class and the secondary refusal surfaces at dispatch as `BLOCKED` (AR-10).
4. A reverify unit passes the same verified address binding (fresh proof and SPKI pin), Destination Authorization Policy and consent re-check, broker issue, per-request reservation, admission order and egress gate as an initial unit (FR-172, FR-197, FR-177, FR-190, FR-175, FR-199); a reverify that cannot establish any of them is `INCONCLUSIVE` with the closed reason, never `PASSED`. Reverify attempts share the identity's attempt window (FR-191) and the per-issue cooldown (FR-184). Group findings follow the scheduled-members barrier (FR-141).
