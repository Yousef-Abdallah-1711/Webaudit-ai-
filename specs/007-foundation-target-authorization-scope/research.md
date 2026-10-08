# Phase 0 Research: Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope

No `NEEDS CLARIFICATION` markers remained in `spec.md` after the Clarify phase (3 questions
asked/answered 2026-10-07; see `spec.md`'s Clarifications section). This document records the
research that grounds this plan's design decisions, not open unknowns.

## R1: What is the real current-state baseline this spec must not regress?

- **Decision**: treat this session's own direct repository audit (not a separate prior-session
  audit document, unlike the parent spec's reliance on `docs/reviews/scan-audit-2026-10-07/`) as
  the settled current-state evidentiary baseline for this spec. Specifically: `Target`/
  `TargetVerification`/`ControlLevel`/`InputType` (`apps/api/prisma/schema.prisma:48-64,424-464`),
  the control-gate service (`apps/api/src/services/control-gate/{attest,verify,reconfirm,
  rate-bound}.ts`), target/scan creation (`apps/api/src/routes/targets.routes.ts`,
  `apps/api/src/services/intake/{create-scan,upload,repos}.ts`), and the confirmed absence of any
  `organizationId`/`workspaceId`/`tenantId` field anywhere in the schema.
- **Rationale**: this session performed the equivalent audit work itself (direct schema/code reads
  plus a dedicated read-only exploration pass) rather than inheriting one; re-deriving it a third
  time inside `data-model.md` would duplicate already-cited evidence for no new confidence.
- **Alternatives considered**: re-verify every claim a second time inside this plan (rejected — no
  new evidence would result); rely only on the parent spec's own current-state section (rejected —
  the parent's audit was scoped to the questions *it* needed answered, e.g. it never needed to know
  `assertLoadGenerationAllowed`'s actual production call-site status, which materially matters here
  and did not matter there).

## R2: Does `assertLoadGenerationAllowed`'s existing "Level 2 check" gate conflict with Constitution Principle X?

- **Decision**: no conflict. Direct inspection of `apps/api/src/services/control-gate/reconfirm.ts`
  and a repo-wide grep for its call sites found it (and `assertAttested`) referenced only from
  `reconfirm.ts`'s own definition and from two test files
  (`apps/worker/tests/unit/control-gate-import.test.ts`,
  `apps/api/tests/adverse/control-gate.test.ts`) — **no production call site exists**. The actual
  production gating mechanism is a different, more general one: `create-scan.ts` (lines 255-277)
  calls `reconfirmControl` directly and compares `controlLevelRank` per-module, using
  `resolveRequiredControlLevel` (`apps/api/src/services/registry/resolve-required-control-level.ts`)
  to find the minimum `ControlLevel` any enabled `Capability` row in a requested module declares.
  "Level 2" in this existing code's own comments means "a capability whose `requiredControlLevel` is
  `VERIFIED`" — a per-*capability* ownership-strength requirement, not a request-volume/load-testing
  concept despite the function's name. Every one of today's 16 vendored capabilities is still
  passive/read-only (confirmed by the parent spec's own audit); none is actually a load generator.
  There is therefore no existing mechanism today that lets Ownership Verification alone unlock
  anything resembling the future `LOAD_CAPACITY`/`ACTIVE_SECURITY` execution classes — the entire
  current gating surface is, and remains, an Ownership-only concept, consistent with Constitution
  Principle X's premise that the platform "never previously needed this distinction... because it
  never offered active testing at all."
- **Rationale**: this finding resolves a genuine risk this spec had to check (per the triggering
  brief's own instruction to surface, not silently resolve, any tension between repository evidence
  and the master architecture's assumptions) — had `assertLoadGenerationAllowed` been wired to a
  real capability, this spec would need to explicitly decide whether that capability is grandfathered
  under FR-024's zero-regression guarantee or must be re-gated under the new `TargetAuthorization`
  model. Since it has no production caller, there is nothing to grandfather or re-gate.
- **Alternatives considered**: treating the function's existence alone as evidence of a conflict
  requiring a master-architecture amendment (rejected — a defined-but-uncalled function proves
  nothing about runtime behavior; the amendment path is reserved for genuine evidence/assumption
  contradictions, and this one dissolved on inspection).

## R3: Is there an existing audit-trail mechanism this spec can reuse for grant lifecycle events (FR-018), or does it need a new one?

- **Decision**: reuse the existing `AuditLogEntry` model (`apps/api/prisma/schema.prisma:853-865`)
  as-is. Its shape (`actorId` — deliberately unconstrained, no FK, so the log outlives account
  deletion; `action: String`; `subjectType: String`; `subjectId: String?`; `before`/`after: Json?`)
  already fits a grant-lifecycle event exactly, and `control-gate/reconfirm.ts`'s own `settle()`
  function already writes to it today for `control.demoted` events — a direct precedent for writing
  `authorization.granted`/`authorization.revoked`/`authorization.narrowed` events the same way.
- **Rationale**: Constitution Principle VIII ("a new capability category MUST reuse an existing
  shared contract... before inventing a parallel one") applies here exactly as it does to the parent
  spec's own engine-level contracts; there is no field this spec's grant-lifecycle audit needs that
  `AuditLogEntry` lacks.
- **Alternatives considered**: a new `AuthorizationAuditEvent` table scoped specifically to grants
  (rejected — no distinguishing requirement from `AuditLogEntry` was found; this would duplicate the
  existing mechanism for no new invariant, the same reasoning the parent spec's `decisions.md`
  ADR-004 applied to keeping `TargetAuthorization` and `TargetVerification` separate for a reason
  that actually differs, not as a style preference); waiting for F07's future `ExecutionAuditEvent`
  and using it for grant events too (rejected — `ExecutionAuditEvent` is explicitly scoped by F07 to
  record what an *execution* did against a *target*, a distinct subject from what a *grant's own
  lifecycle* did; conflating them would make F07's future design inherit a responsibility it does
  not own, per the parent's own Bounded Contexts table separating Safety from Authorization & Scope).

## R4: Can the existing `controlLevelRank`-style comparison pattern inform how `TargetAuthorization`'s derived `ACTIVE` state and budget exhaustion should be computed?

- **Decision**: yes, reuse the *pattern* (a small, pure, totally-ordered comparison function the
  caller applies against live-read data, never against a value trusted from a cache column) without
  reusing the `ControlLevel` enum itself. `reconfirmControl`
  (`apps/api/src/services/control-gate/reconfirm.ts:89-163`) is the concrete precedent this spec's
  FR-012 (derived `ACTIVE` state) and FR-014 (live re-check at dispatch time) follow: "never read
  `controlLevel` as evidence... reads it only to know what to write back." `TargetAuthorization`'s
  future live-check implementation (F04's responsibility, per FR-014) should follow the identical
  shape: read `grantedAt`/`revokedAt`/`expiresAt`/budget-consumption fresh, derive the verdict, write
  back only a cache/observability value, never trust a previously-derived verdict as the answer.
- **Rationale**: this is exactly the kind of existing-pattern reuse Constitution Principle VIII
  asks for, and it is also the concrete resolution mechanism for this spec's own FR-014 (the
  immutable-plan-vs-revocation tension) — a pattern already proven correct in production for a
  structurally identical problem (a cached ownership-strength column vs. a live-verifiable truth).
- **Alternatives considered**: storing `ACTIVE` as a persisted, explicitly-transitioned state column
  (rejected — this is exactly the "cache mistaken for the answer" bug `reconfirm.ts`'s own code
  comments warn against, and would let a revoked grant remain read as `ACTIVE` by any code path that
  forgets to also check `revokedAt` directly).

## R5: Are Postgres/Prisma native enough to express `executionClasses` as an array-valued enum field on `TargetAuthorization` (FR-006), or does this need a join table?

- **Decision**: a native Prisma scalar list of an enum (`ExecutionClass[]`) is sufficient — Postgres
  supports native array columns and Prisma supports scalar lists on Postgres specifically (unlike
  MySQL/SQLite, which would need a join table). The existing schema already targets PostgreSQL
  exclusively (per `PROJECT_MAP.md`/the constitution's Technology Constraints), so no portability
  concern applies.
- **Rationale**: avoids an unnecessary join table for what is, in practice, a short, bounded list
  (at most the number of execution classes the parent architecture ever defines) — a join table
  would be justified only if per-class metadata (e.g. a per-class sub-budget) were needed, which
  FR-006/FR-011 deliberately do not require (budgets are per-grant, not per-class-within-a-grant).
- **Alternatives considered**: a `TargetAuthorizationExecutionClass` join table (rejected — no
  per-class attribute exists today that a scalar array cannot express; would be premature
  normalization against Constitution's general "don't add complexity without justification" bar,
  which this constitution's Development Workflow section states explicitly: "Unjustified complexity
  is grounds for rejection on its own").

## R6 (closure pass): Can `TargetEnvironment`/`TargetAuthorization` actually be added to the schema while `Target` itself carries zero new fields, as this spec originally claimed?

- **Decision**: no — proven, not assumed, during this spec's closure pass. Prisma 6.1.0 requires a
  relation to be declared on both sides of a one-to-many pair; running `prisma validate` against
  an isolated, untracked copy of the real schema with this spec's `TargetEnvironment`/
  `TargetAuthorization` models appended exactly as drafted produced two P1012 errors, both reading
  "is missing an opposite relation field on the model `Target`." Adding exactly two structural
  back-relation fields to `Target` (`targetEnvironment TargetEnvironment?`,
  `targetAuthorizations TargetAuthorization[]`) — and nothing else — made the schema validate
  successfully on re-run.
- **Rationale**: the brief for this closure pass explicitly required verifying this empirically
  rather than asserting either "valid" or "invalid" from reasoning alone; `Target` already carries
  two structurally identical back-relation fields (`verifications`, `scans`) for its two existing
  one-to-many relations, so this is not a new category of field on `Target`, only two more
  instances of a pattern already present. Both new fields are relation-only: no column, no
  default, no business/authorization/environment/verification semantics, and no read path from any
  existing capability or code path.
- **Alternatives considered**: keeping the original "zero fields added to `Target`" claim and
  hoping a future implementer discovers the real constraint during `/speckit-implement` (rejected —
  exactly the "do not assume it is valid, do not assume it is invalid, verify it" failure this
  closure pass was commissioned to prevent); modeling the relation as implicit/unmanaged on the
  Prisma side to avoid touching `Target` (rejected — Prisma's relation mode in this project is the
  default explicit relational mode consistent with every other existing relation in
  `schema.prisma`; introducing a second relation-declaration style for only these two relations
  would be an inconsistency with no offsetting benefit, and Prisma's own suggested fix — "run
  `prisma format` or add it manually" — is exactly the explicit back-relation field this spec now
  documents).
- **Evidence (exact commands and results)**: see `data-model.md`'s "Prisma feasibility note" for
  the full error text and the passing re-run's output. Performed against a temporary copy at a
  path under this session's scratchpad directory, outside any tracked path; the real
  `apps/api/prisma/schema.prisma` was read but never written to, and the temporary copy was deleted
  immediately after the proof concluded. No migration was generated or applied.
