# Coverage and Evidence Honesty Checklist: Source / Backend / Database / Automated Code Testing Platform

**Purpose**: Validate the quality of the requirements that keep results honest: the six-verdict taxonomy, the "unsupported
or unavailable never reads as pass" rule, the four separate coverage sections, instrumented-code-coverage rules, test
presence taxonomy, typed evidence and provenance, fingerprint stability, reverify honesty, the deterministic/heuristic/AI
split, and the reason-code registry as the single authority. This checklist tests the written requirements, not any
implementation.
**Created**: 2026-10-09
**Feature**: [spec.md](../spec.md) (FR-088..090, FR-111..114, FR-120, FR-126..129, FR-136) |
[plan.md](../plan.md) | [contracts/coverage-contract.md](../contracts/coverage-contract.md) |
[contracts/source-evidence-contract.md](../contracts/source-evidence-contract.md) |
[contracts/automated-test-contract.md](../contracts/automated-test-contract.md) | [data-model.md](../data-model.md)

**Status (pass 3)**: 28/28 items satisfied by the current package; remaining unchecked items: 0.

**Note**: This checklist is a reviewer-owned requirements-quality review artifact. It was evaluated against the actual
files of the planning package on 2026-10-09. It is PLANNING ONLY: nothing here executes, builds or provisions anything.
**Marker Semantics**: `[x]` means the requirement-quality criterion is satisfied by the current spec package. `[ ]` means
a real gap, inconsistency or ambiguity remains; each such item carries a `**GAP**:` note naming where the package
falls short, so it can be repaired before closure. It does not mean implementation work is complete.

**Status (pass 2, re-evaluated against the repaired package)**: 26 of 28 items satisfied; 2 open (see `**GAP**:` notes).

## Verdict Taxonomy and Check Outcomes

- [x] CHK-CE001 Is "unsupported (language, runner, dependency source, database, dialect) never becomes PASS" stated as a
  normative rule and repeated as a boundary rule in the detection, coverage, rule-registry, test and database contracts?
  [Consistency, Spec §FR-113, §FR-014, language-toolchain-detection-contract rule 2, coverage-contract Invariant 10]
- [x] CHK-CE002 Are the six verdicts (`PASS`, `FINDING`, `NOT_TESTED`, `UNSUPPORTED`, `BLOCKED`, `INCONCLUSIVE`) each given a
  distinct meaning that is explicitly not collapsible into one "skipped" bucket?
  [Clarity, Spec §FR-112, coverage-contract Invariant 1]
- [x] CHK-CE003 Does every check execution produce exactly one `SOURCE_CHECK_RESULT` (a thrown `evaluate` recorded as
  `BLOCKED`, claim-before-readiness, `resultRef` set), and is that evidence kind barred from every trigger set at registry load?
  [Completeness, Spec §FR-111, §FR-112, source-rule-registry-contract Invariants 2/`onSourceEvidenceCommitted`]
- [x] CHK-CE004 Does a one-time sweep after all units are terminal guarantee that no applicable check ends the scan without
  an outcome (`BLOCKED` when the producer unit ended non-COMPLETED, `NOT_TESTED` when the precondition was never met)?
  [Completeness, Spec §FR-112, source-rule-registry-contract `sweepUnresolvedSourceChecks`, plan "Check registry dispatch"]
- [x] CHK-CE005 Does every reason code map to the same verdict wherever it appears (reason registry, owning contract,
  data-model mirror, quickstart fixtures, plan tables)?
  **RESOLVED**: scripted check: contract and data-model registries match for all 83 codes (kind and verdict), and no
  table row in any contract/quickstart/plan/research pairs a registry code with a different verdict; skipped =
  INCONCLUSIVE, `NOT_DISCOVERED` = NOT_TESTED, `RUNNER_OUTPUT_UNPARSEABLE` = INCONCLUSIVE, `NETWORK_BLOCKED_BY_POLICY`
  = NOT_TESTED, `UNSUPPORTED_SOURCE_INPUT` = UNSUPPORTED, `EXECUTION_PLANE_UNAVAILABLE` = BLOCKED (quickstart flag
  matrix too). [Consistency, Spec FR-136]
- [x] CHK-CE006 Is every value in the registry's "verdict" column a member of the six-verdict set (or an explicitly
  non-verdict annotation), and is each dual mapping decided by a stated rule?
  **RESOLVED**: registry kinds are `VERDICT` (exactly one of the six verdicts; no dual mappings) or `FLAG`
  ("annotation only", never a Finding); `TOOLCHAIN_*`, `FINDINGS_CAPPED`, `COVERAGE_EXCLUDES_MOST_FILES`,
  `NON_DISPOSABLE_DATABASE_REFERENCE`, `SANDBOX_POLICY_VIOLATION` are FLAGs; `TIMED_OUT`/`RESOURCE_LIMIT_EXCEEDED` are
  INCONCLUSIVE; boundary rule 5/6 applies mechanically. [Clarity, Spec FR-112, FR-136]
- [x] CHK-CE007 Is a timeout or contained resource-cap result mapped deterministically to a verdict per check family?
  **RESOLVED**: one rule: step `TIMED_OUT` and contained `RESOURCE_LIMIT_EXCEEDED` = INCONCLUSIVE (cause ambiguous) in
  registry, quickstart 11/12, build-typecheck and automated-test contracts; a single test over its own limit is a
  failed case (`tests.run.failed`); the plan severity table has no `test.timed-out` Finding any more. [Ambiguity, Spec
  FR-056, FR-087]

## Partial Results and Coverage Sections

- [x] CHK-CE008 Is "partial is never reported as complete" enforced as a rule with a computable condition (`complete = false`
  whenever any budget was exhausted, any unit was non-COMPLETED, or any check lacks a terminal outcome) and a required
  listing of non-contributing units and reasons?
  [Measurability, Spec §FR-027, §FR-113, §FR-126, coverage-contract Invariant 9]
- [x] CHK-CE009 Are the four coverage sections (source-analysis coverage, platform capability coverage, test-execution
  status, code-coverage metrics) required to be physically separate keys that are never merged into one score, percentage
  or label, with no readiness verdict computed?
  [Clarity, Spec §FR-090, §FR-127, coverage-contract Outputs/Invariant 8, plan Diagram 12]
- [x] CHK-CE010 Are the source-analysis counters specified so that skipped, parse-failed, suppressed and rules-skipped
  items are visible (`filesSkipped` by reason code, `filesParseFailed`, `suppressedObservations`, `budgetExhausted`) and
  unreadable evidence yields an `unavailable` section rather than zero-fill?
  [Completeness, Spec §FR-021, §FR-025, coverage-contract signature and Failure behavior]
- [x] CHK-CE011 Are counters such as `routesExercised`, `migrationsExercised`, `schemaObjectsAnalyzed` defined as counts of
  what was actually probed/applied/analyzed and explicitly barred from being presented as percentage behavior coverage?
  [Clarity, coverage-contract Invariant 6]

## Instrumented Code Coverage

- [x] CHK-CE012 Is instrumented code coverage reported only when real instrumentation produced it, with tool and version,
  snapshot, instrumentation configuration, exclusions, files measured and unsupported portions, and is "no instrumentation"
  an explicit state (`COVERAGE_NOT_INSTRUMENTED`, empty section 4) rather than a zero or inferred value?
  [Completeness, Spec §FR-088, coverage-contract Invariants 3-4/Failure behavior]
- [x] CHK-CE013 Is cross-tool aggregation forbidden with the reason stated (no defensible aggregation contract in v1; values
  are per tool and per workspace) and inference from test counts forbidden?
  [Clarity, Spec §FR-088, coverage-contract Invariant 4/boundary rules 1-2]
- [x] CHK-CE014 Is the "excludes most files" flag defined measurably and consistently?
  **RESOLVED**: coverage-contract invariant 5: flag when `filesMeasured / filesInSnapshot < 0.5` (provisional, hard-
  enforced), `filesInSnapshot` = Tier-1 files excluding denylist and a listed vendored/generated path set; payload and
  registry use the same name; outcome is a FLAG with check `INCONCLUSIVE` and no Finding (plan severity row agrees);
  `pct` derivation stated (`covered/total*100` from tool counts, never inferred). Nit: check id spelled
  `tests.coverage-breadth` (contracts, registry) vs `tests.coverage.breadth` (plan row 591).

## Test Presence, Discovery and Interpretation

- [x] CHK-CE015 Is test presence/result taxonomy complete and one-per-suite (`NO_TESTS_FOUND`, `NOT_DISCOVERED`,
  `UNSUPPORTED_RUNNER`, `RUNNER_SETUP_FAILED`, `SKIPPED`, `EXECUTED_PASSED`, `EXECUTED_FAILED`,
  `RUNNER_REPORTED_ZERO_TESTS`) with discovery, execution and interpretation as three separate steps with separate evidence?
  [Completeness, Spec §FR-077..080, automated-test-contract signature/Invariant 1]
- [x] CHK-CE016 Are exit-zero, zero-discovered and all-skipped each specified as never `PASS`, with reconciliation of
  reporter counts against static discovery and a named delta when the reporter count is lower?
  [Measurability, Spec §FR-079, automated-test-contract Invariant 2/boundary rule 1]

## Evidence Typing and Provenance

- [x] CHK-CE017 Are the ten new evidence kinds typed with per-kind payloads, existing kinds (`SOURCE_LOCATION`, `CODE_FLOW`,
  `DEPENDENCY`) reused where they fit, and SPEC 010's `CHECK_RESULT` neither reused nor widened (with
  `SOURCE_CHECK_RESULT` as 011's own kind)?
  [Consistency, Spec §FR-114, source-evidence-contract "Evidence kinds", data-model additive enum]
- [x] CHK-CE018 Do payloads carry the provenance an auditor needs: snapshot digest, workspace-relative path, line/column,
  rule id and version, tool id and version, image id/digest, template id/version, exit code or status, redaction rule-set
  version, with the owning unit and attempt recoverable through 009's evidence-to-unit attribution?
  [Completeness, Spec §FR-020, §FR-073, data-model Envelope and per-kind schemas]

## Fingerprint Stability and Reverify Honesty

- [x] CHK-CE019 Are fingerprint parts per family specified with identity (path, symbol, route, schema object, migration id,
  test id), excluding line numbers and tool versions, with "unrelated failures that share a generic message never merge" and
  "a line insertion never changes a fingerprint" stated as rules?
  [Clarity, Spec §FR-120, source-evidence-contract fingerprint table and boundary rule 4]
- [x] CHK-CE020 Is the file/symbol-rename limitation not just stated but bounded in its consequence for reverify and
  regression diffing?
  **RESOLVED**: source-reverify-contract rename guard (line 89-91, invariant 8, failure row 113) and source-evidence-
  contract line 66: a renamed/moved/deleted file or symbol yields `INCONCLUSIVE` `REVERIFY_UNVERIFIABLE` (Issue
  `UNVERIFIABLE`), never `RESOLVED`; quickstart fixture 50.
- [x] CHK-CE021 Is reverify's "cannot verify" outcome (`UNVERIFIABLE`) specified for changed toolchain/support, never
  `RESOLVED`, with historical evidence preserved, tool-version drift recorded but not affecting identity, and a fresh snapshot
  and fresh authorization (never old evidence as proof)?
  [Completeness, Spec §FR-121, source-reverify-contract Invariants 2-9 and boundary rules 1-6]

## AI, Determinism and Classification

- [x] CHK-CE022 Is it unambiguous that AI cannot fabricate build success, test execution, coverage, migration results,
  runtime behavior, dependency resolution or toolchain compatibility, runs only after the deterministic layer, carries no
  verdict/coverage/version/result fields, and participates in no authorization, scope, safety, verdict, fingerprint or
  coverage decision?
  [Clarity, Spec §FR-128, §FR-129, §FR-137, source-rule-registry-contract Invariants 3-4]
- [x] CHK-CE023 Can the four result classes required "on every Source Check" be represented, and is the storage of AI
  interpretation defined?
  **RESOLVED**: FR-032 and source-evidence-contract materialization rule 2 decide it: classes 1-3 recorded as
  `ruleClass`; class 4 is never stored on `SOURCE_CHECK_RESULT` and lives only in AI-layer output labelled
  `AI_JUDGMENT` (FR-128, research R24: schema-validated, no verdict/coverage/version fields, references only existing
  evidence ids), never a check or Finding.
- [x] CHK-CE024 Are rule classes tied to severity caps enforced twice (registry load and outcome build, clamp-and-log) so only
  deterministic defects reach HIGH/CRITICAL, maintainability risks stay <= MEDIUM, heuristics <= LOW and never a readiness
  blocker, with the default-severity table respecting the caps?
  [Consistency, Spec §FR-022, §FR-023, source-rule-registry-contract Invariant 1, plan Default Severity Table]
- [x] CHK-CE025 Is an environment or support limitation (missing lockfile, lifecycle scripts, unsupported source, module
  resolution, missing generated code) distinguishable from a customer-code defect and barred from becoming a Finding or
  counting against code quality, with ambiguity resolving to `INDETERMINATE`/`INCONCLUSIVE` rather than `FINDING`?
  [Clarity, Spec §FR-069, §FR-074, §FR-076, build-typecheck-contract Invariant 3]

## Reason-Code Registry as Single Authority

- [x] CHK-CE026 Is the reason-code registry the single, complete authority, with every code used anywhere present and no
  semantic overlap or overload?
  **RESOLVED (pass 3)**: The registry in source-evidence-contract.md is the single authority (83 codes, one verdict per code, `kind` VERDICT/FLAG); the data-model mirror is regenerated from it (78/78, identical verdicts); a scan of backticked reason-code-like tokens finds no unregistered code; quickstart Part A names the authority.
- [x] CHK-CE027 Is the per-run findings cap defined unambiguously for scans that produce several runs?
  **RESOLVED (pass 3)**: The findings cap is per scan plan across all units (spec clarification, plan budget table, automated-test and evidence contracts, research, data-model all say so); the aggregate Finding fingerprint is `[checkId, "capped", workspacePath]`.
- [x] CHK-CE028 Is toolchain/image drift honest: image and tool identity recorded in evidence, drift flagged in coverage
  (`toolchainDrift`), and never allowed to alter fingerprints or silently substitute a version (`toolchainSubstitution`
  explicit, never crossing a Node major)?
  [Completeness, Spec §FR-015, Edge Cases (toolchain differs), coverage-contract Invariant 7, language-toolchain-detection-contract Invariant 7]

## Notes

- Items marked `[ ]` are repair targets for the planning package before the closure/freeze pass; they are not
  implementation tasks.
- Spelling of reason codes shared by `source-evidence-contract.md` and `data-model.md` was compared mechanically and is
  identical; the gaps above concern verdict mapping, completeness and semantics, not spelling.
