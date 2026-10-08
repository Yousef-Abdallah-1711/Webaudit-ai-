# Feature Specification: Fahes Scan Platform Architecture v2

**Feature Branch**: `006-scan-architecture-v2`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Fahes Scan Platform Architecture v2 — a master architecture /
spec-of-specs for the next-generation scanning platform. This spec is a parent architecture
contract, not a feature to implement itself; it defines WHAT the future platform must support and
WHY, and will be refined by future dependent child specs covering individual execution engines and
product domains." (full current-state evidence and requirement detail supplied in the triggering
conversation; current-state claims are drawn from the prior read-only audit at
`docs/reviews/scan-audit-2026-10-07/`, treated here as settled fact, not re-derived.)

**A note on template fit**: this is a master architecture / spec-of-specs, not an end-user-facing
product feature. Its "users" are the engineers and future SpecKit specs that will consume this
contract, and its "stakeholders" are Fahes's product and engineering leadership who need to trust
the roadmap before committing implementation time to any one child spec. Success criteria below
are therefore framed as planning-artifact outcomes (completeness, evidence, decomposition
correctness) rather than end-user product metrics — this follows directly from the triggering
instruction's own explicit allowance that "this spec is allowed to describe a target architecture
that is NOT fully implemented by this spec itself."

## Clarifications

### Session 2026-10-07

- Q: Should the six-level placeholder authorization taxonomy (passive, browser-interactive,
  authenticated, active-security, load, high-impact-staging-only) stand as the working model for
  future child specs, or does the product already have a different mental model for these tiers?
  → A: Accept the placeholder taxonomy as the working model; a future Foundation child spec may
  still refine it with evidence/justification, but it is no longer blocked on product confirmation.
- Q: Must the current production `/scan` flow remain fully operational with zero behavior change
  throughout the entire v2 rollout (strict parallel-run, no cutover window), or is a planned,
  communicated cutover window acceptable for parts of the migration? → A: Strict parallel-run, no
  cutover window, ever. Every child spec ships as additive capability behind its own gating; none
  may ship as a replacing migration with a cutover window.
- Q: Should variable/metered pricing be designed as a general capability any future execution
  class can opt into, or reserved narrowly for the genuinely open-ended classes (load/capacity,
  untrusted source execution)? → A: Narrow. Only `LOAD_CAPACITY` and `SOURCE_EXECUTION` execution
  classes get duration/resource-metered pricing; every other current and future execution class
  stays flat-priced per domain, consistent with today's model.
- Q: Should large future evidence artifacts (screenshots, video, browser traces, HAR files)
  default to the same retention policy as today's report data, or does storage-cost/compliance
  reasoning require a shorter default? → A: Same retention policy and timing as today's report
  data; no separate artifact-specific retention tier by default.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Classify an existing subsystem before touching it (Priority: P1)

A platform architect, about to write a child spec for a new scanning capability, needs to know
whether an existing Fahes subsystem (the BullMQ queue skeleton, the credit ledger, the readiness
engine, the capability-SDK contract, the sandbox-runner, the AI-layer assembly) can be reused
as-is, needs extension, or must be replaced by something new — with the repository evidence that
justifies the classification, not an assumption.

**Why this priority**: every other planning activity depends on this. Without a trustworthy
reuse/extend/new classification, every child spec either reinvents a working subsystem or wrongly
assumes an unsuitable one will stretch to fit, and the audit that exists today
(`docs/reviews/scan-audit-2026-10-07/`) already shows how differently five nominally similar
subsystems (queue, credits, readiness, capability contract, sandbox) actually need to be treated.

**Independent Test**: can be fully tested by picking any subsystem named in the Reuse/Extend/New
matrix (see `TARGET_CAPABILITY_GAP_MATRIX.md`-derived content in this spec's plan) and confirming
the classification traces to a specific file and symbol in the current repository, not to a
general architectural preference.

**Acceptance Scenarios**:

1. **Given** a platform architect is planning a child spec for authenticated security testing,
   **When** they consult this architecture's Reuse/Extend/New classification for "the existing
   capability sandbox," **Then** they find it classified NEW SYSTEM (not reuse) with the specific
   reason (the existing sandbox's threat model is "trusted Fahes code against untrusted data," not
   "untrusted customer code execution") and the file evidence behind that reason.
2. **Given** a platform architect is planning a child spec for a new performance sub-check,
   **When** they consult this architecture's execution-class model, **Then** they find that
   performance sub-checks that need real rendering depend on the Browser/Probe Engine's readiness
   status, not on a new per-domain browser implementation.

---

### User Story 2 - Route a new testing requirement to the right engine and safety tier (Priority: P2)

A platform architect, told the product wants to eventually support a specific new kind of testing
(e.g. authenticated IDOR testing, or load testing against a customer's staging environment), needs
to determine which execution class it belongs to, which constitutional safety principles (X, XI,
XII) it must satisfy, and which existing or not-yet-created child spec owns it.

**Why this priority**: this is the mechanism that prevents the platform from quietly acquiring an
unsafe capability (e.g. a well-intentioned "SSRF checker" child spec that accidentally becomes an
unauthorized active-testing tool) by routing every new capability request through an explicit
execution-class and authorization-tier decision before any implementation work starts.

**Independent Test**: can be fully tested by taking any item from the "current product vision"
testing list in the triggering instruction (SQL injection, IDOR, load testing, authenticated
workflows, etc.) and confirming this spec's execution-class model assigns it to exactly one
execution class with a stated authorization tier and safety-model prerequisite.

**Acceptance Scenarios**:

1. **Given** a request to eventually test for SQL injection against a customer's own application,
   **When** routed through this spec's execution-class model, **Then** it resolves to the Active
   Security execution class, which this spec marks as requiring a dedicated safety/authorization
   child spec (Foundation Spec 07, Safety/Kill Switch/Audit Trail, and Foundation Spec 01,
   Target/Environment/Authorization/Scope) to exist and be implemented *before* any Active Security
   engine child spec may proceed to `/speckit-plan`, per Constitution Principle XIV.
2. **Given** a request to eventually run a load test against a customer's staging environment,
   **When** routed through this spec's execution-class model, **Then** it resolves to the Load/
   Capacity execution class, explicitly distinguished from the existing internal-only k6 harness,
   and is flagged as requiring both the safety/authorization foundation and its own dedicated
   engine child spec — never as an extension of the existing internal load-testing scripts.

---

### User Story 3 - Determine what to plan next without re-deriving the platform (Priority: P3)

An engineering lead, returning to this project after this master architecture spec is complete,
needs to know which future child spec to plan next, what it depends on, and what it must not take
on itself — without re-reading the entire current codebase or re-having the same architectural
debate a second time.

**Why this priority**: this is the spec's stated success condition from the triggering
instruction — "a trustworthy architecture contract that allows future chats to create individual
SpecKit specs without reinventing the platform architecture every time." It is lower priority than
P1/P2 only because it is a *consequence* of getting the domain model and execution-class model
right, not an independent requirement.

**Independent Test**: can be fully tested by handing the spec-of-specs roadmap (produced in this
feature's `plan.md`) to a reader with no other context and confirming they can name the correct
next child spec and its prerequisites without consulting the current codebase.

**Acceptance Scenarios**:

1. **Given** this master architecture spec is complete, **When** an engineering lead asks "what do
   we plan next," **Then** the roadmap names exactly one recommended next child spec, its
   prerequisites (all satisfied or explicitly not), and why it precedes every other listed spec.

### Edge Cases

- What happens when a future child spec discovers that an assumption this master spec made about
  the current architecture is wrong (e.g. a "REUSE" classification turns out to be insufficient
  once the child spec is planned in detail)? -> The child spec MUST surface this back to this
  master spec as a proposed amendment rather than silently diverging from it (see Governance
  implications in `plan.md`); this master spec is a living parent contract, not a one-time snapshot.
- What happens when two future product domains need the same execution engine but with apparently
  conflicting requirements (e.g. Performance and Accessibility both need the Browser/Probe Engine,
  but at different concurrency/timeout profiles)? -> The engine's own child spec owns resolving
  that conflict (e.g. via per-caller configuration), not either domain spec individually; domains
  consume the engine's published contract and MUST NOT negotiate a private variant of it
  (Constitution Principle VIII).
- What happens when a concrete architectural question (e.g. the exact authorization-level
  taxonomy, or the untrusted-execution isolation mechanism) cannot be resolved from repository
  evidence and has no safe default? -> It is recorded explicitly as `PRODUCT DECISION REQUIRED` or
  `UNKNOWN - REQUIRES INVESTIGATION` in this spec's Assumptions/Open Decisions, never silently
  decided by this spec's author.
- What happens if a child spec's execution class does not cleanly match any of the nine
  placeholder execution classes this spec proposes? -> The child spec MAY propose a refined or
  additional execution class, justified by evidence, as an amendment to this master spec — the
  nine classes are explicitly placeholders per the triggering instruction, not a closed set.

## Requirements *(mandatory)*

### Functional Requirements — Core Domain Model

- **FR-001**: The architecture MUST define **Target** as the identity of a thing Fahes is
  authorized to inspect, sourced from one of: a website URL, a connected repository, an uploaded
  archive, or (future) an API target — consistent with and extending the existing `Target`/
  `InputType` model (`URL | REPOSITORY | ARCHIVE` today) rather than replacing it.
- **FR-002**: The architecture MUST define **Environment** as an explicit classification of a
  Target (at minimum: production, staging, development/test) that is informational and scoping
  only — Environment classification MUST NEVER, by itself, grant or imply any testing permission
  beyond what Authorization (FR-004) separately and explicitly grants, per Constitution
  Principle X.
- **FR-003**: The architecture MUST define **Ownership Verification** as the existing-and-extended
  concept of proving a user controls a Target (building on the current `ControlLevel`
  (`NONE/ATTESTED/VERIFIED`) and `TargetVerification` model), and MUST keep it conceptually and
  architecturally distinct from Authorization (FR-004) — Ownership Verification answers "does this
  user control this target," never "is this user allowed to run this category of test against it."
- **FR-004**: The architecture MUST define **Authorization** as explicit, separately-granted
  permission to execute one or more categories of testing against a Target, modeled at conceptual
  levels — **accepted as the working model per Clarifications 2026-10-07**: passive,
  browser-interactive, authenticated, active-security, load, high-impact-staging-only. Each level
  MUST be independently grantable (granting "browser-interactive" does not imply "active-security").
  A future Foundation child spec MAY still refine this taxonomy with repository or product
  evidence, but is not blocked on further product confirmation to proceed with it as a starting
  point.
- **FR-005**: The architecture MUST define **Scope** as a description of what is included and
  excluded for a given Authorization grant: domains, subdomains, specific URLs/route patterns,
  APIs, repositories and branches/commits, accounts, roles, and specific actions. Scope MUST be
  enforceable at execution time, not merely descriptive.
- **FR-006**: The architecture MUST define **Scan Profile** as a reusable, named configuration of
  what kind of scan is requested (placeholders: quick, standard/full, production-readiness,
  frontend-QA, security, authenticated-application, load/capacity, custom), decoupled from the
  specific domains/engines it happens to invoke so that profiles can be extended without redefining
  every domain's selection logic.
- **FR-007**: The architecture MUST define **Scan Plan / Execution Plan** as the resolved,
  immutable execution graph produced by combining a Target, its Authorization, its Scope, a Scan
  Profile, explicit domain selection, and any advanced configuration — this plan, once resolved,
  MUST define exactly what will run, analogous to the existing `Scan.capabilitySnapshot`'s
  "resolved once at scan start and held for the scan's duration" guarantee (R10), extended to cover
  engine selection and authorization/scope resolution, not only capability selection.

### Functional Requirements — Execution Classes

- **FR-008**: The architecture MUST define a set of execution classes, each a distinct trust
  boundary and runtime shape. The following are the evidence-derived placeholder set (any class
  MAY be refined, split, or renamed by a future child spec with justification, per the Edge Cases
  above): `PASSIVE_HTTP` (the existing model — a guarded fetch against one target, no browser, no
  execution of customer code), `BROWSER` (rendering-dependent measurement via a real browser page),
  `CRAWLER` (multi-page discovery and traversal, which does not exist in any form today),
  `SOURCE_STATIC` (read-only analysis of attached source, today's regex/manifest-level depth),
  `SOURCE_EXECUTION` (actually running the customer's own install/build/lint/test — architecturally
  forbidden from the existing trusted-capability sandbox per Constitution Principle XI),
  `ACTIVE_SECURITY` (sending adversarial payloads to a target — requires the safety/authorization
  model of Constitution Principle X before any capability may be implemented), `AUTHENTICATED_
  WORKFLOW` (multi-step, session-bound, role-aware testing), `LOAD_CAPACITY` (generating load
  against a target — architecturally distinct from today's internal-only k6 harness), and
  `TELEMETRY` (ingesting customer-side observability data Fahes cannot itself produce externally).
- **FR-009**: For each execution class, the architecture MUST define (at the class level, not
  per-capability): purpose, trust boundary, input shape, output shape, statefulness
  (stateless/stateful), expected duration range, isolation requirement, network requirement,
  credential requirement, required Authorization level (FR-004), permitted Environment
  classifications, queue/runtime placement, evidence types it can produce, cancellation behavior,
  and reverify implications — this is the per-class instantiation of Constitution Principle XIV's
  per-capability contract requirement.
- **FR-010**: `PASSIVE_HTTP` MUST be recognized as already implemented and requiring no new
  execution-class infrastructure; it is the baseline against which every other class's additional
  requirements (isolation, authorization, duration) are stated as deltas.

### Functional Requirements — Shared Platform Contracts

- **FR-011**: The architecture MUST define, as a contract boundary (not an implementation), each
  of: target identity, environment, ownership, authorization, scope, scan profile, execution plan,
  execution unit, progress event, cancellation signal, finding, evidence, artifact, fingerprint,
  severity, issue lifecycle state, cost/metering record, retention policy, credential binding,
  session binding, observability event, and audit-trail entry. Each contract MUST state which
  existing Fahes concept it extends (if any) and which is wholly new.
- **FR-012**: Every execution engine (FR-013) and every product domain (FR-014) MUST consume these
  shared contracts rather than defining a parallel, engine-specific or domain-specific version of
  the same concept, per Constitution Principle VIII.

### Functional Requirements — Future Execution Engines

- **FR-013**: The architecture MUST account for the following engines, each mapped to the
  execution class(es) it implements, with current-state status and what must be newly built:
  (a) **Passive HTTP Engine** — implemented today, reusable as-is;
  (b) **Browser/Probe Engine** — partially built as an unwired library (`apps/probe-pool`); the
  highest-leverage near-term investment because several capabilities already written against
  `ctx.withPage` activate the moment this engine is deployed as a real cross-process service, with
  no new capability code required;
  (c) **Crawler Engine** — does not exist in any form; needed for multi-page audits, site topology,
  full SEO coverage, and broken-link graphs beyond today's single-page-plus-bounded-sample checks;
  (d) **Static Source Analysis Engine** — exists today only at regex/manifest-metric depth; a
  future AST/SAST-capable version is a new capability within this engine, not a new engine;
  (e) **Untrusted Source Execution Engine** — does not exist and MUST NOT be built by extending the
  existing trusted-capability sandbox (Constitution Principle XI); needed eventually for install/
  build/lint/typecheck/customer-test execution;
  (f) **Active Security Engine** — does not exist; needed for authorized injection/XSS/access-
  control/business-logic testing; requires the safety/authorization foundation (Constitution
  Principle X) before any capability is implemented;
  (g) **Authenticated Workflow Engine** — does not exist; needed for multi-account/role/session-
  aware, multi-step business-process testing;
  (h) **Load/Capacity Engine** — does not exist as a customer-facing capability; the existing k6
  harness is architecturally tied to Fahes's own internal auth/seed-user model and is not a
  starting point for this engine without a rewrite of its assumptions;
  (i) **Telemetry Integration Engine** — does not exist; needed for future customer-side APM/
  OpenTelemetry/Prometheus/RUM ingestion, explicitly distinguished from anything externally
  measurable without customer cooperation.
- **FR-014**: Product domains (Security, Performance, Frontend/UX, Accessibility, Functional/
  Workflow Testing, SEO/Search Visibility, Source/Code Quality, Production Readiness) MUST be
  defined as consumers of one or more engines (FR-013), never as owners of a private engine
  implementation. The architecture MUST show, for each domain, which engine(s) it depends on today
  and which it would depend on once each engine above is built (e.g. Performance depends on Passive
  HTTP today and would additionally depend on Browser/Probe once deployed; Security depends on
  Passive HTTP and Source Static today and would additionally depend on Active Security and
  Authenticated Workflow for deeper future coverage).

### Functional Requirements — Evidence, Findings, Issue Lifecycle

- **FR-015**: The architecture MUST define an evidence model capable of representing, at minimum:
  HTTP request/response transactions, source-code locations, screenshots, screenshot diffs, DOM
  evidence, accessibility-tree evidence, browser traces/HAR/video, load-test metrics (time-series,
  percentiles, throughput, error rate), security reproduction steps, code-flow/dependency evidence,
  and telemetry evidence — without collapsing all of these into one undifferentiated blob field.
  The architecture MUST propose whether this implies typed evidence envelopes, artifact references
  (for large binary evidence stored outside the primary database), versioned evidence schemas, or
  some combination, as an open design question for the Evidence/Findings/Artifacts foundation child
  spec to resolve in detail. **Per Clarifications 2026-10-07**: large artifacts (screenshots, video,
  browser traces, HAR files) default to the same retention policy and timing as today's report
  data — no separate, shorter artifact-specific retention tier by default — and this default MUST
  explicitly include closing the currently-open gap (`docs/reviews/scan-audit-2026-10-07/
  CURRENT_SCAN_INFRASTRUCTURE.md`) where staged ZIP uploads have no proven deletion call site; a
  new artifact store MUST NOT repeat that gap.
- **FR-016**: The architecture MUST preserve the existing fingerprint-based finding-identity
  mechanism as the one cross-engine identity scheme (Constitution Principle IX) — every engine,
  including every future one, MUST produce findings identifiable by a stable fingerprint computed
  the same way today's capabilities compute theirs (a deterministic hash over the capability's own
  declared `fingerprintParts`), so that readiness-regression detection and reverify continue to
  work across engines without per-engine special-casing. **What specific values an engine declares
  as its `fingerprintParts`** for a genuinely new evidence kind (e.g. which dimensions of a
  load-test result or a telemetry batch constitute "the same finding" across two runs) is an
  engine-specific design question that MUST be resolved by that engine's own child spec — this
  requirement binds the *mechanism* (use `fingerprintParts`-based hashing, not a new identity
  scheme), not the specific parts any one future engine chooses.
- **FR-017**: The architecture MUST evaluate the issue lifecycle's future needs beyond today's five
  states (`OPEN/ASSERTED_FIXED/RESOLVED/UNVERIFIABLE/REOPENED`): false positive, accepted risk,
  waived, suppressed, duplicate, cannot-reproduce. This evaluation MUST be recorded as a future
  architecture requirement for the Evidence/Findings foundation child spec to design in detail; it
  MUST NOT be implemented or have the current production `IssueState` enum changed by this spec.

### Functional Requirements — Reverify, Readiness, Cost, Progress, Cancellation, Observability

- **FR-018**: The architecture MUST define reverify classes beyond today's single-HTTP-check,
  30-second, stateless, no-reattached-source model: at minimum, a browser-check class, a
  source-check class (needing a reattached source workspace), a workflow-scenario class
  (multi-step, session-bound), a security-test class, and a load-scenario class. Each MUST specify
  whether it fits the existing single-capability-dispatch pattern (`resolveReverifyCapability` +
  call one `reverify()`) or needs new dispatch plumbing, and MUST preserve the valuable
  targeted-single-finding concept (never re-running a full module or full scan to confirm one
  issue) wherever the execution class allows it.
- **FR-019**: The architecture MUST keep the readiness engine consuming normalized per-domain
  outcomes (score, threshold, pass/fail, named regressions) rather than hardwiring any engine's
  implementation details into the readiness diff/verdict logic, preserving today's genuinely
  open-ended fingerprint-based "new blocker" detection (Constitution Principle IX) as new domains
  and engines are added.
- **FR-020**: The architecture MUST define a cost/resource model that extends — not replaces — the
  existing credit ledger (debit/refund against locked lots) and its currently-unused-for-pricing
  per-execution cost-metering field (`CapabilityExecution.costMicros`). **Per Clarifications
  2026-10-07, metered pricing scope is narrow**: only the `LOAD_CAPACITY` and `SOURCE_EXECUTION`
  execution classes (FR-008) are variable/metered-priced (duration, concurrency, generated load,
  or compute-time scaled); every other execution class — including every new engine built on
  `PASSIVE_HTTP`, `BROWSER`, `CRAWLER`, `SOURCE_STATIC`, `ACTIVE_SECURITY`, `AUTHENTICATED_
  WORKFLOW`, and `TELEMETRY` — MUST remain flat-priced per domain/profile, consistent with today's
  five-domain model. A future child spec MAY revisit this narrow scope only with new evidence that
  a specific flat-priced class has become genuinely cost-unbounded.
- **FR-021**: The architecture MUST define a progress model usable for scans lasting from seconds
  to hours, structured as a hierarchy (placeholder: Scan -> Domain -> Engine -> Execution -> Step),
  with states derived from what the current `ScanState`/`ModuleState` enums already distinguish
  (queued, running, degraded, failed, not-applicable, completed) rather than invented independently,
  extended only where a new execution class genuinely needs a state the current enums cannot
  express (e.g. a "waiting on human/external input" state analogous to today's
  `AWAITING_QUESTIONNAIRE`, generalized for a future authenticated-workflow class that might need
  the same pattern).
- **FR-022**: The architecture MUST define three distinct stop mechanisms: user cancellation (today's
  model — blocks future phases, refunds undelivered work, does not forcibly interrupt in-flight
  work), a platform emergency stop (an operator-initiated halt of a specific execution, broader in
  authority than user cancellation), and a target-safety kill switch (specific to active/adversarial
  execution classes, triggered by a safety condition against the target itself, e.g. unexpected
  target instability). Each MUST specify what it actually stops: queued work, an open browser
  session, an in-flight active-security probe, generated load, or a running untrusted-code
  execution — today's cancellation model only proves the first of these.
- **FR-023**: The architecture MUST define observability requirements per execution engine:
  execution duration, queue wait time, resource usage, failure/retry counts, cancellation events,
  cost, target-safe request counts (for active classes), concurrency/rate observed, and engine
  health — explicitly without exposing customer secrets, credentials, or raw payloads in
  observability data.

### Functional Requirements — Evidence Safety (found during independent review, 2026-10-07)

- **FR-027**: Evidence produced by `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, or
  `SOURCE_EXECUTION` execution classes MUST be passed through the existing redaction mechanism
  (`@webaudit/redaction`, today wired only to AI-prompt assembly) before being stored or displayed
  in any report — a successful injection test or an authenticated workflow test can itself
  exfiltrate or surface real customer secrets, credentials, or PII (e.g. a successful SQL
  injection returning user records), and that content becoming visible in a report is a data
  exposure incident, not merely an evidence-quality question. This extends the existing platform
  guarantee ("Secrets MUST NOT enter LLM context... scanned code and markup MUST be redacted")
  to evidence storage generally, not only to AI prompt assembly. The owning Evidence/Findings/
  Artifacts foundation spec (F03) MUST design this redaction pass as part of the typed `Evidence`
  envelope, not as an optional per-engine afterthought.
- **FR-028**: Every `Artifact` (FR-015) MUST have an explicit per-object size budget and a
  per-scan total-artifact-size budget, enforced at write time — not only a retention *duration*
  policy. This closes a gap the original FR-015/Clarifications wording did not address: retention
  timing controls how long storage is consumed, not how much storage a single scan or execution
  can consume before being refused or truncated. The specific budget numbers are a future child
  spec's decision (F03); this requirement only establishes that a budget MUST exist.

### Functional Requirements — Migration & Backward Compatibility

- **FR-024**: **Per Clarifications 2026-10-07**, the current production `/scan` flow (Target ->
  Scan -> Phase -> Capability -> Finding -> Report, as it exists today) MUST remain fully
  operational with zero behavior change throughout the entire v2 rollout. Strict parallel-run is
  required: no child spec may ship as a replacing migration with a cutover window, **and this
  explicitly includes a pricing change, a database schema migration, a capability-SDK contract
  change, or a UI change — "cutover window" means any coordinated, time-boxed switch of existing
  behavior, regardless of which layer it touches, not only a wholesale platform replacement.**
  Every child spec MUST ship its capability as additive, behind its own gating (a new
  `ModuleType`, a new execution class, a new optional field), such that a scan that selects none of
  the new capability behaves identically to today's platform.
- **FR-025**: Any child spec that proposes extending a shared concept the current production flow
  already depends on (the `ModuleType` enum, the credit pricing function, the readiness threshold
  table, the capability discovery/trust model) MUST demonstrate that the extension is additive —
  existing enum members, existing prices, existing thresholds, and existing capability behavior
  are unchanged — before that child spec may proceed past its own `/speckit-plan`.
- **FR-026**: Where a future execution class or engine requires a genuinely incompatible change to
  an existing shared contract (and FR-025's additive test cannot be met), the architecture MUST
  require an explicit compatibility-adapter layer be designed in that child spec's own plan,
  translating between the current and future shape, rather than a flag-day replacement — per the
  triggering instruction's explicit migration-strategy requirement.

### Key Entities

Each entity below is marked NEW, EXTENSION OF EXISTING (naming the existing entity/field it
extends), or NOT YET JUSTIFIED (named only because the triggering instruction suggested it, with no
current evidence it is needed independent of an entity already listed) — definitive data modeling
is deferred to this feature's `plan.md` and ultimately to the Foundation child specs.

- **Target**: EXTENSION OF EXISTING (`Target` model). Adds no new fields by itself; Environment and
  Authorization (below) attach to it.
- **TargetEnvironment**: NEW. Records a Target's environment classification (production/staging/
  development) separately from `ControlLevel`, so environment and ownership-verification can vary
  independently.
- **TargetAuthorization**: NEW. Records an explicit, separately-granted permission (one of the
  conceptual levels in FR-004) for a Target, distinct from `TargetVerification`.
- **ScopeDefinition**: NEW. Records included/excluded domains/routes/accounts/actions for a given
  TargetAuthorization grant.
- **ScanProfile**: NEW. A named, reusable scan-configuration template, decoupled from the specific
  domain/engine selection it resolves to.
- **ScanPlan** (Execution Plan): NEW, conceptually extends `Scan.capabilitySnapshot`'s "resolved
  once, held for scan duration" guarantee to cover engine/authorization/scope resolution.
- **Execution** / **ExecutionStep**: EXTENSION OF EXISTING (`CapabilityExecution`), generalized to
  represent one engine invocation rather than assuming it is always a vendored capability call.
- **CredentialBinding**: NEW. Represents a scoped, time-limited credential made available to a
  specific Execution for a specific Target (needed for Authenticated Workflow and any future
  authenticated scanning), distinct from the existing GitHub OAuth token vault, which is a
  platform-integration credential, not a target-testing credential.
- **SessionBinding**: NEW. Represents an isolated, per-scan/per-tenant authenticated session state
  (cookies, tokens) used by an Authenticated Workflow execution — MUST NOT be reused across scans or
  tenants, per the constitution amendment's new Security requirements.
- **Evidence**: NEW at the generalized level (extends the existing `Issue.evidence: Json?` field's
  intent but needs typed structure per FR-015) — exact shape deferred to the Evidence/Findings
  foundation child spec.
- **Artifact**: NEW. A reference to large, externally-stored evidence (screenshot, video, HAR,
  trace) distinct from the inline `evidence` JSON blob — needed once any Browser-class or Load-
  class engine exists.
- **ResourceUsage**: EXTENSION OF EXISTING (`CapabilityExecution.costMicros`, `AiInvocation`'s
  token/latency/cost fields), generalized to cover non-AI compute (browser-minutes, generated load,
  storage).
- **SafetyEvent** / **ExecutionAuditEvent**: NEW. Distinct from the existing `AuditLogEntry` (which
  records *operator* actions in the admin console) — records actions a *scan execution* took
  against a *third-party target*, required by Constitution Principle X for every active execution
  class.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every execution path `/scan` supports today (URL, repository, archive intake; the
  five current product domains; readiness; reverify) is classified as REUSE, EXTEND, or NEW SYSTEM
  in this feature's `plan.md`, each classification citing a specific file and symbol from the
  current repository — zero unclassified or evidence-free classifications remain.
- **SC-002**: Every execution class defined in FR-008 declares all ten contract fields required by
  Constitution Principle XIV (execution class, inputs, outputs, authorization level, environment
  restrictions, resource budget, timeout/retry/cancellation semantics, evidence schema, cost model,
  reverify strategy, retention requirements, observability requirements) — a class missing any
  field is incomplete and blocks this spec's readiness for `/speckit-plan` sign-off on that class.
- **SC-003**: The spec-of-specs roadmap (produced in `plan.md`) names every future child spec with
  explicit prerequisites and dependencies, such that a reader with no other context can determine a
  valid implementation order without consulting the current codebase — verified by the Independent
  Test in User Story 3.
- **SC-004**: This spec, and its companion `plan.md`/`tasks.md`, produce zero changes to current
  production scan behavior, current API contracts, current database schema, or current pricing —
  verified by `git diff` against application source directories at the close of this planning pass
  showing no changes outside `.specify/`, `specs/006-scan-architecture-v2/`, and (if separately
  authorized) `docs/`. This is a standing commitment per FR-024's strict-parallel-run clarification,
  not only a fact about this planning pass: every future child spec's own plan MUST be checked
  against the same zero-regression bar before it proceeds to `/speckit-tasks`.
- **SC-005**: Every architectural question that cannot be resolved from repository evidence and has
  no safe conservative default is recorded explicitly as `PRODUCT DECISION REQUIRED` or `UNKNOWN -
  REQUIRES INVESTIGATION` in this feature's Clarifications/Open Decisions — zero such questions are
  silently resolved by assumption and presented as settled.

## Assumptions

- The prior read-only audit at `docs/reviews/scan-audit-2026-10-07/` is accurate as of 2026-10-07
  and is treated as the settled current-state evidentiary baseline for this spec; this spec does
  not re-verify every claim in that audit against source a second time, though `plan.md` spot-checks
  claims material to specific architecture decisions.
- "Users" and "stakeholders" for this spec's template-mandated User Scenarios/Success Criteria
  sections are internal: future spec authors, platform architects, and engineering leadership —
  not Fahes's external customers. This is a deliberate, evidence-grounded departure from the
  spec-template's default assumption of an end-user-facing feature, consistent with the triggering
  instruction's explicit framing of this as a "master architecture / spec-of-specs."
- The nine execution classes in FR-008 and nine engines in FR-013 are placeholders, explicitly
  open to refinement by future child specs with justification, not a final closed taxonomy.
- No current production code, schema, API, or pricing is modified as a result of this spec, its
  plan, or its tasks — this is a planning-and-contract artifact only, per the triggering
  instruction's explicit non-goals.
- Where this spec states a current-architecture fact (e.g. "the browser pool is unwired," "the
  k6 harness is internal-only," "the sandbox never executes customer code"), that fact is treated
  as PROVEN per the companion audit's file-and-line evidence, not re-flagged as an open question
  here — open questions in this spec are reserved for genuinely undecided *future* architecture,
  not re-litigated *current*-state facts.
