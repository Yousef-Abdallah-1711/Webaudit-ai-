# Phase 1 Data Model: Web / UI / Accessibility / Functional Web / SEO Testing Platform

**Closure-pass revision (2026-10-08)**: this document was corrected during this spec's own closure
pass. The original draft's `VisualBaseline` model had a genuine, proven-infeasible defect (a bare
`@@unique` across a triple whose rows are also meant to be retained historically — see "Closure
Finding CF-1" below); this revision fixes it with a pointer/history split. This pass also adds
three small, narrowly-scoped idempotency/concurrency primitives (`IdempotentClaim`,
`CrawlBudgetCounter`) the original draft described only in prose without a feasible mechanism. Four
new tables total (not one) — each justified individually below; none wider in footprint than
strictly required.

No migration is run by this planning pass.

**Zero `@relation` edges into any existing/frozen model**, identical discipline to 009's own R2.
Every reference into `Scan`/`User`/`Artifact`/`ExecutionUnit` (the latter two 009's own models) is a
plain scalar string column with an index.

## `ModuleType` extension (existing enum, `apps/api/prisma/schema.prisma:28-34`)

```prisma
enum ModuleType {
  PERFORMANCE
  SECURITY
  UI             // reused for Frontend/UX domain
  TESTING
  SEO            // reused for SEO domain
  ACCESSIBILITY  // NEW, additive (FR-003)
  FUNCTIONAL     // NEW, additive (FR-003)
}
```

Adding `ACCESSIBILITY`/`FUNCTIONAL` is a Postgres `ALTER TYPE ... ADD VALUE` — every existing row's
current value is untouched; no existing query filtering on a prior value changes behavior. This is
the one touch this spec makes to an existing, non-frozen-spec-owned enum (`spec.md`'s own
Clarifications, `research.md` R1). **This enum addition alone does not make either value
operational** — see `plan.md`'s own "ModuleType Activation Touchpoints" section (FR-003a) for the
full list of call sites that must independently be updated before `ACCESSIBILITY`/`FUNCTIONAL` can
appear in a real scan, scoring pass, or priced quote.

## `EvidenceKind` extension (009's own enum, already designed to be extensible per 009's FR-028)

```prisma
enum EvidenceKind {
  // ... 009's own fourteen existing values, unchanged (HTTP_TRANSACTION, SOURCE_LOCATION,
  // SCREENSHOT, SCREENSHOT_DIFF, DOM_NODE, ACCESSIBILITY_NODE, BROWSER_TRACE, HAR, VIDEO,
  // LOAD_METRICS, SECURITY_REPRODUCTION, CODE_FLOW, DEPENDENCY, TELEMETRY)
  CONSOLE_MESSAGE   // NEW: bounded-size browser console capture (FR-015)
  CRAWL_DISCOVERY   // NEW: one discovery attempt — followed, deduplicated, or refused (FR-019)
  STRUCTURED_DATA   // NEW: JSON-LD / schema.org capture for SEO (FR-015, FR-039)
  CHECK_RESULT      // NEW: one WebCheckDefinition's coverage verdict (FR-041, research.md R4).
                    // Structurally EXCLUDED from the Domain Check Registry's own trigger set
                    // (research.md R15) — this is what makes recursive self-triggering
                    // impossible by construction, not by developer discipline.
}
```

Four of this spec's six candidate Evidence-shaped concepts (`BROWSER_TRACE`, `HAR`, `SCREENSHOT`,
`DOM_NODE`, `ACCESSIBILITY_NODE`) are already present in 009's own enum — this spec reuses them
directly rather than inventing duplicates (confirmed by direct re-read of 009's `data-model.md`).

## `VisualBaseline` (new model — the live "current state" pointer, one row per tenant/page/matrix triple)

```prisma
model VisualBaseline {
  id                     String   @id @default(cuid())
  userId                 String   // denormalized tenant owner (FR-048); scalar, no relation
  pageIdentity           String   // normalized PageIdentity string (contracts/page-identity-contract.md)
  browserMatrixEntryHash String   // stable hash of the BrowserMatrixEntry this baseline is scoped to
  activeApprovalId       String   // scalar ref to the currently-active VisualBaselineApproval.id
  updatedAt              DateTime @updatedAt

  @@unique([userId, pageIdentity, browserMatrixEntryHash])
  @@index([activeApprovalId])
}
```

## `VisualBaselineApproval` (new model — append-only history; every approval ever made, retained)

```prisma
model VisualBaselineApproval {
  id                     String    @id @default(cuid())
  userId                 String    // scalar, no relation
  scanId                 String    // the scan that captured this approval's screenshot; scalar, no relation
  pageIdentity           String
  browserMatrixEntryHash String
  artifactId             String    // scalar reference into 009's own Artifact
  approvedAt             DateTime  @default(now())
  approvedBy             String    // userId of the approving human; scalar, no relation
  supersededAt           DateTime? // set when a later approval replaces this one as the active pointer
  retentionExtended      Boolean   @default(true) // FR-026a: approved baselines get extended retention

  @@index([userId, pageIdentity, browserMatrixEntryHash])
  @@index([scanId])
  @@index([artifactId])
}
```

### Closure Finding CF-1: the original `VisualBaseline` model was infeasible as drafted

The first draft of this document put every field (including `supersededAt`) on one model named
`VisualBaseline`, with `@@unique([userId, pageIdentity, browserMatrixEntryHash])` declared directly
on it, while the surrounding prose separately claimed uniqueness was "enforced at the active layer
by the service function... not by a bare `@@unique` across all rows ever created." **Those two
statements cannot both be true of the same schema**: a bare `@@unique` on that triple, with no
`supersededAt` in its own key, rejects a legitimate second approval (baseline B superseding baseline
A) at the database level the instant it is inserted — the prose's own "service-enforced" claim was
never actually achievable with the schema actually written. This was found during this spec's own
closure pass, not assumed fixed.

**Fix**: split into two models. `VisualBaseline` is the **pointer** — genuinely one row per
`(userId, pageIdentity, browserMatrixEntryHash)` triple, for which an ordinary, non-partial
`@@unique` is the *correct* invariant (there really is exactly one current pointer per triple, no
exception). `VisualBaselineApproval` is the **history** — deliberately many rows per triple over
time, with no uniqueness constraint on the triple at all, each one immutable once written except for
its own `supersededAt` field being set exactly once. This is ordinary, fully-supported Prisma/
PostgreSQL: both constraints are plain (non-partial, non-filtered) unique indexes, requiring no
Postgres extension and no Prisma feature beyond what 009/F01/F07 already use elsewhere in this
lineage.

**Why not a Postgres partial/filtered unique index** (`UNIQUE (...) WHERE supersededAt IS NULL`)
**instead**: technically closer to the original single-table intent, but Prisma's schema language
does not have first-class, version-independent support for partial/filtered unique indexes as of
this lineage's own stated Prisma/PostgreSQL baseline — relying on one would require a hand-written
raw-SQL migration step outside Prisma's own declarative schema, a feasibility risk this spec's own
"verify the strategy is actually feasible with Prisma/PostgreSQL" closure instruction explicitly
asks to avoid. The pointer/history split achieves the identical guarantee with zero dependency on
that feature.

## `approveBaseline`'s concurrency guarantee (closing CF-1's own second half: the race condition)

`approveBaseline` (`contracts/visual-baseline-contract.md`) performs, in one transaction: (1) an
atomic upsert of the `VisualBaseline` pointer row — `INSERT ... ON CONFLICT (userId, pageIdentity,
browserMatrixEntryHash) DO UPDATE SET activeApprovalId = <new>, updatedAt = now() RETURNING
activeApprovalId` and captures the **previous** `activeApprovalId` the `DO UPDATE` clause overwrote;
(2) inserts the new `VisualBaselineApproval` row; (3) if a previous `activeApprovalId` existed, sets
that row's own `supersededAt`. Postgres's own row-level lock on the pointer row, acquired by the
`INSERT ... ON CONFLICT` statement itself, is what makes this race-safe: two concurrent
`approveBaseline` calls for the same triple serialize on that single row's lock — whichever commits
second observes the first's already-written `activeApprovalId` as the row to supersede, and the
pointer ends each call pointing at exactly one row. **Two simultaneous `approveBaseline` calls
cannot leave two active rows** — this is a property of the single atomic upsert statement, not of
any check-then-write sequence in application code.

## `VisualBaselineApproval`'s retention (FR-026a, resolved during this closure pass)

**Product-policy decision confirmed by the user during this closure pass**: an **approved**
baseline's `Artifact` gets extended retention, independent of its originating scan's own report-
retention-parity sweep — so visual regression keeps working across scans over time, not only until
the first scan that captured a baseline ages out. Concretely: `VisualBaselineApproval.
retentionExtended` (default `true`) is read by a new, narrow extension to 009's own
`enforceArtifactRetention` (`contracts/visual-baseline-contract.md`'s own retention rule): an
`Artifact` row referenced by `artifactId` on any `VisualBaselineApproval` whose own `supersededAt`
is null (i.e., it is the currently-active baseline) is excluded from that scan's own retention
sweep, even after the scan's report itself ages out and is removed. Once an approval is
**superseded**, its own `retentionExtended` flag is cleared (set to `false`) and its `Artifact`
becomes eligible for ordinary report-retention-parity sweeping on the *next* sweep pass after a
fixed, bounded audit-retention grace period (named here as a mechanism, not a specific duration,
per this spec's own "mechanism, not number" posture) — so superseded baselines do not accumulate
forever, but are not deleted the instant they are superseded either, preserving a short audit trail
of "what did we compare against before."

## `IdempotentClaim` (new model — the one generic, reusable "claim a logical slot exactly once" primitive)

```prisma
model IdempotentClaim {
  id        String    @id @default(cuid())
  scope     String    // "check-execution" | "crawl-discovery" | "workflow-step-mutation"
  claimKey  String    // the caller's own pre-serialized composite identity for this logical slot
  resultRef String?   // scalar ref to whatever this claim's winning attempt produced, set after completion
  claimedAt DateTime  @default(now())

  @@unique([scope, claimKey])
  @@index([resultRef])
}
```

**Why one generic table instead of three bespoke ones**: `research.md` R15 (Domain Check Registry
idempotency), R16 (crawl-discovery dedup), and `functional-workflow-contract.md`'s own step-mutation
idempotency all need the *identical* shape of guarantee — "exactly one caller, among any number of
concurrent or retried callers racing for the same logical identity, gets to proceed; every other
caller recognizes the slot as already claimed and does not duplicate the work." Constitution
Principle VIII ("reuse an existing shared contract before inventing a parallel one") applies here to
this spec's *own* new territory: one claim primitive, reused three ways via the `scope` discriminator,
is strictly better than three structurally-identical tables that would need to be kept consistent
with each other forever. `claimKey` is always a caller-constructed, deterministic string (e.g.
`"${scanPlanId}:${checkId}:${checkVersion}:${scopeKey}:${browserMatrixEntryHash ?? ''}"` for
`check-execution`) — this table itself has no opinion on what the key means.

**Claim/retry semantics** (used identically by all three scopes): attempt `INSERT ... ON CONFLICT
(scope, claimKey) DO NOTHING RETURNING id`. A row returned → this caller won the claim, proceeds to
do the work, then `UPDATE ... SET resultRef = <...> WHERE id = <won id>`. No row returned → inspect
the existing row: `resultRef IS NOT NULL` → already completed, treat as an idempotent no-op
(closes retry/replay duplication structurally); `resultRef IS NULL` and `claimedAt` older than a
fixed staleness threshold → attempt `UPDATE ... SET claimedAt = now() WHERE id = <existing id> AND
resultRef IS NULL AND claimedAt < <threshold> RETURNING id` to re-claim an abandoned attempt (a
worker that crashed after claiming but before completing); `resultRef IS NULL` and `claimedAt`
recent → another caller is actively working on it right now, this caller is a no-op. Every one of
these is a single atomic SQL statement — there is no window in which a caller reads "not claimed"
and then separately writes "claimed," which is exactly the check-then-create race this closure pass
was asked to eliminate.

## `CrawlBudgetCounter` (new model — the one atomic, bounded counter the Crawler Engine's `maxPages` ceiling needs)

```prisma
model CrawlBudgetCounter {
  id                       String   @id @default(cuid())
  crawlRootExecutionUnitId String   @unique // the originating CRAWLER unit whose discoveryBudget this tracks
  pagesCreated             Int      @default(0)
  updatedAt                DateTime @updatedAt

  @@index([crawlRootExecutionUnitId])
}
```

**Why this is a distinct primitive from `IdempotentClaim`**: a budget ceiling is a *bounded counter*
("reserve the next slot only if fewer than N have been reserved so far"), not a *claim-once* ("has
this exact identity been handled yet"). The two are genuinely different guarantees and conflating
them into one table would obscure which one a given row is providing. Reservation is one atomic
statement: `UPDATE "CrawlBudgetCounter" SET "pagesCreated" = "pagesCreated" + 1 WHERE
"crawlRootExecutionUnitId" = $1 AND "pagesCreated" < $2 RETURNING "pagesCreated"` (a raw query —
Prisma's generated client does not express a conditional increment-with-ceiling directly, so this
is one of the few places this spec names a raw-SQL call site explicitly, consistent with this
lineage's own precedent of naming exactly where a raw query is required rather than pretending the
ORM alone suffices). A row returned → the reservation succeeded, this specific discovery may become
a child `ExecutionUnit`. Zero rows affected → budget is exhausted; record `CRAWL_DISCOVERY` Evidence
with `scopeVerdict: "BUDGET_EXHAUSTED"` (FR-020) and create no child unit. Postgres's own row-level
locking on the single counter row serializes any number of concurrent reservation attempts — the
ceiling can never be exceeded regardless of how many discovery workers race for the last remaining
slot (`research.md` R16). `maxDepth`, by contrast, needs no shared counter at all: depth is a
property of one single discovery path, computed locally by each discovery attempt from how many
hops it took from the seed — there is no concurrently-shared mutable state to race over.

## Code-level (non-persisted) registry shapes

These are declared in source control, directly analogous to today's existing `AuditCapability`
shape (`packages/capability-sdk/src/contract.ts`) — never database rows, per master brief §52's own
"do not blindly create all of them" instruction and this spec's own minimal-footprint posture.

### `BrowserMatrixEntry` (value object, carried in `ExecutionUnit.configuration`)

```text
BrowserMatrixEntry = {
  browserFamily: "chromium" | "firefox" | "webkit",
  viewport: { width: number, height: number },
  locale: string,          // BCP 47, e.g. "en-US", "ar-EG"
  direction: "ltr" | "rtl",
  theme: "light" | "dark",
  reducedMotion: boolean,
}
```

A stable hash of this object (field order fixed, JSON-canonicalized) is what `VisualBaseline.
browserMatrixEntryHash` and FR-042's fingerprint-parts contribution both use — computed once, by
one shared function, never independently re-derived by two different call sites.

### `WebCheckDefinition` (code-level registry entry — one per deterministic check)

```text
WebCheckDefinition = {
  id: string,                           // stable, namespaced (e.g. "a11y.contrast-ratio")
  version: number,
  domain: ModuleType,                   // UI | ACCESSIBILITY | FUNCTIONAL | SEO
  requiredEvidenceKinds: EvidenceKind[], // what this check needs to have been produced already —
                                         // MUST NOT include CHECK_RESULT (research.md R15); a
                                         // registration listing CHECK_RESULT here is rejected at
                                         // registry load time, not merely discouraged
  requiredEngine: "BROWSER" | "CRAWLER" | "PASSIVE_HTTP" | "NONE",
  supportedBrowserFamilies: BrowserFamily[],  // FR-011 — empty/omitted means "all"
  automatabilityTier: "AUTOMATED" | "PARTIALLY_AUTOMATED" | "HUMAN_JUDGMENT_REQUIRED",  // FR-028
  isViewportSpecific: boolean,          // FR-042 — whether fingerprintParts includes matrix identity
  readinessScope: (evidence: EvidenceBatch) => string,  // FR-041a — the scopeKey a multi-unit check
                                                          // is evaluated per (e.g. pageIdentity);
                                                          // defaults to the owning ExecutionUnit's id
                                                          // when omitted (the common, single-unit case)
  evaluate: (evidence: EvidenceBatch) => CheckOutcome,  // pure, deterministic (FR-053)
  fingerprintPartsFor: (evidence: EvidenceBatch, outcome: CheckOutcome) => readonly string[],
  reverifyStrategy: "FRESH_MINIMAL_PLAN" | "REQUIRES_ORIGINAL_CRAWL_SCOPE",  // FR-043
}

CheckOutcome =
  | { verdict: "PASS" }
  | { verdict: "FINDING", findingShape: FindingShape, supportingEvidenceIds: string[] }
  | { verdict: "NOT_TESTED", reason: string }
  | { verdict: "UNSUPPORTED", reason: string }
  | { verdict: "BLOCKED", reason: string }
  | { verdict: "INCONCLUSIVE", reason: string }
```

**`HUMAN_JUDGMENT_REQUIRED` structural constraint (FR-028a)**: a check whose `automatabilityTier` is
`HUMAN_JUDGMENT_REQUIRED` MUST NOT have its `evaluate` function's `PASS`/`FINDING` return values
trusted as-is — the Domain Check Registry itself (`web-check-registry-contract.md`) overrides any
`PASS`/`FINDING` verdict from such a check to `INCONCLUSIVE` before recording it, and logs an
anomaly, since a tier that by definition requires human judgment cannot have produced a trustworthy
automated `PASS`/`FINDING` decision — this is enforced structurally by the one shared registry write
path, not left to each check's own author to remember.

This is a thin, additive extension of the existing `AuditCapability` shape's own spirit (`id`,
declared requirements, a pure evaluator) — it does not replace `AuditCapability`; today's five
HTTP-only capabilities keep their existing shape unchanged (FR-005). `WebCheckDefinition` is the
shape a *new* check (one that needs Engine-produced Evidence rather than calling `ctx.fetch`
itself) declares.

### `WorkflowDefinition` / `WorkflowStep` (code-level, Fahes-declared catalog entries)

```text
WorkflowDefinition = {
  id: string, version: number,
  appliesWhen: (evidence: EvidenceBatch) => boolean,  // e.g. "a <nav> with >= 2 top-level items exists"
  steps: WorkflowStep[],
}

WorkflowStep = {
  primitive: "navigate" | "click" | "fill" | "select" | "check" | "submit" | "wait"
           | "assertUrl" | "assertVisible" | "assertHidden" | "assertText" | "captureEvidence",
  target?: string,              // a bounded selector/role descriptor, never raw script
  value?: string,
  actionSafety: "READ_ONLY" | "LOCAL_BROWSER_MUTATION" | "SERVER_SIDE_REVERSIBLE_MUTATION"
              | "SERVER_SIDE_PERSISTENT_MUTATION" | "DESTRUCTIVE",  // FR-032
}
```

No field accepts arbitrary JavaScript or an `eval`-able string (FR-031) — `target`/`value` are
bounded, typed descriptors a future implementation validates against a fixed grammar, never
executes as code. **A step's own declared `actionSafety` value, including `DESTRUCTIVE`, grants it
no capability by itself (FR-032a)** — every step above `LOCAL_BROWSER_MUTATION` still passes through
`functional-workflow-contract.md`'s own fresh F01 `isAuthorized` gate before it runs; the enum
value is a classification label the gate reads, never a permission the catalog confers.

## Validation rules (enforced at the service layer)

- `VisualBaseline`'s pointer uniqueness per `(userId, pageIdentity, browserMatrixEntryHash)` is a
  real, ordinary database constraint (CF-1's fix) — never a service-layer-only assumption.
- `VisualBaselineApproval.artifactId` MUST reference an `Artifact` whose own `executionUnitId`
  belongs to a `BROWSER`-class `ExecutionUnit` that produced a `SCREENSHOT`-kind `Evidence` —
  checked at `approveBaseline` time, not assumed.
- A `WebCheckDefinition.evaluate` call that throws MUST be caught by the Domain Check Registry and
  recorded as that check's own `BLOCKED` outcome — never propagated to fail the owning
  `ExecutionUnit`'s finalization (`research.md` adversarial #27).
- A `WebCheckDefinition` whose `automatabilityTier` is `HUMAN_JUDGMENT_REQUIRED` MUST NOT have a
  `PASS`/`FINDING` verdict persisted as-is — overridden to `INCONCLUSIVE` by the registry (FR-028a).
- Every `CHECK_RESULT` Evidence row's `verdict` MUST be one of FR-041's six values — no seventh,
  ad-hoc value is ever written by any call site (enforced by the one shared Domain Check Registry
  write path, never written directly by a check's own code).
- No `WebCheckDefinition.requiredEvidenceKinds` list may include `CHECK_RESULT` — rejected at
  registry load time (`research.md` R15's structural non-recursion rule).
- `IdempotentClaim.claimKey` collisions across different logical operations are prevented by always
  including the `scope` discriminator in the lookup — a `check-execution` claim and a
  `crawl-discovery` claim can never collide even if their serialized key strings happened to be
  identical text, since `@@unique` is on `(scope, claimKey)`, never `claimKey` alone.
- `CrawlBudgetCounter` reservation MUST use the single atomic conditional-increment statement
  (`data-model.md`'s own stated raw query) — never a separate `SELECT COUNT` followed by a
  conditional `INSERT`/`UPDATE` in application code.

## Schema invariant ownership

| Invariant | Enforced by | Owning context |
|---|---|---|
| `ModuleType`/`EvidenceKind` additive-only extension (zero existing-row impact) | STRUCTURAL (schema design itself, `research.md` R1) | Cross-cutting |
| `VisualBaseline` pointer uniqueness (real DB constraint, CF-1) | DATABASE (`@@unique`) | Frontend/UX |
| `VisualBaseline`/`VisualBaselineApproval` supersession atomicity | SERVICE (`approveBaseline`'s single atomic upsert) | Frontend/UX |
| Approved-baseline extended retention (FR-026a) | SERVICE (extension to 009's `enforceArtifactRetention`) | Frontend/UX |
| `CHECK_RESULT` verdict enum closure | SERVICE (one shared Domain Check Registry write path) | Cross-cutting |
| Domain Check Registry non-recursion (`CHECK_RESULT` never a trigger input) | STRUCTURAL (trigger-set design itself, `research.md` R15) | Cross-cutting |
| Domain Check Registry idempotency under retry/replay/concurrency | DATABASE (`IdempotentClaim`'s `@@unique`) + SERVICE | Cross-cutting |
| `HUMAN_JUDGMENT_REQUIRED` never yields a trusted automated `PASS`/`FINDING` | SERVICE (registry's own override, FR-028a) | Accessibility |
| Domain Check evaluator exceptions never crash `ExecutionUnit` finalization | SERVICE (Domain Check Registry's own catch boundary) | Execution Runtime (consumed from 009) / this spec's own registry |
| `WorkflowStep` primitive closure (no `eval`, no arbitrary script) | STRUCTURAL (fixed, typed primitive set — no free-text code field exists) | Functional Web |
| `DESTRUCTIVE`/other action-safety values grant no capability by themselves (FR-032a) | SERVICE (fresh F01 gate, every step, every time) | Functional Web |
| Workflow-step mutation idempotency under retry | DATABASE (`IdempotentClaim`'s `@@unique`) + SERVICE | Functional Web |
| Crawl-discovery dedup race-safety | DATABASE (`IdempotentClaim`'s `@@unique`) + SERVICE | Crawler Engine |
| Crawl `maxPages` budget race-safety | DATABASE (`CrawlBudgetCounter`'s atomic conditional increment) | Crawler Engine |
| Fresh F01/F07 check at every browser navigation / crawl discovery / workflow step above `LOCAL_BROWSER_MUTATION` | SERVICE (this spec's own dispatch wrapper, calling F01/F07's own enforcement unchanged) | Browser/Crawler Engines, Functional Web |
| Tenant isolation on every new construct | SERVICE | All six areas |
| Zero `@relation` edges into `Scan`/`User`/`Artifact`/`ExecutionUnit` | STRUCTURAL | Cross-cutting |
