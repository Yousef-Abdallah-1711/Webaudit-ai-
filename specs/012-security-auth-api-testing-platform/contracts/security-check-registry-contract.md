# Contract: Security Check Registry and Parent-Side Dispatch

Per FR-001, FR-006..FR-012, FR-009, FR-066, FR-135..FR-142, FR-146..FR-150, FR-160, FR-161..FR-166. The one generic mechanism that (a) holds versioned `SecurityCheckDefinition` records, (b) turns committed security-relevant Evidence into `SECURITY_CHECK_RESULT` Evidence and, where warranted, a Finding, and (c) records an outcome for every applicable check before the SECURITY module result is written. Same seam as SPEC 010 `web-check-registry-contract.md` and SPEC 011 `source-rule-registry-contract.md`, restated for security; consumed by pattern, not by code. Closed vocabulary: plan.md "Reason-code registry"; no code in this file is invented.

## Status / Ownership

- Owning spec: 012, Context J (Finding and Reverify Integration) with check declarations contributed by Contexts D, F, G, H, I.
- The registry is **code-level and vendored** (`packages/security-registry/`, Principle II), not a table; the dispatcher is one shared evaluator-service component (`apps/worker/src/security/evaluator-service.ts`, role `fahes_sec_derive`). Neither is created by this planning pass.
- Status: planning contract, NOT frozen. Activation gated by SG1, SG2, SG4, SG6 (plan.md) and flags `FAHES_SECURITY_PASSIVE|ACTIVE|AUTHENTICATED` (FR-158).

## Consumers

- `onSecurityEvidenceCommitted` is called by the 009 `recordEvidence` post-commit hook (the same hook 010 `onEvidenceCommitted` and 011 `onSourceEvidenceCommitted` use); for 012 the hook is a registered **no-op** (workers are not producers on the 012-owned `sec-evaluate` queue; only the orchestrator and the evaluator service enqueue `{v, scanPlanId, reason}`, F4), and the evaluator service (role `fahes_sec_derive`) runs the dispatch and writes every derived record through `sec_derive_*` functions (FR-201(j)); the queue message schema, producer and consumer authority, idempotency, amplification limits, sweep context and database revalidation are specified in data-model 4.10D (IC-4), and Redis is never an authority.
- 009 `continueScanIfPlanTerminal` and the `timeout-sweep` planned pass call `sweepUnresolvedSecurityChecks` (scan-deadline-contract.md "Plan-unit barrier and module-result finalizers", rule 4; "Sweeper" step 3b).
- `resolvePlan` (009 `execution-plan-contract.md` step 4) reads `executionClass`, `classification`, `requestBudget`, `timeoutMs` to create unit templates (E14 `active-security-execution-contract.md`, E15 `auth-workflow-execution-contract.md`).
- `securityCoverageSummary` (FR-143) reads `SECURITY_CHECK_RESULT` counts; the reverify resolver (FR-151) reads `reverifyBehavior`; SPEC 014 reads `rootCauseGroup`.

## Inputs

- Committed Evidence rows of any kind **except** `SECURITY_CHECK_RESULT`: `HTTP_TRANSACTION`, `HAR`, `AUTH_STATE_TRANSITION`, `PERMISSION_COMPARISON`, `API_SURFACE`, `CLEANUP_RECORD`, `ADVISORY_MATCH`, `SOURCE_SURFACE`, `DEPENDENCY`, `CODE_FLOW`, `SECURITY_REPRODUCTION` (reused kinds per plan.md "Evidence kinds added"). All are already redacted (009 FR-030, 012 FR-127).
- The set of units of the plan and their terminal statuses (read-only, for `requiresProducerCompleted`).
- Registry source files loaded and validated once at process start.

## Outputs

- Exactly one `SECURITY_CHECK_RESULT` Evidence per `(check, version, scopeKey)` execution.
- For verdicts `CONFIRMED_VULNERABILITY | LIKELY_VULNERABILITY | CONFIGURATION_RISK | INFORMATIONAL` only: one Finding via 009 `materializeFinding` (FR-139). Non-finding verdicts appear only in coverage.
- A `ModuleResult` for `ModuleType.SECURITY` written by the registered module-result finalizer (no new `ModuleType`; plan.md Clarifications).

## Operations

### Shapes (pseudo-signatures, not final TypeScript)

```text
SecurityCheckDefinition = {
  id: string,                      // prefix in {sec.*, auth.*, authz.*, api.*, logic.*, dep.*}
  version: semver,                 // immutable per (id, version)  FR-150
  category: "CONFIGURATION"|"AUTHENTICATION"|"AUTHORIZATION"|"API"|"BUSINESS_LOGIC"|"DEPENDENCY",
  severityGuidance: { defaultSeverity, cap, byConfidence },        // FR-138
  classification: "C0"|"C1"|"C2"|"C3"|"C4"|"C5",                   // declared; recomputed at load  FR-007
  executionClass: "NONE_PARENT_SIDE"|"PASSIVE_HTTP"|"BROWSER"|"CRAWLER"|"SOURCE_STATIC"|"ACTIVE_SECURITY"|"AUTHENTICATED_WORKFLOW",
  requiredAuthorizationClass: ExecutionClass | null,               // F01 class; null iff C0
  allowedEnvironments: Environment[],                              // C0 may include PRODUCTION; >=C1 never
  requiredConsentFlags: ConsentFlag[],                             // mutation/side-effect classes, default OFF
  actionCategories: ActionCategory[],                              // closed set FR-011
  targetApplicability(ctx): boolean,                               // pure
  inputSchema,                                                     // typed check inputs (endpoint identity, identityRefs, fixtureRefs)
  probeDefinition?: ProbeDefinition,                               // absent iff C0, C4, C5 (UNSUPPORTED entry)
  requestBudget: { maxRequests, maxPerEndpoint?, maxProbesPerOperation?, maxMutations? },
  timeoutMs,
  sessionRequirements: { identities: 0..4, roles?: RoleKey[], mfa: "NONE"|"EXEMPT_OR_FIXTURE" },
  cleanupRequirements: CleanupSpec | null,                         // required iff C2
  sideEffects: SideEffect[],                                       // lockout|email|sms|state-change|none  FR-088
  abortConditions: AbortCondition[],                               // non-empty for every check with a probeDefinition
  requiredEvidenceKinds: EvidenceKind[],                           // never SECURITY_CHECK_RESULT
  requiresProducerCompleted: boolean,                              // default true
  evidenceRequirements, reverifyBehavior: "FRESH_MINIMAL_PLAN",
  coverageBehavior: { facet: "API"|"AUTH"|"AUTHZ"|"BUSINESS_LOGIC"|"CONFIGURATION"|"DEPENDENCY",   // L34: CONFIGURATION and DEPENDENCY facets added
                      preconditionIsApplicability: boolean },   // L34: true => an unmet precondition makes the check not applicable rather than a degrading NOT_TESTED
  confirmable: boolean, oracle?: OracleDefinition,
  idempotent: boolean,                                             // C0/C1 only; gate for request-level retry FR-057
  rootCauseGroup?: string, cwe: string[], owasp: string[],
  readinessScope?(evidence) -> string,
  appliesWhen(ctx) -> { applicable: boolean, reason?: SecReason },
  evaluate(batch) -> CheckOutcome,                                 // pure, sync, no I/O, no AI
  fingerprintPartsFor(batch, outcome) -> string[],                 // FR-141
}
CheckOutcome = { verdict: SecVerdict, confidence?: Confidence, reasonCode?: SecReason | UpstreamReason,
                 severity?, supportingEvidenceIds[], confirmationLimitation? }
SecVerdict   = CONFIRMED_VULNERABILITY | LIKELY_VULNERABILITY | CONFIGURATION_RISK | INFORMATIONAL
             | NO_ISSUE_DETECTED | INCONCLUSIVE | NOT_TESTED | BLOCKED | UNSUPPORTED
loadSecurityRegistry(sources) -> Registry | RegistryLoadError
onSecurityEvidenceCommitted(evidence, scanPlanId) -> void
sweepUnresolvedSecurityChecks(scanPlanId) -> void       // 009 module-result finalizer
finalizeSecurityModuleResult(scanPlanId) -> void         // same finalizer registration (step order below)
```

### Id prefixes and domain mapping

`sec.*` configuration/headers/cookies/CORS/CSP/disclosure/TLS-visible (C0, plus C1 `sec.cors.*` active origin probes, `sec.inject.*`, `sec.xss.*`); `auth.*` authentication (C3; FR-086); `authz.*` authorization (C3, with a dependent C1 unit; FR-091); `api.*` API (C0 spec-based, C1 active; FR-101); `logic.*` business logic (C3, C2 with consent; FR-114); `dep.*` dependency advisory (C0 parent-side; FR-111). Prefix is purely a naming/ownership rule; dispatch never branches on prefix. Concrete ids elsewhere in this spec (`sec.cfg.csp-weak`, `auth.session.logout-invalidation`) are examples; this contract defines no check catalogue.

### `loadSecurityRegistry` (startup; failure aborts load of the registry and disables every non-C0-existing check: `SEC_ENGINE_DISABLED`)

1. Reject a duplicate `(id, version)`, a missing `fingerprintPartsFor`, an id outside the six prefixes, a prefix/category mismatch.
2. **Class recomputation (FR-007/FR-149)**: compute `classification` mechanically from `probeDefinition`/`cleanupRequirements`/`sessionRequirements`/`actionCategories` (rules: no crafted request and no credential, header, parameter, body, method or Origin deviation from the ordinary fetch = `C0`; crafted read-only request, no credential = `C1`; any `FIXTURE_MUTATE` category or `cleanupRequirements` present = `C2`; credential/session use = `C3`; any step the closed C4 list or C5 list matches = `C4`/`C5`). Declared != computed = reject. The HTTP method is an input to the computation only through `parameters`/fixture semantics, never as the rule.
3. Derive `executionClass` from computed classification and reject a declared mismatch (C0 -> producer class or parent-side; C1 -> `ACTIVE_SECURITY`; C2/C3 -> `AUTHENTICATED_WORKFLOW`, plus a linked `ACTIVE_SECURITY` unit only for crafted cross-identity requests per FR-062).
4. Reject a probe whose `destination` is not parameterized from authorized inputs (endpoint identity, fixture locator template, Target host); a literal host/IP/URL, a destination derived from response content, an OpenAPI `servers` entry used directly (FR-083), or any URL with a scheme in the probe body.
5. Reject a check with a `probeDefinition` and empty `abortConditions`.
6. Reject a mutating (`C2`) probe without `cleanupRequirements` naming a `FIXTURE_CLEANUP` method or customer fixture-reset plus a verification read.
7. Reject `confirmable: true` without an `oracle` that references fixture-confined proof (FR-140).
8. Reject any `requiredEvidenceKinds` containing `SECURITY_CHECK_RESULT`.
9. Reject a probe body/parameter value outside the closed harmless alphabet (FR-102/FR-105 lint), a request template with unbounded repetition, a probe count above `requestBudget.maxProbesPerOperation` (<= 8).
10. Reject `C4`/`C5` entries that carry a `probeDefinition`, `evaluate` network behavior or `requestBudget > 0`; accept them only as `UNSUPPORTED` entries (below).
11. Reject `requiresProducerCompleted: false` on any check that can return `NO_ISSUE_DETECTED` (default `true`; the 011 rule is not weakened).
12. Reject `idempotent: true` on any `C2`/`C3` check.

### Unsupported entries (C4/C5, FR-010)

A registry may contain `{id, version, classification: "C4"|"C5", unsupported: true, reasonCode, description}` for truthful coverage (e.g. a registered "active rate-limit probe"). A C4/C5 entry's `reasonCode` is `SEC_PROBE_CLASS_UNSUPPORTED` (L11; a separately proposed check-class code was rejected as a duplicate). It has no probe, no `evaluate`, no budget and no code path. The dispatcher records one `UNSUPPORTED` result per scan for each such entry when the scan's configuration requested its category; the reason code is the entry's `reasonCode`, which MUST come from the closed registry (`SEC_PROBE_CLASS_UNSUPPORTED` for C4/C5 entries; capability-specific entries: `SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_TLS_INSPECTION_UNAVAILABLE`, `SEC_OOB_UNSUPPORTED`, `SEC_UNSUPPORTED_CREDENTIAL_KIND`, `SEC_ECOSYSTEM_UNSUPPORTED`).

### `onSecurityEvidenceCommitted` (parent-worker-side, once per newly committed non-`SECURITY_CHECK_RESULT` Evidence; copy of the 010/011 claim-before-readiness algorithm)

1. For every check whose `requiredEvidenceKinds` includes `evidence.kind`: `scopeKey = check.readinessScope?(evidence) ?? defaultScope(check, evidence)`, where `defaultScope` is the `endpointIdentity` (path template + METHOD) for `api.*/authz.*/logic.*`, the `origin` for `sec.*`, the workspace partition `@snapshotDigest` for `dep.*`, and the `executionUnitId` otherwise. `claimKey = "${scanPlanId}:${check.id}:${check.version}:${scopeKey}"` (begins with `scanPlanId`, so keys never cross tenants or scans).
2. Attempt `IdempotentClaim` scope `sec-check-execution` on `claimKey`. Not won: stop.
3. Query that every kind in `requiredEvidenceKinds` has a committed row for `scopeKey`. Not ready: **delete the claim** and stop.
4. Ready: if the flag for the check's domain is off or the check is unavailable: record `NOT_TESTED` (`SEC_ENGINE_DISABLED`), go to step 10.
5. `requiresProducerCompleted` rule: read the status of every producing unit of the required evidence. If any is not `COMPLETED` the outcome MAY only be `LIKELY_VULNERABILITY`, `CONFIRMED_VULNERABILITY`, `CONFIGURATION_RISK`, `INFORMATIONAL`, `INCONCLUSIVE` or `BLOCKED` (`SEC_UPSTREAM_PRODUCER_FAILED`), never `NO_ISSUE_DETECTED`; a `NO_ISSUE_DETECTED` returned by `evaluate` is overridden to `INCONCLUSIVE` and an anomaly is logged.
6. Run `appliesWhen`. Not applicable: `NOT_TESTED` with its `SecReason` (`SEC_PRECONDITION_UNMET`, `SEC_FIXTURE_MISSING`, `SEC_EXPECTATION_MISSING`, `SEC_INVARIANT_UNDEFINED`, `SEC_IDENTITY_ROLE_UNMAPPED`, `SEC_SIDE_EFFECT_FIXTURE_MISSING`, `SEC_VERSION_UNRESOLVED`, `SEC_ADVISORY_STALE`) or `UNSUPPORTED`/`BLOCKED` where the registry says so, without calling `evaluate`; go to step 10.
7. Call `evaluate(evidenceBatch)` inside try/catch with the short wall-clock bound; a throw or overrun records `BLOCKED` (`SEC_EVALUATION_ERROR`, L11) and never propagates to the owning unit's finalization.
8. Apply the verdict ladder (below) and clamp severity to `severityGuidance.cap` and FR-138 caps (an over-cap result is clamped and logged as an anomaly).
9. A `CONFIRMED_VULNERABILITY` result is accepted only if `confirmable: true` and the evidence batch contains the oracle's fixture-confined proof; otherwise it is downgraded to `LIKELY_VULNERABILITY` (anomaly logged).
10. Record exactly one `SECURITY_CHECK_RESULT` via `recordEvidence` after claiming `IdempotentClaim` scope `sec-evidence-write` with key `"${scanPlanId}:${executionUnitId}:${attempt}:SECURITY_CHECK_RESULT:${check.id}:${check.version}:${scopeKey}"` (FR-135), attributed to the producing unit of the triggering Evidence. The generic (permissive) `recordEvidence` is used because this is registry-dispatched parent-side evidence written after units are terminal (scan-deadline-contract.md "Evidence and finalization fencing" rule 2).
11. Set the check claim's `resultRef` to that Evidence id.
12. For finding verdicts: compute `fingerprintPartsFor` per FR-141 (`[checkVersionMajor, normalizedPathTemplate(apiIdentity), METHOD, identityRole?, parameterName?, probeFamily]`; `checkId` is NOT in the parts because 009 `fingerprintOf` already hashes the `checkId` it is given; no line numbers, timestamps, tokens or response values). Checks sharing a `rootCauseGroup` on the same endpoint all pass the **group's canonical `checkId`** to `fingerprintOf` (L6), so one Finding is produced. Set `Issue.location = METHOD + https://host/path-template` (FR-145), then `materializeFinding` with the `SECURITY_CHECK_RESULT` id plus `supportingEvidenceIds`. `materializeFinding` is independently idempotent; the two guarantees are never substituted for each other. When the per-plan findings cap is reached no further `materializeFinding` call is made: the remaining finding verdicts are summarized in the `SECURITY_CHECK_RESULT` evidence and carry the FLAG `SEC_FINDINGS_CAPPED` (L11; a FLAG annotates a verdict, it is never a verdict). A unit-produced evidence write rejected by the fence is annotated `SEC_STALE_EVIDENCE_REJECTED` (FLAG), never a verdict change.

Non-recursion: `SECURITY_CHECK_RESULT` is excluded from every check's trigger set (rejected at load, step 8) and `onSecurityEvidenceCommitted` returns immediately when `evidence.kind === SECURITY_CHECK_RESULT`.

### Verdict ladder and mapping to 010's six verdicts

| 012 verdict | 010 six-verdict mapping | Materializes Finding | Notes |
|---|---|---|---|
| `CONFIRMED_VULNERABILITY` | `FINDING` | yes | needs `confirmable` + fixture-confined oracle proof (FR-140); never from status code alone, never AI |
| `LIKELY_VULNERABILITY` | `FINDING` | yes | evidence-backed; severity <= HIGH; injection DBMS-error signature stays here (FR-106) |
| `CONFIGURATION_RISK` | `FINDING` | yes | severity <= check cap (<= HIGH; MEDIUM for most) |
| `INFORMATIONAL` | `FINDING` | yes, severity INFO, unscored (FR-142) | |
| `NO_ISSUE_DETECTED` | `PASS` | no | always rendered "no issue detected by N executed probes of check X vN against E endpoints/I identities" (FR-137) |
| `INCONCLUSIVE`, `NOT_TESTED`, `BLOCKED`, `UNSUPPORTED` | same names | no | coverage only |

Ladder rules (decision order inside `evaluate` and the dispatcher): (1) a verdict requiring executed probes is unavailable without those probes' evidence -> `NOT_TESTED` (`SEC_NO_EVIDENCE`); (2) transport error/ambiguous -> `INCONCLUSIVE` (`SEC_RESPONSE_AMBIGUOUS`); (3) weak signal -> `INCONCLUSIVE` (`SEC_SIGNAL_WEAK`); (4) required cleanup failed or unverified -> never `NO_ISSUE_DETECTED` (FR-123; verdict `INCONCLUSIVE` with `SEC_CLEANUP_FAILED`/`SEC_CLEANUP_UNVERIFIED`; an existing `LIKELY`/`CONFIRMED` is kept with cleanup state attached); (5) a high-severity hypothesis is never `CONFIRMED`; (6) a check may record `confirmationLimitation` with flag `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY`.

### `readinessScope` default

Default readiness scope = the narrowest natural identity of the check (see step 1). A check narrows it (to one `(endpointIdentity, identityRef)` pair, one fixture pair, one `RouteIdentity`) by declaring `readinessScope`. A scope function MUST be pure and MUST NOT include a response value, timestamp or token.

### Engine-executed probe identity (FR-148)

Probes are executed by E14/E15 units, not parent-side. Execution identity = `(planId, checkId, checkVersion, endpointIdentity, identityRef?, probeIndex)`. The unit-level `idempotencyKey` is derived per 009 `execution-unit-contract.md` boundary rule 4 (from the unit id and attempt). Before each probe the engine claims `IdempotentClaim` scope `sec-probe-attempt` with key `"${scanPlanId}:${checkId}:${checkVersion}:${endpointIdentity}:${identityRef ?? '-'}:${probeIndex}"`; the claim is written through the fenced wrapper (see `active-security-execution-contract.md`). A recovered unit that finds a claim with `SENT` intent (`mutation-cleanup-contract.md`) does NOT re-send; it records `SEC_MUTATION_SENT_UNCONFIRMED` (FLAG) or `SEC_RESPONSE_AMBIGUOUS` for a non-mutating probe whose result was never recorded (a non-mutating probe with no recorded result MAY be re-sent only if `idempotent: true`, at most `retries <= 1`, consuming budget; otherwise it is recorded `INCONCLUSIVE`).

### `sweepUnresolvedSecurityChecks` and the SECURITY module-result finalizer

Registered as a 009 module-result finalizer (scan-deadline-contract.md rule 4). Runs once after every unit of the plan is terminal, and again on scan-level termination (deadline sweep step 3b, before the guarded `TIMED_OUT` transition) with coverage `complete: false`. Ordering inside the single registered finalizer: (1) sweep, (2) module result.

Sweep, for each registered check applicable to the plan (including `UNSUPPORTED` entries requested) with no `SECURITY_CHECK_RESULT`:
1. Re-attempt claim, readiness and evaluation first (closes the lost wake-up).
2. If the claim is held by a live in-flight dispatcher (no `resultRef`, not stale), do NOT record an outcome for that check; return not-ready and let the next pass retry, so a sweep-recorded `BLOCKED`/`NOT_TESTED` can never overwrite a real verdict. A claim with no `resultRef` older than the owning unit's `timeoutPolicyMs + hardStopMarginMs` is stale (FR-166) and is re-claimable only by a conditional `UPDATE`; it is re-claimed and recorded `INCONCLUSIVE` (`SEC_RESPONSE_AMBIGUOUS`). Stale-claim recovery never re-sends a probe whose durable intent is `SENT` or later (FR-166).
3. Otherwise record: `BLOCKED` with the producing unit's cause (`SEC_UPSTREAM_PRODUCER_FAILED`, or the verbatim F01/F07/009 reason when the unit ended `REFUSED`/`KILLED`, e.g. `NO_MATCHING_GRANT`, `KILL_SWITCH_PENDING`, `SCAN_DEADLINE_EXPIRED`); `BLOCKED` `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` for planning refusals; `NOT_TESTED` `SEC_PRECONDITION_UNMET`/`SEC_NO_EVIDENCE` when the precondition was never satisfied; `NOT_TESTED` `SEC_ENGINE_DISABLED` when a flag/gate is off.
4. Results written by the sweep (not by a live dispatch) carry `synthesized: true` in the `SECURITY_CHECK_RESULT` payload (L33), so coverage can distinguish sweep-recorded outcomes from evaluated ones.
5. The same finalizer writes residual manifests (`CLEANUP_RECORD`, state `RESIDUAL`) and `SESSION_UNCONFIRMED` records for stopped/killed/cancelled/expired units from durable `MutationIntent` rows (FR-162; L3): parent-derived evidence, not unit-produced, therefore not subject to the unit fence; idempotent via the `sec-evidence-write` claim; never sends a request.
6. No applicable check ends a scan without a recorded outcome (FR-147).

Module result (FR-142): `NOT_APPLICABLE` (score `null`) if no check produced a real result (every applicable check is `NOT_TESTED|BLOCKED|UNSUPPORTED`); `COMPLETE` only if every *applicable* requested check produced `NO_ISSUE_DETECTED` or a finding verdict; otherwise `DEGRADED` (any applicable check `NOT_TESTED|BLOCKED|UNSUPPORTED|INCONCLUSIVE`). A partial, refused or scan-terminated pass is never `COMPLETE`. **DEGRADED scoring (L1/FR-142/P13 OWNER-APPROVED)**: because `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']`, a `DEGRADED` SECURITY result is scored from its findings and MUST carry `coverageComplete: false` plus the `securityCoverageSummary`; no consumer may present it as complete or as a security pass; no numeric cap. `NOT_APPLICABLE` carries a `null` score. **Verified (L36)**: `apps/api/prisma/schema.prisma` and `packages/types/src/domain.ts` define `ModuleState = PENDING|RUNNING|COMPLETE|DEGRADED|FAILED|NOT_APPLICABLE`; the three states used here are members; the finalizer never writes `PENDING|RUNNING`. The finalizer is idempotent and writes no score weights (FR-142).

## Invariants

1. Check definitions are immutable per `(id, version)`; a changed probe is a new version; fingerprints use only the major version (FR-150).
2. `classification` stored in the registry equals the loader-recomputed value for every loaded check; no runtime code path reads a self-declared class.
3. No check with computed class >= `C1` has `PRODUCTION` in `allowedEnvironments`.
4. `SECURITY_CHECK_RESULT` is never in any check's trigger set and `onSecurityEvidenceCommitted` is the only writer of that kind (rule 1 below).
5. At most one `SECURITY_CHECK_RESULT` exists per `(scanPlanId, check.id, check.version, scopeKey)`.
6. A `NO_ISSUE_DETECTED` result exists only if every producing unit ended `COMPLETED` (when `requiresProducerCompleted: true`) and no required cleanup failed.
7. `CONFIRMED_VULNERABILITY` exists only for a `confirmable: true` check with an oracle observing fixture-confined proof.
8. `evaluate` is pure, deterministic, synchronous; its output depends only on the evidence batch.
9. Every registered applicable check has a recorded outcome after the sweep.
10. Every `reasonCode` on a result is a member of the closed `SEC_*` registry or an upstream reason passed verbatim.
11. Every `UNSUPPORTED` C4/C5 entry has no probe and no code path.

## Safety & Authorization (F01 / F07 / production)

- The dispatcher runs only in the evaluator service (role `fahes_sec_derive`, never in a worker role), sends no request, calls no model, reads no credential, and consults neither F01 nor F07 (all authorization happened in the producing units and at plan resolution). It reads Evidence already redacted.
- Plan resolution (consuming this registry) applies the domain->class filter: a check whose computed class is `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` against a `PRODUCTION` or unclassified target is recorded `BLOCKED` (`SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`) and no unit is created (FR-078, 007 FR-015a). F01 is consumed unchanged; production passive checks (C0) are allowed.
- `securityScopeGate` data (`actionCategories`, `requiredConsentFlags`) is declared here and enforced by the engines (not by F01; named limitation).
- A check is never silently relabeled passive to bypass production limits: relabeling changes the recomputed class and fails load (Invariant 2).

## Failure states

| Condition | Verdict | Reason code |
|---|---|---|
| Declared class != recomputed class; probe destination not parameterized; missing `abortConditions`; mutating without cleanup; confirmable without oracle; `requiredEvidenceKinds` contains `SECURITY_CHECK_RESULT` | registry load error; affected checks `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| Check against PRODUCTION target, class >= C1 | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` |
| Target unclassified | `BLOCKED` | `SEC_ENVIRONMENT_UNCLASSIFIED` |
| F01 refuses the class | `BLOCKED` | verbatim F01 reason (`NO_MATCHING_GRANT`, `REVOKED`, `EXPIRED`, `BUDGET_EXHAUSTED`, `OUT_OF_SCOPE`, `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`) |
| Producer unit not `COMPLETED` | `BLOCKED` (or finding-only verdicts, never PASS) | `SEC_UPSTREAM_PRODUCER_FAILED` or upstream reason |
| No producing evidence | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| `appliesWhen` false | `NOT_TESTED` | per cause (`SEC_PRECONDITION_UNMET`, `SEC_FIXTURE_MISSING`, ...) |
| Unsupported target/capability | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_TLS_INSPECTION_UNAVAILABLE`, `SEC_OOB_UNSUPPORTED`, `SEC_ECOSYSTEM_UNSUPPORTED` |
| Weak signal / ambiguous | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` / `SEC_RESPONSE_AMBIGUOUS` |
| `evaluate` throws or overruns | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Flag/gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| Cleanup failed/unverified for the step | `INCONCLUSIVE` | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Sweep loses claim to live dispatcher | no outcome recorded this pass | n/a (retry next pass) |

## Idempotency & retry

Scopes: `sec-check-execution` (key above), `sec-probe-attempt` (engine-side, key above), `sec-evidence-write` (FR-135). A redelivery finds `resultRef` set and no-ops. A not-ready outcome releases the claim. The claim is attempted before the readiness query. `materializeFinding` is idempotent by 009. Dispatcher work is parent-side and never retried by a queue; the sweep is its own retry mechanism.

## Evidence

Produces `SECURITY_CHECK_RESULT` payload: `{checkId, checkVersion, classification, scopeKey, verdict, confidence?, reasonCode?, severity?, executedCounts{probes,endpoints,identities}, supportingEvidenceIds[], confirmationLimitation?, cwe[], owasp[], producerStatuses[]}`; no request/response values, no identifiers beyond endpoint identity and fixture-class labels; passed through the value-aware redactor (FR-127). `producerStatuses` makes `requiresProducerCompleted` auditable.

## Budgets / limits

- F07-authoritative: none consumed here (parent-side).
- LOCAL (the registry validates declared ceilings; the engine enforces them): `requestBudget.maxRequests <= 300` for `ACTIVE_SECURITY` checks and `<= 150` for `AUTHENTICATED_WORKFLOW` (per unit, FR-069); `maxPerEndpoint <= 8`; `maxProbesPerOperation <= 8`; `maxMutations <= 3` per fixture; identities <= 4; workflow steps <= 25 (the cap is 25 everywhere; no larger hard cap, L13). A declared value above the platform maximum is a load error. Evaluator wall-clock bound: short, platform constant (not a 012-defined number).

## Reverify

`reverifyBehavior: "FRESH_MINIMAL_PLAN"` is the only legal value (FR-152). The loader requires every finding-capable check to declare the single probe family to re-run and, for `C2`, `requiresFreshConsent: true`. Reverify resolves through 009 `resolvePlan(kind: REVERIFY)` with fresh F01/F07; a reverify that could not execute records `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`, never a pass; an `INCONCLUSIVE` reverify maps to Issue state `UNVERIFIABLE` (FR-164, L5). Check namespaces `sec|auth|authz|api|logic|dep` are routed to the 009 REVERIFY plan path before the legacy `resolveReverifyCapability` (FR-164). `Issue.location` is bound to a concrete destination by `parseSecurityLocation` (FR-163); an unbindable location is `SEC_REVERIFY_UNVERIFIABLE`. Stored exploits are never replayed.

## Boundary rules (MUST NOT)

1. The dispatcher is the only call path that writes `SECURITY_CHECK_RESULT` or calls `materializeFinding` for security checks.
2. `SECURITY_CHECK_RESULT` MUST NOT appear in any trigger set.
3. The claim MUST be attempted before the readiness query; a not-ready outcome MUST release it.
4. Dispatch MUST NOT contain a domain- or check-specific branch; adding a check requires zero dispatcher edits (FR-149).
5. `evaluate` MUST NOT perform I/O, spawn, call a model or read beyond the evidence batch.
6. A check that could not run MUST NEVER read as a check that found nothing; `UNSUPPORTED`/`NOT_TESTED`/`BLOCKED` MUST NEVER become `NO_ISSUE_DETECTED`.
7. The registry MUST NOT accept a class declared by the author; class is computed.
8. SPEC 010's `CHECK_RESULT` and 011's `SOURCE_CHECK_RESULT` payloads/registries MUST NOT be reused or widened.
9. The sweep MUST NOT run before all units are terminal or the scan is terminated, and MUST re-attempt evaluation before assigning `NOT_TESTED`/`BLOCKED`.
10. No probe corpus, payload list or probe definition MAY be downloaded at runtime (FR-066).
11. Reason codes MUST come only from plan.md's closed registry or upstream verbatim.
12. No AI participates in dispatch, readiness, verdict, severity, confidence, scope or fingerprint (FR-144).

## Named limitations

- Class recomputation depends on a registry-author-supplied `probeDefinition` being a complete description of the request; an under-described probe passes load (mitigated by the probe lint and SG6 fixture suite, not eliminated).
- `appliesWhen`/oracle correctness is only as good as fixtures; `CONFIRMED_VULNERABILITY` is limited to customer-registered fixture proof and says so.
- The stale-claim threshold is defined by FR-166 (unit `timeoutPolicyMs + hardStopMarginMs`); the `ModuleState` values are 009's schema (verified, L36).
- `INFORMATIONAL` maps to 010's `FINDING` for compatibility but is unscored.

## FR traceability

FR-001, FR-006..FR-012 (classification, categories, mechanical class); FR-009, FR-146 (definition fields); FR-066 (probe is data); FR-078 (production filter); FR-136..FR-142 (verdicts, ladder, severity, module state); FR-145 (location); FR-147 (dispatch, non-recursion, sweep, finalizer); FR-148 (probe identity); FR-149, FR-150 (loader rejections, immutability); FR-135 (evidence-write claim); FR-141 (canonical `rootCauseGroup` checkId); FR-142 (module state, DEGRADED marker); FR-151..FR-153 (reverify declaration); FR-160 (parallel run: legacy checkers are unaffected); FR-162 (residual manifests from the finalizer); FR-163, FR-164 (location binding, reverify routing, INCONCLUSIVE to UNVERIFIABLE); FR-165 (no AI in dispatch); FR-166 (claim staleness).

## Acceptance tests required (deterministic, fixture-based; not executed in planning)

- `T-REG-class-mismatch-rejected`: a fixture check declaring `C0` with a crafted Origin probe fails load; a GET that the fixture declares state-changing computes `C2`; a read-only POST search computes `C1`.
- `T-REG-load-rejections`: one fixture per FR-149 rejection (destination literal, missing `abortConditions`, mutating without cleanup, confirmable without oracle, `SECURITY_CHECK_RESULT` in required kinds), each fails with a distinct load error.
- `T-REG-unsupported-entry`: a C5 entry with a probe is rejected; a valid C5 entry yields exactly one `UNSUPPORTED` result.
- `T-DISPATCH-claim-before-readiness`: two required kinds arrive out of order; claim is released on not-ready; exactly one result is written after the second kind.
- `T-DISPATCH-non-recursion`: committing a `SECURITY_CHECK_RESULT` triggers zero evaluations.
- `T-DISPATCH-redelivery-noop`: replaying the same Evidence yields one result, one Finding.
- `T-DISPATCH-producer-not-completed`: producer `KILLED` with an evaluate returning `NO_ISSUE_DETECTED` yields `INCONCLUSIVE`; with a finding signal yields the finding verdict.
- `T-DISPATCH-evaluate-throw`: an `evaluate` that throws records `BLOCKED` and does not alter the producing unit's status.
- `T-DISPATCH-confirm-downgrade`: `CONFIRMED` without oracle proof is downgraded to `LIKELY`.
- `T-SWEEP-lost-wakeup`: evidence committed after a released claim is evaluated by the sweep rather than recorded `NOT_TESTED`.
- `T-SWEEP-live-claim`: sweep does not overwrite an in-flight claim; recovers a stale claim as `INCONCLUSIVE`.
- `T-MODULE-state`: all-blocked -> `NOT_APPLICABLE`/`null` score; one `NOT_TESTED` -> `DEGRADED`; all `NO_ISSUE_DETECTED`/findings -> `COMPLETE`; terminated scan never `COMPLETE`.
- `T-PROBE-identity`: a recovered unit with an existing `SENT` claim re-sends nothing.
- `T-PROD-filter`: a PRODUCTION target yields passive results plus `SEC_PRODUCTION_PROHIBITED` for every C1+ check and zero units.

## Resolved additions

- Item 1 (no code for registered C4/C5 unsupported) -> L11: `SEC_PROBE_CLASS_UNSUPPORTED`. Applied in "Unsupported entries".
- Item 2 (evaluator error) -> L11: `SEC_EVALUATION_ERROR` (replaces the earlier proposed evaluator-threw code). Applied in dispatch step 7 and Failure states.
- Item 4 (undefined claim-stale threshold) -> L30/FR-166: unit `timeoutPolicyMs + hardStopMarginMs`, conditional `UPDATE`, never re-sends a `SENT` probe. Applied in sweep step 2.
- Item 5 (lost-claim INCONCLUSIVE recovery) -> now carried by FR-166 text.
- Item 6 (ModuleResult mapping) -> VERIFIED (L36) against `apps/api/prisma/schema.prisma` and `packages/types/src/domain.ts`: `ModuleState = PENDING|RUNNING|COMPLETE|DEGRADED|FAILED|NOT_APPLICABLE`.
- Item 7 (Issue severity must contain INFO) -> VERIFIED (L36): `enum Severity { CRITICAL HIGH MEDIUM LOW INFO }` in `schema.prisma` (used by `Issue.severity`) and `SEVERITIES` in `packages/types/src/domain.ts`.
- L1 (DEGRADED scored with `coverageComplete:false`, NOT_APPLICABLE null, P13 no cap), L3/FR-162, L4/L5 (FR-163/164), L6 (canonical rootCauseGroup checkId), L7/FR-165, L13 (step cap 25), L33 (`synthesized:true`), L34 (facets CONFIGURATION/DEPENDENCY, `preconditionIsApplicability`) applied above.

## Open for closure

No item is open. Registry load failure reason, the findings-cap value (plan Budgets) and the `preconditionIsApplicability` default are decided in Consolidated repairs item 1 and the finding contract.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Load-failure reason**: a registry load failure reuses `SEC_ENGINE_DISABLED` (accepted); steps skipped by a `STOP_BRANCH` use `SEC_PRECONDITION_UNMET` (accepted); `preconditionIsApplicability` defaults to `false`.
2. **Extra loader lints (G-34)**: (a) `AuditLogEntry.action` values come from a closed constant list; (b) copy lint: the word "exploitable" may appear only in text for `CONFIRMED_VULNERABILITY` verdicts; (c) the rendered request must lie inside the computed class envelope.
3. **Persisted partial marker (FR-186)**: the module-result finalizer writes `ModuleResult.coverageComplete` (`true` only for `COMPLETE`); it is read by report/overall/014.
4. **Redaction cost watchdog (FR-174)**: every evaluator classifier job runs in the HostileTextExecutor and is terminated at the hard timeout (200 ms), tripping `SEC_ANALYSIS_BUDGET_EXHAUSTED` and failing closed; a same-thread watchdog is not accepted (FR-174).
5. **No private divergence (FR-159)**: every upstream gap is recorded in `upstream-amendment-requests.md` (none is required to complete planning; AR-13 is required for activation and AR-18 is a required clarification before activation); the registry never widens 010 `CHECK_RESULT` or 011 `SOURCE_CHECK_RESULT`.
6. **Claim staleness (FR-166)** stands as written; stale-claim recovery never re-sends a `SENT` probe and is disabled for credentialed units (FR-183).
7. **Group materialization (B-9, FR-141)**: a registry flag `groupMaterialization: true` (required for every check with a `rootCauseGroup`) defers `materializeFinding` to the finalizer barrier described in `security-finding-contract.md`; the loader rejects a grouped check that calls `materializeFinding` directly.
8. **Coverage-required snapshot (FR-186)**: scan creation writes `Scan.capabilitySnapshot.x012.coverageRequired`; the finalizer always writes an explicit boolean `coverageComplete` for such scans.
