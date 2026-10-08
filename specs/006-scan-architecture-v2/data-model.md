# Phase 1 Data Model: Fahes Scan Platform Architecture v2

Conceptual entity model only — **no Prisma schema is modified by this plan**. Every future child
spec that actually adds a table runs its own `/speckit-plan` with a real, reviewed migration, per
Constitution Principle XIV and this plan's Constitution Check. Each entity below states which
existing entity it extends (if any), proposed key fields (illustrative, not a final schema), and
its relationships. Entities are grouped by the Bounded Context (`plan.md`) that owns them.

## Target Management (existing context, minimally extended)

### Target — EXTENSION OF EXISTING (`Target` model, unchanged fields)

No new fields. Continues to carry `inputType`, `canonicalValue`, `controlLevel`, `userId`. The
entities below attach to it without modifying it, preserving FR-024's additive-only guarantee.

## Authorization & Scope (new context)

### TargetEnvironment — NEW

- `id`, `targetId` (FK -> Target), `classification` (`PRODUCTION | STAGING | DEVELOPMENT`),
  `classifiedAt`, `classifiedBy` (userId).
- Relationship: one Target MAY have zero or one current `TargetEnvironment` (a Target with none is
  treated as unclassified, which per Constitution Principle X MUST refuse any execution class that
  requires an Environment restriction check — unclassified is not a safe default for active
  classes).
- Validation: `classification` MUST NOT, by itself, change what `TargetAuthorization` (below)
  permits — enforced by never reading `TargetEnvironment` from any authorization-check code path
  except as an explicit, separate gate (FR-004/Constitution X).

### TargetAuthorization — NEW

- `id`, `targetId` (FK -> Target), `grantedBy` (userId), `executionClasses` (array over the FR-008
  enum), `scopeId` (FK -> ScopeDefinition), `environmentRestriction` (which `TargetEnvironment`
  classifications this grant is valid for), `requestBudget`, `concurrencyBudget`, `durationBudget`,
  `grantedAt`, `revokedAt`.
- Relationship: one Target MAY have multiple `TargetAuthorization` grants (one per execution-class
  set/scope combination); a grant is independent of `TargetVerification` (Ownership Verification) —
  neither entity references the other, by design, per Constitution Principle X.
- State transitions: `GRANTED -> ACTIVE -> REVOKED | EXPIRED`. A revoked/expired grant MUST cause
  every budget/scope check to fail closed (refuse), never fail open.

### ScopeDefinition — NEW

- `id`, `includedPatterns` (domains/subdomains/routes/APIs/repos/branches/accounts/roles/actions),
  `excludedPatterns` (same shape, takes precedence over included on overlap).
- Relationship: referenced by `TargetAuthorization`; immutable once referenced by an active grant
  (a Scope change requires a new grant, not an in-place edit, so an audit trail entry always
  reflects the Scope that was actually active at execution time).

## Scan Planning (new context)

### ScanProfile — NEW

- `id`, `name` (e.g. "quick", "production-readiness", "security-passive" — placeholders per
  FR-006), `defaultDomains` (array over `ModuleType`, extended), `defaultExecutionClasses`,
  `advancedConfigSchema` (what additional configuration this profile accepts).
- Relationship: referenced when resolving a `ScanPlan`; a profile is a template, not a live scan —
  editing a profile never retroactively changes an already-resolved `ScanPlan`.

### ScanPlan (Execution Plan) — NEW, conceptually extends `Scan.capabilitySnapshot`

- `id`, `scanId` (FK -> `Scan`, existing), `targetAuthorizationIds` (the specific grants this plan
  relied on, snapshotted), `resolvedExecutionUnits` (array of engine/capability selections,
  analogous to and replacing the role `capabilitySnapshot` plays today), `resolvedAt`.
- Relationship: one `Scan` has exactly one `ScanPlan`, resolved once and held immutable for the
  scan's duration — this is the direct architectural descendant of today's R10 guarantee
  ("Resolved once at scan start and held for the scan's duration"), generalized to cover engine and
  authorization resolution, not only capability selection.
- Validation: a `ScanPlan` containing any execution class beyond `PASSIVE_HTTP`/`SOURCE_STATIC`
  MUST reference at least one valid, active `TargetAuthorization` covering that class — enforced at
  resolution time, never at execution time (fail before queueing, matching today's "refuse before
  charging" precedent from archive intake).

## Execution Runtime (existing context, extended)

### Execution / ExecutionStep — EXTENSION OF EXISTING (`CapabilityExecution`)

- Existing fields (`scanId`, `capabilityId`, `module`, `succeeded`, `findingCount`, `durationMs`,
  `costMicros`) retained unchanged. New optional fields: `executionClass` (FR-008 enum, defaults to
  `PASSIVE_HTTP`/`SOURCE_STATIC` for every existing capability so no backfill is required),
  `progressSteps` (array, populated only by classes that declare step-level progress per FR-021),
  `cancelledBy` (`USER | EMERGENCY_STOP | KILL_SWITCH | null`, extends today's implicit
  "cancellation = API state transition" with the three-way distinction FR-022 requires).
- Relationship: unchanged — still belongs to one `Scan`, still references one `Capability` (or, for
  a new engine not expressed as a vendored capability, a new `executionClass`-typed reference, left
  to that engine's own child spec to design precisely).

## Evidence & Artifacts (new context)

### Evidence — NEW at the generalized/typed level (extends the intent of `Issue.evidence: Json?`)

- `id`, `issueId` (FK -> `Issue`, existing), `kind` (`HTTP_TRANSACTION | SOURCE_LOCATION |
  SCREENSHOT | SCREENSHOT_DIFF | DOM_NODE | ACCESSIBILITY_NODE | BROWSER_TRACE | HAR | VIDEO |
  LOAD_METRICS | SECURITY_REPRODUCTION | CODE_FLOW | DEPENDENCY | TELEMETRY`), `inlinePayload`
  (small evidence, JSON — today's existing pattern, preserved), `artifactId` (FK -> `Artifact`,
  nullable, used when the evidence is too large to inline).
- Relationship: an `Issue` MAY have multiple typed `Evidence` rows instead of (or alongside) the
  existing single `evidence: Json?` field — the existing field is NOT removed (FR-024 additive
  guarantee); new engines populate the typed `Evidence` rows, existing capabilities are unaffected.
- Validation: `kind` determines whether `inlinePayload` or `artifactId` is required — enforced by
  the Evidence/Findings/Artifacts foundation child spec's own contract, not finalized here.
- **Security requirement (FR-027, found during independent review)**: for evidence produced by
  `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, or `SOURCE_EXECUTION`, both `inlinePayload` and any
  content later retrieved via `artifactId` MUST pass through the existing `@webaudit/redaction`
  mechanism before being persisted — a successful exploit's evidence can itself contain real
  customer secrets/PII, which is a data-exposure incident if it reaches a report unredacted.

### Artifact — NEW

- `id`, `scanId` (FK -> `Scan`), `storageKey` (R2, tenant-scoped per Constitution Principle XIII,
  analogous to today's `uploads/<userId>/<sha256>.zip` pattern), `contentType`, `sizeBytes`,
  `createdAt`, `retentionPolicyRef` (per the 2026-10-07 Clarifications, defaults to the same policy
  as report retention — no separate shorter default). **Per FR-028 (found during independent
  review)**: `sizeBytes` MUST be checked against both a per-object and a per-scan total-artifact
  budget at write time, enforced by Execution Runtime (F04), not left to retention alone to bound
  storage growth.
- Relationship: referenced by `Evidence.artifactId`; cleanup MUST be proven by an actual call site
  (per Constitution Principle XIII and the explicit callout in FR-015 not to repeat the existing
  staged-ZIP-upload retention gap the audit found).

## Credentials / Sessions (new context)

### CredentialBinding — NEW

- `id`, `targetAuthorizationId` (FK -> `TargetAuthorization`), `credentialRef` (encrypted at rest,
  scoped, per the constitution amendment's new Security requirements), `issuedAt`, `expiresAt`,
  `revokedAt`.
- Relationship: scoped to exactly one `TargetAuthorization` grant; distinct from the existing
  GitHub OAuth token vault (`apps/api/src/services/auth/token-vault.ts`), which is a
  platform-integration credential (connecting Fahes to GitHub on the user's behalf), not a
  target-testing credential (letting an engine authenticate *to the target being scanned*).

### SessionBinding — NEW

- `id`, `executionId` (FK -> Execution), `credentialBindingId` (FK -> `CredentialBinding`),
  `sessionState` (opaque, e.g. cookies/tokens needed mid-workflow), `createdAt`, `destroyedAt`.
- Validation: MUST NOT be reused across scans or tenants under any circumstance (constitution
  amendment's new Security requirement) — enforced by scoping `sessionState` lifetime to exactly
  one `executionId`, never shared or cached across executions.

## Safety (new context)

### SafetyEvent / ExecutionAuditEvent — NEW

- `id`, `targetAuthorizationId` (FK), `executionId` (FK, nullable — some events, like a refused
  grant, precede any execution), `action` (what was attempted against the target), `timestamp`,
  `actorId` (userId or `SYSTEM`), `outcome`.
- Relationship: distinct from the existing `AuditLogEntry` (which the schema's own comment defines
  as covering *operator* actions in the admin console — deliberately no FK to `User` so the log
  outlives account deletion). `ExecutionAuditEvent` instead records actions a *scan execution* took
  against a *third-party target*, required by Constitution Principle X for every active execution
  class, and MAY reference `User` directly (it is not the same deletion-survivability case the
  existing `AuditLogEntry` design note addresses, because its subject is the target, not the
  operator).

### ResourceUsage — EXTENSION OF EXISTING (`CapabilityExecution.costMicros`, `AiInvocation`'s
token/latency/cost fields)

- New optional fields on `Execution` (not a new table): `browserMinutes`, `generatedLoadUnits`,
  `storageBytesWritten` — populated only by `LOAD_CAPACITY`/`SOURCE_EXECUTION`/`BROWSER` classes,
  consumed by the narrow-scope metered-pricing function (FR-020), left `null`/`0` for every
  existing flat-priced class.

## Entities explicitly marked NOT YET JUSTIFIED

No entity proposed in the triggering instruction's own entity-name list lacks a home above once
mapped to a Bounded Context — `TargetEnvironment`, `TargetAuthorization`, `ScopeDefinition`,
`ScanProfile`, `ScanPlan`, `Execution`/`ExecutionStep`, `CredentialBinding`, `SessionBinding`,
`Evidence`, `Artifact`, `ResourceUsage`, `SafetyEvent`/`ExecutionAuditEvent` are all accounted for
above, each as NEW or an explicit EXTENSION. No entity is introduced in this document beyond that
list.
