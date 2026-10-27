# Tenant, Privacy and Security Checklist: Source / Backend / Database / Automated Code Testing Platform

**Purpose**: Validate the quality of the requirements for tenant isolation, privacy and security of everything this spec
persists, transmits or exposes: snapshot and artifact scoping and retention, redaction and excerpt minimization,
credential-file handling, prompt-injection defenses, presigned URLs, per-run credentials, fixture data lifecycle, cleanup,
audit and observability hygiene, ownership versus authorization, operator access and IDOR-safe reads. This checklist tests
the written requirements, not any implementation.
**Created**: 2026-10-09
**Feature**: [spec.md](../spec.md) (FR-003, FR-009..012, FR-039, FR-045..046, FR-057, FR-059, FR-083, FR-117..119, FR-129..130) |
[plan.md](../plan.md) | [data-model.md](../data-model.md) (Tenant isolation, retention, lifecycle) |
[contracts/source-snapshot-contract.md](../contracts/source-snapshot-contract.md) |
[contracts/source-evidence-contract.md](../contracts/source-evidence-contract.md) | [research.md](../research.md) R24, R29

**Status (pass 3)**: 26/26 items satisfied by the current package; remaining unchecked items: 0.

**Note**: This checklist is a reviewer-owned requirements-quality review artifact. It was evaluated against the actual
files of the planning package on 2026-10-09. It is PLANNING ONLY: nothing here executes, builds or provisions anything.
It follows the house style of SPEC 010's `tenant-privacy-evidence-security.md`.
**Marker Semantics**: `[x]` means the requirement-quality criterion is satisfied by the current spec package. `[ ]` means
a real gap, inconsistency or ambiguity remains; each such item carries a `**GAP**:` note naming where the package
falls short, so it can be repaired before closure. It does not mean implementation work is complete.

**Status (pass 2, re-evaluated against the repaired package)**: 23 of 26 items satisfied; 3 open (see `**GAP**:` notes).

## Tenant Scoping of Persisted Objects and Keys

- [x] CHK-TP001 Is every persisted or stored object this spec creates enumerated with its tenant scoping (snapshot Artifact,
  staged ZIP, evidence payloads, log/coverage/schema/migration artifacts, Guest scratch, proxy allowlist entries, EP run
  record, idempotency claims, REVERIFY artifacts) in one table, and is "scoped at creation to the owning user" a requirement
  rather than a convention?
  [Completeness, Spec §FR-130, data-model "Tenant isolation, retention, lifecycle"]
- [x] CHK-TP002 Is the "tenant-scoped key" required for snapshots and artifacts defined identically wherever it appears?
  **RESOLVED**: one key shape: 009 `artifacts/<scanId>/<executionUnitId>/<contentDigest>` in source-snapshot-contract
  (Outputs 1, Idempotency 1), plan Storage and data-model Identity/tenant tables; "tenant-scoped" is defined as
  scoping through `Artifact.userId` plus the owning `scanId` ownership check, with REVERIFY using `originScanId`
  (FR-148). [Consistency, Spec FR-010, FR-119]
- [x] CHK-TP003 Is the tenant/retention treatment of artifacts for REVERIFY plans defined?
  **RESOLVED**: FR-148 and data-model tenant table last row: REVERIFY Artifacts carry `scanId = originScanId` (009
  `createArtifact` is caller-supplied), retention follows the origin scan, tenant/target filtered lookups (FR-149);
  quickstart fixture 62. The remaining `UNKNOWN` in data-model line 268 concerns SOURCE_CHECK_RESULT unit attribution
  only. [Completeness, Spec FR-121, FR-130, FR-140]
- [x] CHK-TP004 Do retention and deletion requirements give every storage location a proven deletion path (snapshot and
  artifacts at report-data retention parity; temp paths on every exit path; staged ZIP with a new deletion call site;
  orphan-object sweeps), and is the known staged-upload retention gap explicitly not inherited?
  [Completeness, Spec §FR-012, §FR-057, §FR-130, plan Migration Map #6, research.md UI-8]

## Redaction, Excerpts and Secret Handling

- [x] CHK-TP005 Is redaction required for every 011 evidence payload and artifact that can contain source text, logs, stack
  traces, schema or SQL, explicitly including `SOURCE_STATIC` evidence that 009 does not force, and is "no evidence stored
  before redaction" a boundary rule?
  [Completeness, Spec §FR-117, source-evidence-contract Invariant 1/boundary rule 2, research.md R24]
- [x] CHK-TP006 Is the behavior when the redaction step itself fails specified (payload rejected as `ENGINE_DEFECT` or
  recorded with 009's `_redactionFailed` marker, never stored unredacted)?
  [Edge case, untrusted-execution-contract Lifecycle phase 8, source-evidence-contract Failure behavior, research.md R24]
- [x] CHK-TP007 Are excerpts minimal and bounded (<= 7 lines and <= 600 characters), forbidden from credential-bearing
  files, and is full source barred from every report artifact so the Source Snapshot is the only full-source object, never
  served through report routes?
  [Measurability, Spec §FR-118, source-snapshot-contract Invariant 7/boundary rule 5]
- [x] CHK-TP008 Is the credential-file denylist complete, versioned and consistent across spec, contract and research?
  **RESOLVED (pass 3)**: The denylist is versioned (`denylistVersion`), complete in source-snapshot-contract (v1 incl. `*.kdbx`, `*.ovpn`), and research R24/R33 point to it; non-denylisted files containing secrets are handled by the exact-value scrub.
- [x] CHK-TP009 Do the redaction requirements cover every sink a secret could reach: logs, AI prompts, evidence, artifacts
  AND the derived Finding fields?
  **RESOLVED**: FR-150 and source-evidence-contract invariant 5: Finding title/explanation/consequence/fix-prompt text
  passes `@webaudit/redaction` before `materializeFinding` and never contains denylist content or secrets; FR-117
  (evidence/artifacts), FR-129 (AI prompts), FR-059 (observability without secrets or payloads); quickstart fixture
  57. [Completeness, Spec FR-117, FR-129, FR-150, FR-059]
- [x] CHK-TP010 Are prompt-injection defenses (untrusted-segment labeling, "treat as data" preamble, excerpt cap, no tools
  for the model, schema-validated output referencing only existing evidence ids) backed by fixtures for every untrusted
  surface the research names?
  **RESOLVED (pass 3)**: Injection defenses are required (FR-129) and fixtures 90 and 91 add package-description and error-message surfaces to the README/comment/test-name/log fixtures.
- [x] CHK-TP011 Is it required that the GitHub token is used only inside the trusted worker against allowlisted hosts and
  never written to evidence, logs, the snapshot, a presigned URL or the Execution Plane (so private-repository execution adds
  no new credential exposure)?
  [Clarity, Spec §FR-039, §FR-045, source-acquisition-contract Safety 2/boundary rule 5]

## Presigned URLs and Per-Run Credentials

- [x] CHK-TP012 Are presigned URL rules specified as one consistent, enforceable set?
  **RESOLVED**: one rule set (FR-045/FR-146, source-snapshot-contract invariant 8, untrusted-execution-contract line
  66, data-model "Presigned URL rules", plan): single-object, read-only GET, one-time, 10-minute TTL (never longer
  than run TTL), bound to the run, received only by the Execution Plane, never logged or in Evidence; expiry is stated
  as the bound (object stores offer no revocation primitive); fixture I20/60 `url-reuse`.
- [x] CHK-TP013 Is "per-run scoped credentials" (FR-046) defined concretely?
  **RESOLVED**: FR-146 and untrusted-execution-contract (line 66-69): the supervisor-to-EP credential is a run-scoped
  bearer issued per `runId`, valid only for `heartbeat`, `streamEvents`, `getRun` and `destroy` of that run and dead
  once `DESTROYED`; the Guest receives neither it nor the presigned URL; fixture 60.

## Cross-Tenant Isolation

- [x] CHK-TP014 Is cross-tenant isolation of filesystem, process, network and log visibility specified (one Guest per run
  never reused, no host mounts, per-tenant concurrency, scoped teardown wipe) with `cross-tenant-read` and `residue-writer`
  as negative fixtures?
  [Completeness, Spec §FR-046, isolation-policy-contract matrix "Tenant boundaries", quickstart fixture 25]
- [x] CHK-TP015 Are cross-tenant caches and shared lookup structures excluded or bounded?
  **RESOLVED**: dependency-installation-contract 4f/boundary rule 6, plan P1/Principle XIII, research R9 and data-
  model forbid any cross-run/cross-tenant cache; automated-test-contract line 128 and data-model make every claimKey
  (including `source-check-execution`) begin with `scanPlanId`. [Consistency, Spec FR-042, FR-046, FR-135]
- [x] CHK-TP016 Do all idempotency `claimKey` shapes embed a tenant-owned identity and agree across documents?
  **RESOLVED**: data-model IdempotentClaim table is the single authority; every claimKey (`source-check-execution`,
  `source-acquire`, `ep-run-start`, `evidence-write`) begins with `scanPlanId`, stated in plan, data-model, source-
  acquisition, automated-test, static-analysis, source-reverify and untrusted-execution contracts. [Consistency, Spec
  FR-135]
- [x] CHK-TP017 Does the ownership-versus-authorization separation survive in the privacy requirements (acquisition needs
  Target ownership only, execution a separate `TargetAuthorization` and F07 admission with its own audit trail, public
  readability grants nothing)?
  [Consistency, Spec §FR-003, §FR-122, source-acquisition-contract Safety 1/4]

## Fixture Data, Cleanup and Retention of Tenant Data

- [x] CHK-TP018 Is fixture data lifecycle bounded to synthetic, seeded, bounded data with production data never copied, no
  row contents persisted beyond bounded synthetic samples, teardown by Guest destruction, and customer connection strings
  never used or echoed (path and variable name only)?
  [Completeness, Spec §FR-083, §FR-100, §FR-109, execution-fixture-contract Invariants 5-8]
- [x] CHK-TP019 Is it required that no customer data persists on the Execution Plane after teardown (scratch wiped, proxy
  allowlist entries removed, run record bounded by TTL, presigned URL expired) and that cleanup applies on every exit path
  including supervisor crash (dead-man, reconciler)?
  [Completeness, Spec §FR-046, §FR-057, §FR-130, plan Principle XIV table "Retention"]
- [x] CHK-TP020 Is the disclosure that customer source leaves the application plane for a separate Execution Plane
  covered by a requirement?
  **RESOLVED**: FR-147 requires the `SOURCE_SENT_TO_EXECUTION_PLANE` audit event before any SOURCE_EXECUTION and
  customer-facing documentation/consent copy that the snapshot is copied to the Execution Plane; the in-product
  consent surface is recorded as a dependency on the U30 UX spec (spec Clarifications, research R29/line 1115).
  [Completeness, Spec FR-130, FR-133, FR-147]

## Audit and Observability Hygiene

- [x] CHK-TP021 Is the audit trail specified without secrets (only the F07-owned event types via
  `recordExecutionAuditEvent`; `outcome` short bounded strings; payload redacted; `SAFETY_VIOLATION`, `EXECUTION_COMPLETED`
  and `ESCALATED` written by 011 only through that function)?
  [Clarity, Spec §FR-056, §FR-123, plan F07 Integration "Audit events used"]
  **RESOLVED (pass 3)**: The audit trail is secrets-free: F07 events through `recordExecutionAuditEvent` (members of the closed enum) plus the disclosure event as an `AuditLogEntry` action `source.sent_to_execution_plane` (tenant, target, digest, run id, no content); no new F07 type.
- [x] CHK-TP022 Is observability required to be emitted without secrets or payloads (allow-listed fields; escape-detection
  signals as operator telemetry) for both the SOURCE_STATIC and SOURCE_EXECUTION classes?
  [Completeness, Spec §FR-059, plan Principle XIV table "Observability", quickstart A1.8]

## Access Control for Reads and Operators

- [x] CHK-TP023 Is operator access to tenant source, snapshots, logs and evidence specified (who may read, audit, no
  casual browsing)?
  **RESOLVED**: FR-144 (and plan F07 table, data-model tenant table, untrusted-execution-contract): operators may stop
  runs and read run metadata/diagnostics without payloads; operators MUST NOT read tenant snapshots, logs or evidence
  payloads in v1; no break-glass defined (needs its own spec and audit); fixture 59.
- [x] CHK-TP024 Is every NEW read path required to re-derive tenant ownership (no bare-id lookup), as SPEC 010 FR-048 did?
  **RESOLVED**: FR-145 (every new read path, snapshot download for presign, evidence, artifact, coverage summary,
  correlation lookups, filters `(id, userId)` with indistinguishable NotFound), source-reverify-contract lines 30-31
  (Issue by `reverifyIssueId`), source-snapshot-contract line 56 and the run-scoped EP credential (FR-146) for
  `getRun`/`destroy`; fixture 56. [Completeness, Spec FR-145, FR-146]
- [x] CHK-TP025 Are prior-scan lookups (toolchain drift against "the most recent prior scan of the same repository
  workspace") confined to the same tenant?
  **RESOLVED**: FR-149 and coverage-contract invariant 7: the prior-scan lookup is filtered by the same `userId` and
  target, never crosses tenants even for the same public repository, with no same-tenant prior scan `driftDetected` is
  false and nothing of another tenant is exposed; fixture 58.
- [x] CHK-TP026 Are source-intake abuse vectors for a tenant's own upload covered so they cannot reach another tenant's data
  (archive guard before any byte is written; per-scan temp path derived from `(scanPlanId, unitId)`; deletion on every exit
  path; nested archives not recursed; submodules and LFS never fetched)?
  [Completeness, Spec §FR-006..008, source-acquisition-contract Invariants 4-6]

## Notes

- Items marked `[ ]` are repair targets for the planning package before the closure/freeze pass; they are not
  implementation tasks.
- Isolation of the hostile-code boundary itself is covered in `hostile-code-isolation.md`; this checklist covers tenant
  and privacy properties of persisted and transmitted data.
