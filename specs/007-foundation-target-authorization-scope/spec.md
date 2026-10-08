# Feature Specification: Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope

**Feature Branch**: `007-foundation-target-authorization-scope`

**Created**: 2026-10-07

**Status**: Planning complete — frozen for downstream specs (F02/F05/F07 and any
`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`/`SOURCE_EXECUTION` engine spec may now
consume this spec's entities/contracts without redesigning them). No implementation has occurred
under this feature — see Migration & Backward Compatibility (FR-021) and SC-004.

**Input**: User description: "Foundation Spec 01 — Target / Environment / Ownership / Authorization /
Scope. Child spec of the completed master architecture at `specs/006-scan-architecture-v2/`
(`handoff-F01.md`). Designs `TargetEnvironment`, `TargetAuthorization`, `ScopeDefinition` as real,
implementable, migratable entities attaching to the existing `Target` model without modifying it.
Must resolve the authorization-tier taxonomy, the Scope pattern-matching representation, the
grant/revoke/expire lifecycle, grant authority, composite/multi-class authorization, budget
semantics, tenant isolation, and migration posture — without designing any specific engine's
execution logic or the untrusted-code isolation mechanism. Must unblock F02, F05, F07." *(This quote's "without modifying it" is the original triggering
framing, preserved verbatim per this repo's convention of not editing the Input quote
post-hoc — FR-021 below states the closure-pass-corrected, proven invariant: zero semantic
modification, plus two Prisma-required structural fields.)*

**A note on template fit**: like its parent (`specs/006-scan-architecture-v2/`), this is a
foundation/platform-contract spec, not an end-user-facing feature — but unlike the parent, it
*does* produce a real, migratable data model and real enforcement contracts that F02/F04/F05/F07
and every active-class engine will directly implement against. Its "users" are: (a) the platform
engineer who implements the Prisma migration and the authorization-check library this spec
contracts; (b) every future child spec's author who must consume `TargetAuthorization`/
`ScopeDefinition` rather than invent a parallel concept; (c) the target's owning user, who is the
actual human who grants/revokes a real permission through this model once an engine consumes it.
Success criteria mix planning-artifact completeness (per the parent's own pattern) with concrete,
testable data-model/contract properties specific to this spec's narrower, more implementable scope.

## Clarifications

### Session 2026-10-07

- Q: Should `ScopeDefinition`'s host-matching support subdomain wildcards, or stay exact-host-only
  like every other allowlist in this codebase? → A: Single-level wildcard (`*.example.com` matches
  `a.example.com`, not `a.b.example.com`), per FR-007 — confirmed as this spec's working design, not
  changed by this answer, since FR-007 already specified single-level wildcarding as its default.
- Q: Should platform operators be able to unilaterally revoke any user's `TargetAuthorization`
  grant, or should revocation stay strictly owner-only until F07's execution-level kill switch
  exists? → A: Operators can revoke any grant, always audited, revoke-only (never create/widen),
  per FR-017 — confirmed as this spec's working design for the same reason.
- Q: Should this spec establish fixed, platform-wide maximum values for a grant's request/
  concurrency/duration budgets, or leave any ceiling to a later spec (F06/F07)? → A: Fixed
  platform-wide maximums now, closing the "technically finite but absurd" gap before any engine
  exists to consume a grant — see the concrete values added to FR-011.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A target owner grants scoped permission for a new testing capability (Priority: P1)

A user who owns a Target (has proven control of it, per the existing Ownership Verification model)
wants a future capability — once an engine like Active Security or Authenticated Workflow actually
exists — to be allowed to run adversarial or authenticated tests against a specific, bounded part
of that target (e.g. "staging only," "only `/api/*`," "never the payment flow"). Today, nothing in
the platform can express this: Ownership Verification is the only gate that exists, and it answers
a different question ("do you control this") than the one this story needs answered ("did you
specifically allow this kind of test, here, within these bounds").

**Why this priority**: every single future active-class engine (Active Security, Authenticated
Workflow, Load/Capacity, Source Execution) is permanently blocked without this — it is the one
entity set every other new capability's safety model depends on (Constitution Principle X), and
getting it wrong once is cheaper than getting it wrong in eight downstream specs that each build an
engine on top of it.

**Independent Test**: can be fully tested by granting a `TargetAuthorization` for one execution
class with a non-trivial `ScopeDefinition` (e.g. `*.staging.example.com` included,
`checkout.staging.example.com` excluded) and confirming a scope-evaluation call correctly admits an
in-scope request and refuses an excluded one — entirely independent of any engine actually existing
yet, since this spec defines the contract an engine will later call, not an engine itself.

**Acceptance Scenarios**:

1. **Given** a user owns a Target with Ownership Verification at `VERIFIED`, **When** they request
   an Authorization grant for `ACTIVE_SECURITY` scoped to `staging.example.com` with a request
   budget of 500 and a 24-hour duration budget, **Then** the system creates a `TargetAuthorization`
   row referencing that Target, that execution class, that Scope, and those budgets — and creates no
   relationship whatsoever to the existing `TargetVerification` row.
2. **Given** the same grant from Scenario 1, **When** a (future, not-yet-built) engine asks "is
   `ACTIVE_SECURITY` against `staging.example.com/api/login` authorized right now," **Then** this
   spec's authorization-check contract returns yes, citing the specific grant, without consulting
   `TargetVerification`/`ControlLevel` at all.
3. **Given** the same grant, **When** the same engine asks about `production.example.com` (a
   different host, same Target's canonical value is `example.com`), **Then** the check refuses,
   citing out-of-scope, not out-of-authorization — the two refusal reasons are distinguishable.
4. **Given** a Target with no `TargetEnvironment` classification at all, **When** any execution
   class that declares an environment restriction is checked against it, **Then** the check refuses
   as unclassified, never defaulting to permit.

---

### User Story 2 - A grant is revoked while work is in flight, and the revocation actually matters (Priority: P1)

A user revokes a `TargetAuthorization` grant — because they changed their mind, sold the domain,
or discovered the grant was created in error. Work that was planned or is executing under that
grant must stop being authorized immediately, not merely stop being authorized for the *next* scan
someone creates.

**Why this priority**: this is the exact tension the parent spec's own handoff brief flags as
unresolved ("the master architecture currently wants ScanPlan resolved immutably at scan start, but
revocation/kill-switch semantics may require some authorization properties to remain dynamically
enforceable") — getting this wrong either breaks the "immutable plan" guarantee every other
execution concept relies on, or silently makes revocation theatrical. It is P1, tied with User
Story 1, because an authorization model whose revocation does not actually revoke anything is not
a safety control at all.

**Independent Test**: can be fully tested by granting an Authorization, resolving a (hypothetical)
plan reference to it, revoking the grant, and confirming a live re-check of that same grant
reference — performed the same way a future engine would perform it mid-execution — now refuses,
without needing any engine to actually exist.

**Acceptance Scenarios**:

1. **Given** an active `TargetAuthorization` grant, **When** a (future) `ScanPlan` snapshots a
   reference to that grant's id at resolution time, **Then** that snapshot is immutable — the plan
   never re-resolves *which* grant covers a given execution class mid-scan.
2. **Given** the snapshot from Scenario 1, **When** the grant is revoked before the plan's execution
   units that depend on it have run, **Then** a live check of that same grant id (performed at or
   immediately before each unit of work that depends on it, not only once at plan resolution)
   returns refused — the immutable *reference* does not imply an immutable *validity verdict*.
3. **Given** a grant nearing its `durationBudget`, **When** the budget is exhausted mid-scan,
   **Then** the same live-check contract refuses further work under that grant, distinguishing
   "budget exhausted" from "revoked" and from "expired" in its refusal reason.
4. **Given** a grant that is revoked, **When** any already-queued work that was never dispatched is
   inspected, **Then** this spec's contract defines that queued-but-undispatched work under a
   revoked grant must be rejected before dispatch — the dispatch-time check is not optional because
   a plan-resolution-time check already happened once.

---

### User Story 3 - A future child spec author determines whether their execution class needs scope, environment restriction, or both (Priority: P2)

An engineer planning a future engine's own child spec (e.g. Authenticated Workflow, or a later
revision of Active Security) needs to know, without re-deriving it, exactly what fields a
`TargetAuthorization` grant carries, what a `ScopeDefinition` can and cannot express, how
budgets are represented, and what "composite" authorization means for a test that spans two
execution classes (e.g. IDOR testing, which needs `AUTHENTICATED_WORKFLOW` for session setup and
`ACTIVE_SECURITY` for the adversarial request itself).

**Why this priority**: lower than User Stories 1-2 because it is a *consumption* concern, not a
*safety* concern — getting the contract merely unclear (rather than unsafe) is expensive but not
dangerous. It directly determines whether F02, F05, and F07 can be planned in concrete detail
(per the roadmap's dependency table), which is this spec's own stated "done" bar.

**Independent Test**: hand this spec's `contracts/` and `data-model.md` to a reader with no other
context and confirm they can correctly answer, for a hypothetical tenth execution class, whether it
needs Scope, whether it needs an Environment restriction, and whether a single grant or multiple
grants apply when two classes are both needed for one logical test.

**Acceptance Scenarios**:

1. **Given** this spec's completed contracts, **When** a reader is asked how IDOR testing (needing
   both `AUTHENTICATED_WORKFLOW` and `ACTIVE_SECURITY`) is authorized, **Then** they can state,
   without guessing, whether one grant lists both execution classes or two separate grants are
   combined at `ScanPlan`-resolution time — this spec resolves that question explicitly (see
   Clarifications and FR-010).
2. **Given** this spec's completed contracts, **When** a reader is asked whether a new, tenth
   execution class a future spec proposes needs its own new `ScopeDefinition` matching dimension
   this spec never anticipated, **Then** they can determine whether the existing pattern language
   already covers it or whether an amendment to this spec is required — i.e. the pattern language's
   extensibility rule is stated, not left implicit.

### Edge Cases

- What happens when a user tries to create a `TargetAuthorization` whose Scope names a host (or, for
  a wildcard, a base domain) or repository outside the owning Target's own domain tree/canonical
  value entirely (e.g. a grant on verified Target `mysite.com` scoped to `google.com`, or to the
  wildcard `*.com`)? -> Refused at grant-creation time per FR-007's host/repository-boundedness
  rule — this is the primary finding of this spec's own independent adversarial review, not a
  hypothetical: without this rule, Ownership Verification of *a* Target would have been
  sufficient to obtain a grant whose Scope reaches an entirely different, unverified host, which is
  precisely the ownership/authorization collapse Constitution Principle X forbids.
- What happens when two grants on the same Target cover the same execution class with different
  Scopes (e.g. one covering `staging.example.com`, a later one covering `*.example.com`)? -> Both
  remain independently valid and independently revocable; a request is authorized if **any** active,
  non-expired grant for that execution class covers it in Scope, Environment, and budget — grants do
  not merge, narrow, or supersede each other implicitly (see FR-013).
- What happens when a grant's Environment restriction says "staging only" but the Target's
  `TargetEnvironment` classification later changes from staging to production? -> The grant's
  Environment restriction is evaluated against the Target's *current* `TargetEnvironment`
  classification at check time (not a value snapshotted at grant time) — a grant scoped to staging
  becomes unusable the moment the Target is reclassified to production, with no separate revocation
  needed; this is a deliberate fail-closed consequence of Constitution Principle X's "environment
  must never be inferred, always explicit" rule, not an oversight.
- What happens when a user requests an Authorization grant for a Target they have not yet proven
  Ownership Verification for? -> Refused; Ownership Verification remains a prerequisite to
  *requesting* an Authorization grant at all (you must first prove you control the target before
  you may even ask permission to test it more aggressively), even though the two remain structurally
  unrelated entities with no FK between them (FR-004).
- What happens when a budget field (request/concurrency/duration) is omitted at grant creation? ->
  Refused at creation time for every execution class except where this spec's taxonomy explicitly
  allows an unbounded budget for a specific low-risk class (see FR-011) — there is no silent
  "unlimited by omission" default anywhere in this model.
- What happens when a future engine asks this spec's authorization-check contract about an
  execution class this spec's taxonomy does not yet know about? -> Refused — an unrecognized
  execution class is never treated as implicitly authorized by any existing grant, matching this
  model's fail-closed default everywhere else.
- What happens when a request to an in-scope host redirects to a host entirely outside the
  Target's own canonical value and outside every grant's Scope (e.g. `staging.example.com` redirects
  to `attacker-controlled.example.net`)? -> The redirect destination gets its own independent
  scope check per FR-010; it is refused as out-of-scope exactly like any other out-of-scope
  destination, with no special leniency because the chain's first hop was in-scope — this is the
  concrete case FR-010's "never inferred from an earlier hop" rule exists to cover.

## Requirements *(mandatory)*

### Functional Requirements — Core Entities

- **FR-001**: This spec MUST define **TargetEnvironment** as a classification of an existing
  `Target` (production / staging / development, at minimum) that is purely informational and
  scoping — it MUST NEVER, by itself, grant or widen what any `TargetAuthorization` permits
  (Constitution Principle X). A Target MAY have no classification at all ("unclassified"); every
  execution class that declares an Environment restriction MUST refuse against an unclassified
  Target, never default-permit.
- **FR-002**: This spec MUST define **TargetAuthorization** as an explicit, separately-granted
  permission for one or more execution classes against a Target, carrying: the execution class(es)
  it covers, a reference to exactly one `ScopeDefinition`, an Environment restriction (which
  `TargetEnvironment` classification(s) this grant is valid for), a request budget, a concurrency
  budget, a duration budget, who granted it and when, and its current lifecycle state (FR-012).
  `TargetAuthorization` MUST NOT reference `TargetVerification` in either direction, by foreign key
  or by any derived read path, per Constitution Principle X.
- **FR-003**: This spec MUST define **ScopeDefinition** as a deterministic, auditable, normalizable
  description of what a `TargetAuthorization` grant includes and excludes, per FR-008's pattern
  language — never a single free-form regex field (see Assumptions).
- **FR-004**: Requesting a new `TargetAuthorization` grant for a Target MUST require that Target to
  already carry Ownership Verification (`TargetVerification`/`ControlLevel` at `ATTESTED` or
  stronger, per the existing control-gate model) as a precondition to the *request* succeeding —
  this is the one point where the two concepts interact, and it is a precondition check, not a
  structural reference; no column, foreign key, or cached field on `TargetAuthorization` stores or
  derives from `TargetVerification`'s state after that one-time precondition check.

### Functional Requirements — Authorization Taxonomy

- **FR-005**: This spec MUST replace the master architecture's placeholder hierarchical taxonomy
  (passive / browser-interactive / authenticated / active-security / load /
  high-impact-staging-only) with **independent, per-execution-class grants**: a `TargetAuthorization`
  names the specific `ExecutionClass` value(s) (from the FR-008-of-the-parent-spec enum:
  `BROWSER`, `CRAWLER`, `SOURCE_EXECUTION`, `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`,
  `LOAD_CAPACITY` — the four classes genuinely requiring Authorization beyond Ownership Verification
  per the parent's Safety & Authorization Model, plus any future class a later spec adds) it covers,
  with no numeric rank and no implication that holding a grant for one class implies or eases
  holding a grant for another. This directly resolves the parent's own open question ("are these
  really hierarchical levels, or independent capabilities?") per its own instruction to prefer
  least-privilege semantics when the detailed design does not prove a hierarchy is correct — no
  such proof exists; the opposite is demonstrated by FR-006 and by the parent's own `decisions.md`
  finding that `AUTHENTICATED_WORKFLOW` does not imply `ACTIVE_SECURITY` or vice versa.
- **FR-006**: A single `TargetAuthorization` MAY list more than one `ExecutionClass` (e.g. a grant
  explicitly listing both `AUTHENTICATED_WORKFLOW` and `ACTIVE_SECURITY`, for a test like IDOR that
  genuinely needs both), sharing one Scope and one set of budgets — this spec does NOT introduce a
  separate "composite grant" entity, because an array-valued `executionClasses` field on the
  existing `TargetAuthorization` already expresses this without a new invariant a two-grant model
  cannot also express; a user remains free to instead create two separate single-class grants with
  independent Scopes/budgets if that is what their situation actually needs. Whether a given test
  requires one grant naming two classes or two independent grants is the *granting user's* choice,
  not something this spec's data model forces either way. **To close any residual ambiguity
  (closure-pass addition)**: a grant listing `[AUTHENTICATED_WORKFLOW, ACTIVE_SECURITY]` means each
  listed class MAY independently be checked against that same grant's Scope/Environment/budgets —
  it does **not** mean holding the grant for one class implies or grants the other (FR-005 already
  forbids implication between classes generally; this is that same rule applied to the classes
  within one multi-class grant, not an exception to it), and it does **not** mean two *different*
  grants may ever be combined so that one supplies Scope and another supplies budget or Environment
  permission (FR-013's "never combined across grants" rule applies identically whether the two
  grants in question share zero or all of their execution classes). One authorization decision is
  always satisfied by exactly one grant, in full, or not at all.

### Functional Requirements — Scope

- **FR-007**: `ScopeDefinition`'s pattern language MUST be structured and type-specific, not a
  single generic string field, per target kind:
  - **Web/URL targets**: `includedHosts`/`excludedHosts` (each entry is either an exact hostname or
    a single-level subdomain wildcard of the form `*.example.com`, which matches exactly one label
    deep — `a.example.com` matches, `a.b.example.com` does not, `example.com` does not match the
    wildcard itself and must be listed separately if also intended. **There is no flag, field, or
    mechanism anywhere in this spec's model that widens this to recursive/nested-subdomain
    matching** — an earlier draft of this document mentioned a hypothetical
    `includeNestedSubdomains: true` flag that was never added to `data-model.md` or
    `contracts/scope-matching-contract.md`; this closure pass found and removed that dangling
    reference as a genuine contract contradiction. Single-level wildcarding is this spec's entire
    and final v1 wildcard rule; a future spec that genuinely needs recursive matching must propose
    it as an explicit, justified amendment, not assume it already exists here), `includedPathPrefixes`/
    `excludedPathPrefixes` (exact path-prefix strings, matched after URL-decoding and
    `.`/`..`-segment normalization — never raw, unnormalized path comparison), `schemes` (defaults
    to both `http`/`https` unless narrowed), `ports` (defaults to the scheme's standard port unless
    widened explicitly).
  - **Repository/source targets**: `repositoryFullName` (exact, matching the existing
    `REPO_PATTERN`-validated canonical form), `includedRefs`/`excludedRefs` (exact branch/tag names
    or exact commit SHAs — no glob), `includedPathPrefixes`/`excludedPathPrefixes` (same
    normalization rule as web).
  - **Query strings are never a scope-matching dimension, for either target kind.** A destination's
    query string is stripped before matching and has no corresponding `ScopeDefinition` field —
    two requests differing only in query string always receive the same scope decision. This is a
    deliberate scope-reduction, not an oversight: query parameters are request *content*, not
    destination *identity*, and allowing them into scope matching would let the same effective
    scope be described in infinitely many equivalent-looking patterns, contradicting FR-003's
    determinism requirement. A future class that genuinely needs to restrict specific query
    parameters (not merely the host/path destination) extends this spec additively with its own
    justification.
  - **Authenticated-workflow scope** (layered on top of either target kind above, only when the
    grant's `executionClasses` includes `AUTHENTICATED_WORKFLOW`): `includedAccountRefs`/
    `includedRoles`/`includedActionCategories` — opaque identifiers this spec defines the *shape*
    of, not the semantics of (F05's own child spec defines what an "account ref" or "role" concretely
    resolves to).
  - **Every `includedHosts`/`excludedHosts` entry (and, for a wildcard entry, the domain the
    wildcard is relative to) MUST be the owning Target's own canonical hostname or a subdomain of
    it — never an unrelated host.** "Subdomain of `B`" is defined precisely as: the candidate
    string `H` satisfies `H === B` or `H` ends with the literal substring `"." + B` — **never** a
    bare suffix/substring check (`H.endsWith(B)` without the preceding-dot requirement). This
    precision is load-bearing, not stylistic: a naive bare-suffix check would incorrectly accept
    `attackerexample.com` as "ending with `example.com`" with no dot boundary, and would also
    incorrectly accept `example.com.attacker.net` if the check were reversed (checking whether the
    *canonical value* is a substring of the candidate, rather than the candidate ending with
    `.` + canonical value). Found and closed during this spec's closure-pass adversarial review as
    a concrete bypass of the boundedness rule below, not only a hypothetical. For a
    `REPOSITORY`-kind Scope, `repositoryFullName` MUST equal
    the owning Target's own `canonicalValue` exactly, never a different repository. **This closes a
    critical gap found during this spec's own independent adversarial review**: without this
    constraint, a user who owns (and has proven Ownership Verification for) *their own* Target
    `mysite.com` could attach a Scope naming an entirely unrelated host (`google.com`, or even the
    single-level wildcard `*.com`, which matches almost every second-level `.com` domain) or an
    entirely unrelated, unowned repository to a grant on *their own, legitimately verified* Target
    — nothing in FR-004's ownership precondition (which checks the *Target*, not the *Scope*'s
    content) would catch this, because Ownership Verification and Scope validation were being
    treated as unrelated checks. This is exactly the "can wildcard scope authorize too much" /
    "can a grant reference a target the user never verified" failure class Constitution Principle X
    exists to prevent, and this spec's own FR-004 alone did not prevent it — only a scope-vs-Target
    bounding rule does. A genuinely cross-domain test need (e.g. an application on `example.com`
    that redirects through a third-party OAuth provider on a different domain) is **not** solved by
    widening this rule — it requires the user to separately prove Ownership Verification for that
    second host as its *own* Target and create a *separate* grant for it; combining two such grants
    for one logical test is the same composite-authorization question FR-006 already defers to the
    consuming engine, not a reason to weaken this boundary.
  - No field anywhere in `ScopeDefinition` accepts an arbitrary user-supplied regular expression.
    This is a deliberate, narrower choice than a generic pattern engine, matching the existing
    codebase's own precedent (CORS allowlist and the safe-net test-origin allowlist are both
    exact-match-only by stated design philosophy) and Constitution Principle X's requirement for
    Scope to be deterministic and auditable.
- **FR-008**: Exclusion MUST take precedence over inclusion on overlap, defined precisely as: a
  request is in-scope if and only if at least one inclusion entry matches **and** no exclusion entry
  matches, evaluated after the same normalization rule (host lowercasing/punycode-folding, path
  decode-and-normalize, explicit scheme/port resolution) is applied to both the request and every
  pattern entry — normalization MUST happen before matching, never matching-then-normalizing, so
  that a request cannot be crafted in a form that matches an inclusion pattern literally while
  evading an exclusion pattern that would catch its normalized form (or vice versa).
- **FR-009**: `ScopeDefinition` MUST be immutable once referenced by any `TargetAuthorization` grant
  that has left the `GRANTED` state (FR-012) — narrowing or widening what a grant covers requires a
  new `TargetAuthorization` (and, if its content differs, a new `ScopeDefinition`), never an
  in-place edit to a `ScopeDefinition` row an active or past grant already references. This
  preserves an accurate audit trail: a revoked grant's historical Scope is never retroactively
  altered by a later, unrelated edit.
- **FR-010**: Resolving whether a specific destination (a URL a browser/crawler/active-security
  engine is about to reach) is in-scope MUST use the exact same evaluation defined in FR-007/FR-008,
  called fresh for **each individual destination in a chain** — every redirect hop, every
  cross-origin resource load, and every crawl-frontier expansion gets its own independent scope
  check against its own actual, resolved destination, never inferred from the fact that an earlier
  hop, the original request URL, or any other destination in the same chain was already in-scope.
  A redirect, a cross-origin navigation, or a CDN/static-asset host is in-scope only if it
  independently satisfies FR-008 against the same `ScopeDefinition`; this spec does not special-case
  "same-site" or "CDN" as implicitly in-scope, and does not special-case "the chain started
  in-scope" as sufficient for any later hop.

### Functional Requirements — Lifecycle

- **FR-011**: `TargetAuthorization` MUST declare a request budget, a concurrency budget, and a
  duration budget — each a concrete number with an explicit unit (requests: count; concurrency:
  simultaneous in-flight requests/sessions; duration: seconds) — at grant creation. `requestBudget`
  and `concurrencyBudget` MAY be explicitly set to "unlimited" only for execution classes this
  spec's taxonomy marks as inherently non-resource-intensive at the grant level (none of the four
  classes in FR-005 qualify today; this is a named extension point for a future class, not a current
  escape hatch). `durationBudget` MUST always be finite — an unlimited-duration active-class grant
  is refused at creation unconditionally, independent of execution class, because an unbounded grant
  duration defeats the purpose of a time-scoped permission regardless of how tightly its request/
  concurrency budgets are set. `requestBudget` and `concurrencyBudget` are consumed **cumulatively
  across the grant's entire lifetime**, not reset per scan or per execution — a grant is one
  standing permission with one running total, not a per-use allowance; a user who wants a budget
  that resets periodically creates a new grant each period instead (FR-016 makes this cheap: create
  a new grant, optionally revoke the old one).
  **Per Clarifications 2026-10-07**, this spec fixes platform-wide maximums every grant's budgets
  MUST NOT exceed, independent of execution class: `requestBudget` <= 1,000,000; `concurrencyBudget`
  <= 1,000; `durationBudget` <= 2,592,000 seconds (30 days). A grant creation request exceeding any
  one of these is refused at creation, not silently clamped. These are this spec's own informed
  defaults (no repository precedent sets them; no existing mechanism bounds request volume against
  a third-party target today because no active-class engine exists yet) — a future execution-class-
  specific child spec (e.g. E14 Active Security, E16 Load/Capacity) MAY set a *tighter* class-specific
  ceiling in its own plan, but MUST NOT exceed these platform-wide maximums without a documented
  amendment to this spec, the same governance bar Constitution Principle XIV applies to any other
  safety-relevant contract.
- **FR-012**: `TargetAuthorization` MUST have exactly these lifecycle states: `GRANTED` (created,
  not yet usable — see FR-014), `ACTIVE` (usable, within its duration window, not revoked, budgets
  not exhausted), `REVOKED` (explicitly ended by its granting authority or a platform safety action,
  terminal), `EXPIRED` (its duration window has elapsed, terminal). `ACTIVE` is a **derived** state,
  computed at check time from `grantedAt`/`revokedAt`/`expiresAt`/budget-consumption fields — it
  MUST NOT be a separately persisted, independently-settable column that a check could read as stale
  cached truth, mirroring the existing `reconfirmControl` precedent that a cached column is never
  itself the authority. `GRANTED` is the brief window between creation and the grant's effective
  start time if one is specified in the future; a grant with no future-dated effective start
  transitions from `GRANTED` to the derived-`ACTIVE` state immediately, with no separate activation
  action required.
- **FR-013**: Authorization for a specific execution class, against a specific destination, MUST be
  computed as: does **any** of the Target's `TargetAuthorization` grants (a) list that execution
  class, (b) currently derive to `ACTIVE` (FR-012), (c) have a Scope (FR-007/FR-008) that admits the
  destination, (d) have an Environment restriction that the Target's *current* `TargetEnvironment`
  classification satisfies, and (e) have remaining request/concurrency/duration budget — if yes for
  any single grant, authorized; multiple grants are never combined to jointly satisfy one check
  (e.g. one grant's Scope cannot be added to a different grant's budget).
- **FR-014**: Revocation MUST be effective immediately for every subsequent check (FR-013) — there
  is no propagation delay modeled by this spec, and no separate "pending revocation" state. Because
  `ACTIVE` is derived (FR-012), revoking a grant is exactly one write (`revokedAt`), after which
  every future call to FR-013's check for that grant returns non-`ACTIVE` with no other state to
  update. This spec explicitly resolves the parent's immutable-`ScanPlan`-vs-revocation tension: a
  `ScanPlan` (owned by F02, referenced here only for this resolution) immutably snapshots **which**
  grant id(s) it relies on at resolution time, but it MUST NOT snapshot a **validity verdict** —
  every actual unit of work dispatched under a referenced grant MUST re-run FR-013's live check
  immediately before that unit of work begins (not only once, at plan resolution), and queued but
  undispatched work under a now-non-`ACTIVE` grant MUST be rejected before dispatch. The plan's
  immutability is about *what was intended to run and under which grant reference*, never about
  *whether that grant is still good* — that is always re-verified live. (F04's Execution Runtime
  owns *calling* this re-check at dispatch time, since F04 owns dispatch mechanics per
  `specs/006-scan-architecture-v2/roadmap.md`; this FR binds the *contract* F04 MUST call, the same
  way Constitution Principle XIV binds contracts generally — it does not design F04's queue or
  dispatch logic.)
  **Revocation / kill-switch boundary (closure-pass addition, per adversarial review question
  "can revokedAt itself be mistaken for a physical kill switch")**: this FR guarantees only that
  `revokedAt` being set makes every *subsequent authorization check* refuse — it does **not**
  guarantee that already-in-flight network activity, an open browser session, or a running
  execution is physically interrupted at the moment of revocation. Setting `revokedAt` is a
  database write, not a signal delivered to a running process. Interrupting already-running work
  is F07's (Safety/Kill Switch/Execution Audit Trail) responsibility — per
  `specs/006-scan-architecture-v2/roadmap.md`, F07 owns "the emergency-stop and
  target-safety-kill-switch *mechanisms*" (the actual propagation/interruption machinery), while
  F01 owns only the authorization-side consequence (every future check against the revoked grant
  refuses). A future engine MUST NOT read this FR as "revocation stops the worker" — it stops the
  worker only to the extent F07's kill-switch mechanism, once implemented, observes the revocation
  and acts on it; until F07 exists, a revoked grant's already-dispatched work is refused from
  re-authorization at its *next* checkpoint (e.g. its next request/step, per the Authorization vs.
  Resource Reservation requirements in FR-024 below) but is not guaranteed to be forcibly
  interrupted mid-request.
- **FR-015a**: `environmentRestriction` MUST NOT include `PRODUCTION` on a grant whose
  `executionClasses` includes `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, or `LOAD_CAPACITY` —
  refused at creation, unconditionally, in this version of this spec's model.
  **This closes a gap found during this spec's own checklist review**: the parent architecture's
  placeholder taxonomy included a `high-impact-staging-only` tier specifically to allow these
  classes against production under extra scrutiny; FR-005 replaces the parent's hierarchical
  taxonomy with independent per-class grants and, in doing so, does not carry forward any
  equivalent production-permitting mechanism. Rather than silently dropping the parent's "never
  production by default" safeguard (Constitution Principle X) down to "never production unless a
  grant happens to list it," this spec makes the restriction absolute pending a deliberate future
  amendment. A future spec that genuinely needs to permit one of these three classes against
  production (the parent's own `high-impact-staging-only` intent) MUST propose that as an explicit,
  evidenced amendment to this spec — it is not obtainable by any grant this spec's own
  `createAuthorization` contract can create today.
  **`SOURCE_EXECUTION` is deliberately excluded from this prohibition (closure-pass correction)**:
  the parent's own Execution-Class Matrix classifies `SOURCE_EXECUTION`'s Environment restriction
  as "Any (ownership only; risk is to Fahes's own infra, not the target)" — this class's risk model
  is customer code running inside Fahes's own (future, container/VM-grade, Constitution Principle
  XI) isolation boundary, not an adversarial action taken *against* the target, so the target's
  Environment classification is not a safety-relevant input for this class the way it is for the
  other three. Carrying this spec's blanket prohibition to `SOURCE_EXECUTION` without this
  exception would have silently contradicted the parent's own, already-reasoned distinction — found
  and corrected during this spec's closure pass, not assumed consistent without checking.
  `SOURCE_EXECUTION` grants MAY include `PRODUCTION` in `environmentRestriction`; `environmentRestriction`
  remains non-empty for every class, including `SOURCE_EXECUTION` (FR-013(d) still needs something
  to evaluate), it is only the *production-specifically-forbidden* rule that does not apply to it.
- **FR-015**: Exhausting any one of a grant's three budgets (FR-011) MUST cause that grant to be
  treated as non-authorizing for FR-013 purposes for the remainder of its duration window, with a
  refusal reason distinguishable from `REVOKED` and `EXPIRED` — budget exhaustion is not itself a
  new lifecycle state (it does not change `grantedAt`/`revokedAt`/`expiresAt`), it is a fourth,
  independent reason FR-013's check can refuse, computed from consumption data this spec defines the
  shape and meaning of (FR-011's units and ceilings) but whose **authoritative tracking is not this
  spec's own responsibility**. Per `specs/006-scan-architecture-v2/roadmap.md`'s explicit text, F07
  (Safety/Kill Switch/Execution Audit Trail) owns "the request/concurrency/duration budget
  enforcement hooks" — the atomic reservation/decrement counters, concurrency leases, and
  crash/cancellation recovery that make "how much of this budget is left, right now, safe against
  concurrent consumers" an answerable, race-free question. F04 (Execution Runtime) owns the
  dispatch context that calls into F07's enforcement hooks immediately before a unit of work
  consumes budget. F01's own responsibility ends at: defining what a budget *means*, what its
  platform-wide ceiling is, and requiring that `isAuthorized` (FR-013) refuse once F07's
  authoritative accounting reports exhaustion — F01 does not design, and this spec does not invent,
  the reservation/locking/leasing mechanism itself (no Redis script, database advisory lock, or
  specific concurrency algorithm is specified here; that is F07's `/speckit-plan` decision). See
  FR-024 for the related point-in-time-authorization-vs-reservation distinction this boundary
  depends on.

### Functional Requirements — Grant Authority

- **FR-016**: Only the Target's owning user (`Target.userId`) MAY create a new `TargetAuthorization`
  grant for that Target, consistent with today's platform having no organization/workspace/role
  layer above the individual user account (confirmed by direct schema inspection: no
  `organizationId`/`workspaceId`/`tenantId` field exists anywhere in `apps/api/prisma/schema.prisma`,
  and every existing credit/billing/auth/target model is keyed directly on `User.id`). The target
  owner MAY also revoke or narrow (by creating a replacement grant with a smaller Scope/shorter
  duration and revoking the original — never by in-place edit, per FR-009) their own grant.
- **FR-017**: A platform operator (the existing `User.isOperator` flag) MAY revoke any
  `TargetAuthorization` grant belonging to any user, as a safety action (Constitution Principle X's
  "working emergency stop... independent of the normal cancellation path"), but MAY NOT create or
  widen a grant on a Target they do not own — operator authority under this spec is strictly
  reductive (revoke-only), never expansive, matching the existing `isOperator` flag's role as a
  platform-safety capability rather than a target-testing one.
- **FR-018**: Every grant creation, revocation, and (FR-016's) replacement-based narrowing MUST
  write an audit entry recording the actor, the action, the affected grant, and a before/after
  state — reusing the existing `AuditLogEntry` mechanism and its established shape
  (`actorId`/`action`/`subjectType`/`subjectId`/`before`/`after`, the same pattern
  `control-gate/reconfirm.ts`'s `settle()` already uses for `control.demoted` events) rather than
  inventing a parallel audit mechanism for the grant lifecycle specifically. (This is distinct from,
  and does not replace, the future `ExecutionAuditEvent`/`SafetyEvent` that F07 defines for
  recording what an *execution* actually did against a target once it is running — FR-018 covers
  only the grant's own lifecycle events.)

- **FR-017a** (closure-pass addition — environment classification authority): Only the Target's
  owning user MAY classify or reclassify that Target's `TargetEnvironment` (via
  `contracts/grant-lifecycle-contract.md`'s `classifyEnvironment`). Unlike `TargetAuthorization`
  revocation (FR-017), this operation has **no operator variant** — classifying a Target's
  environment is metadata about the owner's own Target, not itself a safety action; a platform
  operator who judges a Target's current classification to make an existing grant unsafe acts
  through FR-017's operator-revocation path on the specific grant(s) of concern, never by
  reclassifying a Target the operator does not own.
- **FR-018a** (closure-pass addition — environment classification auditability): Every
  `TargetEnvironment` classification and reclassification MUST write an audit entry (reusing
  `AuditLogEntry`, same mechanism as FR-018, not a new history table — see this FR's own
  justification below for why a full history table is not warranted by current evidence), recording
  the actor, the previous classification (if any), and the new classification. This closes a real
  auditability gap found during this spec's closure pass: because `TargetEnvironment` is updated
  in place with no history (data-model.md's explicit design choice), a high-risk execution that
  was permitted because a Target was classified `STAGING` at check time would otherwise leave no
  trace of *why* that permission looked correct if the Target is later reclassified to `PRODUCTION`
  and back to `STAGING` — the audit trail must be able to answer "what was this Target classified
  as when this authorization decision was made," not only "what is it classified as now." Using
  `AuditLogEntry` for this (action values `environment.classified` for the first classification of
  a previously-unclassified Target, `environment.reclassified` for any subsequent change) is
  sufficient per this spec's own evidence: no requirement in this spec or its User Stories needs
  anything beyond "what changed, by whom, when" — the same bar FR-018 already applies to the grant
  lifecycle, and the same reasoning `research.md` R3 applies to reusing `AuditLogEntry` rather than
  inventing a parallel mechanism. A full `TargetEnvironment` history table remains unjustified by
  current evidence (Constitution's "unjustified complexity is grounds for rejection" bar) — if a
  future spec discovers a concrete need beyond "what changed, by whom, when" (e.g. needing to
  efficiently query "every Target classified PRODUCTION during interval X" at a scale `AuditLogEntry`
  cannot serve), that is new evidence for a future amendment, not something this spec invents
  speculatively now.

### Functional Requirements — Tenant Isolation

- **FR-019**: `TargetAuthorization` MUST be scoped to its owning Target's `userId` at creation and
  at every read — there is no cross-user sharing of a grant, matching the existing platform's
  per-user (not per-organization) tenancy model confirmed by direct schema audit (FR-016's
  evidence). A lookup of a `TargetAuthorization` by id MUST additionally filter by the requesting
  user's `userId` matching the Target's `userId` (the same `findFirst({ where: { id, userId } })`
  pattern the existing `reconfirmControl`/`create-scan` code already uses for `Target`), closing the
  IDOR risk of one user guessing another user's grant id.
- **FR-020**: `ScopeDefinition` rows are not directly tenant-owned (they have no `userId` of their
  own) but MUST only ever be reachable through a `TargetAuthorization` that is itself tenant-scoped
  per FR-019 — a `ScopeDefinition` MUST NOT expose any lookup path (by its own id, with no
  accompanying grant/tenant check) that would let one user read another user's Scope definition.

### Functional Requirements — AI Is Not Authorization

- **FR-023**: No AI/machine-learning judgment of any kind MAY decide, influence, or be consulted
  for: whether a user owns a Target, whether an Authorization grant should exist, whether a
  destination is in Scope, whether an Environment classification permits an execution class, or
  whether a budget may be exceeded. `isAuthorized` (`contracts/authorization-check-contract.md`)
  and `isInScope` (`contracts/scope-matching-contract.md`) MUST remain pure, deterministic
  functions with no model call anywhere in their implementation or in any function they call —
  stated here as its own requirement (not only inherited from `handoff-F01.md` §22 and the
  parent's Constitution Principle III) so this spec's own package is self-contained on this point.

### Functional Requirements — Authorization Decision vs. Resource Reservation (closure-pass addition)

- **FR-024**: An `AUTHORIZED` result from `isAuthorized` (FR-013) is a **point-in-time decision**,
  never a durable execution ticket. Specifically, and explicitly, for every future engine to read
  before treating `AUTHORIZED` as permission to keep acting:
  - An `AUTHORIZED` result MAY become invalid immediately after it is returned (the grant may be
    revoked, expire, or exhaust its budget in the interval between the check and the caller's next
    action) — a caller MUST NOT cache an `AUTHORIZED` result across more than the single action it
    was obtained for.
  - An `AUTHORIZED` result does **not** override a later revocation (FR-014) or a later Environment
    reclassification (the Edge Cases' reclassification scenario) — both remain checked fresh at
    every subsequent call, never short-circuited by an earlier `AUTHORIZED` verdict.
  - An `AUTHORIZED` result does **not**, by itself, reserve concurrency slots or decrement request
    budget — `isAuthorized` is a pure, read-only, side-effect-free *decision* function (per FR-023's
    "pure, deterministic functions" requirement); it is not interpreted as having consumed anything
    unless a future, F07-owned atomic runtime contract explicitly combines the authorization check
    and the budget reservation into one atomic operation. A downstream implementation that
    separately calls `isAuthorized` (read) and then increments a consumption counter (write) as two
    non-atomic steps has a race condition that is F07's responsibility to close with an atomic
    reservation primitive, not something `isAuthorized` itself can prevent by being called more
    carefully — **a simple read-then-act check is insufficient for concurrency enforcement**, and
    this spec does not claim otherwise.
  - An `AUTHORIZED` result for one destination does **not** authorize any other destination,
    including a redirect target, a cross-origin resource load, or the next page a crawler
    discovers (FR-010 already requires a fresh check per destination) — and does **not** authorize
    the next step of a multi-step authenticated workflow; each step/request/destination of a
    long-running execution under `CRAWLER`, `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, or
    `LOAD_CAPACITY` requires its own fresh authorization check, not one check amortized across the
    whole execution. This spec does not design how any specific engine implements that per-step
    re-checking (that is each engine's own child spec's concern) — it establishes only the shared
    invariant that no engine may treat one initial `AUTHORIZED` result as permanent, standing
    permission for arbitrary later actions.

### Functional Requirements — Migration & Backward Compatibility

- **FR-021**: This spec introduces **zero semantic changes** to the `Target` or `TargetVerification`
  Prisma models, zero changes to any existing control-gate function's signature or behavior
  (`attestControl`/`startVerification`/`checkVerification`/`reconfirmControl`/
  `assertLoadGenerationAllowed`/`assertAttested`), and zero changes to any current scan-creation,
  intake, or capability-dispatch code path. "Zero semantic changes" is this spec's precise invariant
  (replacing an earlier, Prisma-infeasible claim of "zero changes" of any kind — see the
  closure-pass Prisma feasibility finding below): no authorization state, environment state,
  verification-derived state, permission flag, cached authorization truth, or any other
  business-meaning field is added to `Target`. **Prisma 6.1.0 does, however, require two
  structural, business-meaning-free relation back-reference fields on `Target`** —
  `targetEnvironment TargetEnvironment?` and `targetAuthorizations TargetAuthorization[]` — the
  same way `Target` already carries `verifications TargetVerification[]` and `scans Scan[]` for its
  other existing one-to-many relations. This was proven, not assumed, by running `prisma validate`
  against an isolated schema copy during this spec's closure pass: omitting these two fields
  produces Prisma error P1012 ("is missing an opposite relation field on the model `Target`") on
  both `TargetEnvironment.target` and `TargetAuthorization.target`; adding them (and nothing else)
  makes the schema valid. These two fields carry no default, no business logic, and are never read
  by `Target`'s own 16 existing capabilities or any current scan-creation/intake code path — they
  exist solely so Prisma's relation graph is well-formed, exactly like its two existing siblings.
  Every entity this spec defines remains strictly additive: a `Target` with zero
  `TargetAuthorization` rows and zero `TargetEnvironment` classification behaves exactly as every
  `Target` behaves today, because nothing in today's platform reads either new entity or either new
  relation field — the four execution classes that require `TargetAuthorization` (FR-005) do not
  exist as runnable engines yet, so no existing code path is in a position to be gated by, or
  regress because of, this spec's new tables or relation fields.
- **FR-022**: Any future child spec (an engine spec implementing `ACTIVE_SECURITY`,
  `AUTHENTICATED_WORKFLOW`, `LOAD_CAPACITY`, or `SOURCE_EXECUTION`) that wires a real enforcement
  point against this spec's `TargetAuthorization` MUST implement FR-013's full check (not a subset)
  before that engine's first production capability executes against any target, per Constitution
  Principle XIV and the parent spec's Constitution Principle X.

### Key Entities

- **TargetEnvironment**: NEW. `id`, `targetId` (FK -> existing `Target`), `classification`
  (`PRODUCTION | STAGING | DEVELOPMENT`), `classifiedAt`, `classifiedBy` (userId). One Target has
  zero or one *current* classification (a Target may be reclassified; the model keeps the current
  value live-read, matching FR-001's "evaluated at check time, not snapshotted" rule from the Edge
  Cases). Tenant scope: inherited from `Target.userId` (no own `userId` column; always read through
  its owning Target).
- **TargetAuthorization**: NEW. `id`, `targetId` (FK -> existing `Target`), `userId` (denormalized
  copy of `Target.userId` at creation, for direct tenant-scoped lookup per FR-019 without an extra
  join — immutable after creation, since a grant's owner cannot change without the underlying
  Target's ownership changing, which is out of this spec's scope), `grantedBy` (userId, almost
  always equal to `userId` per FR-016, distinguished only for the FR-017 operator-revocation audit
  trail — operators never populate this field as a *grantor*), `executionClasses` (array, FR-006),
  `scopeId` (FK -> `ScopeDefinition`), `environmentRestriction` (array over `TargetEnvironment`
  classifications this grant is valid for), `requestBudget`, `concurrencyBudget`, `durationBudget`
  (FR-011), `grantedAt`, `expiresAt` (derived from `grantedAt` + `durationBudget` at creation,
  stored for query efficiency, never the authority over expiry — recomputable from the other two at
  any time), `revokedAt`, `revokedBy`. No field references `TargetVerification`.
- **ScopeDefinition**: NEW. `id`, `targetKind` (`WEB | REPOSITORY`, matching which of FR-007's two
  shapes applies), the type-specific fields from FR-007, `createdAt`. Not directly tenant-owned
  (FR-020); immutable once referenced by a non-`GRANTED`-state grant (FR-009).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of this spec's three new entities (`TargetEnvironment`,
  `TargetAuthorization`, `ScopeDefinition`) has a complete field list, an explicit tenant-scoping
  statement, and zero foreign-key or derived-read relationship to `TargetVerification` — verified by
  direct inspection of `data-model.md` against FR-002's "MUST NOT reference `TargetVerification`"
  rule, zero violations.
- **SC-002**: The authorization-check contract (FR-013) is specified precisely enough that a reader
  with no other context can determine, for any hypothetical (execution class, destination,
  Target-with-grants) triple, which of this spec's seven distinguishable outcomes applies —
  `AUTHORIZED`, or `REFUSED` with exactly one of `NO_MATCHING_GRANT`, `REVOKED`, `EXPIRED`,
  `BUDGET_EXHAUSTED`, `OUT_OF_SCOPE`, or `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED` as the reason
  (`data-model.md`'s `AuthzResult` type) — never a single undifferentiated "refused." (Corrected
  during this spec's closure pass: an earlier draft of this criterion understated the count as
  "five," not matching the six actually-distinct `REFUSED` reasons `data-model.md` already
  defined.)
- **SC-003**: The immutable-plan-vs-revocation tension the parent's handoff brief explicitly flagged
  as unresolved is resolved with a stated, checkable rule (FR-014) rather than left for a future
  spec to discover unresolved — verified by the Independent Test in User Story 2.
- **SC-004**: This spec's own package produces zero changes to any file outside
  `specs/007-foundation-target-authorization-scope/` — verified by `git status`/`git diff
  --name-only` at the close of this planning pass, matching the parent spec's own SC-004 pattern and
  Constitution Principle XIV's "complete contract before implementation" gate (this spec does not
  reach `/speckit-implement`).
- **SC-005**: This spec's `quickstart.md`-equivalent validation (reusing the parent's own eight-step
  quickstart, since this spec's content is exactly what that quickstart checks a child spec against)
  passes all eight steps when run against this spec's own `plan.md`/`data-model.md`.
- **SC-006**: F02, F05, and F07 (per `specs/006-scan-architecture-v2/roadmap.md`'s dependency table)
  can each name, from this spec alone, the specific entity/field/contract they depend on, without
  needing to ask this spec's author a follow-up question — verified by the Independent Test in User
  Story 3.

## Assumptions

- The three-tier intake model (URL / repository / archive) and the existing `Target`/
  `TargetVerification`/`ControlLevel` model, as directly audited in this session against
  `apps/api/prisma/schema.prisma` and `apps/api/src/services/control-gate/`, are accurate as of
  2026-10-07 and are treated as this spec's own settled current-state baseline — not re-derived a
  second time in `plan.md`, the same way `specs/006-scan-architecture-v2/` treated
  `docs/reviews/scan-audit-2026-10-07/` as settled.
- "Tenant" in this spec means an individual `User` account, matching the confirmed current absence
  of any organization/workspace/role layer in the schema. If the platform later introduces such a
  layer, this spec's `userId`-based scoping is the thing a future amendment would need to revisit —
  not something this spec invents a speculative hook for today (no unused `organizationId` column is
  added "just in case").
- `ScopeDefinition`'s pattern language (FR-007) deliberately does not support arbitrary regular
  expressions, consistent with the existing codebase's own precedent of exact-match-only allowlists
  (CORS, safe-net's test-origin escape hatch) and Constitution Principle X's determinism
  requirement. Single-level subdomain wildcarding (not full recursive wildcarding, not
  exact-host-only) is confirmed as the right default per Clarifications 2026-10-07 — a deliberate,
  bounded departure from the rest of the codebase's stricter exact-match philosophy, justified by
  real multi-subdomain staging setups being impractical to enumerate exactly.
- The specific mechanism that performs FR-014's live re-check at dispatch time belongs to F04
  (Execution Runtime); this spec defines the contract that mechanism must satisfy, not the
  mechanism itself — consistent with this spec's own charter (owns Target/Authorization/Scope
  contracts, not engine or runtime execution logic).
- No Prisma migration is run by this spec. `data-model.md`'s field lists are the real, intended
  schema (not illustrative placeholders, unlike the parent spec's own data-model.md, which
  explicitly deferred finalization to this spec) — but the actual `schema.prisma` edit and migration
  file are implementation work for whichever future session runs `/speckit-implement` against this
  spec, which this planning pass does not do.
