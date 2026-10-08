# Checklist: Tenant, Privacy, and Evidence Security

## Tenant Isolation

- [x] CHK-TPS001 Every new construct this spec defines (`VisualBaseline`, `CRAWL_DISCOVERY`/
  `CHECK_RESULT`/`CONSOLE_MESSAGE`/`STRUCTURED_DATA` Evidence, a `BrowserContext`'s own lifetime) is
  confirmed tenant-scoped at creation and at every read, re-derived through its owning `Scan`/
  `ExecutionUnit`'s `userId` (FR-048).
- [x] CHK-TPS002 `VisualBaseline`'s own uniqueness constraint is confirmed scoped by `userId` first
  — two different tenants' identical-looking pages can never collide into the same active baseline
  row.
- [x] CHK-TPS003 No new lookup this spec defines (across all ten contracts) is a bare id lookup
  with no tenant-ownership re-derivation — independently re-checked across every contract file.

## Redaction

- [x] CHK-TPS004 `CONSOLE_MESSAGE`/`HAR`/form-input-bearing `DOM_NODE` Evidence is confirmed to be
  passed through `@webaudit/redaction` before persistence, independent of 009's own narrower
  `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`SOURCE_EXECUTION` class-list gate not covering
  `BROWSER`/`CRAWLER` (FR-045, `research.md` R9).
- [x] CHK-TPS005 The screenshot-redaction limitation is stated honestly in `spec.md` FR-046 — this
  package does not claim pixel-level redaction capability it does not have.
- [x] CHK-TPS006 `@webaudit/redaction`'s own actual scope (text segments only, confirmed by direct
  code read of `packages/redaction/src/index.ts`) was verified before this spec made any claim
  about what it covers — not assumed from its name.

## Credential / Secret Boundary

- [x] CHK-TPS007 No workflow-step configuration, Evidence payload, or queue-job payload anywhere in
  this package's contracts carries a raw credential, session token, cookie, or API key — every
  reference is an opaque `credentialBindingRef` (FR-047).
- [x] CHK-TPS008 Browser-context cookies are confirmed non-persisted across contexts (FR-013) —
  closing the specific vector of one tenant's session leaking into a later execution.

## Evidence/Finding Provenance Integrity

- [x] CHK-TPS009 `CHECK_RESULT` Evidence is confirmed to be the only write path recording a check's
  coverage verdict — no check's own code writes this directly (`web-check-registry-contract.md`
  rule 1).
- [x] CHK-TPS010 Every Finding this spec's domains produce is confirmed to link back to its
  supporting `CHECK_RESULT`/Evidence via `IssueEvidenceLink` — provenance is never implicit or
  reconstructed after the fact.
- [x] CHK-TPS011 `Artifact` object keys for this spec's own screenshots/traces/videos are confirmed
  to use 009's own existing, tenant-scoped, validated key scheme — no second, independently-
  validated key format was introduced.

## Artifact / Storage Boundary

- [x] CHK-TPS012 This spec's screenshot storage is confirmed to route entirely through 009's own
  `createArtifact`/`Artifact` — `apps/api/src/services/storage/reports.ts`'s own pre-existing,
  unconsumed module is not reused as a second, parallel storage path (FR-014, `plan.md`'s own
  Reuse/Extend/New Matrix entry for this module).
- [x] CHK-TPS013 A pending (unapproved) `VisualBaseline` candidate is confirmed to receive no
  extended retention — it is swept on the same schedule as any other `Artifact` (`research.md` R6).

## Cross-Tenant Attack Surface

- [x] CHK-TPS014 The "one tenant receives another tenant's cookies" adversarial scenario is
  confirmed structurally closed (fresh context, zero persistence), not merely policy-closed
  (`research.md` adversarial #6).
- [x] CHK-TPS015 Cross-tenant execution-id guessing against this spec's own new constructs is
  confirmed covered by the identical tenant-scoped-lookup discipline FR-048 requires everywhere —
  no new construct is exempt.
- [x] CHK-TPS016 (closure-pass addition) `VisualBaseline`'s pointer-row uniqueness is keyed by
  `(userId, pageIdentity, browserMatrixEntryHash)` with `userId` first — a cross-tenant lookup for
  an identical-looking page/matrix simply addresses a structurally distinct row; two tenants can
  never collide into or read each other's active baseline (`research.md` adversarial C26).
- [x] CHK-TPS017 (closure-pass addition) `IdempotentClaim`'s own `claimKey` is always constructed
  by its caller to include the owning `scanPlanId`/`executionUnitId` — re-verified that no claim
  scope (`check-execution`, `crawl-discovery`, `workflow-step-mutation`) can be satisfied by a key
  collision across two different tenants' scans, since each caller's own key-construction rule
  includes its tenant-scoped identity as a prefix.
- [x] CHK-TPS018 (closure-pass addition) The screenshot-redaction limitation (FR-046) is confirmed
  to state its actual operational consequence explicitly — screenshots rely solely on the same
  tenant-scoped `Artifact` access control every other artifact has, never an implied redaction
  guarantee that does not exist.
