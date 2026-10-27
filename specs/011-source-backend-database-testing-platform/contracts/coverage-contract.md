# Contract: Source Coverage Summary

Per FR-088, FR-089, FR-090, FR-112, FR-113, FR-126, FR-127, FR-145, FR-149. Consumers: report rendering, SPEC 014
(readiness, as input only), `source-reverify-contract.md`, operators. SPEC 010's coverage contract is
restated here, not imported: this spec depends on no 010 code (`SOURCE_CHECK_RESULT` replaces `CHECK_RESULT`).

## Signature (shape, not final TypeScript)

```text
scanSourceCoverageSummary(scanPlanId: string) -> {
  unitCoverage: ReturnType<typeof scanCoverageSummary>,        // 009, unchanged, extended not replaced
  sourceAnalysisCoverage: {                                      // section 1
    workspaces: { workspacePath, language, supportTier, filesAnalyzed, filesSkipped: {reasonCode,count}[],
                  filesParseFailed, filesInSnapshot, rulesExecuted, rulesSkipped: {ruleId,reasonCode}[],
                  suppressedObservations }[],
    budgetExhausted?: { dimension }, complete: boolean },
  platformCapabilityCoverage: {                                  // section 2
    checks: { checkId, checkVersion, domain: ModuleType, supportTier, verdictCounts: Record<CheckVerdict,number>,
              reasonCodeCounts: Record<string,number> }[] },
  testExecutionStatus: {                                         // section 3
    suites: { discovered, executed, passed, failed, skipped, byResultStatus: Record<TestResultStatus,number> },
    cases: { discovered, executed, passed, failed, skipped },
    routesExercised: { inventoried, probed }, migrationsExercised: { declared, applied },
    schemaObjectsAnalyzed: { kind: string, count: number }[] },
  codeCoverageMetrics: { workspacePath, tool, toolVersion, instrumentationConfigRef, exclusions: string[],
    filesMeasured, filesInSnapshot (the analyzable denominator, invariant 5), unsupportedPortions: string[], flags: ReasonCode[],
    statements?, branches?, functions?, lines? : { covered, total, pct } }[],     // section 4
  toolchainDrift: { workspacePath, previousImageId?, currentImageId, driftDetected: boolean }[]
}
```

## Inputs

Read-only over `ExecutionUnit` rows (009), `SOURCE_CHECK_RESULT`, `SOURCE_MANIFEST`, `TEST_RESULT`,
`COVERAGE_REPORT`, `SOURCE_SURFACE`, `SCHEMA_SNAPSHOT`, `MIGRATION_RESULT`, `CONTRACT_RESULT` Evidence of
the plan. Every read filters by the owning tenant `(id, userId)` (FR-145); a non-owner gets NotFound indistinguishable from a
nonexistent plan. Coverage is requested through the `coverage` parameter of the test templates (`off|v8|istanbul`; command-policy-contract).

## Outputs

The structure above. Four sections are physically separate keys and are never merged into one score,
percentage or label (FR-090). `codeCoverageMetrics` is an empty list when no instrumentation produced data.

## Ownership

Result/Evidence side of 009's read model, extended by SPEC 011. SPEC 011 owns this function and the
`COVERAGE_REPORT` payload; 009 owns `scanCoverageSummary`; SPEC 014 owns any readiness judgment.

## Invariants

1. Six-value taxonomy restated for source: `PASS`, `FINDING`, `NOT_TESTED`, `UNSUPPORTED`, `BLOCKED`,
   `INCONCLUSIVE`. `UNSUPPORTED` means language, runtime, framework, tool or database dialect not
   supported; `NOT_TESTED` means precondition false or required infrastructure absent; `BLOCKED` means
   dependency/scope/authorization refusal or a thrown `evaluate`; `INCONCLUSIVE` means insufficient
   evidence. Never collapsed into one "skipped" bucket (FR-113).
2. Every applicable Source Check ends with exactly one `SOURCE_CHECK_RESULT` (FR-112); the finalization
   sweep `sweepUnresolvedSourceChecks` guarantees none is missing; counts here are over those rows.
3. Code-coverage metrics are reported only when real instrumentation produced them: Vitest (v8 or
   istanbul provider), Jest coverage, or Node test coverage / c8, requested via the test template's `coverage` parameter. Each entry records tool, tool version,
   instrumentation configuration, exclusions, files measured, files in snapshot, unsupported portions and
   snapshot digest (FR-088).
4. Metrics MUST NOT be inferred from test counts and MUST NOT be aggregated across tools or workspaces;
   there is no universal percentage. Entries are per tool and per workspace.
5. `COVERAGE_EXCLUDES_MOST_FILES` is a FLAG (annotation) attached to the `codeCoverageMetrics` entry (and its
   `COVERAGE_REPORT`) when `filesMeasured / filesInSnapshot < 0.5` (provisional ratio, hard-enforced). The denominator is
   `filesInSnapshot` = Tier-1 source files in the snapshot, excluding credential-denylist files and generated or vendored
   paths (`node_modules`, `dist`, `build`, `.next`, `coverage`, `vendor`, `*.d.ts`, `*.min.js`; versioned code-level data).
   The flag is never a verdict: the check `tests.coverage-breadth` records `INCONCLUSIVE` and no Finding is created. Full
   application coverage is never claimed because existing tests passed (FR-089). `pct` is derived only as
   `covered / total * 100` (two decimals) from the instrumentation tool's own counts; counts are authoritative and `pct`
   is never inferred from test counts or aggregated.
6. `routesExercised`, `migrationsExercised`, `schemaObjectsAnalyzed` are counters of what was actually
   probed/applied/analyzed; they are never presented as percentage coverage of customer behavior.
7. `toolchainDrift` flags when image or tool identity differs from the most recent prior scan of the same
   repository workspace; drift never changes fingerprints (FR-120) but is always surfaced. The prior-scan lookup is filtered by the same tenant
   (`userId`) AND the same target and never crosses tenants, even for the same public repository (FR-149); with no same-tenant
   prior scan, `previousImageId` is absent and `driftDetected` is `false`, and nothing about another tenant's runs is exposed.
8. The function computes no verdict, no readiness, no score, no "good enough" (FR-127, FR-137).
9. Partial results are never "complete": `complete` is `false` whenever any budget was exhausted, any
   unit was non-COMPLETED, any Tier-1 workspace partition was not executed (`WORKSPACE_CAP_EXCEEDED`), the scan was terminated by a scan-level sweep or deadline before every unit was terminal (U-1 context), or any check lacks a terminal outcome; the non-contributing units and reasons
   are listed (FR-126).
11. Runner-reported labelling (FR-155): every test, lint or build pass/fail in the summary carries `reportSource: "RUNNER_REPORTED"`; the coverage statement says "runner-reported" and never "verified".
12. ModuleResult mapping (FR-154): the summary exposes, per new `ModuleType`, the inputs of the additive state mapping (all applicable checks PASS/FINDING => COMPLETE; some PASS/FINDING with any non-PASS/FINDING => DEGRADED; none PASS/FINDING => NOT_APPLICABLE; platform failure with no results => FAILED). It computes no score; the legacy `100 - deductions` formula is untouched, and a module whose checks are all UNSUPPORTED/NOT_TESTED therefore never scores 100 (fixture: an unsupported-language project yields NOT_APPLICABLE).
10. Unsupported input never reads as pass: a Tier-3 language yields `UNSUPPORTED` counts, with zero `PASS`.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict / effect |
|---|---|---|---|
| Instrumentation absent, not requested, or failed | `COVERAGE_NOT_INSTRUMENTED` | none | section 4 empty (no metric reported); coverage checks `NOT_TESTED` |
| Instrumentation unsupported by runner/version | `UNSUPPORTED_RUNNER` | none | `UNSUPPORTED` |
| Few files measured | `COVERAGE_EXCLUDES_MOST_FILES` (FLAG) | none | flag on the entry; check `tests.coverage-breadth` `INCONCLUSIVE` |
| Test Step with coverage not started (run envelope exhausted) | `RUN_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` |
| Plan not found / not owned | n/a | read error, tenant-scoped | no data returned |
| Evidence unreadable | n/a | `ENGINE_DEFECT` | affected section marked `unavailable`, never zero-filled |

## Safety

Read-only; no execution, no network. Counters never expose paths of credential-denylist files (paths
only as `EXCLUDED_CREDENTIAL_FILE` counts). No customer source text appears in this summary.

## Idempotency

Pure function over committed Evidence; same inputs yield identical output (stable ordering by workspace
path then checkId). Safe to call repeatedly and concurrently.

## Consumers

Report API/UI source section, SPEC 014 readiness engine (consumes facts, judges elsewhere),
reverify (compares drift flags), operators.

## Non-negotiable boundary rules

1. The four sections MUST stay separate; no combined coverage number may be produced.
2. Code coverage MUST come only from real instrumentation output, never from counts or AI.
3. `UNSUPPORTED` and `NOT_TESTED` MUST remain distinguishable from each other and from `PASS`.
4. No readiness verdict or score MUST be computed here (SPEC 014).
5. Partial or budget-exhausted analysis MUST NOT be reported as complete.
6. Tool version MUST NOT enter fingerprints; it MUST be recorded and drift flagged.
7. This contract MUST NOT import SPEC 010 code or widen its `CHECK_RESULT` payload.
