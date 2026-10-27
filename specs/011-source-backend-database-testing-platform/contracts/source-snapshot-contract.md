# Contract: Source Snapshot

Per FR-009, FR-010, FR-011, FR-045, FR-116, FR-118, FR-130, FR-145, FR-148, FR-153. Consumers: E12 static analysis, language/toolchain detection, Execution Supervisor and Execution Plane (E13), reverify, SPEC 012/013/014.

## Signature (shape, not final TypeScript)

```text
buildSnapshot(extractedDir, ctx) -> { snapshotArtifactId, manifestEvidenceId, contentDigest }
verifySnapshot(snapshotArtifactId, expectedDigest) -> { ok: true } | { ok: false, failureClass: "ENGINE_DEFECT" }   // see Failure behavior
presignSnapshotForGuest(snapshotArtifactId, runId) -> { url, expiresAt }
```

A Source Snapshot is not a table: it is an `Artifact` (contentType `application/vnd.fahes.source-snapshot`) plus one `SOURCE_MANIFEST` Evidence (FR-116).

## Inputs

1. A directory produced by safe extraction (`source-acquisition-contract.md`), the owning `userId`, `scanPlanId`, optional `scopeGrantRef`.
2. Limits: acquisition limits are the existing 50 MiB archive / 512 MiB extracted / 20,000 files; per-file analysis cap 2 MiB; per-file execution-snapshot cap 10 MiB. The FR-119 50 MiB per-run / 20 MiB per-object cap applies to Artifacts produced by 011 (reports, logs), not to the snapshot. The Source Snapshot Artifact ceiling is 128 MiB compressed per object and 256 MiB per scan *(provisional; see U-2 in `upstream-amendment-requests.md`)*; the per-scan budget counts the snapshot plus 011 report and log Artifacts; a snapshot that would exceed it is `SOURCE_TOO_LARGE`.

## Outputs

1. Normalized deterministic archive stored via 009 `createArtifact` with the 009 key `artifacts/<scanId>/<executionUnitId>/<contentDigest>` (no custom prefix; tenant-scoped through the owning scan) and retention parity (FR-010). For REVERIFY units `Artifact.scanId = originScanId` (FR-148; 009 `createArtifact` is caller-supplied) and retention follows that scan.
2. `SOURCE_MANIFEST` Evidence per `source-evidence-contract.md` (fields: repositoryFullName?, requestedRef, resolvedCommitSha, workspacePath, contentDigest, fileCount, bytes, acquisitionTimestamp, tenantUserId, scopeGrantRef?, excludedFiles[], skipped[], denylistVersion, toolchainEvidenceRef).

## Ownership

Context A. Owning spec: 011. Stored through 009 only; no private store.

## Invariants

1. Normalization algorithm, in order: (a) drop VCS metadata (`.git/`, `.hg/`, `.svn/`); (b) drop credential-denylist files; (c) reject or drop links, devices and special files (the guard already refuses them); (d) normalize paths to NFC, `/` separators, workspace-relative, and REFUSE (`ARCHIVE_GUARD_REFUSED`) any entry whose name contains a control character, a backslash, or that collides with another entry after NFC normalization (two different raw names must never map to one path); (e) normalize modes to `0644` (or `0755` if the owner-executable bit was set); (f) validate text encoding of files typed text (invalid UTF-8 files are kept as binary, flagged in `skipped[]`); (g) apply per-file caps, over-cap files listed in `skipped[]` with size and reason `SKIPPED_TOO_LARGE`; (h) sort entries by bytewise UTF-8 path; (i) emit archive with zeroed timestamps (mtime `0`), no owner data.
2. Credential denylist (FR-009, FR-153): a versioned code-level list `credential-denylist`; its version is recorded in `SOURCE_MANIFEST.denylistVersion`. v1 patterns: `.env`; `.env.*` (except `.env.example`, `.env.sample`, `.env.template`, `.env.dist`); `*.pem`; `*.key`; `*.p12`; `*.pfx`; `*.jks`; `*.keystore`; `id_rsa*`; `id_dsa*`; `id_ecdsa*`; `id_ed25519*`; `.npmrc`; `.yarnrc.yml`; `.yarnrc`; `.pypirc`; `.netrc`; `_netrc`; `.git-credentials`; `.docker/config.json`; `.aws/credentials`; `.aws/config`; `credentials.json`; `service-account*.json`; `kubeconfig`; `*.kubeconfig`; `*.tfstate`; `*.tfvars`; `secrets.*`; `*.secret`; `.htpasswd`; `*.kdbx`; `*.ovpn`. Non-denylisted files that nevertheless contain secrets are not excluded; their secret values are handled by the exact-value scrub (`source-evidence-contract.md` invariant 9). Exclusion of `.npmrc`/`.yarnrc*` also supports FR-065 (the platform forces registry configuration). A list change is a new version. Matching is by basename and path, case-insensitive. Each exclusion is recorded by path only, reason `EXCLUDED_CREDENTIAL_FILE`; content is never hashed into the digest, logged or excerpted (FR-118).
3. `contentDigest` = lowercase hex sha256 of the canonical manifest text: header line `fahes-source-snapshot-v1\n`, then one line per included file in sorted order: `<path>\t<size>\t<sha256>\n` (field order exactly: path, size in decimal bytes, per-file sha256), where `<path>` is percent-encoded: `%`, tab, newline, carriage return and every other control character are written as `%XX` (uppercase hex), so no path can contain a field or line separator and two different trees can never share a digest. No trailing fields, no timestamps, no modes. Excluded and skipped files are not in the manifest lines.
4. Identical input content yields an identical digest across runs, hosts and tool versions.
5. A snapshot is immutable: no update path exists; any change produces a new snapshot with a new digest and artifact.
6. Snapshots are per-scan and tenant-keyed; never shared across tenants or scans; retention never exceeds report-data retention (FR-130).
7. The snapshot is the only full-source object and is never exposed through report routes (FR-118).
8. Delivery to the Execution Plane is a presigned URL for exactly this one object, read-only (GET), short-lived (TTL 10 minutes, never longer than the run TTL), generated by the trusted side and revoked or expired at teardown (FR-045).

## Failure behavior

| Condition | Reason code | FailureClass | Verdict / effect |
|---|---|---|---|
| Digest mismatch at consumption | `SNAPSHOT_DIGEST_MISMATCH` | `ENGINE_DEFECT` | Consumer stops; dependent checks `BLOCKED` |
| Artifact write failed or metadata write failed | (none) | `TRANSIENT_INFRASTRUCTURE` | Orphan sweep reclaims; checks `BLOCKED` |
| File over cap | `SKIPPED_TOO_LARGE` | none | Listed in `skipped[]`; checks needing that file `NOT_TESTED` |
| Credential file present | `EXCLUDED_CREDENTIAL_FILE` | none | Recorded; checks needing it `NOT_TESTED` |
| Snapshot exceeds the extracted-size or Artifact ceiling | `SOURCE_TOO_LARGE` | `INVALID_CONFIGURATION` | Acquisition fails; no snapshot |
| Entry name unrepresentable (control character, NFC collision) | `ARCHIVE_GUARD_REFUSED` | `INVALID_CONFIGURATION` | Acquisition fails; no snapshot |

A digest mismatch is a platform integrity fault (`SNAPSHOT_DIGEST_MISMATCH` is in the registry) surfaced as a classified failure, never a verdict of `PASS`.

## Safety

1. Credential files never enter the snapshot, so they can never reach the Guest or an E12 child.
2. Redaction (`@webaudit/redaction`) applies to manifest strings that could contain secrets (paths and excluded-file reasons are path-only) per FR-117.
3. The presigned URL is single-object, read-only, 10-minute and never logged in full. Snapshot download for presign filters by owning tenant `(id, userId)`; a non-owner gets NotFound indistinguishable from nonexistent (FR-145).
4. Snapshot bytes are untrusted data; consumers parse, never execute.

## Idempotency

1. Artifact key is 009's `artifacts/<scanId>/<executionUnitId>/<contentDigest>` (`scanId = originScanId` for REVERIFY); re-running `buildSnapshot` on the same content finds the existing artifact and returns it (FR-135).
2. The `SOURCE_MANIFEST` Evidence write is claimed under the acquisition claim (`source-acquire`); a replay never writes a second manifest.
3. `presignSnapshotForGuest` is derived from `runId` (TTL 10 minutes); a second call returns a fresh URL for the same object without changing the snapshot.

## Consumers

E12 (read-only mount of the extracted snapshot in its child); Execution Supervisor (artifact id plus digest copied into `ExecutionUnit.configuration`); Execution Plane (pulls once, verifies digest before copying to scratch); `scanSourceCoverageSummary`; SPEC 012/013/014 per the downstream freeze.

## Non-negotiable boundary rules

1. Verification of `contentDigest` is MANDATORY at every consumption: E12 before parsing, supervisor before presigning, Guest agent before unpacking. A mismatch aborts that consumer.
2. The digest definition in invariant 3 is the only definition; no consumer may compute a different canonical form.
3. No consumer may modify a snapshot or write back into it; scratch copies are ephemeral.
4. Credential-denylist files MUST NOT appear in any snapshot, evidence excerpt, log or artifact.
5. The Artifact content type `application/vnd.fahes.source-snapshot` is reserved for this object and MUST NOT be served by any report or download route.
6. No snapshot is shared between tenants or scans; deduplication by digest across tenants is forbidden.
7. No new table, column or relation edge is introduced for snapshots (FR-116).
