# Contract: Source Rule and Source Check Registry

Per FR-022, FR-023, FR-025, FR-031..FR-034, FR-032, FR-145, FR-149, FR-111, FR-112, FR-113, FR-120, FR-135, FR-137. The one generic dispatch mechanism that turns committed source Evidence into `SOURCE_CHECK_RESULT` Evidence and, where warranted, a Finding. Same seam as SPEC 010's web-check registry, restated for source; consumed by pattern, not by code. Consumers: Domains D, E, F, G; `scanSourceCoverageSummary`.

## Signature (shape, not final TypeScript)

```text
SourceRule = { ruleId, ruleVersion: semver, ruleClass: "DETERMINISTIC_DEFECT" | "MAINTAINABILITY_RISK" | "HEURISTIC_SUGGESTION",
               languages[], severityCap, appliesWhen(ctx), params (versioned defaults), fingerprintPartsFor(obs),
               falsePositiveHandling: { suppressionComment, frameworkAllowlist?, confidence } }
SourceCheckDefinition = { id, version: semver, domain: ModuleType (SOURCE_QUALITY | BACKEND | DATABASE | AUTOMATED_TESTS),
               requiredEvidenceKinds[] (never SOURCE_CHECK_RESULT), requiredEngine: "SOURCE_STATIC" | "SOURCE_EXECUTION" | "NONE",
               supportTier: 1 | 2, ruleClass, appliesWhen(ctx), readinessScope?(evidence), evaluate(batch) -> CheckOutcome,
               fingerprintPartsFor(batch, outcome), reverifyStrategy }
CheckOutcome = { verdict, reasonCode?, severity?, supportingEvidenceIds[] }
onSourceEvidenceCommitted(evidence, scanPlanId) -> void
sweepUnresolvedSourceChecks(scanPlanId) -> void
```

## Inputs

Committed Evidence rows of any kind except `SOURCE_CHECK_RESULT`; detection results; the code-level registry (loaded and validated at startup).

## Outputs

Exactly one `SOURCE_CHECK_RESULT` Evidence per check execution (six verdicts: `PASS`, `FINDING`, `NOT_TESTED`, `UNSUPPORTED`, `BLOCKED`, `INCONCLUSIVE`); for `FINDING`, a Finding via 009 `materializeFinding`.

## Ownership

Contexts D, E, F, G declare checks; the dispatcher is a single shared component (parent-worker side). Owning spec: 011.

## Invariants

1. Severity caps (FR-023): `DETERMINISTIC_DEFECT` up to CRITICAL; `MAINTAINABILITY_RISK` <= MEDIUM; `HEURISTIC_SUGGESTION` <= LOW and never a readiness blocker. A style preference is never CRITICAL. Caps are enforced at registry load and again when the outcome is built (an over-cap severity is clamped and logged as an anomaly).
2. Registry load rejects: a check listing `SOURCE_CHECK_RESULT` in `requiredEvidenceKinds`; a duplicate `(id, version)`; a cap that violates invariant 1; a missing `fingerprintPartsFor`.
3. AI-only interpretations never become Findings (FR-032); no AI participates in dispatch, readiness, verdict, severity or fingerprint (FR-137).
4. A check's `evaluate` is pure, deterministic, synchronous, with no I/O and no AI.
5. Check-id prefixes and domains (R2): static source checks `src.*` (SOURCE_QUALITY), backend `backend.*` (BACKEND), database `db.*` (DATABASE); execution-derived checks (build, framework build, type-check, lint execution, tests, coverage) belong to `AUTOMATED_TESTS` with ids `tests.build.*`, `tests.typecheck.*`, `tests.lint.*`, `tests.run.*`, `tests.coverage.*`. Source Quality may consume `TOOL_DIAGNOSTIC` from lint for maintainability signals, but those are `src.*` checks.
6. `ruleClass` semantics: the three recorded classes are `DETERMINISTIC_DEFECT`, `MAINTAINABILITY_RISK`, `HEURISTIC_SUGGESTION`; severity caps are ceilings, never floors (a `DETERMINISTIC_DEFECT` may be LOW). FR-032's fourth class (AI-only) is never a `ruleClass`, a check or a Finding; it exists only as `AI_JUDGMENT` in AI-layer output.
7. Prior-evidence lookups (toolchain-drift flag, reverify comparison) are filtered by tenant and target and never cross tenants (FR-149); every read path filters by owning tenant `(id, userId)` (FR-145).

## `onSourceEvidenceCommitted` (parent-worker-side, once per newly committed non-`SOURCE_CHECK_RESULT` Evidence)

1. For every check whose `requiredEvidenceKinds` includes `evidence.kind`: compute `scopeKey = check.readinessScope?(evidence) ?? "${workspacePath}@${snapshotDigest}"` (default readiness scope = workspace partition plus snapshot digest; a check may narrow to one file or suite). `claimKey = "${scanPlanId}:${check.id}:${check.version}:${scopeKey}"` (begins with `scanPlanId`, so keys never collide across tenants or scans).
2. Attempt `IdempotentClaim` scope `source-check-execution` on `claimKey`; if not won, stop.
3. Query that every kind in `requiredEvidenceKinds` has a committed row for `scopeKey`. Not ready: delete the claim and stop.
4. Ready: run `appliesWhen`. Not applicable: record `NOT_TESTED` (or `UNSUPPORTED` when the workspace tier fails `supportTier`, reason from the registry) without calling `evaluate`; go to step 8.
5. If the producing evidence carries `confidence: LOW`: record `INCONCLUSIVE` (`LOW_DETECTION_CONFIDENCE`); go to step 8.
6. Call `evaluate(evidenceBatch)` inside try/catch; a throw or an overrun of the short wall-clock bound records `BLOCKED` and never propagates to unit finalization.
7. Observers have already emitted (E12/E13 side); `evaluate` only interprets. Clamp severity to the rule-class cap.
8. Record exactly one `SOURCE_CHECK_RESULT` via `recordEvidence` (first claiming `evidence-write`, `source-evidence-contract.md`), attributed to the producing unit of the triggering evidence (`executionUnitId` of that Evidence row).
9. Set the claim's `resultRef` to that Evidence id.
10. For `FINDING`: `fingerprintPartsFor` (parts per `source-evidence-contract.md`, no line numbers or tool versions), then `materializeFinding` with the `SOURCE_CHECK_RESULT` id plus `supportingEvidenceIds`; per-test and cap rules in `source-evidence-contract.md`.

## `sweepUnresolvedSourceChecks`

It is registered as a SPEC 009 **module-result finalizer** (together with the FR-154 `ModuleResult` mapping): 009 calls it from the scan completion gate `continueScanIfPlanTerminal` and, for an expired plan, from the sweep BEFORE the guarded `TIMED_OUT` transaction so that refunds reflect delivered results. If the sweep loses a `source-check-execution` claim to a live in-flight dispatcher (claim held, no `resultRef`, not yet stale per 010), it does NOT record an outcome for that check: it returns not-ready and the next sweep pass (or the 009 self-healing pass) retries, so a sweep-recorded `BLOCKED`/`NOT_TESTED` can never overwrite a real verdict; a claim still unresolved after the 010 stale threshold is re-claimed and recorded `INCONCLUSIVE`. Runs exactly once after every unit in the plan is terminal, and also once on scan-level termination (for example when the scan-wide timeout sweep or U-1 deadline ends the scan), in which case the coverage summary is marked `complete: false`. For each registered check applicable to the plan with no `SOURCE_CHECK_RESULT`, the sweep FIRST re-attempts claim, readiness and `evaluate` (this closes the lost wake-up in which a trigger lost the claim to a concurrent attempt that then saw "not ready" and released it, although the evidence had since committed); only checks that still cannot be evaluated receive an outcome: `BLOCKED` if its producing unit ended `FAILED`, `CANCELLED`, `KILLED`, `REFUSED` or `BLOCKED` (including `EXECUTION_PLANE_UNAVAILABLE`); `NOT_TESTED` if its precondition was never satisfied by anything the plan produced. No applicable check ends a scan without a recorded outcome (FR-112, FR-113).

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|---|---|---|---|
| `evaluate` throws or overruns | (none; internal error named in payload) | `ENGINE_DEFECT` | `BLOCKED` |
| Language/tier unsupported | `UNSUPPORTED_LANGUAGE` | none | `UNSUPPORTED` |
| Precondition absent | per cause (e.g. `NO_LOCKFILE`, `REQUIRES_EXTERNAL_SERVICE`) | none | `NOT_TESTED` |
| Producer unit not `COMPLETED` | cause code (e.g. `EXECUTION_PLANE_UNAVAILABLE`) | unit's own | `BLOCKED` |
| Partial analysis | `ANALYSIS_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` |

## Safety

Dispatcher runs in the trusted worker only, never inside E12's child or the Guest; it reads Evidence already redacted and writes only through 009.

## Idempotency

Scope `source-check-execution`, key above; a redelivery finds `resultRef` set and no-ops. `materializeFinding` is independently idempotent (009); the two guarantees are not substituted for each other (FR-135).

## Consumers

Domain check modules; coverage summary; report materialization; reverify.

## Non-negotiable boundary rules

1. This is the only call path that writes `SOURCE_CHECK_RESULT` or calls `materializeFinding` for source checks.
2. `SOURCE_CHECK_RESULT` is never in the trigger set (checked at registry load).
3. The claim MUST be attempted before the readiness query; a not-ready outcome MUST release the claim.
4. Dispatch is by declared evidence kind alone; no domain-specific or check-specific branch exists in the dispatcher; adding a check or rule needs zero dispatcher edits.
5. `evaluate` MUST NOT perform I/O, spawn, call a model, or read anything beyond the evidence batch.
6. A check that could not run MUST NEVER read as a check that found nothing; unsupported MUST NEVER become `PASS`. A check whose `requiredEngine` is `SOURCE_EXECUTION` or `SOURCE_STATIC` may record `PASS` only if EVERY producing unit of its required evidence ended `COMPLETED` (the dispatcher reads the producer status; evidence committed by a unit that was killed, expired, failed or refused before completing is kept (FR-038) but can only support `FINDING`, `INCONCLUSIVE` or `BLOCKED`, never `PASS`). Default `requiresProducerCompleted: true` on every `SourceCheckDefinition`.
7. `sweepUnresolvedSourceChecks` MUST NOT run before all units are terminal (or the scan is terminated), is idempotent (its claims make a repeat run after scan-level termination a no-op for already-recorded checks and it MAY therefore run at plan end and again on termination), and MUST re-attempt evaluation before assigning `NOT_TESTED`/`BLOCKED`. Units left `RUNNING` with no live lease and no live Execution Plane run are finalized by the 011 maintenance sweep `finalizeStuckSourceExecutionUnits` (`FAILED` + `TRANSIENT_INFRASTRUCTURE`) so that the sweep can complete.
8. SPEC 010's `CHECK_RESULT` payload and registry are neither reused nor widened.
9. Reason codes come only from the registry in `source-evidence-contract.md`.
