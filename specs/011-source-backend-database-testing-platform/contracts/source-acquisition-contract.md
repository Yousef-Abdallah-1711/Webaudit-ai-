# Contract: Source Acquisition

Per FR-001..FR-012, FR-122, FR-130, FR-135, FR-147, FR-151. Consumers: Source Snapshot builder (`source-snapshot-contract.md`), language/toolchain detection, E12 static analysis, Execution Supervisor (E13 input), reverify (FR-121), SPEC 012/013/014 (via the snapshot only).

## Signature (shape, not final TypeScript)

```text
acquireSource(input: AcquireSourceInput) -> AcquireSourceResult
AcquireSourceInput  = { scanPlanId | originScanId, userId, targetId,
                        source: { kind: "GITHUB", repositoryFullName, requestedRef?: string }
                              | { kind: "ZIP", stagedUploadKey, uploadSha256 },
                        workspacePath?: string, grantRef?: AuthorizationRef }
AcquireSourceResult = { ok: true, snapshotArtifactId, manifestEvidenceId, contentDigest, resolvedCommitSha? }
                    | { ok: false, reasonCode, failureClass }
```

Unit shape: ExecutionUnit `engineId: "source-static.acquire"`, class `SOURCE_STATIC`, queue `webaudit-scan-phase` (unchanged), no `TargetAuthorization`.

## Inputs

1. GitHub: repository reachable through the user's existing GitHub connection (public or private). The OAuth token is read from the existing token vault inside the trusted worker only (FR-001).
2. ZIP: staged upload already size-bounded by `readBoundedUpload`; only ZIP is accepted (FR-001, FR-008).
3. Any other `source.kind` (arbitrary Git URL, other Git hosts, tar) is refused: `UNSUPPORTED_SOURCE_INPUT`.
4. `requestedRef` absent means the repository default branch.
5. Grammar (FR-151), validated before any network call: `repositoryFullName` matches the existing `REPO_PATTERN` (`owner/name`); `requestedRef` is at most 255 characters, contains no `..`, no control characters, no whitespace and no leading `-`; a commit SHA is exactly 40 hex characters; `repositoryFullName` additionally rejects `.` and `..` segments and a trailing `.git` (the existing `REPO_PATTERN` alone accepts `.`/`..`, which URL normalization would collapse while carrying the bearer token). `workspacePath` is relative, has no `..` segment, no leading `/`, no control characters, at most 255 characters per segment and 1024 in total. A `requestedRef` containing `?`, `#`, `%` or a backslash is rejected; a `/` is legal in a branch name, and the value is percent-encoded as a single path segment (`encodeURIComponent`) when composing `/repos/{o}/{r}/commits/{ref}`, while content is fetched only by the 40-hex resolved SHA (`/zipball/{sha}`), so a ref can never alter the request path, query or host. Any violation is `REPO_REF_INVALID`.

## Outputs

1. A Source Snapshot Artifact plus one `SOURCE_MANIFEST` Evidence (FR-011), both per `source-snapshot-contract.md`.
2. For GitHub input the manifest records `requestedRef`, `refKind` (`BRANCH`, `TAG`, `SHA` or `DEFAULT`; refs are resolved fully qualified as `refs/heads/...` or `refs/tags/...` so a tag and a branch of the same name cannot be confused) and `resolvedCommitSha`; for ZIP, `resolvedCommitSha` is absent and identity is the staging identity plus `contentDigest`. The manifest also records `sourceForm` (`GITHUB_EXPORT_ARCHIVE` or `ZIP_UPLOAD`) and `exportAttributesPresent` (the repository's `.gitattributes` contains `export-ignore` or `export-subst`).
3. F01 destination identity: when no explicit ref is requested, the destination ref is the repository's resolved DEFAULT BRANCH NAME (resolved via the GitHub API) and path is the selected workspace path. A ZIP upload yields an ARCHIVE Target using the REPOSITORY scope shape with `repositoryFullName == Target.canonicalValue`, destination ref `""` (empty string: a grant with empty `includedRefs` admits it, a grant listing refs does not) and path = workspace path.
4. Path-only records for `SUBMODULE_NOT_FETCHED`, `LFS_POINTER_UNRESOLVED`, `EXCLUDED_CREDENTIAL_FILE`.

## Ownership

Context A (Source Acquisition). Owning spec: 011. Consumes 007 (ownership, `isInScope`), 009 (`recordEvidence`, `createArtifact`), 010 (`IdempotentClaim` by pattern).

## Invariants

1. Ref resolution precedes fetch: resolve `requestedRef` to a 40-hex commit SHA via the GitHub API, then fetch the zipball by that SHA. A branch name is never an analysis identity (FR-002).
2. Fetch uses only the existing SSRF-guarded fetch with the fixed host allowlist `api.github.com`, `codeload.github.com`; a redirect leaving the allowlist aborts (FR-005).
3. No git binary, Git protocol, hook or repository-supplied program is ever invoked (FR-005).
4. Submodules are never fetched; `.gitmodules` presence is recorded, dependent checks end `NOT_TESTED` (FR-006). LFS pointers are detected by their pointer-file signature and never resolved (FR-007).
5. Every archive passes the existing archive guard (`inspectArchive`, then `extractArchive`): traversal, absolute path, symlink/hardlink/device refusal, ratio/size/entry limits, duplicate paths, no nested recursion. Nothing is written before inspection passes (FR-008). The guard's defaults are unchanged. Because GitHub export archives legitimately contain committed symlinks and UTF-8 names, two NEW additive guard options exist for the GitHub path only (listed in the `plan.md` touch list with a regression test proving the defaults are untouched): `symlinkPolicy: "refuse"` (default) or `"skip-and-record"` (the entry is dropped and recorded as a skip, never extracted), and `decodeUtf8WhenFlagged: false` (default) or `true` (entry names decoded as UTF-8 when the archive's UTF-8 flag is set; the default Latin-1 decoding would turn non-ASCII names into mojibake and cause false type-check findings). The ZIP-upload path keeps `"refuse"`.
6. Extraction occurs only under a per-scan temp path derived from `(scanPlanId, unitId)`; it is deleted on completion, failure, timeout and cancellation (FR-008, FR-012, FR-130).
7. Workspace selection of a subdirectory is constrained to the grant's `includedPathPrefixes` when a grant is in play (FR-004).
8. Partial acquisition never yields a snapshot or a `SOURCE_MANIFEST` (FR-012).
9. No new storage location is introduced without a proven deletion call site; the staged-upload retention gap is not relied on (FR-012). A staged ZIP upload is retained until the owning scan's report-data retention expires (needed for ZIP reverify) and is then deleted by a NEW proven deletion call site; it is never deleted at acquisition completion.
10. Scope timing: the F01 `isInScope` decision is made after ref resolution and before any content fetch; the resolved SHA is recorded with the decision (FR-004).
11. GitHub export-archive limitation: the archive is `git archive` output, so files hidden by `export-ignore` are invisible to every check and cannot be detected, and `export-subst` substitutes content. The manifest flag `exportAttributesPresent` and the reports' statement of the commit identity carry this limitation; it is listed in the residual-risk register (`research.md` R29), not priced as negligible.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict / effect |
|---|---|---|---|
| Unsupported input kind | `UNSUPPORTED_SOURCE_INPUT` | `INVALID_CONFIGURATION` | Refused; no unit work |
| Connection revoked, repo missing or deleted | (none; class only) | `TARGET_UNAVAILABLE` | Unit `FAILED`; dependent checks `BLOCKED` |
| Repo/ref grammar violation (FR-151) | `REPO_REF_INVALID` | `INVALID_CONFIGURATION` | Refused before any network call; no unit work |
| Archive guard rejection | `ARCHIVE_GUARD_REFUSED` | `INVALID_CONFIGURATION` | Unit `FAILED`; no snapshot |
| Archive larger than the 50 MiB zipball limit, or snapshot over the Artifact ceiling | `SOURCE_TOO_LARGE` | `INVALID_CONFIGURATION` | Unit `FAILED`; no snapshot; reported to the customer as too large |
| GitHub rate limit (HTTP 403/429 with rate-limit headers) | (none; class only) | `TRANSIENT_INFRASTRUCTURE` | Retry per 009 attempts; never a customer-attributable result |
| Repository archived, forbidden or access revoked | (none; class only) | `TARGET_UNAVAILABLE` | Unit `FAILED`; dependent checks `BLOCKED` |
| Network fault, GitHub 5xx | (none; class only) | `TRANSIENT_INFRASTRUCTURE` | Retry per 009 attempts |
| Ref or path not admitted by F01 | `OUT_OF_SCOPE` | `SAFETY_REFUSED` | Refused before any fetch |
| Submodule / LFS pointer / credential file | `SUBMODULE_NOT_FETCHED`, `LFS_POINTER_UNRESOLVED`, `EXCLUDED_CREDENTIAL_FILE` | none | Recorded; dependent checks `NOT_TESTED` |

## Safety

1. Acquisition is class `SOURCE_STATIC`: Target ownership only. Acquisition is never authorization to execute; `SOURCE_EXECUTION` performs its own F01 `isAuthorized` plus F07 admission with its own audit trail (FR-003, FR-122).
2. The GitHub token is used only inside the trusted worker, only against allowlisted hosts, and is never written to evidence, logs, the snapshot, a presigned URL or the Execution Plane (FR-039, FR-045).
3. When a grant is in play the ref as requested (or the SHA if supplied) and the workspace path are each admitted by `isInScope` using REPOSITORY destination `{repositoryFullName, ref, path}`; the resolved SHA is the sole executed identity (FR-004). A branch-name request against a grant listing only SHAs is refused `OUT_OF_SCOPE`.
4. Public readability of a repository grants nothing.
5. Repository content is untrusted data; nothing from it is executed or passed to a shell.

## Idempotency

1. Claim: `IdempotentClaim` scope `source-acquire`, `claimKey = "${scanPlanId}:${repoOrArchiveIdentity}:${resolvedCommitSha | uploadSha256}:${workspacePath}"` (begins with `scanPlanId`, which REVERIFY plans also have, so keys cannot collide across tenants or scans). Won claim runs; an existing claim with `resultRef` returns the recorded result without refetching (FR-135).
2. Re-acquiring the same SHA yields an identical `contentDigest` (normalization is deterministic).
3. The ref-to-SHA resolution is performed once per claim; a retry reuses the recorded SHA and never re-resolves the ref within one scan.
4. Reverify re-resolves the ref and so may produce a new SHA and a new claim (FR-121).
5. ZIP reverify limitation: an ARCHIVE-origin finding is reverified only against the retained original upload (if still within retention), which verifies environment/toolchain changes only; a corrected ZIP is a NEW upload = new Target = new scan + new grant, not a reverify. If the original upload is gone the outcome is `REVERIFY_UNVERIFIABLE` (`source-reverify-contract.md`).
6. Handoff (FR-147): acquisition itself discloses nothing to the Execution Plane. The `source.sent_to_execution_plane` (an `AuditLogEntry` action; F07's closed `ExecutionAuditEventType` is not extended) audit event (tenant, target, snapshot digest, EP run id; no content) is recorded by the SOURCE_EXECUTION admission path before any run; acquisition only supplies the snapshot digest it references.

## Consumers

Snapshot builder; toolchain detector; E12 engine; Execution Supervisor (reads snapshot Artifact id and digest from `ExecutionUnit.configuration`); `scanSourceCoverageSummary`.

## Non-negotiable boundary rules

1. Resolve-then-fetch-by-SHA is the only Git-hosted path; fetching by branch name is forbidden.
2. TOCTOU: any F01 decision made on the requested ref MUST be recorded together with the resolved SHA; the executed content MUST be the SHA content and nothing else.
3. No git binary, no clone, no Git hooks, in any trusted process, in any build.
4. Acquisition never grants or implies execution authorization; the two checks and audit trails stay separate.
5. A private-repository token never leaves the trusted worker; the Execution Plane receives only a snapshot via a single-object presigned URL.
6. Submodule content and LFS objects are never fetched, under any flag, in v1.
7. A failure after partial extraction MUST delete the temp path before the unit reports terminal status.
8. Every reason code used here MUST exist in the registry in `source-evidence-contract.md`.
