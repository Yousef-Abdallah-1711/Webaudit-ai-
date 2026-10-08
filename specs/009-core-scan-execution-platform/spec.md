# Feature Specification: Core Scan & Execution Platform (consolidates F02 + F03 + F04)

**Feature Branch**: `009-core-scan-execution-platform`

**Created**: 2026-10-07

**Status**: Planning complete — frozen for downstream specs (every future Engine spec — E10
Browser/Probe, E11 Crawler, E12 Static Source extend, E13 Untrusted Source Execution, E14 Active
Security, E15 Authenticated Workflow, E16 Load/Capacity, E17 Telemetry Integration — and the six
renumbered product-testing specs SPEC 2-6 must consume this spec's contracts rather than inventing
private orchestration, evidence, or progress systems). No implementation has occurred under this
feature — see Migration & Backward Compatibility (FR-040) and SC-006.

**Downstream contract freeze** (added during this spec's closure pass, mirroring F07's own
identical header-level block — `specs/008-safety-killswitch-budget-audit/spec.md`): every future
Engine spec (E10-E17) and every future product-testing spec — named generically as SPEC 2-6 earlier
in this planning lineage, and by the same five domains under the numbering SPEC 010 (Web/UI/
Accessibility/SEO), SPEC 011 (Source/Backend/Database/Automated Code), SPEC 012 (Security/Auth/API/
Business-Logic), SPEC 013 (Performance/Load/Capacity/Observability), SPEC 014 (Functional/
Regression/Cross-Domain/Production Readiness) in a later closure-review session — MUST consume this
spec's frozen contracts: `ScanPlan`/`ExecutionGraph` resolution, the `ExecutionUnit` lifecycle,
progress reporting, `Evidence`/`Artifact` ownership, Finding provenance (`IssueEvidenceLink`), and
runtime cancellation semantics (FR-021) — and, through this spec, F01's `isAuthorized` and F07's
Safety Admission/Kill Switch/Execution Audit contracts. No future spec MAY invent a private
alternative to any of these. A future spec that genuinely cannot fit one of these frozen contracts
MUST raise an explicit upstream amendment request against this spec (per this spec's own Edge
Cases' "surface a proposed amendment rather than silently diverge" rule, inherited from 006's
identical governance model) — it MUST NOT silently bypass the contract.

**Consolidation note**: this spec is the single planning package for what
`specs/006-scan-architecture-v2/roadmap.md` originally planned as three separate foundation
specs — **F02** (Scan Profiles / Execution Planning / Orchestration), **F03** (Evidence / Findings
/ Artifacts), and **F04** (Execution Runtime / Queue / Progress / Cancellation). The planning
*granularity* changed (one package, not three); the *architectural boundaries* did not — this spec
is organized around three internal bounded contexts (Scan Planning, Execution Runtime, Result/
Evidence Platform) that map directly onto F02/F04/F03 respectively, and each requirement below
states which context owns it. Collapsing the boundaries themselves (letting Planning dispatch
queue jobs, letting Runtime decide evidence meaning, letting Evidence schedule workers) would be
exactly the mistake Constitution Principle VIII exists to prevent, and this spec does not make it.

**Input**: User description: "MASTER PROMPT — FAHES CORE SCAN & EXECUTION PLATFORM. Planning
Only — Consolidated F02 + F03 + F04. Design the common execution backbone through which future
browser testing, crawler testing, source analysis, source execution, authenticated workflows,
active security testing, load/capacity testing, and telemetry-backed analysis are planned,
executed, observed and reported — without designing those engines themselves. Must integrate with
frozen F01 (`specs/007-foundation-target-authorization-scope/`) and frozen F07
(`specs/008-safety-killswitch-budget-audit/`) without redesigning either. Must resolve: the
Scan Profile/Configuration model, the immutable Execution Plan, the Execution Graph (DAG), the
generic Execution Unit contract, runtime/queue topology (reuse/extend/replace/new), process
isolation and the force-termination requirement F07 explicitly handed to F04, the three-way
cancellation model, crash/restart/stale-worker safety, retry-semantics classification, the
progress model, the Evidence envelope, the Artifact model (including the known staged-upload
retention gap), Finding materialization and provenance, partial-result handling, tenant isolation,
retention, current-production parallel-run compatibility, reverify compatibility, the credentials
boundary (deferred to a future Security/Auth spec), the metering boundary (deferred to a future
Credits spec), and a security/performance self-review of the platform's own mechanisms — all
without implementing anything, without redesigning any individual testing engine or capability,
and without touching current production code, schema, or behavior." (Full triggering brief
supplied in the session that created this spec; current-state infrastructure claims are drawn from
`docs/reviews/scan-audit-2026-10-07/` and this session's own direct reads of
`apps/api/prisma/schema.prisma`, `packages/capability-sdk/src/contract.ts`,
`apps/worker/src/orchestrator/orchestrator.ts`, `apps/worker/src/workspace/teardown.ts`,
`apps/api/src/services/storage/{uploads,retention}.ts` — treated as settled fact, not re-derived.)

**A note on template fit**: like its three logical predecessors (F01, F07), this is a foundation/
platform-contract spec, not an end-user-facing feature — but unlike F01/F07, which each finalized
a narrow, self-contained data model, this spec's scope spans three bounded contexts and must prove
they compose into one coherent pipeline without collapsing into each other. Its "users" are: (a)
the platform engineer who eventually implements the Execution Plan resolver, the new queue
topology, and the Evidence/Artifact writers this spec contracts; (b) every future Engine spec's
author (E10-E17), who must consume `ExecutionPlan`/`ExecutionUnit`/`Evidence`/`Artifact`/the
checkpoint-integration contract rather than invent parallel versions; (c) the six renumbered
product-testing specs (SPEC 2-6), which consume this platform's normalized outcomes rather than
each building their own orchestration; (d) an operator, who needs this platform's observability to
debug a stuck scan without reading six engines' source.

## Clarifications

### Session 2026-10-07

- Q: Should a single immutable `ExecutionPlan` also be the authority for *exactly which* HTTP
  requests/pages a stateful, frontier-driven class (`CRAWLER`) will visit, enumerated in advance —
  or can the plan declare bounded *intent* (origin, page-count ceiling, politeness rules) while the
  actual frontier is discovered at runtime? → A: Bounded intent. The plan's immutability guarantee
  (FR-015) is about *what was authorized to run and under which grant/scope/budget reference*, not
  about a fully-enumerated-in-advance request list — a `CRAWLER`-class `ExecutionUnit` MAY spawn
  further child `ExecutionUnit`s at runtime (each independently re-checked against F01/F07 per
  FR-010 of F01) as its frontier expands, bounded by the parent unit's own declared ceiling. This
  directly resolves master-prompt §17's "late graph expansion if allowed" question without
  requiring new product input — it is an architectural consequence of F01's own FR-010/FR-024 rule
  that every destination gets its own fresh authorization check, never inferred from an earlier one.
- Q: Does one `Evidence` row belong to exactly one `Issue` (as `specs/006-scan-architecture-v2/
  data-model.md`'s illustrative sketch modeled it), or can the same evidence support multiple
  findings and one finding depend on multiple evidence records (as the master prompt's own §20
  explicitly requires: "the same evidence may support multiple findings... a finding may depend on
  multiple evidence records")? → A: Many-to-many, via a join table (FR-028). This is a correction to
  006's illustrative (explicitly non-final) sketch, not a contradiction of a frozen decision — 006's
  own `data-model.md` header states its entity shapes are "illustrative, not a final schema" and
  defers finalization to the owning foundation spec, which this spec now is for Evidence.
- Q: Does `ExecutionUnit` extend the existing `CapabilityExecution` table (as `specs/
  006-scan-architecture-v2/plan.md`'s Reuse/Extend/New Matrix proposed), or does it need to be a new
  table? → A: New table, not an extension — found and corrected during this spec's own Prisma
  feasibility check (FR-016, mirroring the proof discipline F01's closure pass established).
  `CapabilityExecution.capabilityId` is a required (non-nullable) foreign key to `Capability`
  (`apps/api/prisma/schema.prisma:683-707`); a generic cross-engine execution record that is not
  always a vendored-capability dispatch cannot satisfy that constraint without either weakening an
  existing required column (a semantic change to a working table, which this spec's own migration
  posture treats the same way F01 treated `Target`/`TargetVerification` — avoid unless proven
  necessary) or inventing a placeholder capability row per engine (worse — pollutes the
  `Capability` registry with non-capabilities). A new `ExecutionUnit` table, referencing `Scan` by
  a plain scalar `scanId` column with no `@relation` (the identical pattern F07's own `research.md`
  R9 already established and proved sufficient), achieves the same goal with zero structural change
  to any existing model — a *stronger* non-modification guarantee than 006's own draft proposed,
  consistent with this spec's own Constitution Principle VIII reasoning: prefer the option that
  requires zero edits to a working, frozen subsystem when one exists.
- Q: Does `TargetAuthorization`-relevant process isolation for a hung *trusted* Fahes engine
  (F07's `research.md` R7-named F04 dependency) require container/VM-grade isolation — the same bar
  Constitution Principle XI sets for *untrusted customer code* — or does a lighter mechanism
  suffice? → A: A lighter mechanism suffices, and using the container/VM bar here would conflate two
  different threat models this spec must keep distinct (FR-019). Principle XI's bar exists for code
  *Fahes did not write* (a customer's own build/test/lint). The hung-process problem F07 handed to
  this spec is about Fahes's *own* engine code (a `BROWSER`/`ACTIVE_SECURITY`/
  `AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY` engine Fahes wrote and reviewed) getting stuck —
  correctness/liveness, not an adversarial-code containment problem. This spec resolves it with a
  dedicated child OS process per long-running `ExecutionUnit` plus a parent-armed, unconditional
  `SIGKILL` deadline (FR-019), directly generalizing the already-proven `apps/sandbox-runner`
  precedent — proportionate to the actual threat model, not over-built to a different one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A future engine author gets one place to plug in, not three (Priority: P1)

An engineer planning a future engine spec (e.g. E14 Active Security) needs a single, coherent
answer to "how does my engine's work get planned, dispatched, observed, and reported" — not three
separate, possibly-inconsistent answers from three separately-planned foundation specs that might
disagree with each other about, say, whether the Execution Plan or the Execution Runtime owns
retry semantics.

**Why this priority**: this is the entire reason the roadmap's planning granularity changed from
three specs to one — three independently-planned foundation specs created a real risk (named in the
triggering master prompt itself) of F02 assuming something about evidence that F03 designs
differently, or F04 assuming a progress shape F02 never produces. A single package, internally
organized around the same three bounded contexts, removes that risk by construction: one author,
one Execution Unit contract referenced identically everywhere it matters.

**Independent Test**: can be fully tested by taking E14's (not-yet-written) own future `/speckit-
plan` and confirming every cross-context reference it needs (how a plan resolves authorization into
an `ExecutionUnit`, how that unit calls F07's checkpoint contract, how it writes `Evidence`, how
its progress reaches the UI, how it fails/retries/is cancelled) is answered once, consistently, in
this spec's `contracts/` — never three different answers from three different documents.

**Acceptance Scenarios**:

1. **Given** this spec's completed contracts, **When** a future engine author asks "how do I
   declare one unit of my engine's work," **Then** they find exactly one `ExecutionUnit` contract
   (`contracts/execution-unit-contract.md`) naming every field, including the F01 authorization
   reference, the F07 safety requirement, and the evidence-contract reference — not a planning
   artifact that answers scheduling in one file and evidence in an unrelated one with no declared
   relationship.
2. **Given** the same contracts, **When** a future engine author asks "what happens if my engine's
   work is still running when the user cancels, an operator hits emergency stop, or the target
   authorization is revoked," **Then** they find one authoritative answer (FR-021/FR-022, directly
   built on F07's existing kill-switch contract) — never a Planning-context answer that disagrees
   with a Runtime-context answer.

---

### User Story 2 - An operator can answer "why did this execution unit do what it did" without reading six engines' source (Priority: P1)

A platform operator, debugging a scan that partially failed, needs to reconstruct: what was
planned, what actually ran, in what order, under what authorization, what it produced, and why it
stopped — using this platform's own records, not by reading each engine's internal implementation.

**Why this priority**: tied for P1 with User Story 1 because this is the master prompt's own
explicit test for the Execution Graph (§10: "A future operator must be able to answer: Why did this
execution unit exist. What requested domain caused it. What dependencies did it have. What
authorization did it rely upon. Why did it run / skip / block / fail") — a platform that cannot
answer this is not meaningfully more operable than six independent, undocumented engines would be.

**Independent Test**: can be fully tested by resolving a (simulated) `ExecutionPlan` with a
multi-unit graph (a fan-out/fan-in shape), running it to a mixed outcome (some units succeed, one
is skipped, one fails), and confirming every one of the operator's five questions above is
answerable by querying this spec's own records alone.

**Acceptance Scenarios**:

1. **Given** a resolved `ExecutionPlan` with three `ExecutionUnit`s, one of which depends on the
   other two completing, **When** one of the two dependencies fails, **Then** querying the
   dependent unit's record shows it as `BLOCKED` (not silently skipped, not retried), with its
   `blockedByExecutionUnitId` naming the failed dependency.
2. **Given** a completed scan that mixed `PASSIVE_HTTP` (today's existing, unchanged path) and one
   new execution class, **When** an operator inspects the scan's `ExecutionPlan`, **Then** they see
   every unit from both — this platform does not create a second, parallel observability surface
   for new classes that excludes what today's platform already runs.

---

### User Story 3 - A partially-failed scan still delivers the evidence it actually gathered (Priority: P2)

A scan requests five execution units; three complete successfully, one is cancelled by the user
mid-run, one fails due to a transient infrastructure error. The user must receive a report
reflecting the three successful units' real findings — not a report that discards everything
because one piece failed, and not a report that silently hides which pieces did not complete.

**Why this priority**: lower than User Stories 1-2 because it is a *consequence* of getting the
Execution Graph and Evidence model right, not an independent design surface — but it is the master
prompt's own explicit requirement (§21) and a direct extension of a guarantee today's platform
already honors (a `ModuleResult` degrades and reports why, per Constitution Principle I; a module's
single skill failure never fails the whole module or scan).

**Independent Test**: can be fully tested by resolving a plan with five units, forcing three
outcomes (`COMPLETED` x3, `CANCELLED` x1, `FAILED` x1), and confirming the scan's aggregate
read-path still surfaces the three completed units' Evidence/Findings in full, with the other two
explicitly recorded (not silently absent) and distinguishable from each other.

**Acceptance Scenarios**:

1. **Given** the five-unit scenario above, **When** the scan's report is built, **Then** it
   contains every Finding the three `COMPLETED` units produced, and the report's own completeness
   metadata names exactly which units did not contribute and why (`CANCELLED`/`FAILED`), never
   presenting partial coverage as if it were full coverage.
2. **Given** the same scenario, **When** a future Production Readiness spec (SPEC 6, not designed
   here) asks whether this scan's evidence coverage was sufficient for a readiness verdict, **Then**
   it can answer that question from this platform's own per-unit outcome metadata alone, without
   this spec needing to define what "sufficient" means (that remains SPEC 6's own scoring concern).

### Edge Cases

- **A child spec (a future engine) discovers this platform's own contract is insufficient for its
  needs** → it MUST surface this back to this spec as a proposed amendment (per 006's own
  "living parent contract" governance, which this spec inherits), never silently diverge or invent
  a private parallel mechanism (Constitution Principle VIII).
- **Two execution classes needing the same engine disagree on configuration (e.g. concurrency)** →
  per 006's own Edge Cases, the *engine's* own child spec resolves this via per-caller
  configuration; this platform's `ExecutionUnit.configuration` field is exactly the place that
  per-caller configuration is carried, so the mechanism already exists — this spec does not need a
  new one.
- **An `ExecutionPlan`'s referenced `TargetAuthorization` grant is revoked between plan resolution
  and a specific unit's dispatch** → per F01's FR-014 and F07's FR-012, resolved entirely by F01/F07
  already; this spec's only obligation (FR-022) is to call F07's checkpoint contract at the two
  mandatory points (dispatch, and the FR-013 cadence during a running unit) and to never cache an
  earlier `AUTHORIZED`/`GRANTED` result across that boundary.
- **A long-running `ExecutionUnit`'s own process hangs with no cooperating event loop left to check
  an `AbortSignal`** → FR-019's dedicated-child-process-plus-SIGKILL design (the resolution to
  F07's named R7 dependency) guarantees the process exits; it explicitly does NOT guarantee an
  already-sent external request to a third-party target stops being processed remotely (this
  spec does not claim what no spec safely can).
- **A `CRAWLER`-class unit's frontier discovers a destination outside its own grant's Scope
  mid-crawl** → per F01's FR-010 (every destination gets its own fresh check, never inferred from an
  earlier hop), the child `ExecutionUnit` for that destination is never created at all — it is
  recorded as `REFUSED_OUT_OF_SCOPE` in the parent unit's own discovery log, not silently dropped
  and not treated as a plan violation (the plan declared bounded intent, not an exhaustive URL list,
  per this spec's own Clarifications).
- **An `Artifact` upload to R2 succeeds but the database transaction recording its `Artifact` row
  fails** → FR-032 requires the upload be treated as orphaned, not referenced by any `Evidence` row
  (since the row that would reference it was never committed), and reclaimed by this platform's own
  orphan sweep (extending the existing retention-sweep pattern) rather than left as an unbounded,
  never-billed, never-cleaned object — directly closing the class of gap the current staged-ZIP-
  upload retention question already represents (FR-033).
- **A `Scan`'s report is being actively read while this platform's retention sweep removes its
  `Evidence`/`Artifact` rows** → FR-034 requires the existing retention-sweep ordering discipline
  (mark `reportRemovedAt`, the report route then returns a "removed" response) to extend to the new
  entities identically — a reader never observes a half-removed report (some `Evidence` gone, some
  present) because removal of a scan's new-entity rows is a single transaction, matching the
  existing `enforceRetention` pattern's own per-scan atomicity.
- **A reverify is requested for a Finding whose originating execution class required
  `TargetAuthorization`, and the original grant has since expired** → FR-029 requires a reverify to
  resolve a **new**, minimal `ExecutionPlan` (never reuse or extend the original scan's plan) and
  re-run F01's authorization check fresh against the Target's *current* grants — a reverify that
  cannot obtain a fresh `AUTHORIZED` result is refused with the same reason F01's own
  `isAuthorized` would give, never silently falling back to the original (now possibly stale)
  grant reference.
- **A Scan Profile's definition changes after a historical scan already resolved a plan from an
  earlier version** → FR-007 requires the resolved plan to retain its own snapshot (`profileVersion`,
  captured at resolution time) — the historical scan's plan is forever explainable from the profile
  version it actually used, never from whatever the profile currently says.

## Requirements *(mandatory)*

### Functional Requirements — Scan Configuration & Profile (Scan Planning context)

- **FR-001**: This spec MUST define **ScanConfiguration** as the resolved input to planning: a
  Target, a selected **ScanProfile** (or fully custom domain/engine selection), the product domains
  requested by the user, any advanced per-domain configuration the profile schema permits, and —
  only if a selected domain requires an execution class beyond `PASSIVE_HTTP`/`SOURCE_STATIC` — a
  reference to the specific F01 `TargetAuthorization` grant(s) the user intends to rely on.
  `ScanConfiguration` is the thing a (future) richer `/scan` UX (U30, not designed here) submits;
  this spec defines its shape, not its UI.
- **FR-002**: This spec MUST define **ScanProfile** as a named, versioned, reusable template
  (placeholders, per 006's own FR-006, carried forward unchanged and not newly invented here:
  quick / standard-full / production-readiness / frontend-QA / security / authenticated-application
  / load-capacity / custom) that declares a default set of product domains and, per domain, which
  execution class(es) satisfying that domain requires. A `ScanProfile` is versioned
  (`ScanProfileVersion`, FR-003) — editing a profile's definition MUST NOT retroactively change what
  an already-resolved `ScanPlan` (FR-006) is recorded as having used.
- **FR-003**: Every `ScanProfile` MUST be read through an explicit **version** at resolution time.
  `ScanPlan.profileVersion` (FR-006) is a snapshot of the exact version resolved against, immutable
  thereafter — directly answering the Edge Cases' "profile definition changes after a historical
  scan" case and master-prompt §8's own "a historical scan must remain explainable even if the
  profile definition changes later" requirement.
- **FR-004**: The platform MUST distinguish three layers, never collapsing any two (master-prompt
  §7, extending 006's own FR-006 distinction): **product domains** requested by the user (Security,
  Performance, Frontend, SEO, etc. — today's existing `ModuleType` set, extensible), **execution
  classes** required to satisfy them (F01's `ExecutionClass` enum plus `PASSIVE_HTTP`/
  `SOURCE_STATIC`, which never require `TargetAuthorization`), and **execution units** (FR-012) the
  Plan Resolver (FR-005) actually generates. A requested domain MUST NOT become a queue job
  directly — it is resolved, deterministically, through this three-layer chain every time.
- **FR-005**: This spec MUST define the **Plan Resolver** as a pure, deterministic function:
  `resolve(ScanConfiguration) -> ExecutionPlan | PlanRefusal`. Given the same `ScanConfiguration`
  and the same live F01 authorization state, it MUST produce the same `ExecutionPlan` shape (not
  necessarily byte-identical ids, but identical structure/dependencies/classes) — runtime workers
  MUST NOT guess at user intent; every execution unit a worker ever receives was generated by this
  one resolver, never improvised at dispatch time (master-prompt §7's "runtime workers MUST NOT
  dynamically guess").

### Functional Requirements — Execution Plan & Graph (Scan Planning context)

- **FR-006**: This spec MUST define **ScanPlan** (Execution Plan) as the authoritative, resolved
  snapshot of what was intended to run for one `Scan`: its `scanId`, `profileId`+`profileVersion`
  (FR-003), the specific `TargetAuthorization` grant id(s) it relies on (snapshotted by reference,
  never by copying grant content, per F01's own FR-014 pattern), and its resolved
  **ExecutionGraph** (FR-008). A `ScanPlan` is **immutable once resolved** — this is the direct
  architectural descendant of today's `Scan.capabilitySnapshot`'s "resolved once at scan start, held
  for the scan's duration" guarantee (R10), extended to cover execution-class and authorization
  resolution, not only capability selection. Immutability binds the plan's *declared intent*
  (FR-015's precise scope), never a live authorization verdict (FR-022 re-checks that fresh, always).
- **FR-007**: Resolving a `ScanPlan` MUST call F01's `isAuthorized` (or, for an execution class
  requiring F07, a planning-time equivalent check — see FR-022) once per requested execution class
  beyond `PASSIVE_HTTP`/`SOURCE_STATIC`, before the plan may be marked `RESOLVED` rather than
  `REFUSED`. A plan containing any class that fails this check is never created in a dispatchable
  state — refused before any credit is charged and before any queue entry is created, matching the
  existing platform's own "refuse before any debit" precedent (`create-scan.ts`).
- **FR-008**: This spec MUST define **ExecutionGraph** as an explicit, inspectable DAG of
  `ExecutionUnit`s (FR-012) with declared dependencies (`ExecutionDependency`, FR-013). The graph
  MUST support: parallel execution (siblings with no dependency edge), serial dependencies (a fan-in
  unit depending on one or more predecessors), fan-out (one unit's completion unblocking several),
  optional/conditional branches (a unit whose `canRun`-equivalent precondition the resolver
  evaluates before admitting it to the graph at all — mirroring today's existing `canRun` discipline
  at the capability level, generalized to the unit level), and runtime-discovered child units for a
  stateful, frontier-driven class (this spec's own Clarifications, `CRAWLER`'s bounded-intent rule).
- **FR-009**: Every `ExecutionUnit` in a resolved graph MUST be answerable, from this platform's own
  records alone, for: why it exists (which requested domain/profile selection caused it), what
  dependencies it has, what authorization/scope it relies on (the specific grant id, not a copy),
  and — once execution begins — why it ran, was skipped, was blocked, or failed (master-prompt §10's
  explicit operability bar; User Story 2's own acceptance test).
- **FR-010**: Fan-in dependency failure MUST propagate deterministically: a unit depending on a
  failed or cancelled predecessor is recorded `BLOCKED` (never silently `SKIPPED`, never
  silently retried), naming the specific predecessor via `blockedByExecutionUnitId`. A unit with
  **no** satisfied dependency path is never dispatched at all — it transitions directly from
  `PLANNED` to `BLOCKED` without ever reaching `DISPATCHED`.
- **FR-011**: A `ScanPlan` is resolved **exactly once per `Scan`**, matching today's R10 guarantee's
  own scope. This spec does not define mid-scan replanning or a second plan version for the same
  scan — a `ScanConfiguration` change after a scan has started requires a new `Scan` (today's
  existing model), not an amendment to an in-flight plan. (A **reverify**, FR-029, resolves its own
  separate, minimal plan — it is never a second version of the original scan's plan.)

### Functional Requirements — Execution Unit Contract (Scan Planning context, consumed by Execution Runtime)

- **FR-012**: This spec MUST define **ExecutionUnit** as the generic, cross-engine record of one
  engine invocation, carrying at minimum: `id`, `scanId`, `planId`, `executionClass` (F01's enum,
  extended with `PASSIVE_HTTP`/`SOURCE_STATIC`), `engineId`/`capabilityRef` (an opaque identifier for
  the specific engine/capability that will execute it — this spec does not define engine identity
  beyond a stable string key any future engine spec declares), `targetId`, `targetAuthorizationId`
  (nullable — null for `PASSIVE_HTTP`/`SOURCE_STATIC`, which never require one), `configuration`
  (the per-caller configuration an engine needs, per this spec's own Edge Cases), `dependencyIds`
  (FR-013), `priority` (reusing today's existing plan-tier priority-band model, extended), `timeout
  policy`, `retryPolicy` (FR-023's classification, not a blind `attempts` number), `requiresSafety
  Checkpoint` (boolean — true for every execution class F07's FR-026 names, false for
  `PASSIVE_HTTP`/`SOURCE_STATIC`), `idempotencyKey` (FR-025), `status` (FR-014), `attempt` (FR-024),
  and an `evidenceContractRef` naming which `Evidence.kind` values this unit is expected to produce.
  **No field carries a raw credential or session secret** (FR-020) — only an opaque
  `credentialBindingRef` a future Security/Auth spec (F05, not designed here) defines the resolution
  of.
- **FR-013**: This spec MUST define **ExecutionDependency** as an explicit edge
  (`executionUnitId` -> `dependsOnExecutionUnitId`) within one `ExecutionGraph`. A dependency edge
  MUST only ever reference another unit within the *same* `ScanPlan` — cross-plan dependencies do
  not exist, since a plan's immutability (FR-006) only makes sense bounded to its own graph.
- **FR-014**: `ExecutionUnit.status` MUST have exactly these values: `PLANNED` (exists in the
  resolved graph, not yet eligible to run), `BLOCKED` (a dependency failed/was cancelled, FR-010),
  `ADMITTED` (passed its safety checkpoint / authorization re-check, about to dispatch —
  distinguishable from `DISPATCHED` because admission and queue-dispatch are two different
  operations per F07's own admission-is-a-decision-not-a-reservation-of-queue-slot framing),
  `DISPATCHED` (a queue job exists for it), `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` (user-
  initiated, per F07's `USER_CANCELLATION` kill-switch reason), `KILLED` (operator emergency stop or
  target-safety kill switch, per F07's other `KillSwitchReason` values — deliberately **not**
  merged with `CANCELLED`, directly preserving the master prompt's own three-way cancellation
  distinction, §14), `REFUSED` (never admitted — authorization/scope/budget/safety refusal at or
  before the checkpoint, FR-022), and `SKIPPED` (its own `canRun`-equivalent precondition was false
  at resolution time — never reached `PLANNED` as a dispatchable unit at all, distinguishable from
  `BLOCKED`, which *was* dispatchable until a dependency failed).
- **FR-015**: `ScanPlan` immutability (FR-006) means precisely: the graph's membership (which
  `ExecutionUnit`s exist, their `executionClass`, their declared dependencies, and the specific
  `TargetAuthorization` grant id(s) referenced) never changes after resolution — **except** for the
  one explicitly-allowed case of a `CRAWLER`-class (or any future frontier-driven class's) runtime-
  discovered child units, which are additive-only, bounded by their parent unit's own declared
  ceiling, and themselves immutable once created. What is never immutable, and MUST always be
  re-checked live: whether a specific grant is still `AUTHORIZED` (F01), whether a kill-switch stop
  is pending (F07), and whether budget remains (F07) — directly reusing F01's own FR-014 resolution
  of "a previously valid plan may become non-dispatchable," generalized here from one grant
  reference to every unit in a graph that depends on one.

### Functional Requirements — Execution Runtime: Queue Topology & Dispatch (Execution Runtime context)

- **FR-016**: The platform MUST classify every existing and new subsystem it touches as **REUSE**,
  **EXTEND**, or **NEW**, with file-level evidence — see `plan.md`'s Reuse/Extend/New Matrix. At
  minimum: the existing `webaudit-scan-phase`/`webaudit-reverify`/`webaudit-maintenance`/
  `webaudit-email-notification` queues (`packages/config/src/queues.ts`) continue to carry
  `PASSIVE_HTTP`/`SOURCE_STATIC` dispatch **unchanged** (REUSE); `ExecutionUnit` is a **NEW** table,
  not an extension of `CapabilityExecution` (this spec's own Clarifications, Prisma-feasibility
  finding).
- **FR-017**: Every execution class requiring a **new** queue (per Constitution Principle XII's
  "own queue, not copied short-job defaults" rule, and 006's own plan.md precedent) MUST get its own
  dedicated queue, not a shared "long-running" queue mixing classes with different duration/
  statefulness/safety profiles — directly mirroring the existing platform's own precedent of giving
  `webaudit-reverify` its own queue specifically so an audit backlog cannot starve it. This spec
  names the queue-placement decision per execution class (`plan.md`'s Runtime/Queue Model) but does
  not provision any real BullMQ queue instance — that is implementation work for whichever future
  engine spec first wires a real dispatch point for its own class, per FR-040's migration posture.
- **FR-018**: `ExecutionUnit` dispatch MUST be driven from durable Postgres state, never from queue-
  job-payload content as the authority — a queue job for an `ExecutionUnit` carries only its `id`
  (and the minimal routing data needed to select a worker/queue), and the worker re-reads the unit's
  full, current record from Postgres at dispatch time, immediately before calling F07's safety
  checkpoint (FR-022). This closes the "queue payload tampering"/"forged execution-unit id" class of
  risk structurally: a tampered or forged payload id simply fails the subsequent tenant-scoped
  lookup (FR-026), never executes with attacker-supplied configuration.
- **FR-019 (process isolation / force termination — resolving F07's named dependency)**: Every
  `ExecutionUnit` whose `executionClass` requires a dedicated queue (FR-017) MUST run inside its own
  dedicated child OS process, forked by its owning worker, generalizing the proven
  `apps/sandbox-runner` SIGKILL pattern (`apps/sandbox-runner/src/host/server.ts`/`limits/
  timeout.ts`) from "operator-installed capability dispatch" to "any long-running engine
  invocation." The owning worker MUST arm an unconditional, parent-side `SIGKILL` deadline for that
  child process, sized to the unit's own `timeoutPolicy` plus a fixed margin, independent of
  whether the child's own event loop is still responsive. **This closes exactly the gap F07's own
  `research.md` R7 named and explicitly handed to this spec** ("a true hung worker process... that
  requires a process topology... this spec does not design"). Per this spec's own Clarifications,
  this is **not** Constitution Principle XI's container/VM-grade isolation bar (that remains E13's
  own, separate, higher bar for *untrusted customer code*) — this mechanism exists for Fahes's own
  *trusted* engine code getting stuck, a liveness guarantee, not a containment boundary against
  adversarial code. **Named limitation, stated with the same honesty F07's own FR-014 states its
  limitation**: `SIGKILL`ing the child process guarantees Fahes stops acting on the work and
  consumes no further budget; it does **not** guarantee an already-in-flight request to a third-
  party target is itself interrupted, retracted, or ceases being processed remotely.
- **FR-020**: No `ExecutionUnit` field, queue job payload, progress event, or log line MAY carry a
  raw credential, session token, cookie, or API key (extending the constitution's existing Security
  requirements and F07's own FR-024 to this platform's own records) — only an opaque
  `credentialBindingRef`/`sessionBindingRef` a future F05 spec defines the resolution of.

### Functional Requirements — Safety Integration (Execution Runtime context, consuming F01/F07)

- **FR-021**: This platform MUST preserve F07's exact three-way stop distinction at the
  `ExecutionUnit` level (never collapsing any two into one state, master-prompt §14): user
  cancellation (`ExecutionUnit.status = CANCELLED`, F07's `USER_CANCELLATION` reason), an operator
  emergency stop or target-safety kill switch (`ExecutionUnit.status = KILLED`, F07's
  `OPERATOR_EMERGENCY_STOP`/`AUTHORIZATION_REVOKED`/`ENVIRONMENT_RECLASSIFIED`/
  `SYSTEM_SAFETY_POLICY` reasons), and ordinary system failure (`ExecutionUnit.status = FAILED`,
  FR-023's failure classification). A single undifferentiated "stopped" state is never acceptable
  for any execution class F07's mechanisms apply to.
- **FR-022**: Every `ExecutionUnit` whose `requiresSafetyCheckpoint` is true (FR-012) MUST call
  F07's `safetyCheckpoint` contract at exactly the points F07's own FR-018 requires (dispatch time,
  before every subsequent safety-sensitive action, and at F07's fixed 5-second cooperative-polling
  cadence during any single long-running action) — this platform does not reimplement any piece of
  that sequence (Constitution Principle VIII) and does not invent a parallel authorization/budget
  check. For `PASSIVE_HTTP`/`SOURCE_STATIC` (`requiresSafetyCheckpoint = false`), today's existing
  cooperative-cancellation-flag model (`apps/worker/src/orchestrator/cancellation.ts`) continues
  unchanged (FR-040) — this spec does not retrofit F07's heavier mechanism onto classes that never
  needed it.
- **FR-022a**: A **plan-resolution-time** authorization check (FR-007) and a **dispatch-time**
  safety checkpoint (FR-022) are never substituted for each other — resolving a plan as `RESOLVED`
  for an execution class never exempts that class's units from their own fresh dispatch-time
  checkpoint, exactly as F01's own FR-014/FR-024 already require for any two calls separated by
  time, applied here across the planning/runtime boundary specifically.

### Functional Requirements — Progress Model (Execution Runtime context)

- **FR-023 (failure classification — retry semantics)**: Every `ExecutionUnit` failure MUST be
  classified into one of these `FailureClass` values before any retry decision is made (master-
  prompt §16's explicit classification requirement — never one generic policy for every failure):
  `TRANSIENT_INFRASTRUCTURE` (a database/queue/network blip unrelated to the target or the finding
  — retryable, bounded attempts, per the unit's own declared `retryPolicy`), `DETERMINISTIC_FINDING`
  (not a failure at all — the engine measured something and the measurement itself is the result;
  this classification exists so a caller never mistakes "the target returned HTTP 500" or "a
  security probe found the vulnerability it was testing for" for an execution failure), `TARGET_
  UNAVAILABLE` (the target itself could not be reached — distinct from an internal fault), `SAFETY_
  REFUSED` (F01/F07 refused — authorization/scope/budget/kill-switch; never automatically retried
  with the same inputs, per F01's own authorization-check-contract rule 3), `TIMEOUT` (the unit's
  own declared timeout elapsed — retryable only if the unit's own idempotency is proven, FR-025),
  `ENGINE_DEFECT` (the engine's own code threw/misbehaved — never auto-retried, surfaced for
  operator attention), `INVALID_CONFIGURATION` (the unit's own `configuration` was malformed at
  dispatch time — never auto-retried), `CUSTOMER_CODE_FAILURE` (for `SOURCE_EXECUTION`: the
  customer's own build/test/lint failed — this is the execution's *result*, not a Fahes
  infrastructure failure, and is reported as such, never retried as if Fahes's own code broke), and
  `EXTERNAL_DEPENDENCY_FAILURE` (a third-party provider Fahes itself depends on, e.g. an AI
  provider — retryable per existing `AIExecutor` fallback-chain semantics, unchanged).
- **FR-024**: Idempotence for any retry attempt greater than one MUST be **proven**, not assumed,
  per execution class, before that class's `retryPolicy` may permit `attempts > 1` — directly
  reusing Constitution Principle XII's existing rule, applied here as a gating requirement on this
  platform's own `retryPolicy` field (FR-012) rather than left to each engine spec to rediscover
  independently. A class that may have already incurred a real-world side effect (a sent payload, a
  billed unit of generated load, a partially-completed workflow step) defaults to `attempts: 1`
  with explicit recovery handling, exactly as today's existing scan-phase queue already does for
  the identical reason.
- **FR-025**: Every budget-consuming or side-effect-bearing operation an `ExecutionUnit` performs
  MUST be keyed by a deterministic `idempotencyKey` (reusing F07's own FR-008 shape: stable per
  execution-unit-and-attempt identity, never freshly minted per invocation for what is actually the
  same retried attempt) — this is the same discipline F07 already requires of its own callers,
  restated here as this platform's own obligation to derive that key correctly, since this platform
  is the caller F07's contract describes.
- **FR-026**: Every `ExecutionUnit` lookup by `id` (at dispatch, at a safety checkpoint, in any
  operator or reporting query) MUST additionally filter by the requesting context's tenant
  ownership (`scanId`'s owning `userId`) — the identical `findFirst({ id, userId })`-equivalent
  pattern F01/F07 already establish, applied here to close the "cross-tenant execution id guessed"
  risk (master-prompt §29) structurally rather than by convention.
- **FR-027**: This spec MUST define a **progress model** hierarchical enough to represent: `Scan` ->
  `ExecutionPlan` -> `ExecutionUnit` -> (optionally) a bounded sub-step a specific execution class's
  own child spec defines the meaning of. Progress MUST be split into two tiers: a **durable**
  snapshot (a bounded-size `progressSnapshot: Json?` field on `ExecutionUnit`, last-write-wins,
  updated at a throttled cadence — never one row or one write per tick, per master-prompt §30's
  "no DB transaction per progress tick" bound) and **ephemeral** fine-grained ticks (published over
  the existing Redis/WebSocket progress-delivery path, `apps/worker/src/orchestrator/emit.ts`'s
  existing pattern, generalized to per-unit granularity — never persisted individually, per the
  constitution's "Redis... never a system of record" rule). If an execution class's own total work
  is genuinely unknown in advance (e.g. a crawl frontier not yet fully discovered), the durable
  snapshot MUST represent that honestly (an explicit `indeterminate: true` field) rather than
  fabricating a percentage (master-prompt §17's explicit "do not fake percentages" requirement).
- **FR-027a**: A progress event (ephemeral or durable) emitted for an `ExecutionUnit` already in a
  terminal `status` (FR-014: `COMPLETED`/`FAILED`/`CANCELLED`/`KILLED`/`REFUSED`/`SKIPPED`) MUST be
  rejected by the durable-snapshot writer and logged as an anomaly — never silently applied, which
  would let a late, stale worker's progress write resurrect the appearance of still-running work
  after this platform has already recorded the unit as finished (closing the master-prompt §40
  "progress emitted after terminal state" adversarial scenario).

### Functional Requirements — Evidence Model (Result/Evidence Platform context)

- **FR-028 (many-to-many correction — this spec's own Clarifications)**: This spec MUST define
  **Evidence** as a typed envelope (kind-tagged, per 006's own FR-015 enumeration of evidence kinds
  — HTTP transaction, source location, screenshot, screenshot diff, DOM node, accessibility node,
  browser trace, HAR, video, load metrics, security reproduction, code flow, dependency,
  telemetry — extensible, not closed) that is produced by exactly one `ExecutionUnit` but MAY be
  referenced by **zero or more** `Issue`/Finding rows, and a Finding MAY depend on **zero or more**
  `Evidence` rows — realized as an `IssueEvidenceLink` join table (`data-model.md`), not a
  one-to-one `issueId` foreign key on `Evidence` itself (correcting 006's own illustrative,
  explicitly-non-final sketch, which this spec's charter is to finalize).
- **FR-029 (reverify compatibility)**: A reverify for a Finding whose originating `ExecutionUnit`
  required `TargetAuthorization` MUST resolve a **new**, minimal `ScanPlan` (a single-unit graph,
  `planKind: REVERIFY`) through the same Plan Resolver (FR-005) — never reuse, extend, or read
  forward from the original scan's plan or its authorization-grant snapshot. This plan's own FR-007
  authorization check is run fresh, against the Target's *current* grants, exactly as every other
  plan resolution — directly satisfying master-prompt §31's "Reverify MUST NOT simply replay stale
  authorization assumptions." For `PASSIVE_HTTP`/`SOURCE_STATIC` findings, today's existing
  single-capability reverify dispatch (`apps/worker/src/reverify/runner.ts`) is unchanged (FR-040) —
  this FR applies only to a reverify class this platform newly enables.
- **FR-030**: Evidence produced by an execution class F07's mechanisms apply to (`ACTIVE_SECURITY`,
  `AUTHENTICATED_WORKFLOW`, `SOURCE_EXECUTION`) MUST pass through the existing `@webaudit/
  redaction` mechanism before being persisted (directly reusing 006's own FR-027 and F07's own
  FR-024, applied here to `Evidence.inlinePayload`/any `Artifact` content retrieved for display,
  never only to `ExecutionAuditEvent` as F07 scoped its own identical rule). This spec names no new
  redaction mechanism — the one that already protects AI-prompt assembly and F07's audit payloads
  is the one this platform's Evidence writer also calls, unconditionally, with no caller-supplied
  bypass.
- **FR-031**: Evidence large enough that inlining it would grow `Evidence`'s own row unboundedly
  (a screenshot, a trace, a HAR file, a video) MUST be stored as an **Artifact** (FR-032) referenced
  by `Evidence.artifactId`, never inlined — this is 006's own non-negotiable boundary rule 4
  (`contracts/shared-platform-contracts.md`), restated here as this spec's own binding requirement
  since this is the spec that actually defines `Artifact`.

### Functional Requirements — Artifact Model (Result/Evidence Platform context)

- **FR-032**: This spec MUST define **Artifact** as a reference to large, externally-stored
  evidence content in R2, carrying: `id`, `scanId` (plain scalar, no `@relation`, per this spec's
  own Clarifications), `executionUnitId` (plain scalar — the unit that produced it), `storageKey`
  (tenant-scoped and content-addressed where feasible, mirroring the existing `uploads/<userId>/
  <sha256>.zip` pattern, `apps/api/src/services/storage/uploads.ts:uploadKeyFor`), `contentType`,
  `sizeBytes`, `createdAt`, and `retentionPolicyRef` (FR-034). **Per FR-033**, `sizeBytes` MUST be
  checked against both a per-object and a per-scan cumulative-artifact-size budget at write time —
  not only bounded by a retention *duration* later.
- **FR-033**: This platform MUST enforce an explicit per-object artifact-size budget and a
  per-scan cumulative artifact-size budget, refusing (not silently truncating) a write that would
  exceed either — the specific numeric ceilings are a future engine spec's own decision (the engine
  producing the artifact knows its own realistic size envelope; this spec establishes only that a
  budget MUST exist and MUST be enforced at write time, directly carrying forward 006's own FR-028).
- **FR-034 (closing the staged-upload retention gap)**: Every `Artifact` MUST have a proven
  deletion call site reachable from this platform's existing retention-sweep mechanism
  (`apps/api/src/services/storage/retention.ts:enforceRetention`, extended — not replaced — to also
  enumerate and delete `Artifact` rows/R2 objects for a scan whose report has passed its retention
  boundary) — directly closing the exact gap this session's own source read confirmed
  (`UploadStorage.remove` exists with zero call sites under `apps/api/src`/`apps/worker/src`).
  `Artifact`'s own retention timing defaults to report-retention parity (006's own ADR-007,
  product-confirmed 2026-10-07) — no separate, shorter artifact-specific tier by default.
- **FR-035 (orphan reclamation)**: An `Artifact`'s R2 object whose corresponding database row write
  failed or was rolled back (the Edge Cases' "upload succeeds, DB transaction fails" case) MUST be
  reclaimed by a periodic orphan sweep — extending the existing maintenance-queue sweep family
  (`apps/worker/src/orchestrator/timeout-scheduler.ts`'s own `upsertJobScheduler` pattern) rather
  than inventing a new scheduling mechanism — never left as an unbounded-growth, untracked R2 object.

### Functional Requirements — Finding Materialization & Provenance (Result/Evidence Platform context)

- **FR-036**: The platform MUST preserve the existing fingerprint-based Finding-identity mechanism
  (`packages/scoring/src/fingerprint.ts:fingerprintOf`) as the one cross-engine identity scheme —
  every new execution class's engine computes its own `fingerprintParts`, consumed by the same
  mechanism, never a parallel identity scheme (Constitution Principle IX, directly inherited, not
  redesigned). This spec does not change `Issue`'s existing schema, state machine, or attribution
  assignment (`MEASURED`/`AI_JUDGMENT`, set by the runner, never by an engine) in any way.
- **FR-037**: A Finding materialized from a new execution class's Evidence MUST retain, via its
  `IssueEvidenceLink` rows (FR-028), enough provenance to answer: which `ExecutionUnit` produced
  the supporting evidence, under which `ScanPlan`, under which `TargetAuthorization` grant, during
  which execution class — the same five-question bar FR-009 already establishes for an
  `ExecutionUnit` itself, extended here to the Finding that consumes its output.
- **FR-038**: Partial scan completion (User Story 3) MUST NOT discard Evidence/Findings a
  successfully-completed `ExecutionUnit` produced merely because a sibling unit failed, was
  cancelled, or was killed — findings and their supporting evidence from `COMPLETED` units always
  reach the report; the report's own completeness metadata (FR-039) names what did not contribute.
  This spec does not design final Readiness-eligibility scoring (that remains SPEC 6's own
  concern, per 006's own FR-019 precedent) — it defines only the per-unit outcome metadata SPEC 6
  would need to make that determination.
- **FR-039**: Every `Scan`'s report-level read path MUST be able to state, for the scan as a whole:
  which `ExecutionUnit`s contributed `COMPLETED` evidence, which were `CANCELLED`/`KILLED`/`FAILED`/
  `BLOCKED`/`SKIPPED`/`REFUSED`, and (for each non-`COMPLETED` unit) its specific reason — this is
  the coverage-completeness metadata a future SPEC 6 (Production Readiness) consumes, not a score
  this spec computes itself.

### Functional Requirements — Tenant Isolation, Retention, Observability, Metering Boundary

- **FR-040 (migration & backward compatibility)**: This spec introduces **zero behavior change** to
  the current production `/scan` flow, current API contracts, current database schema (beyond
  wholly new, additive tables — `ExecutionUnit`/`ExecutionDependency`/`Evidence`/`Artifact`/
  `IssueEvidenceLink`/`ScanProfile`/`ScanProfileVersion`/`ScanPlan`, every one referencing existing
  models only via plain scalar columns with no `@relation`, per this spec's own Clarifications), or
  current pricing. `PASSIVE_HTTP`/`SOURCE_STATIC` dispatch, today's existing cancellation/timeout/
  credit-debit/reverify/retention mechanisms are explicitly out of scope for modification — they
  continue to behave exactly as today, unmodified, per 006's own FR-024 strict-parallel-run
  requirement, which this spec inherits without exception.
- **FR-041**: Every new entity this spec defines MUST be tenant-scoped at creation and at every
  read, re-deriving ownership through its owning `Scan`'s `userId` (or, for `TargetAuthorization`-
  referencing fields, through F01's own already-tenant-scoped grant) — never a bare lookup by `id`
  alone, directly extending Constitution Principle XIII and the identical discipline F01/F07 already
  establish for their own entities.
- **FR-042**: Every new object-storage location this spec defines (`Artifact`'s R2 keys) MUST use a
  tenant-scoped, content-addressed-where-feasible key and MUST have a proven deletion call site
  before this platform may be considered complete (FR-034) — no new storage class may repeat the
  staged-ZIP-upload gap this spec's own evidence confirms exists today.
- **FR-043**: This platform MUST expose per-engine observability (duration, queue wait time,
  resource usage, failure/retry counts by `FailureClass` (FR-023), cancellation/kill events, cost,
  concurrency observed, engine health) without exposing a customer secret, credential, or raw
  payload in any observability record — directly inheriting 006's own FR-023, scoped here to the
  concrete `ExecutionUnit`/`Evidence`/`Artifact` records this spec actually defines.
- **FR-044 (metering boundary)**: This spec does not design final pricing (that remains a future
  Credits/Metering spec's own concern, per 006's own FR-020 narrow-scope decision). It defines only
  the generic hooks a future pricing function needs: `ExecutionUnit.costMicros` (extending the
  existing `CapabilityExecution.costMicros` pattern to the new table), reservation via F07's own
  `AdmissionLease`/`BudgetConsumption` (already F07's mechanism, not reinvented here), and usage-
  emission/reconciliation as an observability record (FR-043) a future Credits spec can aggregate.
- **FR-045 (credentials boundary)**: This spec does not design credential/session storage (that
  remains a future Security/Auth spec's own concern, per 006's own FR-013(g) handoff). It defines
  only how `ExecutionUnit` safely references a future opaque `credentialBindingRef`/
  `sessionBindingRef` (FR-020) — no raw secret ever appears in any entity or contract this spec
  defines.
- **FR-046 (AI is not planning, execution, or evidence)**: No AI/machine-learning judgment of any
  kind MAY decide, influence, or be consulted for: whether a `ScanPlan` resolves or is refused,
  which `ExecutionUnit`s a graph contains, whether an execution unit is admitted/dispatched/
  retried/killed, what an `Evidence` record contains, or whether a Finding's supporting evidence is
  sufficient. Every operation this spec defines MUST remain a pure, deterministic function of
  durable state and the F01/F07 contracts it calls — extending F01's identical FR-023 and F07's
  identical FR-025, so this spec's own package is self-contained on this point exactly as its two
  upstream dependencies are.

## Key Entities

- **ScanConfiguration**: NEW (ephemeral input shape, not necessarily its own table — a request DTO
  the Plan Resolver consumes). Target + Profile/custom selection + domains + advanced config +
  authorization-grant references.
- **ScanProfile** / **ScanProfileVersion**: NEW. Named, versioned scan-configuration template.
- **ScanPlan**: NEW, generalizes `Scan.capabilitySnapshot`'s intent. The immutable resolved graph.
- **ExecutionUnit**: NEW (not an extension of `CapabilityExecution` — see Clarifications). One
  engine invocation, generically.
- **ExecutionDependency**: NEW. A DAG edge between two `ExecutionUnit`s in the same plan.
- **Evidence**: NEW, typed envelope. Many-to-many with `Issue` via `IssueEvidenceLink` (see
  Clarifications — a correction to 006's own illustrative sketch).
- **IssueEvidenceLink**: NEW. The many-to-many join table FR-028 requires.
- **Artifact**: NEW. Large binary evidence content reference, R2-backed, budgeted (FR-033),
  retained at report-retention parity (FR-034), orphan-swept (FR-035).
- **FailureClass**: NEW (enum, not a table). FR-023's retry-semantics classification.
- `Target`, `Scan`, `Issue`, `CapabilityExecution`, `TargetAuthorization`, `AdmissionLease`,
  `BudgetConsumption`, `KillSwitchState`, `ExecutionAuditEvent`: EXISTING/FROZEN, referenced by
  plain scalar id only, zero structural modification (this spec's own Clarifications; F07's R9
  precedent, applied one level further).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every subsystem this spec touches (four existing queues, the capability-SDK contract,
  the credit ledger, the readiness/reverify mechanisms, the sandbox-runner, `CapabilityExecution`,
  `AuditLogEntry`, the retention sweep, the staged-upload storage) is classified REUSE/EXTEND/NEW in
  `plan.md`, each citing a specific file/line — zero unclassified or evidence-free classifications,
  matching 006's own SC-001 bar.
- **SC-002**: Every one of this spec's new entities (`ScanProfile`, `ScanProfileVersion`,
  `ScanPlan`, `ExecutionUnit`, `ExecutionDependency`, `Evidence`, `IssueEvidenceLink`, `Artifact`)
  has a complete field list in `data-model.md`, a proven-feasible Prisma shape (checked the same way
  F01's own closure pass proved its two structural fields necessary — see `data-model.md`'s own
  feasibility note), and zero structural (`@relation`) edges into any existing/frozen model.
- **SC-003**: F07's own named dependency ("a process topology... this spec does not design,"
  `specs/008-safety-killswitch-budget-audit/research.md` R7) is resolved with a concrete, checkable
  mechanism (FR-019) and its own honestly-stated limitation — verified by direct inspection of
  FR-019's wording against F07's own R7 text.
- **SC-004**: Every one of the 40+ adversarial scenarios in this spec's own adversarial-review pass
  (`plan.md`'s Independent Adversarial Review section) maps to at least one Functional Requirement
  or an explicit, named defer-to-F01/F07 resolution — zero orphaned scenarios, matching F07's own
  SC-004 bar.
- **SC-005**: This spec's `quickstart.md` validation (reusing and extending 006's own eight-step
  child-spec checklist, since every future Engine spec E10-E17 must pass it against this spec
  specifically, not only against 006) passes all steps when run against this spec's own `plan.md`/
  `data-model.md`.
- **SC-006**: This spec's own package produces zero changes to any file outside
  `specs/009-core-scan-execution-platform/` — verified by `git status`/`git diff --name-only` at
  the close of this planning pass, matching F01's and F07's own SC-004/SC-005 pattern.
- **SC-007**: A future engine spec's author (E10-E17) can answer, from this spec alone and without a
  follow-up question: how their engine's work becomes an `ExecutionUnit`, how it integrates with
  F07's checkpoint contract, how it writes Evidence/Artifacts, how its progress reaches the UI, how
  it is retried/cancelled/killed, and what it must declare before proceeding to its own
  `/speckit-tasks` — verified by the Independent Test framing of User Stories 1-2 taken together.

## Assumptions

- F01 (`specs/007-foundation-target-authorization-scope/`) and F07
  (`specs/008-safety-killswitch-budget-audit/`) are frozen and are consumed, not redesigned, by
  this spec — no change to either's entities, contracts, or ceiling values is proposed here. The
  one amendment this spec records against 006 itself (not F01/F07) is the Evidence many-to-many
  correction (Clarifications) and the `ExecutionUnit`-is-not-`CapabilityExecution` correction
  (Clarifications) — both corrections to 006's own explicitly-illustrative, non-final sketches, not
  contradictions of a frozen decision.
- This spec's current-state baseline (`docs/reviews/scan-audit-2026-10-07/`, plus this session's
  own direct reads of `apps/api/prisma/schema.prisma`, `packages/capability-sdk/src/contract.ts`,
  `apps/worker/src/orchestrator/orchestrator.ts`, `apps/worker/src/workspace/teardown.ts`,
  `apps/api/src/services/storage/{uploads,retention}.ts`) is treated as settled, not re-derived a
  second time in `research.md`, the same posture 006/F01/F07 each took toward their own baselines.
- No Prisma migration is run by this planning pass. `data-model.md`'s field lists are the real,
  intended schema (matching F01's and F07's own posture, not 006's own deliberately-illustrative
  one) — the actual `schema.prisma` edit is implementation work for whichever future session runs
  `/speckit-implement` against this spec, which this planning pass does not do.
- The specific business-facing names and numeric values for `ScanProfile`s, queue concurrency,
  timeout constants, and artifact size budgets are each a future engine/implementation decision
  this spec deliberately does not invent (master-prompt §8's own "do not invent business-facing
  profile names" instruction, generalized) — this spec establishes the *mechanism* each needs, not
  the specific product-facing number or name.
- "Tenant" means an individual `User` account, identical to F01's own confirmed assumption (no
  organization/workspace layer exists in the schema) — this spec does not invent a speculative hook
  for one.
