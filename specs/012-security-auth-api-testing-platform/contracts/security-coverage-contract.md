# Contract: Security Coverage Summary and SECURITY Module Result

Per FR-137, FR-142, FR-143, FR-147, FR-155, FR-157, FR-162, FR-165, FR-166, SC-002, SC-003. Owns `securityCoverageSummary(scanPlanId)`, the seven distinguished states, the mapping of check verdicts to the `SECURITY` module-result state and score rule, the rendering rule that no findings is not a pass, and the 014 handoff. SPEC 010's six-value taxonomy and 011's coverage pattern are restated, not imported: 012 depends on no 010/011 code (`SECURITY_CHECK_RESULT` replaces `CHECK_RESULT`).

## Status / Ownership

- Status: planning contract, NOT frozen.
- Ownership: 012 owns `securityCoverageSummary`, the facet definitions and the registered SECURITY module-result finalizer (`sweepUnresolvedSecurityChecks`, FR-147). 009 owns `scanCoverageSummary` (unit-level) and the module-result finalizer hook; `packages/scoring` owns the score formula; SPEC 014 owns every readiness judgment.
- Pattern: mirrors 011 `coverage-contract.md` (sections kept physically separate, partial never complete, UNSUPPORTED vs NOT_TESTED distinct) and 010 `coverage-contract.md` (sweep guarantees one verdict per check).

## Consumers

- Report API/UI SECURITY section; the registered module-result finalizer (writes `ModuleResult`); `apps/worker/src/orchestrator/timeout.ts` `isDelivered`/refund path (reads the resulting state); SPEC 014 readiness/correlation (facts only); `security-reverify-contract.md`; operators.

## Inputs

Read-only over, for the plan: 009 `ExecutionUnit` rows; `SECURITY_CHECK_RESULT`, `API_SURFACE`, `AUTH_STATE_TRANSITION`, `PERMISSION_COMPARISON`, `CLEANUP_RECORD`, `ADVISORY_MATCH`, `HTTP_TRANSACTION` (counts only) Evidence; `CapabilityExecution` rows of legacy SECURITY capabilities (facts only, never merged); `AdvisorySnapshot` metadata (digest, import time). Every read filters by the owning tenant `(id, userId)`; a non-owner gets NotFound indistinguishable from nonexistent.

## Outputs

```text
type Facet = "API" | "AUTH" | "AUTHZ" | "BUSINESS_LOGIC" | "CONFIGURATION" | "DEPENDENCY"    // coverage facets, NOT ModuleTypes (Clarification)
type CoverageState =                                                                          // the seven distinguished states (FR-143)
  "NO_ISSUE_DETECTED_IN_EXECUTED_CHECKS" | "NO_CHECKS_EXECUTED" | "INSUFFICIENT_PERMISSIONS"
  | "MISSING_CREDENTIALS" | "UNSUPPORTED_TARGET" | "INCONCLUSIVE_RESPONSE" | "INCOMPLETE_SCAN"

securityCoverageSummary(scanPlanId: string) -> {
  unitCoverage: ReturnType<typeof scanCoverageSummary>,          // 009, unchanged, extended not replaced
  checks: { checkId, checkVersion, facet, classification, executionClass,
            verdictCounts: Record<SecurityVerdict, number>, reasonCodeCounts: Record<string, number> }[],
  api:      { discovered, authorized, tested, attemptedNoResponse, skipped: number,
              skippedByReason: { reason: string, count: number }[], byOrigin: Record<"OPENAPI"|"SOURCE_DERIVED"|"OBSERVED", number>,
              surfaceComplete: boolean },
  auth:     { statesExercised: StateName[], identitiesTested: number, rolesTested: string[], loginAttempts: number,
              lockoutSignals: number, mfaChallengesObserved: number },
  authz:    { expectationsDeclared, expectationsMissing, ownershipPairsTested, outcomeCounts: Record<ObservedOutcomeClass, number> },
  workflow: { stepsDeclared, stepsExecuted, invariantsEvaluated, invariantsUndefined },
  probeFamilies: { family: string, probesExecuted: number, endpoints: number }[],
  blockedUnsupported: { verdict: "BLOCKED"|"UNSUPPORTED", reason: string, count: number }[],
  cleanup:  { mutations, reverted, residual, unverified, sentUnconfirmed },
  advisory: { snapshotDigest?: string, snapshotAgeDays?: number, packagesMatched: number, unresolvedVersions: number, unsupportedEcosystems: string[] },
  legacyCapabilities: { capabilityId, succeeded, skippedReason?, findingCount }[],     // facts, never merged into verdict counts
  states: Record<CoverageState, { present: boolean, checkCount: number, reasons: string[] }>,
  moduleResultInputs: { applicableChecks, executedChecks, noIssue, findings, notTested, blocked, unsupported, inconclusive,
                        proposedState: "COMPLETE"|"DEGRADED"|"NOT_APPLICABLE"|"FAILED", proposedScore: number | null,
                        coverageComplete: boolean },
  complete: boolean,            // the `coverageComplete` marker: false whenever the result is DEGRADED (L1/FR-142)
  nonContributing: { unitId, status, reason?: string }[]
}
```

`checks`, `api`, `auth`, `authz`, `workflow`, `cleanup`, `advisory` and `legacyCapabilities` are physically separate keys and are never merged into one score, one percentage or one label. No coverage percentage of "security" is ever produced.

## Operations

```text
securityCoverageSummary(scanPlanId) -> SecurityCoverageSummary                 // pure read
sweepUnresolvedSecurityChecks(scanPlanId) -> void                              // registered 009 module-result finalizer; idempotent
finalizeSecurityModuleResult(scanPlanId) -> ModuleResult                       // called by the finalizer; calls the pure read, then upserts
renderSecurityStatement(summary, locale) -> StatementBlocks                    // deterministic templates; FR-137 wording
```

Ordered steps of the registered finalizer (it runs before the scan's delivered/undelivered refund computation, 009 `scan-deadline-contract.md` §Sweep step 3b):

1. `sweepUnresolvedSecurityChecks`: for every registered check applicable to the plan (by `targetApplicability` and requested profile) with no `SECURITY_CHECK_RESULT`, write one: `BLOCKED` with the upstream/SEC reason if the producer unit was refused/killed/expired (`SEC_UPSTREAM_PRODUCER_FAILED`, F01/F07/009 reasons verbatim), else `NOT_TESTED` (`SEC_NO_EVIDENCE`, `SEC_ENGINE_DISABLED` or `SEC_PRECONDITION_UNMET`). For every `API_SURFACE` row without a test outcome, record a skip reason (below). Claim each write with `sec-check-execution`.
2. `summary = securityCoverageSummary(scanPlanId)`.
3. Map to module state and score (below).
4. Write `ModuleResult` on `(scanId, module = SECURITY)` under the **single-writer rule (FR-196)**: the legacy persist path updates only through a guarded `updateMany where coverageComplete IS NULL`; this finalizer is the last writer, runs in one transaction (insert-if-absent, row lock), recomputes the score over all SECURITY `Issue` rows (legacy and 012), sets the state by FR-142 and writes `coverageComplete` (tri-state, FR-186). `skippedReason`/`degradedReason` carry the sorted list of closed reason codes, never prose.
5. Return; the 009 sweep then computes delivered/undelivered from the written state.

## SECURITY module-result state and score (FR-142)

| Condition (over **applicable** requested checks) | `ModuleResult.state` | score |
|---|---|---|
| every applicable check produced `NO_ISSUE_DETECTED` or a finding verdict (at least one applicable check exists) | `COMPLETE` | `scoreFromFindings(materialized findings)` (unchanged formula; INFO = 0) |
| at least one real result (`NO_ISSUE_DETECTED` or finding) AND at least one applicable check is `NOT_TESTED`, `BLOCKED`, `UNSUPPORTED` or `INCONCLUSIVE` | `DEGRADED` | `scoreFromFindings(materialized findings)` **with mandatory `coverageComplete: false` and the `securityCoverageSummary`** (L1/FR-142; `MODULE_STATES_SCORED` includes `DEGRADED`, so a null score here would be an upstream bug); P13 OWNER-APPROVED (no numeric cap; observed score preserved with the marker) |
| no applicable check produced a real result | `NOT_APPLICABLE` | `null` (excluded from the overall mean) |
| the finalizer or evaluator itself failed (platform defect), no results | `FAILED` | `null` |

Marker and display rule (L1, superseded by FR-186/FR-188): `ModuleResult.coverageComplete` is a **persisted additive tri-state column** (`true` complete, `false` partial, `null` only for scans not evaluated by 012; `null` on a scan with `Scan.capabilitySnapshot.x012.coverageRequired` is treated as `false`). A `DEGRADED` SECURITY score is preserved as the observed score and is **never** a readiness PASS, never rendered as complete or secure, and every consumer applies `securityCoverageGate` (FR-188). `summary` carries the serialized coverage JSON; the marker is no longer carried by `summary`/`degradedReason`.

"Applicable" = registered for the requested domains and target kind (static, from the plan) minus checks whose registry `coverageBehavior.preconditionIsApplicability` is true **and** whose result is `NOT_TESTED` + `SEC_PRECONDITION_UNMET` (they are counted and listed under `blockedUnsupported` but do not make the area `DEGRADED`; L34). A **lockfile-level scope** (`dep.*`) is covered when **any** per-match `ADVISORY_MATCH` result exists for it; match-level `scopeKey`s are finer than the lockfile scope (L34). A check that ran and found nothing (for example no `Set-Cookie` header to evaluate) is `NO_ISSUE_DETECTED`, not `NOT_TESTED`.

A partial or refused scan is never `COMPLETE` and is never presented as complete or as a pass: the invariants below make `state != COMPLETE` imply the **persisted** `coverageComplete == false` (FR-186), and `NOT_APPLICABLE`/`FAILED` imply `score == null`; a `DEGRADED` score is computed from findings and always travels with `coverageComplete:false` and the coverage summary. The overall product score is computed by `packages/scoring` from whatever the state/score pair is; 012 changes no weight.

## The seven distinguished states (FR-143)

`states` is a record, not a single label: several can be present at once. Each rule below is a mapping over `reasonCodeCounts`; the mapping table is data, versioned with the registry. An unmapped reason code is treated as `INCOMPLETE_SCAN` and flagged as a registry defect (conservative).

| State | Present when | Typical reason codes (closed registry or upstream verbatim) |
|---|---|---|
| `NO_ISSUE_DETECTED_IN_EXECUTED_CHECKS` | at least one result `NO_ISSUE_DETECTED` | - (rendered only with the FR-137 statement) |
| `NO_CHECKS_EXECUTED` | zero results are `NO_ISSUE_DETECTED` or a finding | `SEC_NO_EVIDENCE`, `SEC_ENGINE_DISABLED`, `SEC_PRECONDITION_UNMET`, `SEC_FIXTURE_MISSING`, `SEC_EXPECTATION_MISSING`, `SEC_INVARIANT_UNDEFINED`, `SEC_SIDE_EFFECT_FIXTURE_MISSING`, `SEC_IDENTITY_ROLE_UNMAPPED` |
| `INSUFFICIENT_PERMISSIONS` | any result `BLOCKED` for authorization/scope/consent | `SEC_PRODUCTION_PROHIBITED`, `SEC_ENVIRONMENT_UNCLASSIFIED`, `SEC_ACTION_CATEGORY_NOT_GRANTED`, `SEC_IDENTITY_NOT_IN_SCOPE`, `SEC_CONSENT_MISSING`, `SEC_API_NOT_AUTHORIZED`, `SEC_MUTATION_NOT_PERMITTED`, `SEC_SCOPE_GATE_ERROR`, `SEC_BROKER_DENIED`, `SEC_FIXTURE_RESIDUAL_BLOCKED`, `SEC_WORKFLOW_INVALID`, `SEC_DESTINATION_PROHIBITED`, `SEC_REDIRECT_OUT_OF_SCOPE`, `SEC_SAFE_NET_REFUSED`; F01 `NO_MATCHING_GRANT`, `REVOKED`, `EXPIRED`, `OUT_OF_SCOPE`, `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED` |
| `MISSING_CREDENTIALS` | any result `BLOCKED` for credential/session usability | `SEC_CREDENTIAL_MISSING/_EXPIRED/_REVOKED/_REJECTED/_RATE_LIMITED/_SCOPE_INVALID`, `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`, `SEC_BROKER_UNAVAILABLE`, `SEC_MFA_CHALLENGE_UNSUPPORTED`, `SEC_MFA_TIMEOUT`, `SEC_SESSION_*`, `SEC_ACCOUNT_LOCKOUT_RISK` |
| `UNSUPPORTED_TARGET` | any result `UNSUPPORTED` | `SEC_PROBE_CLASS_UNSUPPORTED`, `SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_UNSUPPORTED_CREDENTIAL_KIND`, `SEC_TLS_INSPECTION_UNAVAILABLE`, `SEC_OOB_UNSUPPORTED`, `SEC_ECOSYSTEM_UNSUPPORTED` |
| `INCONCLUSIVE_RESPONSE` | any result `INCONCLUSIVE` | `SEC_SIGNAL_WEAK`, `SEC_RESPONSE_AMBIGUOUS`, `SEC_FIXTURE_LIMITATION`, `SEC_CLEANUP_FAILED`, `SEC_CLEANUP_UNVERIFIED`, `SEC_REVERIFY_UNVERIFIABLE`, `SEC_ENDPOINT_GONE` |
| `INCOMPLETE_SCAN` | any unit non-`COMPLETED`, any budget exhausted, deadline/cancel/kill, sweep-synthesized result, upstream producer failure | `SEC_BUDGET_LOCAL_*`, `SEC_RATE_LIMIT_ENCOUNTERED`, `SEC_UPSTREAM_PRODUCER_FAILED`, `SEC_API_SURFACE_INCOMPLETE` (FLAG), `SEC_ADVISORY_STALE`, `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE`, `SEC_VERSION_UNRESOLVED`, `SEC_UPSTREAM_PRODUCER_FAILED`, `SEC_EVALUATION_ERROR`, `SEC_ANALYSIS_BUDGET_EXHAUSTED`, `SEC_API_SPEC_*`, FLAGs `SEC_FINDINGS_CAPPED`, `SEC_STALE_EVIDENCE_REJECTED`; F07 `BUDGET_EXHAUSTED_REQUEST/_CONCURRENCY`, `KILL_SWITCH_PENDING`, `INTERNAL_ERROR`; 009 `SCAN_DEADLINE_EXPIRED`, `SCAN_DEADLINE_INSUFFICIENT`, `SCAN_CANCELLED`, `SCAN_FAILED`, `TERMINATION_UNCONFIRMED` |

Nothing is collapsed into one "skipped" bucket: the per-reason counts in `blockedUnsupported` and `checks[].reasonCodeCounts` remain visible so a customer can see exactly why a facet was not tested.

## Counter definitions (deterministic)

- `api.discovered` = distinct `apiIdentity` in `API_SURFACE` for the plan. `api.authorized` = those with `scopeVerdict == IN_SCOPE` **and** the active grant lists the needed class **and** action category (probe-eligible, FR-100). `api.tested` = those with at least one executed probe whose `HTTP_TRANSACTION.outcome.kind == RESPONSE`. `attemptedNoResponse` = sent but transport error/timeout. `skipped = discovered - tested`, each with exactly one reason; `sum(skippedByReason) == skipped`. Skip reasons are closed codes: `SEC_API_NOT_AUTHORIZED` (not probe-eligible), F01 `OUT_OF_SCOPE` verbatim for a host outside scope, `SEC_BUDGET_*`, `SEC_FIXTURE_MISSING`, `SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_ENGINE_DISABLED`, `SEC_NO_EVIDENCE`.
- `auth.statesExercised` = distinct `toState` in `AUTH_STATE_TRANSITION`; `identitiesTested` = distinct `identityRef`; `rolesTested` = distinct `TestRole.key` (labels only, never credentials or identity names).
- `authz.ownershipPairsTested` = distinct `(actorIdentityRef, fixtureOwnerIdentityRef, operationIdentity)` in `PERMISSION_COMPARISON` with an executed observation; `expectationsMissing` counts `SEC_EXPECTATION_MISSING` results.
- `workflow.stepsExecuted` counts executed workflow steps (not planned); `invariantsUndefined` counts `SEC_INVARIANT_UNDEFINED` results.
- `probeFamilies` groups executed probes by registry `probeFamily` (for example `cors-origin`, `unauth-access`, `input-canary`, `schema-violation`); counters of what ran, never a percentage of customer behavior.
- `cleanup.*` counts `CLEANUP_RECORD` terminal states; `residual + unverified + sentUnconfirmed > 0` forces `INCONCLUSIVE_RESPONSE` and blocks `NO_ISSUE_DETECTED` for the affected checks (FR-123).
- `complete == false` whenever any unit is non-`COMPLETED`, any budget was exhausted, any applicable check lacks a real result, `surfaceComplete == false`, the scan ended by sweep/deadline/cancel/kill, or the advisory snapshot was stale; `nonContributing` lists those units and reasons.

## Rendering rule: no findings is not a pass (FR-137)

1. The only positive statement permitted is the scoped one: *"No issue detected by {N} executed probes of check {checkId} v{version} against {E} endpoints / {I} identities."* generated from `statementTemplateId` + counts. It is always followed by the coverage line *"{executed} of {applicable} applicable checks executed; {notTested} not tested, {blocked} blocked, {unsupported} unsupported, {inconclusive} inconclusive."*
2. Forbidden strings (copy-lint, case-insensitive) in any 012-sourced report text: `secure`, `passed security`, `security: pass`, `no vulnerabilities`, `safe`, `OWASP Top 10 compliant`, `penetration test`, `pentest`, `fully tested`, and a bare `PASS`. Legacy marketing labels "OWASP Top 10 / pentest" are deprecated claims (plan.md migration map).
3. A zero-findings scan with `NO_CHECKS_EXECUTED` renders "No security checks were executed" with the reasons; a zero-findings scan with `INCOMPLETE_SCAN` renders "Incomplete; results cover only what ran".
4. `NOT_TESTED`, `UNSUPPORTED`, `BLOCKED`, `INCONCLUSIVE` render as four distinct labels with their reason codes translated through a static code-to-text table; never one "skipped" bucket.
5. Facets (`API`, `AUTH`, `AUTHZ`, `BUSINESS_LOGIC`, ...) are headings **inside** the SECURITY section. They are not `ModuleType` values, have no own score and no own `ModuleResult` row (Clarification: reuse `SECURITY`).
6. **Worker-reported evidence and late legacy rows (IC-3, IC-6)**: every SECURITY section, export and readiness surface carries two captions: "results rest on worker-reported evidence; they are not independently attested" (FR-173 residual (4)) and, for any security issue created after the finalizer's timestamp, "created after coverage finalization" (FR-196(d)). `COMPLETE` is a coverage state, never an attestation of truth, and no consumer may drop either caption.

## Interplay with 009, 010 and legacy

- 009: `unitCoverage` embeds `scanCoverageSummary(scanPlanId)` unchanged (completed vs non-completed units and reasons). `securityCoverageSummary` adds check-level facts; it never replaces unit-level facts.
- 010: the six-value taxonomy is restated via `toCheckVerdict` (`security-finding-contract.md`); 012 does not read `CHECK_RESULT`; 010 browser/crawler-derived inputs appear only as the producing units' status and as `API_SURFACE.origin == OBSERVED` counts.
- Legacy: `legacyCapabilities` lists `CapabilityExecution` outcomes for `headers-checker`, `owasp-checker`, `ssl-analyzer`, `data-leak-scanner`, `dependency-scanner` during the strict parallel run (FR-160). Their findings keep their existing semantics and are not counted in 012 verdict counts; a legacy capability success never turns a 012 check from `NOT_TESTED` into `NO_ISSUE_DETECTED`.
- Refund semantics (WARNING): `apps/worker/src/orchestrator/timeout.ts` `isDelivered(state)` treats `COMPLETE` and `DEGRADED` as delivered and `NOT_APPLICABLE`/`FAILED` as undelivered, and a timed-out scan is refunded per delivered area using the written module state. Therefore the registered finalizer MUST write the state correctly **before** the refund is computed. Writing `COMPLETE`/`DEGRADED` when nothing real ran bills for nothing; writing `NOT_APPLICABLE` when passive checks really ran refunds a delivered area. Pricing remains F06's (ADR-005); until then expiry refunds follow delivered-area semantics only.

## Handoff to SPEC 014 (FR-157)

014 consumes, read-only: `securityCoverageSummary`, stable `rootCauseGroup`, `API_SURFACE.apiIdentity` and 011 `RouteIdentity` (`correlationGrammarVersion: 1`), `SECURITY_CHECK_RESULT` verdicts. Correlation, remediation ordering and any readiness verdict are 014's; this contract computes no readiness, no "good enough", no combined score.

## Invariants

1. Every applicable check ends with exactly one `SECURITY_CHECK_RESULT`; after the sweep no applicable check lacks one (counts are over those rows).
2. `discovered >= authorized >= tested`, `skipped == discovered - tested`, and `sum(skippedByReason) == skipped`.
3. `ModuleResult.state == COMPLETE` iff every applicable check is `NO_ISSUE_DETECTED` or a finding verdict (and at least one applicable check exists).
4. `state != COMPLETE` implies `coverageComplete == false`; `NOT_APPLICABLE` and `FAILED` always imply `score == null`; a `DEGRADED` result carries a findings-derived score together with `coverageComplete: false` and the coverage summary (L1); no consumer presents it as complete or as a pass.
5. An area whose checks are all `NOT_TESTED`/`BLOCKED`/`UNSUPPORTED` is `NOT_APPLICABLE` with a `null` score, never scored 100 (fixture: all active units refused and no passive evidence).
6. `NO_ISSUE_DETECTED` counts only checks that actually executed at least one probe or evaluation over real evidence; sweep-synthesized results (`synthesized: true`, L33) are never `NO_ISSUE_DETECTED`.
7. `states.NO_ISSUE_DETECTED_IN_EXECUTED_CHECKS.present` never suppresses the presence of any other state; the renderer prints every present state.
8. The summary computes no verdict, readiness, score or percentage (FR-143).
9. Partial results are never `complete`.
10. Same inputs yield identical output (stable ordering by facet, then checkId, then reason).
11. `UNSUPPORTED` and `NOT_TESTED` remain distinguishable from each other and from `NO_ISSUE_DETECTED`.
12. Facets introduce no `ModuleType` value and no extra `ModuleResult` row.
13. The summary contains no secret, no URL query value, no identity name, no credential and no response content.

## Safety & Authorization

Read-only; no execution, no network, no credential. It reveals only counts, closed reason codes, role labels and API identities already visible to the owning tenant. Cross-tenant requests get NotFound.

## Failure states

| Condition | Verdict / status | Reason code |
|---|---|---|
| Plan not found / not owned | read error, no data | n/a (NotFound) |
| Evidence section unreadable | that section marked `unavailable`, never zero-filled; `complete: false` | n/a (`ENGINE_DEFECT`) |
| Finalizer cannot compute (internal error) | `ModuleResult` `FAILED`, score `null`; fail closed, no partial `COMPLETE` | n/a (`ENGINE_DEFECT`) |
| Check has no result at finalization | sweep writes `BLOCKED`/`NOT_TESTED` | `SEC_UPSTREAM_PRODUCER_FAILED` / upstream verbatim / `SEC_NO_EVIDENCE` / `SEC_ENGINE_DISABLED` / `SEC_PRECONDITION_UNMET` |
| Stale claim re-claimed by the sweep (FR-166) | `INCONCLUSIVE` result, `synthesized: true` | `SEC_RESPONSE_AMBIGUOUS` |
| Reason code not in state-mapping table | counted as `INCOMPLETE_SCAN`; registry-defect flag | none |
| No applicable checks at all | `NOT_APPLICABLE` | `SEC_ENGINE_DISABLED` (flag off) or `SEC_NO_EVIDENCE` |
| Surface incomplete | `complete: false` | `SEC_API_SURFACE_INCOMPLETE` (FLAG) |

## Idempotency & retry

Pure function; safe concurrently and repeatedly. The sweep and finalizer are idempotent: sweep writes are claimed with `sec-check-execution`; the module result is an upsert on `(scanId, module)`; a replay yields the same state and score. A reverify plan returns the same shape for its single-unit plan and MUST NOT create or modify the origin scan's SECURITY `ModuleResult`.

## Evidence

The summary is derived from Evidence; it creates none. The finalizer's synthesized results are `SECURITY_CHECK_RESULT` rows with `producerUnitIds` empty and a `synthesized: true` marker so they can never be confused with executed checks.

## Budgets / limits

LOCAL: none consumed (no network). Output bounded: `checks` <= number of registered checks; `skippedByReason` entries bounded by the closed registry; no unbounded lists (`nonContributing` capped at 200 with a count of the remainder, provisional). F07: none.

## Reverify

Coverage for a REVERIFY plan reports its single check and unit only; `complete` reflects that plan. Reverify outcomes and reasons are in `security-reverify-contract.md`. A reverify does not rewrite the origin scan's coverage.

## Boundary rules (MUST NOT)

1. MUST NOT render absence of findings as pass, secure or complete.
2. MUST NOT present a `DEGRADED` SECURITY score as complete or as a pass, MUST NOT drop the `coverageComplete: false` marker or the coverage summary from it, and MUST NOT report a full score for any non-`COMPLETE` result (L1/FR-142).
3. MUST NOT add a `ModuleType`, a facet score or a facet `ModuleResult`.
4. MUST NOT merge legacy capability outcomes into 012 verdict counts.
5. MUST NOT zero-fill unreadable sections or hide `NOT_TESTED`/`BLOCKED` behind a total.
6. MUST NOT compute readiness, "good enough" or a combined security percentage (014's).
7. MUST NOT write the module state before the sweep has made every applicable check terminal.
8. MUST NOT let a legacy capability's success or a feature flag convert missing 012 coverage into a pass.
9. MUST NOT expose secrets, identities, query values or response content.

## Named limitations

1. Counters measure what ran, not application security; no percentage of "tested behavior" is claimed.
2. `tested` counts an endpoint once any probe returned a response; it does not say how thorough the probes were (see `probeFamilies`).
3. `INSUFFICIENT_PERMISSIONS`, `MISSING_CREDENTIALS` and `UNSUPPORTED_TARGET` are derived from reason-code mapping; customer-missing-test-data reasons (`SEC_FIXTURE_MISSING`, `SEC_EXPECTATION_MISSING`, `SEC_INVARIANT_UNDEFINED`) surface under `NO_CHECKS_EXECUTED` with full reason detail rather than a dedicated state (no eighth state is invented).
4. Strict parallel run: legacy `owasp-checker` etc. keep their own non-verdict semantics (no PASS concept); the legacy module state is still determined by the existing module runner, and a scan with both may show legacy findings under a 012 `DEGRADED` result.
5. A `DEGRADED` SECURITY score is computed from findings only and therefore can read higher than the real posture because unexecuted checks contribute no deduction; the mandatory `coverageComplete: false` marker and no-cap decision (P13 OWNER-APPROVED) are the mitigation, not a guarantee.

## FR traceability

FR-137 (rendering), FR-142 (module state/score), FR-143 (counters and seven states), FR-147 (sweep/finalizer), FR-155/156 (010/011 inputs), FR-157 (013/014 handoff), FR-160 (parallel run), SC-002 (closed reasons), SC-003 (refused scan is DEGRADED with `coverageComplete: false`, or NOT_APPLICABLE with a null score), FR-162 (finalizer writes residual manifests; cleanup counters), FR-165 (AI explanation only), FR-166 (stale claims recorded `INCONCLUSIVE`), Clarification "Reuse SECURITY; facets not modules".

## Acceptance tests required (named, deterministic, fixture-based; not executed in planning)

| Test | Fixture | Expected |
|---|---|---|
| `coverage.all-active-refused-production` | PRODUCTION target, passive evidence absent, active units refused | `NOT_APPLICABLE`, score `null`, states include `INSUFFICIENT_PERMISSIONS` + `NO_CHECKS_EXECUTED` |
| `coverage.passive-only-production` | passive checks executed, active BLOCKED | `DEGRADED`, score from findings with `coverageComplete: false`, rendered as incomplete (never as complete or a pass), `INCOMPLETE_SCAN`/`INSUFFICIENT_PERMISSIONS` present |
| `coverage.complete-all-executed` | all applicable checks `NO_ISSUE_DETECTED`/findings | `COMPLETE`, score from findings, FR-137 statements present |
| `coverage.states.seven-distinguished` | one fixture per state, plus a mixed fixture | each state flagged exactly when its reasons present; mixed shows several |
| `coverage.unmapped-reason-conservative` | injected unknown reason | counted as `INCOMPLETE_SCAN`, defect flag |
| `coverage.api.counters` | spec with 40 ops, 12 in scope (US5) | discovered 40, authorized 12, tested <= 12, skipped 28 with reasons, sum equal |
| `coverage.api.external-ref-no-network` | spec with external `$ref` | `SEC_API_SPEC_EXTERNAL_REF_REFUSED`; zero network calls |
| `coverage.no-findings-not-pass` | zero findings, partial execution | rendered text passes copy-lint; no forbidden strings; shows executed-of-applicable line |
| `coverage.copy-lint-forbidden-strings` | renderer over all templates | none of the forbidden strings appear |
| `coverage.legacy-not-merged` | legacy cookie finding + 012 `NOT_TESTED` | verdict counts unchanged by legacy; `legacyCapabilities` lists it |
| `coverage.cleanup-forces-inconclusive` | residual `CLEANUP_RECORD` + clean probe | `NO_ISSUE_DETECTED` converted; `INCONCLUSIVE_RESPONSE` present |
| `coverage.sweep-guarantees-result` | check without result at deadline | sweep writes `BLOCKED`/`NOT_TESTED` with closed reason; summary complete over those rows |
| `coverage.module-result-before-refund` | timed-out scan with partial results | finalizer writes state before `refundForUndelivered` computation; delivered area not refunded |
| `coverage.facets-not-modules` | scan with API/AUTH/AUTHZ checks | exactly one SECURITY `ModuleResult`; no new ModuleType |
| `coverage.degraded-marker-mandatory` | any `DEGRADED` result | `coverageComplete: false` and coverage summary present; renderer never emits a complete/pass label |
| `coverage.idempotent-finalizer` | finalizer run twice | same state/score, no duplicate results |
| `coverage.tenant-isolation` | cross-tenant plan id | NotFound indistinguishable |
| `coverage.reverify-no-origin-rewrite` | REVERIFY plan completes | origin scan `ModuleResult` unchanged |

## Resolved additions

- C-1 (DEGRADED score vs existing scoring/refund code) -> L1/FR-142/SC-003: option (b) variant adopted: `DEGRADED` is scored from findings with mandatory `coverageComplete: false` and the coverage summary; no consumer may present it as complete or as a pass; `NOT_APPLICABLE` carries `null`; P13 OWNER-APPROVED: no numeric cap (the proposal's "capped below 100" is replaced by the mandatory marker). Applied in the state table, invariants 4-5, boundary rule 2, named limitation 5 and tests.
- C-3 (definition of "applicable") -> L34: `coverageBehavior.preconditionIsApplicability` adopted (registry contract carries the field).
- C-4 (facet vocabulary) -> L34: `CONFIGURATION` and `DEPENDENCY` facets adopted; lockfile scope is covered by any per-match result.
- C-6 (`synthesized: true`) -> L33: adopted; also in security-evidence-contract payload and data-model 7.2.
- L36 verified: `ModuleState = PENDING|RUNNING|COMPLETE|DEGRADED|FAILED|NOT_APPLICABLE` and `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']` (`packages/types/src/domain.ts`); `ModuleResult` columns are `score`, `summary`, `skippedReason`, `degradedReason` (`apps/api/prisma/schema.prisma`); `Severity` includes `INFO`.

## Open for closure

- C-2 (resolved): the existing `FAILED` module state is a valid `ModuleState` (verified) and FR-142 now states that 012 writes it only for a finalizer/evaluator platform defect with no results; 012 adds no new state.
- C-5: customer-missing-test-data reasons surface under `NO_CHECKS_EXECUTED`, no eighth state. Owner: confirm.
- C-7: refund WARNING relies on `isDelivered` in `apps/worker/src/orchestrator/timeout.ts`, which treats `DEGRADED` as delivered. Owner (F06): confirm pricing will not change delivered-area semantics for SECURITY with active classes.
- Persistence of the `coverageComplete` marker: RESOLVED by FR-186 (additive column `ModuleResult.coverageComplete`, migration M012-5c).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Persisted partial marker (F-1, G-3, FR-186)**: `ModuleResult.coverageComplete Boolean?` (additive column, migration M012-5c) is written by the finalizer; `ModuleResult.summary` carries the serialized coverage JSON (F-40). A `DEGRADED` SECURITY result is scored from its findings (the repository's `aggregate.ts` documents that nulling a computable score *inflates* the overall) and is **never** presented as complete or as a pass; report, overall-score consumer and SPEC 014 read `coverageComplete`. The statement "a partial scan never receives a full security score" is replaced by: "a partial scan's score is always accompanied by `coverageComplete:false` and the coverage summary; `null` score only for `NOT_APPLICABLE`". P13 is OWNER-APPROVED (2026-10-11): no cap; the observed score is preserved with the marker. Test `coverage.passive-only-production-no-100` asserts the marker, the label and that the overall output lists SECURITY among partial areas.
2. **Module states**: 012 adds no new `ModuleState`. The existing `FAILED` is written only when the finalizer or evaluator itself fails with a platform defect and no results (score `null`, `coverageComplete` false); a unit-level total failure yields `NOT_APPLICABLE` only if nothing was measured, else `DEGRADED`; if the finalizer's own transaction fails the marker stays `null` and consumers treat it as incomplete (FR-186, FR-196).
3. **Readiness and consumer gating (B-3, FR-188; P13 OWNER-APPROVED).** `securityCoverageGate(area)` is `COMPLETE` iff `coverageComplete === true` or the scan did not require 012 coverage; a `null` on a coverage-required scan is `INCOMPLETE`. Observed scores are preserved. Readiness (`apps/worker/src/readiness/verdict.ts`, `run.ts`, `diff.ts`): the area `pass` requires `COMPLETE`; `ModuleOutcome` gains `coverageComplete` and `observedScore`; `blockers` gains `SECURITY_COVERAGE_INCOMPLETE`; `isReady = false`; a coverage regression vs the baseline is a regression blocker. Certificates (`certificate.ts`, `create.ts`): issuance requires a ready verdict **and** `COMPLETE`. Reports, exports, routes, notifications, share/badge surfaces and web pages show "security coverage incomplete — observed score N". `overallScore()` gains the additive `partialModules`; the numeric result is unchanged. Compatibility: strictly additive over the existing readiness contract (001 FR-066..072); SPEC 014 receives `coverageComplete` as a mandatory input. **Decision tests, not string lints**: `readiness.security-partial-is-no-go` (clean passive + all active blocked => `isReady=false`, blocker present, observed score shown), `certificate.refused-when-security-incomplete`, `report.export.carry-coverage-fields`, `overallscore.partial-modules-additive`, `consumer.contract-enumerates-every-consumer`.
4. **Single writer on `ModuleResult(SECURITY)` (FR-196).** Every legacy SECURITY write — `ModuleResult`, `Issue` and `CapabilityExecution` rows — runs in one legacy transaction that inserts the row if absent (`upsert` with an empty update clause or `createMany` with `skipDuplicates`), takes `SELECT ... FOR UPDATE` on `(scanId, SECURITY)` and checks `coverageComplete IS NULL`; if the finalizer has already committed it writes nothing, discards the late legacy result and audits `module_result.legacy_late_dropped` with the dropped counts (a late legacy result is only possible after the barrier declared the legacy phase terminally failed or deadline-expired, so `coverageComplete` is already false and the score is never computed over a set of issues that later changes). The 012 finalizer runs in one transaction: insert-if-absent, `SELECT ... FOR UPDATE`, recompute the score over all SECURITY `Issue` rows (legacy and 012) via `scoreFromFindings`, set the state (FR-142), write `coverageComplete = AND(012 completeness, legacy phase delivered)` and commit; a module-result finalizer barrier delays it until the legacy SECURITY phase result exists or terminally failed. A failed transaction leaves `null`, treated as INCOMPLETE on a coverage-required scan. Tests `modulresult.legacy-late-write-rejected`, `modulresult.legacy-late-issues-and-capabilities-dropped`, `modulresult.single-writer-merge`, `modulresult.finalizer-transaction-failure-null-is-incomplete`, `modulresult.legacy-failed-phase-marks-incomplete`.
5. **Live progress events are consumers (FR-188).** The module-result events in `packages/types/src/events.ts` (which carry `score`), `apps/worker/src/orchestrator/emit.ts`, `apps/api/src/services/realtime/*`, `apps/web/lib/realtime.ts` and `apps/web/components/scan/ScanProgress.tsx` gain the additive `coverageComplete` and `observedScore`; for a coverage-required scan the SECURITY module event is emitted only after the finalizer's transaction commits and always carries `coverageComplete` (never an unmarked score); the progress UI shows "security coverage incomplete" instead of a passing score. Tests `events.security-carries-coverage-marker`, `events.no-security-score-before-finalizer-commit`, `web.progress-never-shows-secure-when-incomplete`.
6. **Billing (FR-189, FR-198; P15 approved as a principle only, P17 PROPOSED and NOT approved).** `securityBillableWorkSummary(scanPlanId)` is a read-only input reporting per class `plannedWeight`, `executedWeight` and refused/blocked/not-tested counts, including the legacy SECURITY capabilities in `PASSIVE_SECURITY` (weight 1 per planned / delivered legacy `CapabilityExecution`); legacy capability results are not merged into 012 evidence but do count in the passive weights in `CLASS_LEVEL` mode. **Default `AREA_COUNT` mode (every scan until P17 and AR-17 are approved)**: today's billing and refunds are unchanged — the single up-front debit, `AREA_COST`, `refundForUndelivered` with `DEGRADED` delivered — and active/authenticated work is not purchasable (`SEC_ENGINE_DISABLED`); the passive partial-coverage billing gap is stated in FR-189. **`CLASS_LEVEL` mode** (only for scans created after the owner approves P17 and the ADR-005 amendment): settlement runs once per `ScanPlan` at terminal state (COMPLETED, FAILED, TIMED_OUT, CANCELLED); `executedWeight` counts checks with a non-synthesized result that is `NO_ISSUE_DETECTED`, a finding verdict, or `INCONCLUSIVE` with at least one admitted request or completed evaluation; `BLOCKED`, `NOT_TESTED`, `UNSUPPORTED`, refused, synthesized and platform-failure-lost work weigh 0; charge per class = `floor(classPrice x executedWeight / plannedWeight)`, `plannedWeight = 0` => charge 0 and the class price refunded, refund = sum of `classPrice - classCharge` (rounding favors the customer); idempotent through `SecuritySettlement` unique on `scanPlanId` (replay is a no-op; reverify billed separately); the SECURITY area is then excluded from `refundForUndelivered` (no double refund) and the existing platform-failure refund of that area is replaced by the weight rules; cancellation weighs in-flight checks without a committed verdict as 0. Ownership: the worker terminal path (`terminal-refund.ts`) calls `settleSecurityClasses`; the credit ledger and refund-to-originating-lot rule are reused; `SecuritySettlement` follows the credit ledger's retention (FR-167). Tests `billing.default-mode-unchanged`, `billing.partial-not-auto-full`, `billing.unexecuted-class-not-billed`, `billing.legacy-capabilities-weighted`, `billing.planned-weight-zero`, `billing.platform-failure-lost-work-weighs-zero`, `billing.settlement-idempotent-replay`, `billing.rounding-favors-customer`, `billing.cancel-mid-run-executed-weight-only`, `billing.no-double-refund-with-area-count`, `billing.scans-without-requirement-unchanged`, `billing.active-authenticated-not-purchasable`.
