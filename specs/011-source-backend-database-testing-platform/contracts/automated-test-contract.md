# Contract: Automated Test Discovery, Execution Interpretation and Rerun Policy

Per FR-077 through FR-090 (plus FR-056, FR-111, FR-112, FR-120). Consumers: Automated Tests domain
(`ModuleType AUTOMATED_TESTS`) Source Checks, `coverage-contract.md`, `source-reverify-contract.md`,
the Source Check dispatcher. Reason codes come only from the registry owned by
`source-evidence-contract.md` (FR-136; verdicts below follow its R1 reconciliation); this file lists the ones it uses.
Check ids for everything here use the prefix `tests.run.*` (R2; `tests.run.none-found`, `tests.timed-out` and similar are
`tests.run.*` ids owned by `plan.md`'s severity table).

## Signature (shape, not final TypeScript)

```text
discoverTests(snapshot, workspace) -> SuiteClassification[]            // static, SOURCE_STATIC, executes nothing
interpretTestRun(discovery: SuiteClassification[], stepResult: ExecutionStepResult,
                 reporterOutput: TestReporterOutput) -> SuiteResult[]  // pure, trusted side, no I/O
SuiteClassification = { workspacePath, suiteFile, runnerId: "vitest"|"jest"|"node-test"|"pytest",
  state: "DISCOVERED"|"SUPPORTED"|"UNSUPPORTED_RUNNER"|"REQUIRES_CONFIGURATION"|"REQUIRES_EXTERNAL_SERVICE"
        |"REQUIRES_SECRETS"|"UNSAFE_TO_EXECUTE", reasonCode, discoveredCaseCount, confidence }
SuiteResult = { suiteFile, resultStatus: TestResultStatus, verdict: CheckVerdict, reasonCode?,
  cases: TestCaseResult[], attempts: number }
TestResultStatus = "NO_TESTS_FOUND"|"NOT_DISCOVERED"|"UNSUPPORTED_RUNNER"|"RUNNER_SETUP_FAILED"|"SKIPPED"
                 |"EXECUTED_PASSED"|"EXECUTED_FAILED"|"RUNNER_REPORTED_ZERO_TESTS"
```

## Inputs

- A committed Source Snapshot (digest verified) and detection evidence (`SOURCE_MANIFEST`).
- Static test-file discovery for Vitest, Jest and `node:test` (Tier 1) and pytest (Tier 2, discovery only,
  never executed, FR-029). Discovery parses files with the E12 AST; it never evaluates `vitest.config`,
  `jest.config` or any executable config (FR-019); such configs yield `EXECUTABLE_CONFIG_PRESENT`.
- Step output from a Command Template (`test.vitest`, `test.jest`, `test.nodetest`) as untrusted data,
  parsed from structured reporters only (`--reporter=json`, `--json`, TAP/JSON); never from free-text logs.
- Discovery cap: at most 5,000 test files per workspace (provisional); excess yields partial discovery, reason
  `DISCOVERY_CAPPED` (`INCONCLUSIVE` for affected checks), never "complete" (FR-027).

## Outputs

- `TEST_RESULT` Evidence per suite (payload essentials below) and one `SOURCE_CHECK_RESULT` per check.
- Findings via `materializeFinding` (FR-120); an aggregate Finding when capped.
- Verdict mapping (restated six-value taxonomy; no seventh value, FR-112/113):

| TestResultStatus | Verdict | Notes |
|---|---|---|
| `EXECUTED_PASSED` | `PASS` (labelled runner-reported) | roll-up rule: only if executed >= 1, executed count matches discovery (Invariant 2) and skipped cases are at most 50% of discovered cases; more than 50% skipped (but not all) yields `INCONCLUSIVE` with reason `MOSTLY_SKIPPED` (one pass plus 999 skips is never a clean suite) |
| `EXECUTED_FAILED` | `FINDING` | one Finding per failing case |
| `NO_TESTS_FOUND` | `FINDING` (`tests.run.none-found`, MAINTAINABILITY_RISK, max MEDIUM), emitted ONLY at HIGH discovery confidence on a Tier-1 workspace; at lower confidence the reason is `LOW_DETECTION_CONFIDENCE` and the verdict `INCONCLUSIVE` (never `NO_TESTS_FOUND`) | FR-080 |
| `NOT_DISCOVERED` | `NOT_TESTED` | tests may exist outside discovery reach; recorded, never `PASS` |
| `UNSUPPORTED_RUNNER` | `UNSUPPORTED` | |
| `RUNNER_SETUP_FAILED` | `BLOCKED` | fixture or runner startup, not a test failure (FR-084) |
| `SKIPPED` (every case skipped) | `INCONCLUSIVE`, reason `ALL_TESTS_SKIPPED` | never `PASS` |
| mixed suite (some passed, some skipped, none failed) | status `EXECUTED_PASSED` -> `PASS`, with the skipped count and skipped case identities recorded in `TEST_RESULT` and surfaced in coverage | `TestResultStatus` is single-valued: any failed case -> `EXECUTED_FAILED`; else >= 1 executed passed case -> `EXECUTED_PASSED`; else all skipped -> `SKIPPED` |
| `RUNNER_REPORTED_ZERO_TESTS` | `INCONCLUSIVE` | `RUNNER_REPORTED_ZERO_TESTS` |
| step `TIMED_OUT` (step result) | `INCONCLUSIVE` for suites with no parsed result | see Invariant 7 |

## Ownership

Automated Tests domain owns discovery rules, interpretation and the checks. E13 owns execution only and
emits `EXECUTION_STEP_RESULT`/`TEST_RESULT` raw evidence. This contract does not execute anything.

## Invariants

1. Test Discovery, Test Execution and Test Result Interpretation are three separate steps with separate
   evidence; none infers another.
2. Reconciliation: executed case count from the reporter MUST be compared to static discovery. Exit code
   0 is never proof that tests ran; zero discovered tests is never `PASS`; a suite whose cases are all
   skipped is never `PASS`; discovered files with zero reporter cases yield `RUNNER_REPORTED_ZERO_TESTS`.
   A reporter count lower than discovery for non-skipped files yields `INCONCLUSIVE` naming the delta.
3. TestCase identity = `(suiteFile, describePath[], testName, duplicateIndex)`, workspace-relative,
   independent of line numbers; `duplicateIndex` is the 0-based order among identical triples.
4. `TEST_RESULT` payload essentials: `runnerId`, `runnerVersion`, `suiteFile`, per-case `{identity, status:
   passed|failed|skipped|timedOut, durationMs, errorMessage?, stack? (redacted), attemptIndex}`,
   `networkBlockedAttempts`, `exitCode`, `imageId`, `snapshotDigest`, `sequenceSeed?`, `reporterFormat`,
   `discoveredCount`, `executedCount`. All text passes `@webaudit/redaction` (FR-117).
5. One Finding per failing test case; cap 100 per scan plan across all units (provisional). Beyond the cap one aggregate Finding
   carries `FINDINGS_CAPPED` and the full list as Evidence/Artifact; none silently dropped. Fingerprint
   parts: `[runnerId, suiteFile, describePath+testName(+duplicateIndex)]` (FR-120; no line, no tool version).
6. Rerun policy: only failed tests; at most 2 reruns; only for Steps that are fixture-less unit-test Steps
   (`rerunSafe` is true ONLY for unit-test steps that start no fixtures). ALL integration Steps, even those with a
   resettable fixture (`TRUNCATE_RESEED`/`RESTORE_TEMPLATE`), and all state-mutating suites are never rerun in v1. A test failing then passing is `FLAKY_SUSPECTED`
   (MAINTAINABILITY_RISK); the original failure and all attempts' evidence are retained. Retry-until-green
   is forbidden. Reruns consume the same budgets and F07 checkpoints; one failure alone is never "flaky".
7. A step exceeding its per-step wall clock (clamped to the remaining run envelope) yields a `TIMED_OUT` STEP result,
   not a reason on a customer verdict; the unit still ends `COMPLETED` (FR-056, FR-087) and the affected checks are
   `INCONCLUSIVE` (the cause is ambiguous, so the customer is not accused). Test Steps are planned per suite file for
   integration suites and per workspace batch for fixture-less unit suites; reporter output parsed before the timeout is
   preserved ONLY when the runner is launched with a streaming reporter and the agent persists incremental results (Vitest/Jest/`node:test` are run with a streaming reporter variant; where that is unavailable the sentence does not hold and the whole step is `INCONCLUSIVE`). A single test exceeding its own per-test limit,
   as reported by the runner, is simply a failed test case (`FINDING`). Steps not started because the run envelope is
   exhausted are `INCONCLUSIVE` with `RUN_BUDGET_EXHAUSTED`. Snapshot-update flags are not in any test template (command-policy invariant 9).
8. Nondeterminism controls recorded in evidence: `TZ=UTC`, fixed locale, runner seed options
   (`--sequence.seed`, `--seed`) where supported, network frozen offline, sequence order recorded.
9. Integration tests run only against in-Guest fixtures (disposable PostgreSQL, selected service doubles,
   local app instance). Customer external services are unsupported: suites needing them classify
   `REQUIRES_EXTERNAL_SERVICE`; a test that fails after the run recorded `networkBlockedAttempts>0` before that failure is attributed `NETWORK_BLOCKED_BY_POLICY` (`NOT_TESTED`), not a customer `FINDING`, because the customer's code was never given the network it expected (attribution rule; a failure with zero blocked attempts remains a normal failed case) and is never `PASS` (FR-082). Fixture start failure is `RUNNER_SETUP_FAILED`/`BLOCKED` with fixture id.

10. Runner-reported wording (FR-155): every PASS/FAIL derived from reporter output is labelled **runner-reported** in `TEST_RESULT`, check reasons and the coverage statement; a customer process can print a well-formed forged report, so count reconciliation (Invariant 2) is the only cross-check and the result is never described as independently verified. Fixtures: `reporter-forge`, `vsock-forge`.
11. HIGH discovery confidence (the only condition under which `NO_TESTS_FOUND` may be emitted): every discovered candidate test file parsed successfully by the TypeScript adapter, at least one recognized runner configuration or dependency is present, and discovery was not capped (`DISCOVERY_CAPPED`).
12. Root-cause grouping: failures whose normalized first-error signature and originating workspace-relative path are identical (for example one syntax error in a shared module that breaks every suite at load time) are grouped under one `rootCauseKey` and produce ONE root-cause Finding with the affected suites listed, instead of N per-suite findings (fingerprint family "Root-cause group", `source-evidence-contract.md`); the per-scan-plan Finding cap (100) applies after grouping.
13. Tests that depend on Git LFS pointer files that were never resolved (`LFS_POINTER_UNRESOLVED`) fail for a reason Fahes caused: their failures are `INCONCLUSIVE`, not `FINDING`.
14. Check ids: `tests.run.*` (per-case failures `tests.run.failed`, `tests.run.none-found`, `tests.run.flaky`), claimKey begins with `scanPlanId`.

## Failure behavior

| Reason code | FailureClass / status | Verdict |
|---|---|---|
| `RUNNER_REPORTED_ZERO_TESTS` | none (measured) | `INCONCLUSIVE` |
| `NO_TESTS_FOUND` (HIGH confidence only) | none | `FINDING` |
| `LOW_DETECTION_CONFIDENCE` (instead of `NO_TESTS_FOUND`) | none | `INCONCLUSIVE` |
| `DISCOVERY_CAPPED` | none | `INCONCLUSIVE` |
| `NOT_DISCOVERED` | none | `NOT_TESTED` |
| `ALL_TESTS_SKIPPED` | none | `INCONCLUSIVE` |
| `RUN_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` |
| `UNSUPPORTED_RUNNER` | none | `UNSUPPORTED` |
| `RUNNER_SETUP_FAILED`, `FIXTURE_STARTUP_FAILED` | none | `BLOCKED` |
| `REQUIRES_EXTERNAL_SERVICE`, `REQUIRES_SECRETS`, `REQUIRES_CONFIGURATION` | none | `NOT_TESTED` |
| `UNSAFE_TO_EXECUTE` | none | `NOT_TESTED` |
| `FLAKY_SUSPECTED` | none | `FINDING` (MAINTAINABILITY_RISK) |
| `FINDINGS_CAPPED` (FLAG on the aggregate Finding) | none | the aggregate is a `FINDING`; the flag is an annotation |
| `TIMED_OUT` (step result) | none, unit `COMPLETED` | `INCONCLUSIVE` |
| `RUNNER_OUTPUT_UNPARSEABLE` (reporter output present but malformed or truncated beyond use) | none | `INCONCLUSIVE` |
| no reporter output and non-zero exit before any test started | `RUNNER_SETUP_FAILED` | `BLOCKED` |
| parser threw | `ENGINE_DEFECT` | `BLOCKED` |

A throwing `evaluate` is `BLOCKED`, never propagated (FR-112).

## Safety

Reporter output is untrusted: size-capped (10 MiB per step, head+tail with TRUNCATED marker), validated
against a schema, redacted before persistence. Test names and messages are data, never instructions to AI
(FR-129). No test is executed in the API process, ordinary worker or sandbox-runner (FR-035).

## Idempotency

Check execution is claimed through `IdempotentClaim` scope `source-check-execution`; the claimKey begins with `scanPlanId`
(`{scanPlanId}:{checkId}:{checkVersion}:{readinessScope}:{snapshotDigest}`, exact format owned by `data-model.md`) so two tenants
scanning byte-identical content can never collide (FR-135). `TEST_RESULT` writes first claim scope `evidence-write` with key
`{scanPlanId}:{executionUnitId}:{attempt}:TEST_RESULT:{suiteFile}`. Reinterpreting the same step result
yields identical outcomes. Rerun attempt keys derive from `(executionUnitId, attempt, rerunIndex)`.

## Consumers

`coverage-contract.md` (test-execution status section), `source-reverify-contract.md` (failed-test
reverify), `backend-contract-testing-contract.md` (integration suites), SPEC 014 (readiness input only).

## Non-negotiable boundary rules

1. Exit status zero, zero discovered tests and all-skipped suites MUST NEVER yield `PASS`.
2. Discovery MUST NEVER execute customer code or evaluate executable configuration.
3. A failure MUST NEVER be hidden by retrying; the original failure survives any rerun outcome.
4. Integration and state-mutating suites MUST NEVER be rerun in v1.
5. Tests MUST NEVER connect to any customer service; unavailable infrastructure is coverage, not `PASS`.
6. Test identity MUST NEVER include line numbers or tool versions.
7. AI MUST NEVER set a verdict, count or flaky classification (FR-137).
