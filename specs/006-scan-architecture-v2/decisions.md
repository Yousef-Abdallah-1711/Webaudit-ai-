# Architecture Decision Log: Fahes Scan Platform Architecture v2

ADR-style record of the major decisions made during this planning pass. Each entry: decision,
context, alternatives considered, reason, consequences, status.

## ADR-001: Treat the 2026-10-07 audit as settled current-state fact

- **Decision**: `docs/reviews/scan-audit-2026-10-07/` is the evidentiary baseline for every
  current-state claim in this spec/plan; this planning pass does not re-verify those claims a
  second time.
- **Context**: that audit was produced by direct source reading plus one independent model
  cross-check with no shared context, in the same engagement.
- **Alternatives considered**: re-derive current-state facts from scratch inside this plan.
- **Reason**: no new evidence would result, only duplicated effort; the audit is file-and-line
  cited, not inferred.
- **Consequences**: if the audit is later found wrong on a specific point, this plan's
  current-state claims built on that point need a correction, traceable back to this ADR.
- **Status**: Decided.

## ADR-002: Extend the capability-SDK contract rather than replace it

- **Decision**: `AuditCapability` remains the base contract for every bounded, stateless-per-call
  execution class; new fields/hooks are additive.
- **Context**: 16 existing vendored capabilities implement the current contract.
- **Alternatives considered**: a parallel "v2" contract for new classes; a full rewrite.
- **Reason**: no repository evidence that extension is insufficient (Constitution Principle
  VIII's evidentiary bar for rewrite); a parallel contract would force every consumer to branch on
  version.
- **Consequences**: every future engine spec must demonstrate its needs fit as an additive field,
  or justify a genuine exception with new evidence.
- **Status**: Decided. See `research.md` R2.

## ADR-003: Untrusted customer-code execution requires a wholly new isolation system

- **Decision**: `apps/sandbox-runner` MUST NOT be extended or reused for executing a customer's
  own code; a new container/VM-grade isolation system is required (now Constitution Principle XI).
- **Context**: the existing sandbox's threat model is "trusted Fahes code against untrusted data,"
  enforced by `node --permission` process-level flags with no CPU quota or process-count limit in
  its own source.
- **Alternatives considered**: harden the existing sandbox with more `--permission` flags and
  resource limits.
- **Reason**: the underlying primitive was never designed as an adversarial-code boundary; adding
  flags does not change what the primitive is proven against.
- **Consequences**: the Untrusted Source Execution Engine (E13) cannot begin implementation until
  its own child spec selects and justifies a specific isolation mechanism — the constitution's
  `TODO(UNTRUSTED_EXECUTION_MECHANISM)` names this explicitly.
- **Status**: Decided (the "new system" classification); mechanism itself is **Open** (see below).

## ADR-004: Authorization and Ownership Verification are permanently distinct entities

- **Decision**: `TargetAuthorization` (new) and `TargetVerification`/`ControlLevel` (existing) are
  separate entities with no reference between them; Ownership Verification never unlocks an active
  execution class by itself (Constitution Principle X).
- **Context**: today's platform only ever offers passive testing, so this distinction was never
  previously needed as an explicit data model.
- **Alternatives considered**: a single "trust level" field spanning both concepts.
- **Reason**: collapsing the two is explicitly named in the triggering task as the single most
  consequential safety mistake this architecture could make.
- **Consequences**: every future active-class engine spec must reference both entities
  independently in its own authorization check.
- **Status**: Decided.

## ADR-005: Metered pricing is scoped narrowly to two execution classes

- **Decision**: only `LOAD_CAPACITY` and `SOURCE_EXECUTION` get variable/metered pricing; every
  other class (including every new engine built on `PASSIVE_HTTP`/`BROWSER`/`CRAWLER`/
  `SOURCE_STATIC`/`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`TELEMETRY`) stays flat-priced.
- **Context**: product input via the 2026-10-07 Clarifications session.
- **Alternatives considered**: a general metering capability available to any future class.
- **Reason**: keeps the credit model simple for the majority of classes; only genuinely
  open-ended-cost classes need metering.
- **Consequences**: if a future child spec finds a flat-priced class has become cost-unbounded, it
  must bring new evidence to revisit this decision — no standing process for that revisit exists
  yet (see Open Decisions, CHK038).
- **Status**: Decided (product-confirmed 2026-10-07).

## ADR-006: Strict parallel-run, no cutover window, for the entire v2 rollout

- **Decision**: current production `/scan` behavior MUST NOT regress at any point; every child
  spec ships additively, behind its own gating, including for pricing/schema/contract/UI changes.
- **Context**: product input via the 2026-10-07 Clarifications session.
- **Alternatives considered**: allow planned, communicated cutover windows for some changes;
  decide per child spec with no blanket policy.
- **Reason**: product explicitly chose the strictest option.
- **Consequences**: every child spec's own plan must include an additive-only demonstration
  (FR-025) or design an explicit compatibility adapter (FR-026) — never propose a cutover.
- **Status**: Decided (product-confirmed 2026-10-07).

## ADR-007: Large evidence artifacts default to the same retention policy as report data

- **Decision**: no separate, shorter retention tier for screenshots/video/traces/HAR by default;
  reuse the existing report-retention sweep's policy and timing.
- **Context**: product input via the 2026-10-07 Clarifications session; informed by the audit's
  finding that staged ZIP uploads already have an unresolved retention gap.
- **Alternatives considered**: a shorter default for large binary artifacts; defer entirely to each
  engine's own spec.
- **Reason**: product chose consistency over a second retention model; the existing gap must be
  closed using the same mechanism, not compounded by a second one.
- **Consequences**: the Evidence/Findings/Artifacts foundation spec (F03) must explicitly resolve
  the staged-upload retention gap as part of implementing this decision, not as an unrelated
  side-quest.
- **Status**: Decided (product-confirmed 2026-10-07).

## ADR-008: Seven new constitution principles (VIII-XIV) govern this architecture and all its
child specs

- **Decision**: amend `.specify/memory/constitution.md` to v1.2.0, adding Principles VIII-XIV
  (Architecture, Evidence, Safety, Customer Code, Long-Running Execution, Multi-Tenancy,
  Evolution-contract) and four new Security-requirement bullets, rather than writing these rules
  only into this spec/plan.
- **Context**: the triggering task explicitly required this architecture to be enforceable against
  future child specs, not merely descriptive.
- **Alternatives considered**: keep these rules spec-local (only in `spec.md`/`plan.md`).
- **Reason**: a spec-local rule is not binding on a sibling child spec the way a constitution
  principle is — Constitution Principle XIV's own enforcement power depends on living in the
  constitution, not in one feature's spec.
- **Consequences**: every future child spec's own `/speckit-plan` Constitution Check must evaluate
  against Principles I-XIV, not just I-VII.
- **Status**: Decided and implemented (constitution bumped to v1.2.0, 2026-10-07).

## ADR-009: Active/adversarial/authenticated evidence must be redacted before storage, and
artifacts need an explicit size budget (found during independent review, not the initial plan)

- **Decision**: extend FR-015 with two new requirements — FR-027 (evidence from
  `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`SOURCE_EXECUTION` must pass through the existing
  `@webaudit/redaction` mechanism before storage/display) and FR-028 (every `Artifact` needs an
  explicit per-object and per-scan size budget enforced at write time, not only a retention
  duration policy). Added a corresponding Security-requirements bullet to the constitution
  (now five bullets, not four).
- **Context**: found during the mandatory independent, adversarial self-review pass that follows
  `/speckit-analyze` in this planning task's own required workflow — specifically while
  challenging "missing safety controls" and "credential leakage" as review dimensions. The
  original plan's Evidence model (FR-015) addressed *what kinds* of evidence exist and *how long*
  they're retained, but never asked whether evidence *content itself* could be dangerous: a
  successful SQL injection's reproduction evidence, for example, could contain real customer
  records.
- **Alternatives considered**: leave this to each engine's own child spec to discover
  independently (rejected — this is exactly the kind of cross-cutting safety requirement
  Constitution Principle VIII says belongs in a shared contract, not rediscovered three separate
  times by E14/E15/E13's own authors); treat it as obvious/already covered by FR-009's generic
  "evidence schema" field (rejected — "obvious" is how safety requirements get silently dropped;
  this review's whole purpose is to make it explicit).
- **Consequences**: F03 (Evidence/Findings/Artifacts) now has two additional, concrete
  requirements to design against, both already present in `data-model.md`'s `Evidence`/`Artifact`
  entities.
- **Status**: Decided and implemented in this same planning pass (spec.md, data-model.md,
  constitution all updated 2026-10-07).

## Open Decisions

| Item | Category | Detail |
|---|---|---|
| Final authorization-tier taxonomy | PROVISIONAL (accepted as working model, refinement allowed) | FR-004 / ADR-004; product accepted the 6-level placeholder 2026-10-07 but a future Foundation spec (F01) may still refine it with new evidence. |
| Untrusted-code isolation mechanism (container runtime, VM, managed platform) | PRODUCT/ENGINEERING DECISION REQUIRED | Constitution `TODO(UNTRUSTED_EXECUTION_MECHANISM)`; explicitly assigned to E13's own `/speckit-plan`, not this master spec. |
| Active-security authorization-level data model's exact representation | PRODUCT DECISION REQUIRED | Constitution `TODO(ACTIVE_SECURITY_AUTHORIZATION_MODEL)`; assigned to F01. |
| Process for revisiting the narrow metering scope if a flat-priced class becomes cost-unbounded | UNKNOWN - REQUIRES INVESTIGATION | Checklist CHK038; no standing escalation process exists today; needs Fahes engineering/product leadership to define one, not invented here. |
| Acceptance bar for "no known escape path" for the future untrusted-code isolation mechanism | UNKNOWN - REQUIRES INVESTIGATION, deferred to E13 | Checklist CHK025; correctly left to the child spec that chooses the mechanism, since the bar depends on which mechanism is chosen. |
| Whether "Billing/Credits UX" needs its own child spec after all | PROVISIONAL (currently: no) | `roadmap.md` Notes; dropped after dependency analysis, re-add only with new evidence from U30's own planning. |
| Exact field list and typing for `Evidence.inlinePayload` vs. `artifactId` selection | DEFERRED TO F03 | `data-model.md` §Evidence; intentionally left to the owning foundation spec rather than guessed here. |
| Some vision-list testing capabilities (IDOR, business-logic/price/coupon manipulation, race conditions) genuinely span two execution classes, not one | UNKNOWN - REQUIRES INVESTIGATION | Found during `tasks.md` T009: IDOR needs `AUTHENTICATED_WORKFLOW` (two sessions/roles to compare) *and* `ACTIVE_SECURITY` (the actual modified-request attempt); price/coupon manipulation and race conditions are similar. The Execution-Class Matrix's "exactly one class" framing (`roadmap.md`'s own Independent Test wording for User Story 2) does not cleanly fit these — E14 (Active Security) and E15 (Authenticated Workflow) child specs should explicitly decide whether such tests run as one engine invoking the other, or as a distinct composite-class concept, rather than this master spec picking one engine arbitrarily. |

All items above are carried forward verbatim into any future `/speckit-analyze` run against a
child spec that touches them — none should be silently resolved by a child spec without tracing
back to this log.
