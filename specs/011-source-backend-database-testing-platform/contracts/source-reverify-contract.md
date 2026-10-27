# Contract: Source Finding Reverify

Per FR-121 and FR-140, consuming 009 FR-029 and the 009 `resolvePlan(kind: REVERIFY)` contract (plus
FR-004, FR-122, FR-054, FR-145, FR-148, FR-149, FR-151). Consumers: the reverify entry point for Issues from SPEC 011 domains, Source Check
dispatcher, `coverage-contract.md`. Reason codes only from the registry owned by `source-evidence-contract.md`.

## Signature (shape, not final TypeScript)

```text
resolvePlan({ targetId, kind: "REVERIFY", reverifyIssueId, requestedRef?, now }) -> ScanPlan   // 009, unchanged
SourceReverifyPlan = ordered minimal plan of 009 units for exactly one finding type (table below)
ExecutionUnit.configuration (SOURCE_EXECUTION, REVERIFY) = { requestedStepKinds: StepKind[] (the minimal step set), snapshotRef,
  originScanId: string, reverifyIssueId, requestedRef (fully qualified, e.g. refs/heads/main), refKind, workspacePath,
  reverifyOf: { issueId, fingerprint, minimalStepSet } }   // the concrete commandPlan is bound at lifecycle phase 2 from the fresh manifest
ReverifyOutcome = "REPRODUCED" | "NOT_REPRODUCED" | "UNVERIFIABLE"       // maps to IssueState
```

## Inputs

- The existing `Issue` (fingerprint, finding type, originating scan id, workspace path, check or rule id and
  version) and its preserved Evidence.
- The ref as requested (default: the ref recorded originally), re-resolved to a commit SHA now. Ref and repository identity
  are validated against the acquisition grammar (FR-151: `owner/name`; ref <= 255 chars, no `..`, no control characters, no
  leading `-`, no whitespace; commit SHA is 40 hex) before any network call; a violation is `REPO_REF_INVALID` (`BLOCKED`).
- Fresh F01 authorization for `SOURCE_EXECUTION` when execution units are needed; target ownership for static work. The
  REPOSITORY destination is built fresh each time (R4), never copied from the old grant:
  - GitHub origin, ref requested explicitly: `{repositoryFullName, ref = requestedRef, path = workspacePath}`.
  - GitHub origin, no explicit ref: `ref` = the repository's resolved DEFAULT BRANCH NAME (resolved via the GitHub API), `path` = the selected workspace path.
  - ZIP (ARCHIVE Target) origin: REPOSITORY scope shape with `repositoryFullName == Target.canonicalValue`, `ref = ""` (empty
    string; a grant with empty `includedRefs` admits it, a grant that lists refs does not), `path` = workspace path.
- Every read (the Issue by `reverifyIssueId`, snapshots, evidence, artifacts) filters by the owning tenant `(id, userId)`; a
  non-owner gets NotFound indistinguishable from nonexistent (FR-145). Prior-evidence lookups for comparison or drift are
  filtered by tenant and target and never cross tenants (FR-149).

## Outputs

- A fresh `ScanPlan` (`kind: REVERIFY`, `reverifyIssueId`, with its own `scanPlanId`), fresh snapshot Artifact and `SOURCE_MANIFEST`,
  fresh Evidence, fresh `SOURCE_CHECK_RESULT`, and an Issue state update through 009 `materializeFinding`.
- Minimal plan per finding type (`reverifyStrategy` declared on the Source Check):

| Finding type | Units and Steps required | Parameters (validated against FRESH manifest) |
|---|---|---|
| Source rule finding | `SOURCE_STATIC`: acquire, detect, E12 only the originating rule's observer | `ruleId`, `workspacePath`, symbol anchor |
| Schema issue | `SOURCE_STATIC`: acquire, E12 schema observer, the schema check | `objectKind`, `qualifiedName` |
| Type error | `SOURCE_EXECUTION`: acquire, P1 install, `ts.typecheck.tsc` only | workspace, tsconfig path |
| Build failure | `SOURCE_EXECUTION`: P1 install, that single build template only | `templateId`, workspace |
| Failed unit test | `SOURCE_EXECUTION`: P1 install, that test file or id only (`test.*`) | `suiteFile`, test id |
| Failed integration test | as unit test plus the declared in-Guest fixture start | `suiteFile`, test id, `fixtureId` |
| Backend contract failure | `SOURCE_EXECUTION`: install, `backend.start.recognized`, probes for that route only | `routeIdentity`, `operationId?` |
| DB migration failure | `SOURCE_EXECUTION`: install if required, `db.postgres.start`, that migration scenario only | `scenario`, `migrationId` |

- Artifact attribution (FR-148): REVERIFY units create Artifacts (snapshot, logs) with `scanId = originScanId` (009 `createArtifact`
  is caller-supplied); the key stays 009's `artifacts/<scanId>/<executionUnitId>/<contentDigest>` and retention follows the origin scan.

## Origin limitation: ZIP uploads

An ARCHIVE-origin finding can be reverified only against the retained original upload, and only while that upload is within
retention (the staged upload is retained until the owning scan's report-data retention expires, `source-acquisition-contract.md` invariant 9, so the reverify RE-ACQUIRES that retained upload); such a reverify verifies environment or toolchain changes only (the bytes are unchanged). A corrected ZIP is a
NEW upload = a new Target = a new scan with a new grant, never a reverify. If the original upload is gone, the outcome is
`UNVERIFIABLE` with reason `REVERIFY_UNVERIFIABLE`.

## Ownership

009 owns plan resolution and unit lifecycle; SPEC 011 owns per-type planning rules, parameter derivation
and outcome interpretation. The existing single-capability reverify runner (`apps/worker/src/reverify/runner.ts`)
and its queue remain untouched and are never used for SPEC 011 findings (clarification, FR-134).

## Invariants

1. Plan resolution goes through `resolvePlan(kind: REVERIFY)`: one-class minimal config, no profile,
   fail closed to `REFUSED` (009). Static findings use class `SOURCE_STATIC` only; execution findings add
   one `SOURCE_EXECUTION` unit (one Guest, steps in the `commandPlan` bound at phase 2 from `requestedStepKinds`; parameters such as the test file or id are validated against the FRESH manifest and a parameter absent from it is `REVERIFY_PARAMETER_MISSING`).
2. Fresh snapshot: the requested ref is re-resolved and may be a new commit; the resulting SHA, not the old
   one, is recorded and executed. Old snapshot and old Evidence are never reused as proof.
3. Fresh F01 authorization: `isAuthorized` is evaluated again; the old grant snapshot is never reused. If the
   new commit's ref or workspace path falls outside the grant's scope, the plan resolves `REFUSED` citing
   F01's reason (for example `OUT_OF_SCOPE`) and no execution starts (FR-121, FR-122).
4. Parameters are derived only from the fresh manifest: a test path or id, template id, workspace or route
   identity must exist in the fresh manifest paths and detection. A derived parameter that is absent (template id, tsconfig
   path, fixture id, scenario) is `REVERIFY_PARAMETER_MISSING` (`BLOCKED`, unit-level at lifecycle phase 2 when the fresh manifest is read; the plan is not refused); if instead the
   finding's own file, symbol, test, route or migration identity no longer exists, the outcome is `UNVERIFIABLE` (invariant 6).
   Repository strings never reach a shell.
5. Every REVERIFY `SOURCE_EXECUTION` unit sets `configuration.originScanId` to the reverified Issue's
   originating scan id, so the supervisor also subscribes to that scan's F07 SCAN-scope kill channel; REVERIFY
   plans carry a `scanPlanId` (used as the leading part of every claimKey) but no scan id themselves (FR-140), and Artifacts
   use `scanId = originScanId` (FR-148). A stop on that scope destroys the Guest (FR-051).
6. Outcomes by fingerprint comparison: the same fingerprint re-emitted as a `FINDING` means the finding
   persists (`REPRODUCED`: Issue `OPEN`, or `REOPENED` if it was `ASSERTED_FIXED`/`RESOLVED`); the originating
   check ran with sufficient evidence and returned `PASS` or a different fingerprint means `NOT_REPRODUCED`
   (Issue `RESOLVED`); anything else follows rule 7. Rename guard: "not reproduced / resolved" requires that the check re-ran
   against the same workspace-relative path/identity (file, symbol, test, route or migration) and passed. If the fingerprint's
   file or symbol identity no longer exists in the fresh snapshot (renamed, moved or deleted), the outcome is `UNVERIFIABLE`
   (INCONCLUSIVE, `REVERIFY_UNVERIFIABLE`), never an automatic `RESOLVED`; a different fingerprint at a different identity is not
   evidence of a fix.
7. Cannot verify: when toolchain or image identity changed such that the original check is `UNSUPPORTED`,
   `NOT_TESTED` (for example `NO_LOCKFILE`, `UNSUPPORTED_VERSION`), `BLOCKED` or `INCONCLUSIVE` now, the
   outcome is `UNVERIFIABLE` (Issue `UNVERIFIABLE`), never `RESOLVED`. Tool version drift alone does not change
   fingerprints but is recorded.
8. Historical evidence is preserved: no deletion or overwrite; the Issue links both old and new Evidence
   through `IssueEvidenceLink`.
9. Coverage-dependent findings (dead code, cycles, unused exports) reverify over the whole affected workspace
   by the same observer; if sufficient coverage cannot be re-established the outcome is `UNVERIFIABLE`.
10. Reverify consumes the same budgets, F07 admission and checkpoints as a normal run: one request unit and
    one concurrency lease per run; `attempts: 1`; a started customer step is never auto-retried (FR-054).

## Failure behavior

| Condition | Reason code | FailureClass | Result |
|---|---|---|---|
| New commit out of scope | `OUT_OF_SCOPE` (F01 reason passed through) | `SAFETY_REFUSED` | plan `REFUSED`, no units |
| Ref no longer resolves / repo revoked | n/a | `TARGET_UNAVAILABLE` | plan or acquisition fails, Issue unchanged |
| Ref or repository fails the grammar | `REPO_REF_INVALID` | `INVALID_CONFIGURATION` | `BLOCKED`, no network call |
| Derived parameter absent from fresh manifest | `REVERIFY_PARAMETER_MISSING` | `INVALID_CONFIGURATION` | `BLOCKED`, plan refused |
| Finding identity gone (rename/move/delete) | `REVERIFY_UNVERIFIABLE` | none | `UNVERIFIABLE` (Issue `UNVERIFIABLE`) |
| Toolchain or support changed | `REVERIFY_UNVERIFIABLE` (flag `TOOLCHAIN_CHANGED` recorded) | none | `UNVERIFIABLE` |
| ZIP origin and original upload expired | `REVERIFY_UNVERIFIABLE` | none | `UNVERIFIABLE` |
| Execution Plane unavailable | `EXECUTION_PLANE_UNAVAILABLE` | `SAFETY_REFUSED` | refused, no weaker isolation |
| Guest lost before customer step | n/a | `TRANSIENT_INFRASTRUCTURE` | provisioning retry within attempt |

## Safety

Reverify never executes with an older authorization, never skips admission, and never runs customer code
outside the Guest. AI is not involved in plan or outcome decisions (FR-137).

## Idempotency

Plan resolution is idempotent per `(reverifyIssueId, resolvedSha, requestedRef)`; unit keys derive from
`(executionUnitId, attempt)`; evidence and findings follow FR-135. Every claimKey (`source-acquire`, `ep-run-start`,
`source-check-execution`, `evidence-write`) begins with the REVERIFY plan's `scanPlanId`, so keys never collide across tenants or
scans. Finding text passes `@webaudit/redaction` before `materializeFinding` (FR-150). Repeating a reverify of the same commit
yields the same outcome.

## Consumers

Reverify API and UI for source Issues, Issue state machine (`OPEN`, `ASSERTED_FIXED`, `RESOLVED`,
`UNVERIFIABLE`, `REOPENED`), coverage summary, SPEC 014.

## Non-negotiable boundary rules

1. A reverify MUST NEVER reuse a previous snapshot, grant snapshot or evidence as proof.
2. A new commit MUST NEVER inherit the old authorization; out-of-scope refs MUST be refused with F01's reason.
3. Reverify MUST NEVER widen its plan beyond the finding type's minimal units and steps.
4. `originScanId` MUST be present on every REVERIFY `SOURCE_EXECUTION` unit.
5. `UNVERIFIABLE` MUST NEVER be reported as `RESOLVED`.
6. Historical Evidence MUST NEVER be deleted or altered.
7. The existing reverify runner and queue MUST NEVER be modified or used for SPEC 011 findings.
8. A rename, move or deletion of the finding's identity MUST NEVER yield `RESOLVED`.
9. A corrected ZIP MUST NEVER be treated as a reverify; it is a new upload, Target, scan and grant.
