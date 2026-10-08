# Implementation Plan: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail

**Branch**: `008-safety-killswitch-budget-audit` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-safety-killswitch-budget-audit/spec.md`

**Note on template fit**: like F01, this plan does not implement anything — no migration runs, no
application code is written (Constitution Principle XIV's "complete contract before implementation"
gate; this session's explicit instruction not to run `/speckit-implement`). This plan's "how" answers
are concrete for the mechanisms this spec owns (the atomic admission primitive, the kill-switch state
machine, the audit schema), the same way F01's plan was concrete for its own three entities — because
this *is* the further child spec F01 deferred those mechanisms to.

## Summary

This spec turns the parent architecture's and F01's placeholder safety concepts
(`SafetyAdmission`/`ExecutionAuditEvent`/the emergency-stop and kill-switch mechanisms) into a real,
implementable design: one atomic, Postgres-system-of-record admission operation that combines a fresh
F01 `isAuthorized` call with budget reservation in a single transaction (closing the race F01's FR-024
explicitly leaves open); a durable, restart-safe `KillSwitchState` machine
(`REQUESTED → ACKNOWLEDGED → STOPPED`, with `ESCALATED` as a parallel event) propagated to running
workers through the existing Redis pub/sub accelerant pattern this codebase already uses for scan
cancellation, generalized from one `scanId` channel to a small fixed set of scope-keyed channels
(execution/scan/grant/target/tenant/platform); a bounded 5-second cooperative stop-latency checkpoint
contract reusing this codebase's existing `AbortSignal`-composition idiom; and a new `ExecutionAuditEvent`
table (distinct from the existing admin-only `AuditLogEntry`) with mandatory `@webaudit/redaction` pass-
through before persistence. The single hardest design problem this plan resolves explicitly is: **what is
authoritative for "how much budget is left, right now, safe against concurrent consumers"** — resolved as
Postgres row-level locking (`SELECT ... FOR UPDATE`), the same mechanism already proven correct in
production for the structurally identical credit-ledger oversell problem, never a Redis-only decision,
because the constitution's Technology Constraints state Redis is "cache, queue, and rate-limit state only,
never a system of record" and a grant's cumulative lifetime budget is a ledger, not a transient rate limit.

## Technical Context

**Language/Version**: Node.js >=22, TypeScript — existing monorepo standard, no new runtime.

**Primary Dependencies**: Prisma/PostgreSQL (existing, system of record for all new durable state this
spec defines), ioredis/BullMQ (existing, used only as a propagation accelerant and for the existing
queue infrastructure new execution-engine queues will sit on — not as a system of record, per the
constitution's Technology Constraints). No new dependency is introduced; the contracts this spec defines
are implemented as plain TypeScript service functions, matching `control-gate`'s and `credits`'s own style.

**Storage**: PostgreSQL via Prisma — three new tables (`AdmissionLease`, `BudgetConsumption`,
`ExecutionAuditEvent`) plus `KillSwitchState` (see `data-model.md` for whether this is its own table or a
derived view over audit events — resolved there, not guessed here). Redis is used only for the
kill-switch pub/sub propagation accelerant (generalizing `packages/config/src/cancellation.ts`'s existing
single-channel-per-scan pattern) — never for the authoritative admission/budget decision.

**Testing**: existing Vitest stack; a future `/speckit-implement` pass inherits the existing adverse-test
discipline this codebase already applies to credits (`apps/api/tests/adverse/credits-debit-refund-race.
test.ts`) and control-gate (`apps/api/tests/adverse/control-gate.test.ts`) — this spec's own `plan.md`
Phase 1 names the adverse scenarios a future implementation must prove (concurrent admission race,
crash-mid-reservation, redelivery-after-stop), mirroring that existing precedent rather than inventing a
new test philosophy.

**Target Platform**: existing `apps/api` (admission/kill-switch-trigger service, audit-event write path)
and `apps/worker` (checkpoint-contract call sites, kill-switch subscriber, escalation/SIGKILL execution) —
no new deployable unit; this spec's mechanisms live beside the existing `control-gate`/`credits`/
`cancellation` services, not in a new process.

**Project Type**: N/A — foundation/contract planning artifact, same framing as F01, narrowed to a package
that also finalizes real schema/contracts for its own three mechanisms.

**Performance Goals**: the Safety Admission operation is called at minimum once per execution-unit
dispatch and, for `CRAWLER`/`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`, once per
safety-sensitive action within a running execution — it MUST be a small, indexed, single-transaction
Postgres operation (mirroring `credits/debit.ts`'s own locked-lot-read-then-write shape), not a concern
this plan sizes further than "the same order of latency as today's credit debit, which is already called
once per scan creation on the request-handling path."

**Constraints**: (1) Postgres is the sole system of record for admission/budget/kill-switch decisions,
per the constitution's Technology Constraints — Redis MAY accelerate propagation but MUST NOT be the
authority a checkpoint trusts when it disagrees with Postgres; (2) the cooperative stop-latency bound is
fixed at 5 seconds (spec.md FR-013) and MUST NOT be loosened by any future engine; (3) every budget
mutation MUST be idempotent under BullMQ at-least-once redelivery (spec.md FR-008); (4) this spec's own
entities MUST be tenant-scoped exactly as F01's are (inherited through the owning `TargetAuthorization`);
(5) `ExecutionAuditEvent` content MUST pass through `@webaudit/redaction` before any write, no exception.

**Scale/Scope**: three to four new Prisma models (see data-model.md for the exact count — whether
`KillSwitchState` needs its own table or is derived from `ExecutionAuditEvent` is resolved there), one new
Redis channel-naming scheme (generalizing the existing single-scan-id scheme), three documented contracts
(safety-admission, kill-switch, execution-audit). Directly unblocks every future active-class engine spec
(E13/E14/E15/E16) and is itself unblocked only by F01 (frozen) — per `specs/006-scan-architecture-v2/
roadmap.md`'s dependency table, F07 is the one remaining prerequisite those four engine specs share.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.2.0 (Principles I-XIV).*

| Principle | Check | Result |
|---|---|---|
| I. Skills Are Plugins | Does this plan force core code to name a concrete future engine? | PASS — not applicable; this spec defines a safety/admission/audit contract every engine calls, naming no specific engine's logic. |
| II. Vendored Forever | Does this plan introduce any runtime fetch of third-party code? | PASS — not applicable. |
| III. Deterministic Before Probabilistic | Does this plan let AI judgment decide an admission/kill-switch/audit outcome? | PASS — FR-025 ("AI Is Not Safety") is honored throughout; every operation this plan designs is a pure function of durable state. |
| IV. No Single Point of AI Failure | Does this plan route any new AI usage outside `AIExecutor`? | PASS — not applicable; no AI usage introduced. |
| V. Untrusted Code Runs Isolated | Does this plan let untrusted code execute without proven isolation? | PASS — not applicable; this spec's kill-switch/escalation mechanism generalizes the existing sandbox-runner's SIGKILL pattern but does not itself design any isolation boundary (E13 owns that). |
| VI. Metered, Reconciled Cost | Does this plan propose any unmetered expensive operation? | PASS — this spec enforces budgets F01/F06 define; it introduces no new pricing logic itself. |
| VII. Verify Narrowly, Rescan Rarely | Does this plan force a full rescan for a targeted check? | PASS — not applicable; no reverify logic here. |
| VIII. Engines Serve Domains | Does this plan let any engine own a private admission/kill-switch/audit implementation? | PASS — `contracts/` are the one shared implementation every future engine MUST call (FR-018's checkpoint contract), explicitly reusing the existing `admission-gate.ts`/credit-ledger/cancellation/redaction patterns rather than inventing parallel ones per engine. |
| IX. Evidence Is Reproducible | Does this plan affect finding/evidence identity? | PASS — not applicable; `ExecutionAuditEvent` is a safety record, not a Finding; it reuses `@webaudit/redaction`, not a new attribution scheme. |
| X. Authorization Is Not Ownership | Does this plan let any safety mechanism become a production escape hatch? | PASS — this plan touches nothing in F01's `environmentRestriction`/`FR-015a` production prohibition; FR-016 explicitly treats an environment reclassification as a stop trigger, tightening enforcement, never loosening it. |
| XI. Untrusted Code Isolation | See V above. | PASS |
| XII. Long-Running Work | Does this plan assume every future execution class fits today's ~15-min/60s short-job defaults? | PASS — the checkpoint contract (FR-018) and 5-second stop-latency bound (FR-013) are explicitly sized for long-running work, not copied from `scanPhase`'s short-job queue defaults; FR-008's idempotency design explicitly addresses `attempts > 1` safety per Principle XII. |
| XIII. Tenant Boundaries | Does this plan's data model introduce any entity reachable cross-tenant without scoping? | PASS — every new entity (`AdmissionLease`, `BudgetConsumption`, `ExecutionAuditEvent`) is scoped through its owning `TargetAuthorization`'s `userId`, per `data-model.md`. |
| XIV. Capability Contract | Does this plan declare a complete contract before any consumer implements against it? | PASS — `contracts/` fully specifies the safety-admission, kill-switch, and execution-audit shapes; FR-027 requires any consuming engine to implement the full checkpoint contract, not a subset. |

**Gate result: PASS, no violations.** Complexity Tracking table is empty.

### Post-design re-check (after Phase 1)

Re-evaluated against the completed `data-model.md`/`contracts/`. The one design point worth re-confirming
explicitly against the constitution's Technology Constraints: does `AdmissionLease`'s Redis-accelerated
propagation (used only so a worker's checkpoint can learn about a kill-switch stop faster than a Postgres
poll would allow) ever become the *decision* authority rather than an accelerant? **No** — every checkpoint
in `contracts/safety-checkpoint-contract.md` re-reads Postgres for the authoritative admission/kill-switch
verdict whenever Redis is unavailable or disagrees (fail-closed per FR-005/FR-021); Redis absence degrades
latency (a checkpoint falls back to polling Postgres directly), never correctness. Gate result unchanged:
**PASS, no violations.**

## Project Structure

### Documentation (this feature)

```text
specs/008-safety-killswitch-budget-audit/
├── spec.md                                  # Feature specification (done)
├── checklists/requirements.md               # Spec quality checklist (done, 16/16 passing)
├── plan.md                                  # This file
├── research.md                              # Phase 0 output
├── data-model.md                            # Phase 1 output
├── contracts/                               # Phase 1 output
│   ├── safety-admission-contract.md
│   ├── kill-switch-contract.md
│   ├── safety-checkpoint-contract.md
│   └── execution-audit-contract.md
├── quickstart.md                            # Phase 1 output
└── tasks.md                                 # Phase 2 output (speckit-tasks — not yet run)
```

### Source Code (repository root)

Not applicable to this planning pass — no Prisma migration, no new route, no new service file is created
by this session. When a future session implements this spec, the natural landing spots (named here for
that session's convenience, not created by this one): `apps/api/prisma/schema.prisma` (three/four new
models — see `data-model.md`), a new `apps/api/src/services/safety/` directory (parallel to the existing
`apps/api/src/services/control-gate/` and `apps/api/src/services/credits/`, holding `admission.ts`
(Safety Admission), `kill-switch.ts` (trigger + state-transition functions), `audit.ts`
(`ExecutionAuditEvent` writer, redaction-wrapped)), an extension of `packages/config/src/cancellation.ts`'s
channel-naming scheme to the new scope-keyed channels (`apps/worker/src/orchestrator/kill-switch.ts`
alongside the existing `cancellation.ts`, following its exact subscribe/unsubscribe shape), and
`apps/api/tests/adverse/safety-admission-race.test.ts` / `apps/worker/tests/adverse/kill-switch-stop.
test.ts` (parallel to the existing `credits-debit-refund-race.test.ts`/`control-gate.test.ts` pattern).

**Structure Decision**: documentation-only structure for this planning pass, with a real,
implementation-ready schema and contract design — no source tree is created or modified by this plan.

## Complexity Tracking

*No entries — the Constitution Check above found zero violations requiring justification.*
