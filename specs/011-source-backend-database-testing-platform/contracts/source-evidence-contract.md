# Contract: Source Evidence and Reason-Code Registry

Per FR-114, FR-117, FR-118, FR-119, FR-120, FR-126, FR-136, FR-109. Owns the additive `EvidenceKind` payloads for SPEC 011, redaction and excerpt obligations, fingerprint parts, finding materialization rules and the single reason-code registry referenced by every other 011 contract. Full field tables live in `data-model.md`. Consumers: all 011 contracts, 009 `recordEvidence` / `createArtifact` / `materializeFinding`, SPEC 012/013/014.

## Signature (shape, not final TypeScript)

```text
recordSourceEvidence(kind, payload, ctx) -> evidenceId      // wraps 009 recordEvidence; redacts first
buildFingerprintParts(family, identity) -> string[]         // input to 009 unchanged fingerprintOf
reasonCode: one of the registry below (closed set; no free text drives logic)
```

## Inputs

Typed payloads produced by E12 (parent-side after child validation), the Execution Supervisor (after trusted-side validation of Guest output), the acquisition step and the Source Check dispatcher.

## Outputs

Evidence rows (kind-typed), Artifacts for large bodies (20 MiB per object, 50 MiB per run, FR-119), Findings via `materializeFinding`.

## Ownership

Context X (cross-cutting); owning spec: 011. 009 owns storage and lifecycle.

## Evidence kinds

New additive kinds (FR-114): producer and payload summary.

| Kind | Producer | Payload summary |
|---|---|---|
| `SOURCE_MANIFEST` | Acquisition | repo identity, requestedRef, `refKind` (`BRANCH\|TAG\|SHA\|DEFAULT`), resolvedCommitSha, `sourceForm` (`GITHUB_EXPORT_ARCHIVE\|ZIP_UPLOAD`), `exportAttributesPresent` (repository `.gitattributes` `export-ignore`/`export-subst` seen), workspacePath, contentDigest, counts, excluded/skipped, toolchain detection ref |
| `SOURCE_SURFACE` | E12 (static) | route/handler inventory, validation schemas, middleware, env reads, outbound HTTP and DB access sites; `surfaceComplete: boolean`; `origin: SOURCE_DERIVED` |
| `TOOL_DIAGNOSTIC` | E12 or supervisor | toolId, diagnosticCode, path, line, column, message (redacted), severity, `rootCauseKey?` |
| `EXECUTION_STEP_RESULT` | Supervisor | templateId+version, argv, image id, snapshot digest, exit code, durations, classified outcome, log artifact ref |
| `TEST_RESULT` | Supervisor | runnerId, suite, case identity, status, duration, error (redacted), attempts, `networkBlockedAttempts`, `rootCauseKey?`, `reportSource: "RUNNER_REPORTED"` |
| `COVERAGE_REPORT` | Supervisor | tool+version, four metrics, exclusions, filesMeasured, filesInSnapshot, unsupported portions |
| `SCHEMA_SNAPSHOT` | E12 or supervisor | declared objects (static) or `pg_catalog` introspection; artifact ref for large bodies |
| `MIGRATION_RESULT` | Supervisor | migration id, order, outcome, SQLSTATE, object name, partial-state note, `appliedVia: "fahes-applier"` |
| `CONTRACT_RESULT` | Supervisor or E12 | OpenAPI/schema vs inventory or probe; `origin: SOURCE_DERIVED | EXECUTED_LOCAL` |
| `SOURCE_CHECK_RESULT` | Dispatcher only | checkId+version, verdict, reasonCode, severity, supportingEvidenceIds, ruleClass |

Reused kinds: `SOURCE_LOCATION` (E12 observation location), `CODE_FLOW` (import and call paths), `DEPENDENCY` (manifest and lockfile facts). SPEC 010 `CHECK_RESULT` is neither reused nor widened (FR-114).

## Invariants

1. Redaction: every payload and Artifact that can contain source text, logs, stack traces, schema or SQL passes `@webaudit/redaction` before storage or display, including `SOURCE_STATIC` evidence (FR-117).
2. Excerpts: default <= 7 lines and <= 600 characters around the location; never from credential-denylist files; full source never enters report artifacts (FR-118).
3. Artifact budgets: 011 report and log Artifacts are 20 MiB per object, 50 MiB per run; over-budget is refused, never truncated silently; logs are head plus tail with a `TRUNCATED` marker (FR-119). The Source Snapshot Artifact is a separate content type with its own provisional ceiling (128 MiB compressed per object, 256 MiB per scan; `SOURCE_TOO_LARGE` when exceeded; see `source-snapshot-contract.md`, upstream clarification U-2 in `upstream-amendment-requests.md`).
4. Guest-originated payloads are untrusted: schema-validated, size-capped and redacted on the trusted side before `recordEvidence`.
5. Finding-text redaction (FR-150): finding title, explanation, consequence and fix-prompt text derived from evidence passes through `@webaudit/redaction` before `materializeFinding`; Finding text never contains credential-denylist file content or secret values.
6. IDOR-safe reads (FR-145): every read path over this contract's data (evidence, artifact, snapshot download for presign, coverage summary, correlation lookups) filters by owning tenant `(id, userId)`; a non-owner receives NotFound indistinguishable from nonexistent. Prior-evidence lookups are additionally tenant- and target-scoped (FR-149).
7. Fingerprints use 009's unchanged mechanism with caller parts that exclude line numbers and tool versions and include identity; unrelated failures sharing a generic message never merge (FR-120).
8. Runner-reported labelling (FR-155): every PASS/FAIL verdict, check reason and coverage statement derived from test, lint or build reporter output is labelled **runner-reported** in Evidence (`reportSource: "RUNNER_REPORTED"`), check reasons and the coverage statement; it is never described as "verified". Reporter output can be forged by customer code, so count reconciliation (FR-079) stays and does not upgrade the label.
9. Exact-value scrub (FR-156): secret values detected anywhere in the acquired snapshot by the redaction detector at acquisition (run in the credential-less redaction worker, see `static-analysis-contract.md`) are held in memory only, as a set, and used to scrub logs, evidence payloads, excerpts and Finding text before storage; the set is never persisted, logged or placed in a Finding. Non-denylisted files that contain secrets are handled by this scrub, not by exclusion.
10. Log Artifacts (execution logs, step output) are tenant-private and treated as sensitive: owner-only reads (invariant 6), never served by report routes, retention no longer than report-data retention, and disclosed as such in consent copy (FR-147).
12. Cross-domain overlap hand-off (no merging inside 011): when two check families can report the same underlying defect (for example a syntax error seen by the E12 parser as `src.parse.*` and by the compiler as `tests.typecheck.*`), both Findings keep their own fingerprint family and BOTH carry the same `rootCauseKey` (hash of the normalized first-error signature and the workspace-relative path identity). Cross-domain de-duplication is performed by SPEC 014 from `rootCauseKey`; the legacy SECURITY-module `dependency-scanner` overlap is out of scope. 011 never claims fingerprint-level merging across domains.
11. Root-cause grouping: test and diagnostic evidence carry an optional `rootCauseKey` (normalized first-error signature plus the originating workspace-relative path/identity). Suite-load failures sharing one `rootCauseKey` (for example one shared-module syntax error that breaks N suites) materialize ONE root-cause Finding listing the affected suites in Evidence, not N Findings; the cap in Finding materialization rule 1 counts root-cause Findings.

## Fingerprint parts (per family)

| Family | Parts (in order) |
|---|---|
| Source rule | `ruleId`, workspaceRelPath, symbolPath or anchor, occurrenceIndexInDeclaration |
| Tool diagnostic | `toolId`, diagnosticCode, workspaceRelPath, symbolPath or anchor, normalized-message signature |
| Build / step | `templateId`, stepKind, normalized first-error signature |
| Test | `runnerId`, suiteFile, describe-path plus testName (plus duplicate index) |
| Root-cause group (suite-load failures) | `runnerId` or `toolId`, `"root-cause"`, `rootCauseKey` |
| Route / contract | `workspacePath`, METHOD, normalizedRoutePattern, operationId?, `checkId` |
| Capped aggregate (`FINDINGS_CAPPED`) | `checkId`, `"capped"`, `workspacePath` |
| Schema object | objectKind, qualifiedName, `checkId` |
| Migration | `migrationId`, failureClass, SQLSTATE plus objectName signature |

A line insertion does not change a fingerprint; a file rename does (accepted limitation). Because identity includes the workspace-relative path, a renamed or moved file produces a new fingerprint and the old Finding cannot be matched by fingerprint alone. Reverify therefore applies a rename guard (`source-reverify-contract.md`): "not reproduced / resolved" requires the check to have re-run against the same workspace-relative path/identity and passed; if that file or symbol identity no longer exists in the fresh snapshot, the outcome is `INCONCLUSIVE` with `REVERIFY_UNVERIFIABLE`, never auto-`RESOLVED`.

## Finding materialization rules

1. One Finding per failing test case with a stable test identity, bounded by a per-scan-plan cap of 100 across all units (provisional); beyond the cap, one aggregate Finding per `(checkId, workspacePath)` carries `FINDINGS_CAPPED` (fingerprint parts `[checkId, "capped", workspacePath]`) and the full list as Evidence; nothing is silently dropped. Failures that share a `rootCauseKey` count as one (invariant 11).
2. Findings come only from `DETERMINISTIC_DEFECT`, `MAINTAINABILITY_RISK`, `HEURISTIC_SUGGESTION` evidence-backed outcomes; never from `AI_JUDGMENT`. FR-032's fourth class (AI-only interpretation) is NOT stored on `SOURCE_CHECK_RESULT`: only classes 1-3 are recorded as `ruleClass`; class 4 exists solely in AI-layer output labelled `AI_JUDGMENT` and can never be a check or a Finding (R2).
3. Environment limitations (any `VERDICT` code in the registry with verdict other than `FINDING`; `FLAG` codes are annotations) never become Findings and never count against code quality (FR-069).
4. Findings from completed units reach the report even when sibling units fail, are cancelled or are killed (FR-126).

## `## Reason-code registry`

Authoritative and closed (83 codes); adding a code is an edit to this table. `data-model.md` mirrors it with the same codes, kinds and verdicts. Every code has exactly one `kind`:

- `VERDICT`: explains a non-`PASS` verdict (or, for `NO_TESTS_FOUND` and `FLAKY_SUSPECTED`, a `FINDING`). Exactly one verdict per code; there are no dual verdicts and no "informational" verdict. Where the cause is ambiguous the code maps to `INCONCLUSIVE` so the customer is not accused.
- `FLAG`: an annotation or observation attached to Evidence or a Finding; never itself a verdict (verdict column reads "annotation only") and never materialized as a Finding.

`SANDBOX_POLICY_VIOLATION` and `CONTAINMENT_ABORT` are deliberately both kept: `SANDBOX_POLICY_VIOLATION` (FLAG) is the detected signal recorded in Evidence; `CONTAINMENT_ABORT` (`BLOCKED`) is the abort outcome reason (unit `FAILED` + `CUSTOMER_CODE_FAILURE`). A violation signal may precede an abort or, below the abort threshold, be recorded without one. `NO_RECOGNIZED_START` does not exist; the backend start case is `START_TEMPLATE_UNRECOGNIZED`.

| code | kind | meaning | verdict | context |
|---|---|---|---|---|
| UNSUPPORTED_SOURCE_INPUT | VERDICT | Source kind not GitHub-via-connection or ZIP | UNSUPPORTED | acquisition |
| SUBMODULE_NOT_FETCHED | VERDICT | `.gitmodules` present; submodules never fetched | NOT_TESTED | acquisition |
| LFS_POINTER_UNRESOLVED | VERDICT | Git LFS pointer detected, not resolved | NOT_TESTED | acquisition |
| EXCLUDED_CREDENTIAL_FILE | VERDICT | Credential-denylist file excluded from snapshot (path only) | NOT_TESTED | snapshot |
| EXECUTABLE_CONFIG_PRESENT | VERDICT | Config can execute code; not evaluated by E12 | NOT_TESTED | E12 |
| PARSE_FAILED | VERDICT | File could not be parsed | INCONCLUSIVE | E12 |
| UNSUPPORTED_LANGUAGE | VERDICT | Language outside Tier 1/2 | UNSUPPORTED | detection |
| UNSUPPORTED_FRAMEWORK | VERDICT | Framework not supported | UNSUPPORTED | detection |
| UNSUPPORTED_VERSION | VERDICT | Declared toolchain version outside image catalog | UNSUPPORTED | detection |
| UNSUPPORTED_RUNNER | VERDICT | Test runner not Vitest/Jest/`node:test` | UNSUPPORTED | detection / tests |
| UNSUPPORTED_COMMAND | VERDICT | `package.json` script not a recognized template | UNSUPPORTED | command policy |
| UNSUPPORTED_DEPENDENCY_SOURCE | VERDICT | git, tarball-URL, file, link or private-registry dependency | UNSUPPORTED | install |
| UNSUPPORTED_DATABASE | VERDICT | Database outside PostgreSQL 16 | UNSUPPORTED | database |
| UNSUPPORTED_ORM | VERDICT | ORM outside Prisma/SQL | UNSUPPORTED | database |
| NO_LOCKFILE | VERDICT | No lockfile for execution tier | NOT_TESTED | install |
| REQUIRES_LIFECYCLE_SCRIPTS | VERDICT | Dependency needs lifecycle scripts (disabled in v1) | NOT_TESTED | install |
| PRISMA_ENGINE_UNAVAILABLE | VERDICT | Prisma engine not baked for this version range | NOT_TESTED | install / database |
| MISSING_ENV_VAR | VERDICT | Required variable Fahes cannot supply | NOT_TESTED | build / tests |
| MISSING_BUILD_INPUT | VERDICT | Required build input absent or ungenerated | NOT_TESTED | typecheck / build |
| REQUIRES_EXTERNAL_SERVICE | VERDICT | Needs a service Fahes does not provide | NOT_TESTED | tests / backend |
| REQUIRES_SECRETS | VERDICT | Needs real secrets | NOT_TESTED | tests |
| REQUIRES_CONFIGURATION | VERDICT | Needs customer configuration Fahes cannot derive | NOT_TESTED | tests |
| UNSAFE_TO_EXECUTE | VERDICT | Suite classified unsafe to execute | NOT_TESTED | tests |
| RUNNER_SETUP_FAILED | VERDICT | Runner or fixture setup failed (not a test failure) | BLOCKED | tests |
| RUNNER_REPORTED_ZERO_TESTS | VERDICT | Exit 0, zero executed tests, tests discovered | INCONCLUSIVE | tests |
| NO_TESTS_FOUND | VERDICT | Static discovery empty; emitted ONLY at HIGH discovery confidence (Tier 1); LOW confidence uses `LOW_DETECTION_CONFIDENCE` | FINDING | tests |
| NOT_DISCOVERED | VERDICT | Suite not found by static discovery (also route not statically derivable) | NOT_TESTED | tests |
| TIMED_OUT | VERDICT | Step or run wall clock exceeded; cause ambiguous so the customer is not accused (a single test over its limit is simply a failed test case) | INCONCLUSIVE | supervisor |
| RESOURCE_LIMIT_EXCEEDED | VERDICT | Contained cap hit (memory, disk, pids); cause ambiguous | INCONCLUSIVE | supervisor |
| FLAKY_SUSPECTED | VERDICT | Failed then passed on rerun (MAINTAINABILITY_RISK) | FINDING | tests |
| COVERAGE_EXCLUDES_MOST_FILES | FLAG | FLAG on `COVERAGE_REPORT`: `filesMeasured / filesInSnapshot` low; check `tests.coverage-breadth` records INCONCLUSIVE | — (annotation only) | coverage |
| FINDINGS_CAPPED | FLAG | FLAG on the aggregate Finding: per-scan-plan finding cap reached | — (annotation only) | materialization |
| NON_DISPOSABLE_DATABASE_REFERENCE | FLAG | FLAG (observation): source points at a non-disposable DB; never used to connect, never echoed; DB checks proceed on the in-Guest fixture | — (annotation only) | database |
| EXECUTION_PLANE_UNAVAILABLE | VERDICT | EP unprovisioned, unhealthy or no IAB attestation | BLOCKED | supervisor |
| ANALYSIS_BUDGET_EXHAUSTED | VERDICT | E12 budget dimension exhausted | INCONCLUSIVE | E12 |
| LOW_DETECTION_CONFIDENCE | VERDICT | Detection confidence LOW | INCONCLUSIVE | detection |
| NETWORK_BLOCKED_BY_POLICY | VERDICT | Network attempt denied by policy | NOT_TESTED | supervisor / tests |
| FIXTURE_STARTUP_FAILED | VERDICT | In-Guest fixture failed health check | BLOCKED | fixtures |
| SANDBOX_POLICY_VIOLATION | FLAG | FLAG: containment-policy signal detected and recorded in Evidence; the abort outcome is `CONTAINMENT_ABORT` | — (annotation only) | supervisor |
| TOOLCHAIN_SUBSTITUTED | FLAG | FLAG: nearby supported version used; explicit in evidence | — (annotation only) | detection |
| OUT_OF_SCOPE | VERDICT | Ref or path not admitted by F01 / requests another spec's scope | BLOCKED | acquisition / admission |
| CONTRACT_ABSENT | VERDICT | No OpenAPI/JSON Schema contract in source | NOT_TESTED | backend |
| START_TEMPLATE_UNRECOGNIZED | VERDICT | No recognized backend start template | NOT_TESTED | backend |
| DRIFT_UNTESTABLE | VERDICT | Schema/migration drift cannot be compared (introspection unsupported) | NOT_TESTED | database |
| ARCHIVE_GUARD_REFUSED | VERDICT | Archive guard rejected the upload | BLOCKED | acquisition |
| SNAPSHOT_DIGEST_MISMATCH | VERDICT | Snapshot digest failed verification at consumption | BLOCKED | snapshot |
| ALL_TESTS_SKIPPED | VERDICT | Suite entirely skipped | INCONCLUSIVE | tests |
| RULE_APPLICABILITY_UNPROVEN | VERDICT | Rule needs applicability evidence not present | INCONCLUSIVE | rules |
| NETWORK_CUT_UNVERIFIED | VERDICT | Supervisor probe could not confirm egress cut before P3/P4 | BLOCKED | supervisor |
| CONTAINMENT_ABORT | VERDICT | Run aborted by supervisor containment policy (unit `FAILED` + `CUSTOMER_CODE_FAILURE`, F07 `SAFETY_VIOLATION`); includes 3 contained resource-cap kills in one run (provisional) | BLOCKED | supervisor |
| STALE_RESULT_REJECTED | VERDICT | Evidence from a stale lease holder rejected | BLOCKED | supervisor |
| CHECK_EVALUATE_THREW | VERDICT | A check evaluate threw; recorded not propagated | BLOCKED | dispatcher |
| REVERIFY_UNVERIFIABLE | VERDICT | Toolchain or support changed so the original cannot be reproduced | INCONCLUSIVE | reverify |
| REVERIFY_PARAMETER_MISSING | VERDICT | Reverify parameter absent from fresh manifest | BLOCKED | reverify |
| TOOLCHAIN_CHANGED | FLAG | FLAG: toolchain/image identity differs from the original evidence | — (annotation only) | detection / reverify |
| COVERAGE_NOT_INSTRUMENTED | VERDICT | No real coverage instrumentation ran; no metric reported | NOT_TESTED | coverage |
| REQUEST_BUDGET_EXHAUSTED | VERDICT | In-Guest probe request budget exhausted | INCONCLUSIVE | backend |
| INTEGRITY_ENFORCED_ELSEWHERE | VERDICT | Declared that integrity is enforced outside the schema; FK rule not applicable | NOT_TESTED | database |
| FK_APPLICABILITY_UNKNOWN | VERDICT | FK rule applicability undeclared and unprovable | INCONCLUSIVE | database |
| FIXTURE_GENERATION_UNSUPPORTED | VERDICT | Synthetic data generation unsupported for this schema | NOT_TESTED | database |
| IMAGE_NOT_TRUSTED | VERDICT | Execution Image unsigned, not digest-pinned or not in catalog | BLOCKED | supervisor |
| EP_TEARDOWN_UNCONFIRMED | VERDICT | Execution Plane could not confirm destroy and wipe | BLOCKED | supervisor |
| TEMPLATE_PARAMETER_INVALID | VERDICT | Command Template parameter failed validation against the manifest | BLOCKED | command policy |
| RUNNER_OUTPUT_UNPARSEABLE | VERDICT | Structured reporter output could not be parsed | INCONCLUSIVE | tests / build |
| LOCKFILE_OUT_OF_SYNC | VERDICT | Lockfile does not match manifest; frozen install refused | NOT_TESTED | install |
| INTEGRITY_MISMATCH | VERDICT | Downloaded package integrity does not match lockfile | BLOCKED | install |
| MODULE_RESOLUTION_FAILED | VERDICT | Type-check could not resolve a module (environment limitation unless code-attributable) | NOT_TESTED | typecheck |
| GENERATED_CODE_MISSING | VERDICT | Generated code (for example ORM client) unavailable | NOT_TESTED | typecheck |
| MISSING_INTEGRITY | VERDICT | Lockfile entry lacks an integrity hash; frozen install refused | NOT_TESTED | install |
| DYNAMIC_ROUTE_UNRESOLVED | VERDICT | Route pattern computed dynamically and not statically resolvable | INCONCLUSIVE | backend |
| SKIPPED_TOO_LARGE | VERDICT | File over the per-file cap (2 MiB analysis / 10 MiB execution snapshot); listed in `skipped[]`; dependent checks do not run on it | NOT_TESTED | snapshot / E12 |
| DISCOVERY_CAPPED | VERDICT | Test-file discovery cap of 5,000 files hit; discovery incomplete | INCONCLUSIVE | tests |
| RUN_BUDGET_EXHAUSTED | VERDICT | Run wall envelope exhausted; remaining steps not executed | INCONCLUSIVE | supervisor |
| WORKSPACE_CAP_EXCEEDED | VERDICT | A detected Tier-1 workspace was not among the (at most 4) workspaces selected for execution in the scan configuration; its execution-dependent checks are not run (FR-152, provisional cap) | NOT_TESTED | detection / supervisor |
| WORKSPACE_NOT_FOUND | VERDICT | A workspace path selected for execution does not exist as a Tier-1 workspace in the snapshot; the unit ends at lifecycle phase 2 | BLOCKED | detection |
| SCAN_DEADLINE_EXPIRED | VERDICT | The SPEC 009 plan deadline had passed (or the scan was terminal) when the unit was dispatched or expired; the unit was refused or ended by the deadline | BLOCKED | supervisor |
| SCAN_DEADLINE_INSUFFICIENT | VERDICT | Less than the unit's `timeoutPolicyMs + hardStopMarginMs` of plan deadline remained at dispatch; refused before F07 admission, no budget consumed | BLOCKED | supervisor |
| TENANT_NOT_ENABLED | VERDICT | The tenant is not in the `FAHES_SOURCE_EXECUTION_TENANTS` allowlist; execution refused | BLOCKED | activation |
| SYMLINK_SKIPPED | VERDICT | A committed symlink was dropped (never extracted) from a GitHub export archive; checks that depend on that path are `INCONCLUSIVE` and a build or type-check failure that references it is not a customer defect | NOT_TESTED | snapshot |
| REPO_REF_INVALID | VERDICT | Repository, ref or workspacePath violates the grammar (FR-151); refused before any network call | BLOCKED | acquisition |
| SOURCE_TOO_LARGE | VERDICT | Zipball or snapshot over the size limit (50 MiB archive; snapshot Artifact ceiling); no snapshot produced | BLOCKED | acquisition |
| SQL_META_COMMAND_REFUSED | VERDICT | Migration file contains a line starting with a backslash meta-command; refused statically by the Fahes applier | NOT_TESTED | migration |
| MOSTLY_SKIPPED | VERDICT | Suite executed at least one case but more than 50% of discovered cases were skipped (ALL_TESTS_SKIPPED stays for 100%) | INCONCLUSIVE | tests |

The starter set was extended during planning, by the first repair pass and by the second repair pass (3 new codes: `SOURCE_TOO_LARGE`, `SQL_META_COMMAND_REFUSED`, `MOSTLY_SKIPPED`) and by the closure review (`WORKSPACE_NOT_FOUND`, `SCAN_DEADLINE_EXPIRED`, `SCAN_DEADLINE_INSUFFICIENT`, `TENANT_NOT_ENABLED`, `SYMLINK_SKIPPED`; total 83); the first repair pass added 7 new codes: `MISSING_INTEGRITY`, `DYNAMIC_ROUTE_UNRESOLVED`, `SKIPPED_TOO_LARGE`, `DISCOVERY_CAPPED`, `RUN_BUDGET_EXHAUSTED`, `WORKSPACE_CAP_EXCEEDED`, `REPO_REF_INVALID`) by reconciling the codes used across all 011 contracts and `data-model.md`; this table is the single authority and `data-model.md` mirrors it. `SKIPPED` and `EXECUTED_PASSED` / `EXECUTED_FAILED` are suite-status values in `TEST_RESULT`, not reason codes.

## Failure behavior

Evidence-write failures are `TRANSIENT_INFRASTRUCTURE` (retry per 009) and make dependent checks `BLOCKED` until the sweep; a payload that fails schema validation is rejected and recorded as `ENGINE_DEFECT`, never stored.

## Safety

Untrusted text is data: never executed, never given to a shell, labeled when given to AI (FR-129).

## Idempotency

Evidence writes are deduplicated: 009 `recordEvidence` has no dedupe, so every 011 evidence writer first claims `IdempotentClaim` scope `evidence-write` with `claimKey = "${scanPlanId}:${executionUnitId}:${attempt}:${kind}:${naturalKey}"` (begins with `scanPlanId`; REVERIFY plans have one) and writes only when the claim is won; a lost claim with `resultRef` returns the recorded Evidence id. Natural keys per producing contract (E12 uses `(observerId, path, ruleId, anchor, occurrenceIndex)`). Artifact keys follow 009 `artifacts/<scanId>/<executionUnitId>/<contentDigest>`; `materializeFinding` idempotent per 009 (FR-135).

## Consumers

All 011 contracts; coverage summary; SPEC 012/013/014 (read-only).

## Non-negotiable boundary rules

1. No 011 reason is free text; every code in any 011 contract MUST appear in this registry.
2. Evidence MUST NOT be stored before redaction.
3. `SOURCE_CHECK_RESULT` is written only by the dispatcher.
4. Fingerprints MUST NOT contain line numbers or tool versions.
5. A registry code with verdict other than `FINDING`, and any `FLAG` code, MUST NEVER be materialized as a Finding on its own.
6. Every code has exactly one `kind` and one verdict; `data-model.md` MUST mirror the table identically.
