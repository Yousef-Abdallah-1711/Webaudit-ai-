# Contract: Static Source Analysis Engine (E12)

Per FR-017..FR-030, FR-020, FR-117, FR-118, FR-135, FR-032. Consumers: Source Check dispatcher (`source-rule-registry-contract.md`), Domains D (Source Quality), E (Backend), F (Database), G (Automated Tests, discovery only), coverage summary.

## Signature (shape, not final TypeScript)

```text
runStaticAnalysis(unit: ExecutionUnit<SOURCE_STATIC>) -> void      // emits Evidence only, via recordEvidence
parentSide:  forks child, passes { snapshotDir (read-only), rulePackVersions, budgets }, validates and redacts every message received
childSide:   pipeline manifest -> detection -> parser adapters -> Observers -> ObservationEnvelope[]
ParserAdapter  = { language, parse(file) -> ParseResult | ParseFailure, capabilities }
Observer       = { observerId, ruleIds[], observe(parsedWorkspace) -> ObservationEnvelope[] }
ObservationEnvelope = { kind: "SOURCE_LOCATION" | "SOURCE_SURFACE" | "DEPENDENCY" | "CODE_FLOW" | "TOOL_DIAGNOSTIC",
                        path, line, column, ruleId, ruleVersion, tool: { id, version }, snapshotDigest, excerpt?, confidence }
```

Unit shape: class `SOURCE_STATIC`, existing queue `webaudit-scan-phase`, additive to existing capabilities (FR-017).

## Inputs

1. Verified snapshot (digest checked before parsing) and `ToolchainDetection` (`language-toolchain-detection-contract.md`).
2. Versioned rule packs (Observers) from `source-rule-registry-contract.md`.
3. Declarative architecture/database config when present (`fahes.architecture.json`, `fahes.database.json`), parsed as JSON only.
4. Budgets: files, bytes, AST memory (512 MiB per child), wall clock (5 min) per `plan.md`. A worker-level semaphore `FAHES_E12_MAX_CONCURRENT` (default 2) caps concurrent E12 children so that their budgets sum to at most 1 GiB of the worker container's 2 GiB and four concurrent source scans can never OOM the shared worker; exhausting the semaphore queues the unit, it does not shrink the budget silently.

## Outputs

1. Typed Evidence only (FR-017): `SOURCE_LOCATION`, `SOURCE_SURFACE`, `DEPENDENCY` (extends, never replaces, the existing `dependency-scanner`, FR-028), `CODE_FLOW`, `TOOL_DIAGNOSTIC`, `SCHEMA_SNAPSHOT` (static schema), `SOURCE_SURFACE` route inventory; payloads in `source-evidence-contract.md`.
2. Per-file `PARSE_FAILED` observations (parser, error class, location) (FR-021).
3. Coverage counters: files analyzed, skipped, parse-failed per language; rules executed or skipped; suppressed observations (FR-025).

## Ownership

Context B (E12). Owning spec: 011. E12 never decides Findings and never evaluates checks.

## Invariants

1. Parser adapters share only the observation envelope; no universal AST (FR-018). TypeScript/JavaScript: TypeScript Compiler API with symbol resolution and import graph. JSON, YAML, TOML, SQL, Prisma schema (WASM schema parser, no engine binary), Dockerfile: dedicated parsers. Python (Tier 2): concrete-syntax parser, parse plus import graph plus a defined rule subset only (FR-029).
2. Every observation carries provenance: workspace-relative path, line, column, `ruleId`, `ruleVersion`, tool id and version, snapshot digest, redacted minimal excerpt (FR-020, FR-118: <= 7 lines and <= 600 chars, never from credential-denylist files).
3. Parse failure is recorded per file and the file is excluded from "analyzed" (FR-021).
4. E12 NEVER evaluates executable configuration or plugins: ESLint config and plugins, Jest/Vite/Next/Babel/Webpack configs, `.pnpmfile.cjs`, `.yarnrc.yml` `yarnPath`, tsconfig plugins. Declarative JSON/YAML configs are parsed statically; executable configs are recorded `EXECUTABLE_CONFIG_PRESENT` and may only run in the Guest (FR-019).
5. Child-process hardening (FR-026): dedicated forked child; scrubbed empty environment; Node `--permission` with read-only access to the snapshot directory; memory cap; parent-armed unconditional kill deadline; no credentials. This is defense in depth and explicitly NOT a Principle XI claim, since nothing from the customer executes.
    Network wording (honest): the Node permission model has NO network control, so the process flag does not enforce "no network". The E12 child has a scrubbed environment and never opens sockets by design; "no network" is enforced by (a) the absence of network code paths in the child, (b) worker network policy, and (c) a unit test that fails if any socket or `fetch` is attempted. FR-026's wording stays "no network".
6. Budget exhaustion (files, bytes, AST memory, wall clock) yields partial evidence; affected checks become `INCONCLUSIVE` with the exhausted dimension; the analysis is never labeled complete (FR-027).
7. Observers are idempotent over `(snapshotDigest, rulePackVersion)`: re-run yields identical observations in identical order (FR-030).
8. Inline suppression `// fahes-ignore <ruleId>: reason` is recorded as evidence and counted in coverage, never hidden (FR-025).
9. Python files are parsed only; no Python, pytest or Python tooling runs (FR-029).
10. Rule class assignments (R2): each Observer rule declares one of the three recorded `ruleClass` values. Circular dependency = `MAINTAINABILITY_RISK` (cap MEDIUM); provable unreachable code (statement after return/throw, constant-false branch) = `DETERMINISTIC_DEFECT` with default severity LOW (caps are ceilings, not floors); unused-export, duplicate-code and complexity = `HEURISTIC_SUGGESTION` or `MAINTAINABILITY_RISK` per the rule table. FR-032's fourth class (AI-only) is never emitted by E12 or stored.
11. Static dependency inspection (manifests, lockfiles) emits `DEPENDENCY` evidence including unpinned versions, git/tarball/file dependencies, install scripts present and dependency-confusion-shaped scoped names, without executing anything (FR-068).

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|---|---|---|---|
| File cannot be parsed | `PARSE_FAILED` | none | file not analyzed; checks on it `INCONCLUSIVE` |
| Executable config found | `EXECUTABLE_CONFIG_PRESENT` | none | recorded; dependent checks `NOT_TESTED` |
| Language outside Tier 1/2 | `UNSUPPORTED_LANGUAGE` | none | `UNSUPPORTED` |
| Budget exhausted | `ANALYSIS_BUDGET_EXHAUSTED` | none | partial; `INCONCLUSIVE` |
| File over the 2 MiB analysis cap | `SKIPPED_TOO_LARGE` | none | file not analyzed; checks needing it `NOT_TESTED` |
| Child killed on deadline | `ANALYSIS_BUDGET_EXHAUSTED` | `TIMEOUT` | partial evidence kept |
| Child crash or IPC protocol violation | (none; class only) | `ENGINE_DEFECT` | unit `FAILED`; checks `BLOCKED` |

## Safety

1. The child receives no secrets and holds no network; the parent validates, size-caps and redacts every child message before `recordEvidence` (FR-117). Redaction of source excerpts and the snapshot-wide secret-value scan run in a credential-less forked redaction worker (scrubbed environment, no network, memory cap, 60 s kill deadline, bounded 64 KiB windows; FR-156) so that a hostile file cannot stall the parent through the quadratic behavior of the existing detector; the detected secret values are held in memory only for the exact-value scrub (`source-evidence-contract.md` invariant 9).
2. Parsers treat all text as hostile: bounded recursion depth, bounded node count, no `require`, no dynamic import, no `eval`, no plugin loading.
3. Observation text never reaches a shell, a model prompt (except via the labeled assembler, FR-129) or a log without redaction.
4. Credential-denylist files are absent from the snapshot and therefore never parsed.

## Idempotency

1. Evidence rows are identified by the natural key `(observerId, path, ruleId, anchor, occurrenceIndex)`; 009 `recordEvidence` has no dedupe, so the parent first claims `IdempotentClaim` scope `evidence-write` with `claimKey = "${scanPlanId}:${executionUnitId}:${attempt}:${kind}:${naturalKey}"` and writes only when the claim is won (FR-135; `source-evidence-contract.md`).
2. Unit retry is safe: no external side effects, snapshot read-only.

## Consumers

Source Check dispatcher; `scanSourceCoverageSummary`; reverify (single-Observer re-run on the affected workspace); SPEC 012 (reads `SOURCE_SURFACE`).

## Non-negotiable boundary rules

1. E12 MUST NOT create Findings, write `SOURCE_CHECK_RESULT`, or call `materializeFinding`.
2. E12 MUST NOT execute, import, `require` or evaluate any customer file, config, plugin or script.
3. E12 MUST NOT open a network connection or read outside the snapshot directory.
4. A parse failure MUST NEVER be silently skipped or reported as pass.
5. Partial analysis MUST NEVER be labeled complete.
6. Adding an Observer or parser adapter MUST require zero edits to dispatch code (Principle I).
7. E12 MUST NOT replace or modify the existing `dependency-scanner`, `bundle-analyzer`, `css-analyzer` or `data-leak-scanner` capabilities.
8. E12 MUST NOT run in the API process path or inside the Guest; it runs in the forked child under the trusted worker only.
