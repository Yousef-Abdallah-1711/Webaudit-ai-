<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 -> 1.2.0  (2026-10-07)
Bump rationale: MINOR. Seven new principles (VIII-XIV) added to govern the next-generation
  scanning platform ("Fahes Scan Platform Architecture v2") and its future child specs. No
  existing principle was removed or redefined in a way that makes previously compliant code
  non-compliant; the new principles extend III (Deterministic Before Probabilistic) and V
  (Untrusted Code Runs Isolated) explicitly rather than contradicting them, and the existing
  "Security requirements" bullet list under Technology and Security Constraints gained five
  bullets rather than being replaced (a fifth, evidence-redaction bullet was added during this
  same amendment's independent-review pass, 2026-10-07, after the initial four — see below).

Added principles:
  VIII.  Engines Serve Domains, Domains Do Not Own Engines           (Architecture)
  IX.    Evidence Is Reproducible; Judgment Is Labeled                (Evidence - extends III)
  X.     Authorization Is Not Ownership                               (Safety)
  XI.    Untrusted Code Needs Its Own Isolation Boundary               (Customer code - extends V)
  XII.   Long-Running Work Declares Its Own Lifecycle                  (Long-running execution)
  XIII.  Tenant Boundaries Survive Every New Engine                    (Multi-tenancy)
  XIV.   Every Future Capability Declares Its Contract Before It Ships (Evolution)

Amended sections:
  Technology and Security Constraints -> "Security requirements" gained five bullets: credential
    lifecycle (not just encryption-at-rest), session isolation for future authenticated-scanning
    capabilities, explicit target authorization required before any active/adversarial execution
    class runs, environment (production/staging) must never be inferred from ownership
    verification alone, and (added during this amendment's own independent-review pass) evidence
    from an active/adversarial/authenticated execution class MUST be redacted through the same
    mechanism that protects AI prompt assembly before storage or display — found when the master
    architecture spec's own review asked "could a successful exploit's evidence itself leak a
    customer's secrets into a report," which nothing in the initial four bullets addressed.

Context: this bump was produced by a master-architecture planning pass (SpecKit Specify ->
  Clarify -> Plan -> Checklist -> Tasks -> Analyze, Implement and Converge intentionally not run)
  that establishes the parent architecture contract several future child specs will build on:
  new execution engines (browser/probe, crawler, static source analysis, untrusted source
  execution, active security, authenticated workflow, load/capacity, telemetry integration) and
  product domains (security, performance, frontend/UX, accessibility, functional testing, SEO,
  source quality, production readiness) that consume those engines rather than each owning one.

Deferred items requiring follow-up (new):
  TODO(ACTIVE_SECURITY_AUTHORIZATION_MODEL): Principle X requires authorization to be modeled
    as distinct from ownership verification, but the concrete authorization-level taxonomy
    (passive / browser / authenticated / active-security / load / high-impact-staging-only) and
    its data-model representation are a /speckit-specify decision for the Architecture v2 master
    spec and its "Target / Environment / Ownership / Authorization / Scope" foundation child spec,
    not a governance-level choice.
  TODO(UNTRUSTED_EXECUTION_MECHANISM): Principle XI mandates container/VM-grade isolation (or
    equivalent proven containment) for any future untrusted-code-execution engine, but does not
    choose the mechanism (gVisor, Firecracker, a managed container platform, etc.). That is a
    /speckit-plan decision for the dedicated Untrusted Source Execution Engine child spec.

--- Previous sync report below ---

Version change: 1.0.0 -> 1.1.0  (2026-08-23)
Bump rationale: MINOR. A new section ("Design Adherence") was added; no existing principle was
removed or redefined, so previously compliant code stays compliant.

Added: "Design Adherence" section, between the security constraints and the workflow gates.
  Forced by the arrival of an approved design system (vendored at design-system/) that carries
  its own machine-enforceable lint config. Six obligations: tokens via var() only; port components
  rather than rewrite them; never invent an undesigned surface; implement the measured responsive
  behaviour; serve fonts and icons locally; pass visual comparison before completion.

Propagation completed in the same change:
  - design-system/            vendored export (134 files, tokens/components/kits/guidelines)
  - design/screen-map.md      screen -> route -> task join table, plus a named gaps list
  - plan.md                   Technical Context, Project Structure, Constitution Check
  - tasks.md                  21 frontend tasks amended; T237-T247 appended
  - DESIGN.md                 reissued at v3.0 from the design system rather than the competitor
  - CLAUDE.md                 "UI work" section
  - quickstart.md             design-fidelity validation scenario

--- Original ratification below ---

Version change: (uninitialized template) -> 1.0.0
Bump rationale: Initial ratification. No prior versioned constitution existed; the file on disk
was the unmodified scaffold with every placeholder token intact.

Principles defined (all new; template slots were unnamed placeholders):
  PRINCIPLE_1 -> I. Skills Are Plugins; The Core Stays Closed
  PRINCIPLE_2 -> II. Vendored Forever, Never Fetched
  PRINCIPLE_3 -> III. Deterministic Before Probabilistic
  PRINCIPLE_4 -> IV. No Single Point of AI Failure
  PRINCIPLE_5 -> V. Untrusted Code Runs Isolated
  (added)     -> VI. Every Operation Carries a Metered, Reconciled Cost
  (added)     -> VII. Verify Narrowly, Rescan Rarely

  Expanded from the template's 5 slots to 7: the ratifying input enumerated seven distinct,
  independently testable commitments. Collapsing to 5 would have buried either the supply-chain
  rule (II) or the isolation rule (V) inside an unrelated principle.

Sections filled:
  SECTION_2 -> Technology and Security Constraints
  SECTION_3 -> Development Workflow and Quality Gates
  Governance -> populated

Sections removed: none.

Deferred items requiring follow-up:
  TODO(CREDIT_PRICE_TABLE): Principle VI fixes the properties of metering, but no authoritative
    per-operation credit price list exists. WebAuditAI_ARCHITECTURE.md supplies only scattered
    examples (80 credits for a full audit, 3 for a targeted re-verify, 50 on the free plan).
    Resolve via /speckit-specify before any billing feature is planned.
  TODO(PLAN_TIERS): Plans are referenced throughout the architecture (enabledForPlans, "Free
    plan") but tiers, limits, and entitlements are never enumerated. Resolve via /speckit-specify.
  TODO(SANDBOX_MECHANISM): Principle V mandates an isolation boundary with no known escape path
    and explicitly forbids vm2. WebAuditAI_ARCHITECTURE.md names vm2 as the sandbox. This
    constitution deliberately overrides that choice on security grounds. The replacement
    mechanism (isolated-vm, a hardened separate process, or a container per execution) is a
    /speckit-plan decision, not a governance one.
  TODO(DATA_MODEL): No persistence schema exists. db/schema.prisma is referenced by the
    architecture but never defined. Resolve via /speckit-specify then /speckit-plan.
-->

# WebAudit AI Constitution

## Core Principles

### I. Skills Are Plugins; The Core Stays Closed

Every audit capability MUST ship as a skill implementing the `AuditSkill` contract. Module,
orchestrator, and route code MUST NOT import a concrete skill, reference a skill by identifier, or
branch on which skills exist. Skills are reached only through `SkillsRegistry`.

- Adding, removing, updating, or disabling a skill MUST require zero edits to core code. A change
  that forces a core edit is a contract defect, not a skill.
- A skill declares its own `module`, `layer`, and input needs (`requiresCode`,
  `requiresScreenshot`). The core reads those declarations rather than encoding them.
- `canRun(input)` MUST gate execution. A skill whose preconditions are unmet MUST be skipped and
  reported as skipped, never executed speculatively and never treated as fatal.
- A single skill's failure MUST NOT fail its module or the scan. The module degrades and says so.
- Every skill MUST be testable in isolation from a fabricated `SkillInput`, with no live network.

Rationale: skills are this product's unit of growth. Coupling them to core code turns every new
capability into a regression risk spanning all five modules.

### II. Vendored Forever, Never Fetched

Every external skill MUST exist as a complete source copy under
`packages/skills-vendor/<skill>/`, carrying a `skill.manifest.json` that records `originalSource`,
`version`, `vendoredAt`, and `license`.

- Runtime code MUST NOT clone, fetch, install, or otherwise contact a third-party host to obtain
  skill code. Vendoring happens only at setup time, through the vendoring script, as a reviewed
  commit.
- Deletion, renaming, or hijacking of an upstream repository MUST have zero effect on a running
  audit. An automated test MUST assert that every registered skill resolves from local disk.
- Updating a vendored skill MUST bump its manifest version and record a changelog entry stating
  what changed upstream and why the update was accepted.
- During a scan, outbound network access MUST be limited to the audit target and the configured
  LLM and measurement providers.

Rationale: a paying customer must never receive a degraded audit because a stranger deleted a
repository, and must never receive a compromised one because a stranger moved a tag.

### III. Deterministic Before Probabilistic

Every module MUST complete its code layer before its AI layer begins, and the code layer MUST
consume zero LLM tokens.

- Code-layer skills return structured `Finding[]` and MUST NOT call an LLM.
- AI-layer skills receive code-layer output as structured context. They MUST NOT re-derive, guess
  at, or contradict a measured value.
- Anything measurable MUST be measured. The AI layer exists to explain, prioritize, and produce
  remediation guidance, not to invent observations it had no means to make.
- Every issue in a delivered report MUST either cite code-layer evidence or be explicitly labeled
  an AI judgment. Unattributed findings MUST NOT ship.

Rationale: measured facts are cheap, reproducible, and defensible when challenged. Inferred facts
cost tokens and put hallucinated findings into a report a customer will act on and may cite.

### IV. No Single Point of AI Failure

Every LLM call MUST route through `AIExecutor`. Direct provider SDK calls from module, skill,
route, or orchestrator code are forbidden.

- Each configured fallback chain MUST span at least two distinct vendors.
- Exhausting a chain MUST degrade that module to its code-layer findings and mark it `degraded`.
  It MUST NOT fail the entire scan, and MUST NOT silently drop findings.
- Every call MUST record provider, model, token counts, latency, cost, and outcome.
- Prompts and expected response schemas MUST be provider-agnostic. Responses are validated against
  the schema, never trusted because of which vendor returned them.

Rationale: a scan is a long, expensive, user-visible operation. One vendor's rate limit or outage
must not destroy work already paid for in credits and elapsed minutes.

### V. Untrusted Code Runs Isolated

Any skill that has not been vendored through code review is untrusted. Admin-uploaded skill bundles
are untrusted by definition.

- Untrusted code MUST NOT receive filesystem access, network access, environment variables, or
  process control, and MUST NOT share a heap with the API or worker process.
- Isolation MUST be enforced by a boundary with no known escape path. In-process JavaScript
  sandboxes with published sandbox-escape CVEs, `vm2` explicitly, MUST NOT be used.
- Every untrusted execution MUST be bounded by wall-clock and memory limits, and MUST be killable
  from outside.
- Contract conformance MUST be validated before first execution, and that validation MUST itself
  run inside the boundary.

Rationale: this product's entire proposition is telling customers their application is secure.
Arbitrary uploaded code sharing a process with provider credentials, GitHub tokens, and customer
source would make that claim indefensible.

### VI. Every Operation Carries a Metered, Reconciled Cost

Every operation that consumes provider spend or meaningful compute MUST have a declared credit
cost, MUST be checked before execution, and MUST be reconciled against actual cost afterward.

- Credits MUST be verified before work starts. Insufficient balance MUST fail fast and clearly,
  before any provider is billed.
- A user MUST NOT be charged for our failures. Infrastructure faults, exhausted fallback chains,
  and internal errors MUST refund or never debit.
- Actual provider cost MUST be recorded per operation and reconcilable against credits charged.
  Margin MUST be observable per scan, per module, and per skill.
- A skill MUST declare `estimatedTokens`. A skill whose real consumption persistently exceeds its
  estimate MUST be corrected or disabled, not silently absorbed.

Rationale: unmetered AI spend is how this class of product dies. Cost must be attributable to the
exact skill that caused it, or unprofitable capabilities stay invisible until they matter.

### VII. Verify Narrowly, Rescan Rarely

When a user asserts a fix, the system MUST re-run the narrowest check that can confirm or refute
that specific issue.

- A targeted re-verification MUST NOT trigger a full audit, and MUST be priced to reflect the work
  actually performed.
- Verification MUST be objective. An issue turns green only when a check passes, never because a
  user marked it fixed.
- A re-verification MUST return the failing evidence when the issue persists, not merely a negative
  verdict.
- Full re-audits are reserved for the deliberate production-readiness pass, which MUST also detect
  regressions against the prior scan.

Rationale: the product's value is the walk from red to green. If confirming one header costs a full
audit's credits and minutes, users stop walking.

### VIII. Engines Serve Domains, Domains Do Not Own Engines

A future scanning platform MUST separate **execution engines** (the mechanism that produces
measurements — e.g. a browser/probe engine, a crawler, a static-source-analysis engine, an
active-security engine) from **product domains** (Security, Performance, Frontend/UX,
Accessibility, Functional Testing, SEO, Source Quality, Production Readiness), which consume one
or more engines' output.

- A domain MUST NOT implement its own private copy of an engine another domain already needs. A
  browser/probe engine MUST be built once and consumed by every domain that needs rendered-page
  measurement (Performance, Frontend, Accessibility, SEO, Testing, Security alike), never
  reimplemented per domain.
- A new capability category MUST reuse an existing shared contract (capability discovery, finding
  shape, fingerprint identity, credit metering, reverify dispatch) before inventing a parallel one.
  A parallel contract requires a documented reason an existing one cannot serve.
- Rewriting a working subsystem (the BullMQ queue skeleton, the credit ledger, the readiness
  diff/verdict engine, the capability-SDK contract) MUST be justified by repository evidence that
  extension is insufficient, not by preference. Migration and incremental extension are the
  default; rewrite is the exception and MUST be argued for explicitly.
- Standing up a new deployable service MUST be justified by a genuine isolation or scaling need
  (e.g. untrusted code execution needs container/VM isolation no in-process library can provide).
  Services MUST NOT be split merely to mirror an org chart or a specific future roadmap item.

Rationale: the current platform's five vendored modules already show the failure mode this
principle exists to prevent — several domains independently reimplement small pieces of
browser-dependent measurement rather than sharing one engine, and the browser engine itself
(`apps/probe-pool`) exists as an unwired library specifically because no shared, deployed version
of it was ever built. A platform that lets every domain own its own engine recreates that gap at
every future layer instead of fixing it once.

### IX. Evidence Is Reproducible; Judgment Is Labeled

This extends Principle III (Deterministic Before Probabilistic); it does not relax it. Every
deterministic finding, from any execution engine, MUST carry evidence sufficient for a second run
of the same check to reproduce the same verdict against an unchanged target.

- Every finding MUST carry a stable finding-identity (fingerprint), computed by the capability or
  engine that produced it, that survives re-auditing. This is the single cross-engine identity
  mechanism reverify and readiness-regression detection both depend on; a new engine MUST NOT
  invent a second identity scheme.
- Evidence MUST be attributable to either a deterministic measurement or an explicit AI judgment,
  per Principle III's attribution rule — a new execution engine MUST NOT blur this distinction by
  letting an engine or a capability declare its own attribution.
- Where a finding's certainty is not binary (e.g. a heuristic threshold, a sampled check, a
  judgment call under Principle III's AI layer), the evidence MUST carry an explicit
  confidence/measurement-state field rather than presenting a heuristic result with the same
  apparent certainty as a direct measurement.
- No execution engine MAY fabricate a measurement it did not actually take. An engine that cannot
  measure something (e.g. Core Web Vitals with no browser pool configured) MUST report that
  absence explicitly (`NOT_APPLICABLE`/`DEGRADED`/an equivalent state), never a placeholder value.

Rationale: readiness regression detection and targeted reverify both work today because finding
identity is stable and because the report never asks a reader to guess whether a number was
measured or inferred. Every future engine inherits that trust only if it inherits this discipline.

### X. Authorization Is Not Ownership

Proving control of a target (ownership/control verification) and being authorized to run
active or destructive tests against it are two distinct concepts and MUST NEVER be collapsed into
one.

- Ownership verification MUST continue to answer only "does this user control this target." It
  MUST NOT, by itself, unlock any execution class beyond today's passive/measurement-only testing.
- Running any active, adversarial, or potentially disruptive execution class (injection testing,
  authenticated workflow testing, load/capacity generation, or any future class so classified)
  MUST require an explicit, separately-granted authorization distinct from ownership verification.
- Production and staging (or any other environment classification) MUST be explicitly and
  verifiably distinguishable before an active execution class is permitted to run, and destructive
  capability MUST NEVER be inferred from environment alone (a target classified "staging" is not,
  by that classification alone, cleared for every execution class).
- Every active execution class MUST have an explicit scope (included/excluded domains,
  subdomains, routes, accounts, actions), explicit request/concurrency/duration budgets, a working
  emergency stop reachable independent of the normal cancellation path, and an audit trail of what
  was attempted against the target and when.
- Outbound requests made during active testing MUST continue to honor the same SSRF, DNS-rebinding,
  and redirect-revalidation protections the platform already enforces for passive fetches, plus an
  explicit target-allowlist check specific to the granted authorization and scope.

Rationale: the existing platform already distinguishes "I can prove I own this domain" from
"nothing bad will happen if you attack it" by never offering active testing at all. The moment
active testing exists, that distinction has to become an explicit, enforced data model instead of
an implicit platform-wide absence — collapsing the two is the single most consequential safety
mistake this architecture could make.

### XI. Untrusted Code Needs Its Own Isolation Boundary

This extends Principle V (Untrusted Code Runs Isolated); it does not relax it. The existing
sandbox boundary runs **trusted Fahes code (vendored/installed capabilities) against untrusted
data** (a customer's fetched page or source tree). It MUST NOT be reused, extended, or assumed
sufficient for **running the customer's own code** (install scripts, build steps, their own test
suite, arbitrary executables) — that is a different threat model requiring its own boundary.

- Customer-supplied code MUST NOT execute inside the existing capability sandbox unless a future,
  explicitly separate untrusted-code-execution architecture is designed and ratified for that
  specific purpose.
- Any future untrusted-code-execution engine MUST provide container- or VM-grade isolation (or
  equivalent proven containment with no known escape path, per Principle V's existing bar) — the
  process-level `node --permission` boundary that protects the existing trusted-code sandbox is not
  sufficient evidence of safety for running code the customer themselves supplied.
- Network egress from an untrusted-code-execution workload MUST be explicit, minimal, and
  independently justified per capability — it MUST NOT inherit the existing sandbox's egress
  posture by default.
- Credentials, secrets, and environment variables MUST NOT be reachable from an untrusted-code
  workload under any circumstance, including indirectly through a shared filesystem, shared
  process, or shared network namespace.

Rationale: today's sandbox-runner is a well-reasoned, narrowly-scoped answer to one problem —
"run our own reviewed code without letting it over-trust untrusted data." A future spec that
needs to `npm install && npm test` a customer's repository is solving a materially harder problem,
and reusing the existing boundary for it would quietly borrow safety properties it was never
designed to provide.

### XII. Long-Running Work Declares Its Own Lifecycle

A future execution class whose typical duration exceeds the current platform's short-job
assumptions (today: a ~15-minute scan-wide timeout, per-module timeouts in the tens of seconds,
`attempts: 1` with refund-on-failure for the scan-phase queue) MUST NOT inherit those assumptions
by default.

- Every new execution class MUST declare its own cancellation semantics, heartbeat/progress
  reporting cadence, recovery behavior on worker death, idempotence policy, timeout, and retry
  semantics, sized to its own actual duration and statefulness — not copied from the scan-phase
  queue's short-job defaults.
- A long-running execution class SHOULD run in its own queue rather than sharing a queue whose
  other jobs are short and latency-sensitive, consistent with the existing platform's own pattern
  of giving reverify its own queue so an audit backlog cannot starve it.
- Idempotence MUST be proven, not assumed, before an execution class is granted retry attempts
  greater than one. A class that may have already incurred real-world side effects (a paid
  provider call, a billed unit of generated load, a partially-completed authenticated workflow)
  MUST default to `attempts: 1` with explicit refund/recovery handling, exactly as today's
  scan-phase queue already does for the same reason.

Rationale: the current queue configuration's own internal comments state the governing principle
already — "recovery is a decision, not a default." A future load-test or long source-execution
job that silently inherits a 30-second timeout and a blind retry would violate that principle
without a single line of code looking wrong in isolation.

### XIII. Tenant Boundaries Survive Every New Engine

Every new execution engine, evidence type, or storage location MUST preserve the existing
tenant-isolation guarantees — it MUST NOT bypass them for convenience.

- Every new persisted entity that is reachable by more than one tenant's work (executions,
  evidence, artifacts, sessions, credentials) MUST be scoped to the owning user/tenant at creation,
  the same way `Target`/`Scan`/`Issue` are scoped today.
- Every new object-storage location (artifacts, traces, HAR files, video, screenshots) MUST use a
  tenant-scoped or ownership-verifiable key, and MUST have a defined retention/cleanup path before
  it ships — an open question about whether an existing storage class is actually cleaned up
  (as currently exists for staged archive uploads) MUST be resolved, not inherited, by a new class.
- Workspace and credential cleanup on every exit path (completion, failure, timeout, cancellation)
  MUST extend to every new execution class's own workspace/session/credential-binding concept, not
  only to the existing scan workspace.

Rationale: the existing platform's multi-tenancy model is sound where it has been built
(`userId`-scoped queries, scan-scoped workspace teardown) and incomplete in at least one place
that predates this architecture pass (staged-upload retention). A new engine inherits whichever of
those two patterns its author copies; this principle makes copying the sound one mandatory rather
than optional.

### XIV. Every Future Capability Declares Its Contract Before It Ships

Before any future execution engine or capability category is implemented, its owning spec MUST
declare, at minimum:

- its execution class and the trust boundary that class implies (passive/trusted-code-on-
  untrusted-data, browser-rendered, untrusted-code-execution, active/adversarial, or another
  class this architecture's child specs define);
- its inputs and outputs;
- the authorization level and environment restrictions required to run it, per Principle X;
- its resource budget (requests, concurrency, duration, compute, storage);
- its timeout, retry, and cancellation semantics, per Principle XII where long-running;
- its evidence schema and finding-identity strategy, per Principle IX;
- its cost/metering model, including whether it fits the existing flat-per-domain credit model or
  needs duration/resource-scaled pricing;
- its reverify strategy, including whether the existing single-check 30-second reverify model is
  sufficient or whether the class needs its own;
- its retention requirements for any evidence/artifact it produces;
- its observability requirements (what an operator needs to see to know the engine is healthy,
  without exposing customer secrets).

A spec that proposes a new execution engine or capability category without declaring all of the
above is incomplete and MUST NOT proceed to `/speckit-plan` until it does.

Rationale: this is the master architecture's enforcement mechanism for its own stated goal —
every future child spec must prove it has thought through safety, cost, evidence, and lifecycle
before implementation begins, the same way this principle set asks the master spec itself to.

## Technology and Security Constraints

Stack commitments. A change here is a constitutional amendment, not a refactor.

- Monorepo on pnpm workspaces and Turborepo. Shared contracts live in `packages/types`;
  duplicating a type across apps instead of importing it is a defect.
- Next.js App Router on the frontend, Express on the backend. Long work runs in a separate worker
  process via BullMQ on Redis, never inline in a request.
- PostgreSQL through Prisma, schema-migrated. Cloudflare R2 for object storage. Redis is cache,
  queue, and rate-limit state only, never a system of record.
- Live scan state reaches the client over WebSocket. Polling for scan progress is not acceptable.

Security requirements.

- Scan input is hostile input. User-supplied URLs MUST be validated against SSRF: private,
  loopback, link-local, and cloud metadata addresses MUST be refused, on the initial request and on
  every redirect.
- Uploaded archives MUST be size- and type-bounded, and MUST be extracted with path-traversal and
  decompression-bomb protection.
- Cloned repositories and extracted archives MUST live in per-scan temporary paths and MUST be
  deleted when the scan ends, including on failure and on cancellation.
- Third-party credentials, GitHub tokens above all, MUST be encrypted at rest and MUST NOT be
  logged, echoed in errors, or placed in AI prompts.
- Secrets MUST NOT enter LLM context. Scanned code and markup MUST be redacted before becoming
  prompt content.
- Passwords MUST be bcrypt-hashed at cost 12 or greater. Access tokens are short-lived and sent in
  the `Authorization` header; refresh tokens are httpOnly cookies.
- Admin capability MUST be enforced server-side on every privileged route. Frontend route guards
  are usability, never security.
- Credentials used for any future authenticated-scanning capability MUST follow a declared
  lifecycle (issuance, scoped storage, rotation/expiry, revocation on scan end) — not merely
  encryption at rest, per Principle XI.
- Any future authenticated-scanning session MUST be isolated per scan/tenant; a session MUST NOT
  be reused across scans or across tenants under any circumstances.
- No execution class classified as active or adversarial under Principle X MAY run against a
  target before that target carries both ownership verification AND a separate, explicit
  authorization grant for that execution class.
- A target's environment classification (production, staging, or otherwise) MUST NEVER be used,
  by itself, to infer or grant destructive-testing permission — see Principle X.
- Evidence produced by an active, adversarial, or authenticated execution class MUST be redacted
  through the same mechanism that protects AI prompt assembly before it is stored or displayed —
  a successful exploit's own evidence can contain real customer secrets or PII, and that reaching
  a report unredacted is a data-exposure incident, not merely an evidence-quality defect.

## Design Adherence

The interface has an approved design system, vendored at `design-system/`. It is authoritative for
every user-facing surface.

- Every token consumed in application code MUST come from `design-system/tokens/*.css` via
  `var(--token)`. A raw hex colour, a raw pixel value, or a font family not declared by the system
  is a defect, enforced by `design-system/_adherence.oxlintrc.json` in `pnpm lint`.
- A component that exists in `design-system/components/` MUST be ported from it rather than written
  fresh. Its `.d.ts` fixes the prop contract and its `.prompt.md` carries constraints not visible in
  the code; both MUST be read before porting.
- A surface with no entry in `design/screen-map.md` has no approved design. It MUST NOT be invented
  — request a design instead. Shipping an invented surface is a defect regardless of how it looks.
- The measured responsive behaviour MUST be implemented, not approximated: the display scale halves
  at 390px and body tracking goes positive there. A build that renders only one viewport is
  incomplete.
- Fonts and icons MUST be served from the application. No runtime request to a font CDN, icon CDN,
  or any third-party asset host is permitted from a page we serve. The product reports on
  third-party requests; making them ourselves is indefensible.
- A ported surface MUST pass visual comparison against its reference at 1440 and 390 within the
  configured threshold before it is considered complete.

Rationale: the design system is a decision record, not a suggestion. Its severity scale, its
attribution marker, and its five distinct module states each exist to keep a promise the
specification makes. A surface that quietly diverges breaks the promise while looking finished.

## Development Workflow and Quality Gates

- Tests come first for any feature or bugfix: write the failing test, confirm it fails for the
  intended reason, then implement. This applies to skills as much as to core code.
- Every skill MUST have a contract test proving it satisfies `AuditSkill`, plus a test proving its
  module survives that skill throwing.
- Boundary changes MUST carry integration tests: the skill contract, the AI executor's fallback and
  degradation paths, credit debit and refund, and the orchestrator's phase sequencing.
- Provider calls MUST be stubbed in tests. A suite that requires live LLM spend to pass is a broken
  suite.
- Schema changes ship as reviewed, reversible migrations. No hand-edited production schema.
- Every PR MUST state which principles it touches and how it complies. Reviewers verify compliance,
  not merely correctness.
- Added complexity MUST be justified in the PR. Unjustified complexity is grounds for rejection on
  its own.
- Deviating from a principle requires a documented exception in the PR and an issue to remove it.
  Undocumented deviation is a defect regardless of whether the code works.

## Governance

This constitution supersedes conflicting practice, including conflicting guidance in
`WebAuditAI_ARCHITECTURE.md`. Where the two disagree, this document governs and the architecture
document MUST be corrected to match.

Amendment procedure.

1. Propose the change in writing, naming the principle affected and the concrete problem with it.
2. State the migration path for code and specs already relying on the current wording.
3. On approval, amend this file, bump the version, and update dependent specs and plans in the same
   change.

Versioning policy, semantic and applied to governance meaning rather than wording.

- MAJOR: a principle is removed, or redefined such that previously compliant code becomes
  non-compliant.
- MINOR: a principle or section is added, or existing guidance is materially expanded.
- PATCH: clarification, rewording, or typo correction that changes no obligation.

Compliance review.

- Every PR is reviewed against these principles. A reviewer may block on principle violation alone.
- Principles I through V and VII are verified by automated test wherever a test is possible.
  Principle VI is additionally verified by ongoing cost reconciliation, not by tests alone.
- Principles VIII through XIV govern future child specs under the Fahes Scan Platform
  Architecture v2 master spec. A child spec's own `/speckit-plan` and `/speckit-checklist` MUST
  verify compliance with the principle(s) its execution class implicates before any
  `/speckit-tasks`/`/speckit-implement` work begins; Principle XIV's contract declaration is a
  gating requirement, not an aspiration, for every such child spec.
- This constitution is reviewed at the close of each development cycle. Principles that are
  routinely excepted are either wrong or unenforced, and MUST be fixed or removed.
- Runtime development guidance for coding agents lives in agent guidance files at the repository
  root. Those files MUST NOT contradict this constitution; on conflict, this document wins.

**Version**: 1.2.0 | **Ratified**: 2026-08-22 | **Last Amended**: 2026-10-07
