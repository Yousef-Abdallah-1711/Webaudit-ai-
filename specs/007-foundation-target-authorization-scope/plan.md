# Implementation Plan: Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope

**Branch**: `007-foundation-target-authorization-scope` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-foundation-target-authorization-scope/spec.md`

**Note on template fit**: like the parent master architecture, this plan does not implement
anything — no migration runs, no application code is written (per this spec's own non-goals and
Constitution Principle XIV's "complete contract before implementation" gate). Unlike the parent,
this plan's "how" answers are concrete and final for its own three entities: the actual intended
Prisma schema (`data-model.md`), the actual function signatures a consuming engine calls
(`contracts/`), not placeholders deferred to a further child spec — because this *is* that further
child spec for Target/Environment/Ownership/Authorization/Scope specifically.

## Summary

This spec turns the parent master architecture's placeholder Authorization/Scope/Environment
concepts into real, migratable contracts. Technical approach: three new Prisma models
(`TargetEnvironment`, `TargetAuthorization`, `ScopeDefinition`) plus two new enums
(`ExecutionClass`, `TargetEnvironmentClassification`), attaching to the existing `Target` model
with zero *semantic* modification to `Target`/`TargetVerification` and exactly two
Prisma-required, business-meaning-free structural back-relation fields on `Target`
(`targetEnvironment`/`targetAuthorizations` — proven necessary, not assumed, by running
`prisma validate` against an isolated schema copy during this spec's closure pass; see
`data-model.md`'s Prisma feasibility note); a derived (never persisted-as-truth)
`ACTIVE` lifecycle state, following the exact pattern the existing `reconfirmControl` already
proves correct for a structurally identical cached-column-vs-live-truth problem; a structured,
non-regex Scope pattern language with single-level subdomain wildcarding (Clarifications
2026-10-07); fixed platform-wide budget ceilings (Clarifications 2026-10-07); owner-creates/
owner-or-operator-revokes grant authority (Clarifications 2026-10-07); and reuse of the existing
`AuditLogEntry` mechanism for the grant lifecycle's own audit trail. The single hardest design
problem this plan resolves explicitly (not left to a later spec to discover unresolved) is the
immutable-`ScanPlan`-vs-live-revocation tension the parent's own handoff brief flagged: solved by
snapshotting *which grant* a plan relies on immutably, while re-running the authorization check
live at both plan-resolution time and at dispatch time (FR-014).

## Technical Context

**Language/Version**: Node.js >=22, TypeScript — inherited from the existing monorepo standard, no
new runtime introduced.

**Primary Dependencies**: Prisma/PostgreSQL (existing) — this spec adds three models and two enums
to the existing schema; no new dependency is introduced. The contracts this spec defines
(`contracts/*.md`) are implemented as plain TypeScript functions/modules, matching the existing
`control-gate` service's own style (no new library needed for pure comparison/matching logic).

**Storage**: PostgreSQL via Prisma (existing), extended with `TargetEnvironment`,
`TargetAuthorization`, `ScopeDefinition` tables and `ExecutionClass`/
`TargetEnvironmentClassification` enums (native Postgres array support used for
`TargetAuthorization.executionClasses`/`environmentRestriction`, per `research.md` R5). No Redis or
R2 involvement — this spec's entities are small, relational, and have no large-object storage need.

**Testing**: existing test stack (Vitest for unit/contract/integration) — a future
`/speckit-implement` pass against this spec inherits the existing platform's test-first discipline
(Constitution's Development Workflow section) and, per `handoff-F01.md`'s own "done" bar, must
demonstrate the tenant-isolation and authorization-is-not-ownership invariants with adverse tests,
matching the existing `apps/api/tests/adverse/control-gate.test.ts` pattern this spec's grant
lifecycle directly parallels.

**Target Platform**: existing `apps/api` (grant lifecycle service, authorization-check contract
call sites at plan-resolution time) and `apps/worker` (dispatch-time re-check call sites, per
FR-014) — no new deployable unit.

**Project Type**: N/A — this is a foundation/contract planning artifact, the same framing the
parent spec used, narrowed here to a package that also finalizes a real schema (see Project
Structure below).

**Performance Goals**: N/A for this plan itself. The authorization-check contract (FR-013) is
called at minimum twice per execution-class-per-execution-unit (plan-resolution + dispatch time,
FR-014) — its own future implementation should be a small number of indexed queries
(`@@index([targetId, userId])`), not a concern this spec's contract-level design needs to size
further; a future implementation that discovers a real latency problem addresses it as an
implementation detail, not a contract change.

**Constraints**: the five constraints this plan treats as binding, inherited from the parent and
sharpened for this spec's own content: (1) zero *semantic* changes to `Target`/`TargetVerification`/
any existing control-gate function, limited to exactly two proven-necessary Prisma structural
back-relation fields on `Target` (FR-021); (2) no FK or derived-read relationship between
`TargetAuthorization` and `TargetVerification`, ever (FR-002); (3) every budget MUST be finite and
within this spec's own stated platform-wide maximums (FR-011); (4) every new entity MUST be
tenant-scoped at creation per FR-019/FR-020; (5) the authorization-check contract MUST be called
fresh at both plan-resolution and dispatch time — never cached across that boundary (FR-014).

**Scale/Scope**: three new Prisma models, two new enums, three documented contracts
(authorization-check, scope-matching, grant-lifecycle). Directly unblocks F02 (Scan Profiles/
Execution Planning), F05 (Credentials/Sessions), and F07 (Safety/Kill Switch/Audit Trail) per
`specs/006-scan-architecture-v2/roadmap.md`'s dependency table — this spec's own "done" bar (per
`handoff-F01.md`) is that each of those three can be planned in concrete detail citing this spec's
entities/contracts, not placeholders.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.2.0 (Principles I-XIV).*

| Principle | Check | Result |
|---|---|---|
| I. Skills Are Plugins | Does this plan force core code to name a concrete future capability? | PASS — not applicable; this spec defines data/authorization contracts, not capability dispatch. |
| II. Vendored Forever | Does this plan introduce any runtime fetch of third-party code? | PASS — not applicable. |
| III. Deterministic Before Probabilistic | Does this plan let AI judgment decide an authorization/scope outcome? | PASS — FR-022/the parent's own Principle XXII-equivalent rule ("AI Is Not Authorization," `handoff-F01.md` §22) is honored throughout: `isAuthorized`/`isInScope` are pure, deterministic functions with no AI involvement anywhere in this design. |
| IV. No Single Point of AI Failure | Does this plan route any new AI usage outside `AIExecutor`? | PASS — not applicable; no AI usage is introduced. |
| V. Untrusted Code Runs Isolated | Does this plan let untrusted code execute without proven isolation? | PASS — not applicable; this spec names `SOURCE_EXECUTION` as an `ExecutionClass` value a grant may reference, but designs no execution logic or isolation mechanism (that remains E13's). |
| VI. Metered, Reconciled Cost | Does this plan propose any unmetered expensive operation? | PASS — this spec defines budget *shape* only (FR-011); no pricing/metering logic is introduced, consistent with the parent's FR-020 narrow-metering-scope decision remaining F06's concern. |
| VII. Verify Narrowly, Rescan Rarely | Does this plan's design force a full rescan for a targeted check? | PASS — not applicable; this spec defines no reverify logic. |
| VIII. Engines Serve Domains | Does this plan let any domain/engine own a private authorization check? | PASS — `contracts/authorization-check-contract.md`/`scope-matching-contract.md` are the one shared implementation every future engine MUST call, per those contracts' own "non-negotiable boundary rules." |
| IX. Evidence Is Reproducible | Does this plan's design affect finding/evidence identity? | PASS — not applicable; this spec produces no findings/evidence. |
| X. Authorization Is Not Ownership | Does this plan collapse ownership verification and authorization anywhere? | PASS — the one invariant this entire spec exists to hold; FR-002/FR-004 and `data-model.md`'s relationship diagram show zero structural connection, only a one-time precondition check at grant creation. |
| XI. Untrusted Code Isolation | See V above. | PASS |
| XII. Long-Running Work | Does this plan assume a grant's lifecycle fits a short-job model? | PASS — `TargetAuthorization`'s duration budget is explicitly bounded (max 30 days) but is a *permission window*, not a *job*; the actual long-running-execution lifecycle concerns (heartbeat, recovery, idempotence) remain F04's, which this spec's FR-014 explicitly hands the live-recheck obligation to. |
| XIII. Tenant Boundaries | Does this plan's data model introduce any entity reachable cross-tenant without scoping? | PASS — FR-019/FR-020 and `data-model.md`'s explicit tenant-scope statement per entity; zero unscoped new entities. |
| XIV. Capability Contract | Does this plan's design declare a complete contract before any consumer implements against it? | PASS — `contracts/` fully specifies the authorization-check, scope-matching, and grant-lifecycle shapes; FR-022 explicitly requires any consuming engine to implement FR-013's full check, not a subset, before its first production capability executes. |

**Gate result: PASS, no violations.** Complexity Tracking table is empty — no principle required an
exception in this pass.

### Post-design re-check (after Phase 1)

Re-evaluated against the completed `data-model.md`/`contracts/`: no new violation surfaced. The one
design point worth re-confirming explicitly against Principle X: `TargetAuthorization.userId` is a
*denormalized copy* of `Target.userId`, not a reference to any ownership-verification state — it
exists purely for FR-019's tenant-isolation query efficiency, and `data-model.md`'s validation
rules require it to be re-derived from the Target at creation time (never caller-supplied), closing
the one place a careless implementation could accidentally let a grant's apparent owner drift from
its Target's actual owner.

### Post-closure re-check (closure pass)

Re-evaluated a second time after this spec's closure pass (Prisma feasibility proof, wildcard
contradiction removal, budget/kill-switch ownership correction, target-bound-scope precision fix,
environment auditability addition). Specifically against Principle X: does adding two structural
back-relation fields to `Target` (`targetEnvironment`/`targetAuthorizations`) reopen any risk of
`Target` carrying authorization-adjacent state? **No** — both fields are bare Prisma relation
declarations with no scalar value, no default, and no read path from any of `Target`'s 16 existing
capabilities; they let Prisma's query engine traverse the relation graph and carry no business
meaning themselves, the same as the two existing sibling fields (`verifications`, `scans`) that
predate this spec and were never considered a Principle X risk. Gate result unchanged: **PASS, no
violations.**

## Project Structure

### Documentation (this feature)

```text
specs/007-foundation-target-authorization-scope/
├── spec.md                                  # Feature specification (done)
├── checklists/requirements.md               # Spec quality checklist (done, 24/24 passing)
├── plan.md                                  # This file
├── research.md                              # Phase 0 output (done)
├── data-model.md                            # Phase 1 output — real, final schema (done)
├── contracts/                               # Phase 1 output (done)
│   ├── authorization-check-contract.md
│   ├── scope-matching-contract.md
│   └── grant-lifecycle-contract.md
├── quickstart.md                            # Phase 1 output — self-check + consumer-validation guide (done)
└── tasks.md                                 # Phase 2 output (speckit-tasks — not yet run)
```

### Source Code (repository root)

Not applicable to this planning pass. This feature produces no Prisma migration, no new route, no
new service file — `data-model.md` and `contracts/` are the real, final design a future
`/speckit-implement` pass transcribes, not placeholders a further child spec must still finalize
(the one respect in which this spec's "Source Code" section differs from the parent's own
documentation-only framing: the *design* is final here, even though no code is written in this
pass). When a future session does implement this spec, the natural landing spots — named here for
that session's convenience, not created by this one — are: `apps/api/prisma/schema.prisma` (the
three models/two enums, plus the two proven-necessary structural back-relation fields on the
existing `Target` model — see `data-model.md`'s Prisma feasibility note), a new
`apps/api/src/services/authorization/` directory (parallel to the
existing `apps/api/src/services/control-gate/`, holding `create.ts`/`revoke.ts`/`narrow.ts` for the
grant-lifecycle contract and `check.ts`/`scope-match.ts` for the authorization-check/scope-matching
contracts), and `apps/api/tests/adverse/authorization.test.ts` (parallel to the existing
`control-gate.test.ts`).

**Structure Decision**: documentation-only structure for this planning pass as shown above, with a
real, implementation-ready schema and contract design (not a further-deferred placeholder) — no
source tree is created or modified by this plan itself.

## Complexity Tracking

*No entries — the Constitution Check above found zero violations requiring justification.*
