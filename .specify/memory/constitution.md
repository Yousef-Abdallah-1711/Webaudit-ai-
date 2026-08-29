<!--
SYNC IMPACT REPORT
==================
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
- This constitution is reviewed at the close of each development cycle. Principles that are
  routinely excepted are either wrong or unenforced, and MUST be fixed or removed.
- Runtime development guidance for coding agents lives in agent guidance files at the repository
  root. Those files MUST NOT contradict this constitution; on conflict, this document wins.

**Version**: 1.1.0 | **Ratified**: 2026-08-22 | **Last Amended**: 2026-08-23
