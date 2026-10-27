# Contract: Build, Type-check and Lint Steps

Per FR-073 through FR-076 (with FR-019, FR-056, FR-069, FR-087). What a build, framework-build, type-check or lint Step
records, how failures are classified (environment limitation vs code defect), and where lint configuration may run.
Consumers: untrusted-execution-contract (phase 6-9), command-policy (`build.*`, `ts.typecheck.tsc`, `lint.eslint`),
the `AUTOMATED_TESTS` execution-derived checks, reverify planner, coverage summary. Domain rule (R2): every execution-derived check
(build, framework build, type-check, lint execution, tests, coverage) belongs to ModuleType `AUTOMATED_TESTS` with check ids
`tests.build.*`, `tests.typecheck.*`, `tests.lint.*`; static source checks are `src.*` (`SOURCE_QUALITY`). Source Quality may consume
`TOOL_DIAGNOSTIC` from lint for maintainability signals, but those are `src.*` checks.

## Signature (shape, not final TypeScript)

```text
StepResult = { templateId, templateVersion, argv, imageId+digest, toolchain{node,pm,tool}, commitSha, snapshotDigest,
  workspacePath, exitCode|null, signal?, wallMs, status: EXECUTED|TIMED_OUT|NOT_RUN, envIdentity{synthetic keys only},
  diagnostics: Diagnostic[] (capped), logArtifactId, classification: Classification, truncated: boolean }
Diagnostic = { toolId, code, severity, file?, line?, column?, message(redacted, <= 600 chars), category }
Classification = CODE_DEFECT | ENVIRONMENT_LIMITATION(reasonCode) | TOOLING_DEFECT | INDETERMINATE
classifyDiagnostics(stepResult, snapshotManifest, detectionEvidence) -> Classification   // pure, deterministic
```

## Inputs

Validated Step from the command plan; the completed P1 install result; snapshot manifest; detection and declarative
config evidence (static parse); fixed environment and synthetic variables.

## Outputs

`EXECUTION_STEP_RESULT` (one per Step, always, even on failure or timeout) and `TOOL_DIAGNOSTIC` (one per capped batch,
with `SOURCE_LOCATION` references); a redacted log Artifact (<= 10 MiB per step, head+tail with `TRUNCATED`).

## Ownership

The Guest produces raw output; the Supervisor parses with the template's parser, classifies, redacts, and commits
(FR-039). Checks in the Source Quality, Automated Tests and Backend domains interpret; this contract never decides a Finding.

## Invariants

1. Reproducible evidence (FR-073): every Step record carries the fields in `StepResult` so another run with the same
   snapshot digest, image and template version can be compared; fingerprint `[templateId, stepKind, normalized first-error signature]` (D21) excludes tool version.
2. Type-check diagnostics (FR-074) are structured (code, file, line, column, message) from `tsc --pretty false`; line
   numbers are provenance, never fingerprint parts. Diagnostic cap 500 per Step; excess is counted, not dropped silently (`TRUNCATED` marker).
3. Classification of failure origin (FR-074, FR-076):

| Symptom | Classification | Reason code | Verdict |
|---------|----------------|-------------|---------|
| TS2307 / `Cannot find module` for a package present in lockfile but absent after P1 | ENVIRONMENT_LIMITATION | `MODULE_RESOLUTION_FAILED` | `NOT_TESTED` |
| TS2307 for a relative path not in the manifest | CODE_DEFECT | none | `FINDING` |
| TS2307 for a bare specifier declared in neither `package.json` (any workspace) nor the lockfile (a genuinely undeclared dependency) | CODE_DEFECT (`DETERMINISTIC_DEFECT`) | none | `FINDING` |
| Missing generated client (`@prisma/client` types, GraphQL codegen, route types) because generation was not run or lifecycle scripts are off | ENVIRONMENT_LIMITATION | `GENERATED_CODE_MISSING` | `NOT_TESTED` |
| Missing env var read at build time that the platform could not synthesize | ENVIRONMENT_LIMITATION | `MISSING_ENV_VAR` | `NOT_TESTED` |
| Required input absent (`.env.production` excluded, asset not in snapshot, LFS pointer) | ENVIRONMENT_LIMITATION | `MISSING_BUILD_INPUT` | `NOT_TESTED` |
| Needs external service during build (fetching remote data) | ENVIRONMENT_LIMITATION | `REQUIRES_EXTERNAL_SERVICE` | `NOT_TESTED` |
| Syntax or type errors with located diagnostics in manifest files | CODE_DEFECT | none | `FINDING` |
| Compiler crash/OOM caused by Guest limit | measured | `RESOURCE_LIMIT_EXCEEDED` | `INCONCLUSIVE` |
| Step not started because the run envelope is exhausted | measured | `RUN_BUDGET_EXHAUSTED` | `INCONCLUSIVE` |
| Unparseable tool output | TOOLING_DEFECT | `RUNNER_OUTPUT_UNPARSEABLE` | `INCONCLUSIVE` |

   Ambiguity (a message matching both rows) resolves to `INDETERMINATE` and `INCONCLUSIVE`, never to `FINDING`.
4. Framework builds (`build.next`, `build.vite`, `build.nuxt`) are recognized only when the framework is detected; their
   config files are executable (`EXECUTABLE_CONFIG_PRESENT`), run only in the Guest, network cut, with the build output kept in scratch (not uploaded).
5. Lint classification (FR-075): where each source may run:

| Lint source | Examples | Where it may run |
|-------------|----------|------------------|
| Fahes built-in rules | E12 rule packs | E12 child (no customer code) |
| Trusted scanner tooling | Image-shipped `eslint` binary with the Fahes-owned baseline config, used ONLY when the repository has no lint configuration | Guest only (tool executes over customer files) |
| Repo declarative config (always run in the Guest; never merged with the baseline) | `.eslintrc.json`, `eslint.config.json`-style data, `tsconfig.json` rules | Parsed statically in E12 child; may be passed to Guest tool |
| Repo plugins | `plugins: [...]`, shared configs from `node_modules` | Guest only, after P1; plugin code is customer-influenced code |
| Executable custom rules / config | `eslint.config.js`, `.eslintrc.js`, local rule dirs | Guest only; never evaluated by E12 (`EXECUTABLE_CONFIG_PRESENT`) |

6. Static-parse versus Guest-required configuration:

| Config | Static parse in E12 | Guest required to honor |
|--------|--------------------|-------------------------|
| `tsconfig.json` (no `plugins`/extends outside snapshot) | yes (strip comments) | for actual `tsc` run |
| `tsconfig` with `plugins` | parse, flag | compile in Guest only |
| `package.json`, `.eslintrc.json`, `.nvmrc`, `.node-version` | yes | n/a |
| `eslint.config.js/.mjs/.ts`, `.eslintrc.js/.cjs` | record only | yes |
| `vite.config.ts`, `next.config.js`, `nuxt.config.ts`, `jest.config.js`, `babel.config.js`, `webpack.config.js` | record only | yes |

7. Per-step wall limits (typecheck 5 min, lint 5 min, build 10 min, provisional) are maxima clamped to the remaining run
   envelope; expiry yields a `TIMED_OUT` step result (not a unit failure) and the check is `INCONCLUSIVE`; the unit stays `COMPLETED`.
   A repository with no lint configuration runs the image baseline; baseline-run diagnostics carry `toolId` of the baseline so a
   customer is never told a repository rule it never wrote was broken. Lint results are `TOOL_DIAGNOSTIC`; lint severity caps follow rule class (FR-023).
8. Consuming checks (all `AUTOMATED_TESTS`, R2): `tests.typecheck.errors` (`EXECUTION_STEP_RESULT`+`TOOL_DIAGNOSTIC`),
   `tests.build.succeeds` (`EXECUTION_STEP_RESULT`), `tests.lint.violations` (`TOOL_DIAGNOSTIC`), `tests.build.env-limitation-report`
   (coverage only). The finding-bearing severity rows use the same ids (`tests.build.failure`, `tests.typecheck.error`,
   `tests.lint.error` in the plan severity table; the singular/plural spelling is owned by `plan.md`'s table and MUST match this list there). A Step that did not run records `NOT_TESTED` evidence, not silence.

9. Runner-reported wording (FR-155): every build, type-check or lint outcome derived from the output of customer-influenced tooling (`tsc` and framework builds from the customer's lockfile, the repository's own ESLint and its plugins) is labelled **runner-reported** in Evidence, check reasons and the coverage statement; a hostile ESLint plugin or build script can print a well-formed "no errors" report, so this contract never describes such results as independently verified. Fixtures: `hostile-eslint-plugin` (a plugin that exfiltrates, forks and prints a forged clean report: expect containment, a runner-reported label and no forged PASS beyond that label) and `reporter-forge` (isolation-policy-contract).

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|-----------|-------------|--------------|---------|
| Build/type-check/lint exit non-zero with code diagnostics | none | none (measured) | unit `COMPLETED`; check `FINDING` |
| Step wall limit | `TIMED_OUT` (step result) | none (measured) | `INCONCLUSIVE` |
| Run envelope exhausted before the Step | `RUN_BUDGET_EXHAUSTED` | none (measured) | `INCONCLUSIVE` |
| Environment limitation rows above | per table | none | `NOT_TESTED` |
| Network was cut and the build needs the network | `NETWORK_BLOCKED_BY_POLICY` | none | `NOT_TESTED` |
| Unsupported tool/version/framework | `UNSUPPORTED_COMMAND` / `UNSUPPORTED_VERSION` | none | `UNSUPPORTED` |
| Containment abort (tamper, flood, 3 resource kills) | `CONTAINMENT_ABORT` (signal flag `SANDBOX_POLICY_VIOLATION`) | `CUSTOMER_CODE_FAILURE` | unit `FAILED`; checks `BLOCKED` |

## Safety

Build and lint tools execute customer-influenced code; they run only in the Guest, network cut, with synthetic env.
Logs and diagnostics pass `@webaudit/redaction`; excerpts are <= 7 lines / 600 chars and never from credential-denylist files (FR-118).

## Idempotency

Step key `H(executionUnitId, attempt, stepIndex)`; identical snapshot, image and template version produce identical
classification; reverify re-runs only install plus the affected Step (D22).

## Consumers

Automated Tests (`tests.build.*`, `tests.typecheck.*`, `tests.lint.*`), Source Quality (`src.*` consuming lint diagnostics) and Backend Source Checks; `scanSourceCoverageSummary`; REVERIFY planner.

## Non-negotiable boundary rules

1. An environment limitation is never reported as a customer code defect, and a code defect is never hidden as a limitation.
2. Build and lint configuration or plugins that can execute code never run outside the Guest.
3. Build output (`.next`, `dist`) stays in the Guest and is never uploaded or served.
4. No Step is skipped silently; every planned Step yields exactly one `EXECUTION_STEP_RESULT`.
5. Exit code zero proves only that the tool exited, not that anything was verified (see FR-079 for tests).
