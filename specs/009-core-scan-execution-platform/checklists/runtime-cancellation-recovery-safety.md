# Runtime / Cancellation / Recovery Safety Checklist: Core Scan & Execution Platform

**Purpose**: Validate the requirements-quality of this spec's Execution Runtime context
specifically — queue placement, process isolation/force-termination, the three-way cancellation
distinction, crash/restart/stale-worker safety, retry/idempotency, and correct F07 consumption
(never a private parallel mechanism).
**Created**: 2026-10-07
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [data-model.md](../data-model.md)

**Review pass completed 2026-10-07 (same session)**: 20/20 items pass.

## Queue Placement and Topology

- [x] CHK-RT001 Does every non-passive execution class have an explicitly named, dedicated queue,
  with no two classes sharing one? [Completeness, Plan §Runtime/Queue Topology] — six names listed,
  one per class, zero sharing.
- [x] CHK-RT002 Is the `BROWSER`-queue refinement (departing from 006's own tentative placement)
  recorded as a deliberate, evidence-grounded amendment rather than a silent divergence? [Clarity,
  Research §R3/R12] — both present, citing Constitution Principle XII directly.
- [x] CHK-RT003 Does a queue job payload ever carry more than an id? [Security, Spec §FR-018,
  Contracts §execution-runtime-contract.md] — explicitly forbidden, restated in both documents.

## Process Isolation / Force Termination

- [x] CHK-RT004 Is the exact mechanism (child process + parent-armed `SIGKILL`) stated precisely
  enough that two independent implementers would build the same thing? [Clarity, Spec §FR-019] —
  the existing `armTimeout` precedent is cited by name and file path.
- [x] CHK-RT005 Is this mechanism's scope explicitly distinguished from Constitution Principle XI's
  heavier bar, closing the risk that E13 could point at this spec as "already solved"? [Conflict,
  Spec §Clarifications, Research §R4] — both state the distinction explicitly and give the
  rationale (liveness vs. containment).
- [x] CHK-RT006 Is the limitation (an external side effect already dispatched is not retracted) a
  concrete, non-overclaiming statement? [Honesty, Spec §FR-019, Plan §Force-Termination
  Limitations] — stated identically in both, with no broader claim made.
- [x] CHK-RT007 Does this resolve F07's own named open dependency with a direct citation back to
  F07's `research.md` R7? [Traceability, Spec §SC-003] — SC-003 names the exact verification
  method.

## Three-Way Cancellation Distinction

- [x] CHK-RT008 Are `CANCELLED`/`KILLED`/`FAILED` each given a distinguishable, checkable
  definition at the `ExecutionUnit` level? [Clarity, Data-Model §ExecutionUnitStatus, Spec §FR-021]
  — each maps one-to-one to a specific F07 reason or this spec's own `FailureClass`.
- [x] CHK-RT009 Does any requirement anywhere collapse two of these three into one state? [Conflict,
  Spec §FR-021, Plan §Cancellation Diagram] — none found; the state diagram keeps all three
  terminal and distinct.
- [x] CHK-RT010 Is it specified which classes this distinction applies to vs. which keep today's
  unchanged cooperative-flag model? [Completeness, Spec §FR-022] — `requiresSafetyCheckpoint`'s
  computed value is the exact, checkable gate.

## Crash / Restart / Stale-Worker Safety

- [x] CHK-RT011 Is API/orchestrator crash during plan resolution given a concrete, checkable
  resolution? [Gap, Research §Adversarial Review #10] — resolved: a crash leaves the plan absent
  or `REFUSED`, never half-populated (resolution is a single bounded, idempotent-at-the-DB-level
  operation).
- [x] CHK-RT012 Is a redelivered job for an already-finalized unit specified to never re-execute?
  [Completeness, Spec §FR-025, Contracts §runtime-finalization-contract.md] — rule 2 states this
  directly.
- [x] CHK-RT013 Does a late, superseded worker's write get rejected, and by which specific
  mechanism? [Clarity, Research §Adversarial Review #15] — F07's own lease-fencing, consumed
  unchanged, plus this spec's own FR-027a for progress writes specifically.
- [x] CHK-RT014 Is the "worker crashes after evidence write, before finalization" scenario resolved
  without losing the already-written evidence? [Gap, Research §Adversarial Review #12,
  Contracts §evidence-envelope-contract.md] — Evidence writes commit independently of
  finalization, per the contract's own required-behavior step 4.

## Retry / Idempotency / Failure Classification

- [x] CHK-RT015 Is every `FailureClass` value given a distinguishable, non-overlapping definition?
  [Clarity, Spec §FR-023] — nine values, each with a concrete example distinguishing it from its
  neighbors.
- [x] CHK-RT016 Is it specified who assigns `failureClass` (never the engine itself)? [Security,
  Research §R9, Contracts §execution-unit-contract.md rule 1] — stated explicitly, mirroring the
  existing attribution-assignment precedent.
- [x] CHK-RT017 Is the `DETERMINISTIC_FINDING` value's actual persisted behavior unambiguous?
  [Consistency, Research §R9a] — **found and fixed during this checklist's own review**: this value
  is never persisted as `failureClass`; it routes the classification function to `COMPLETED`
  instead — see `research.md` R9a.
- [x] CHK-RT018 Is idempotence required to be *proven*, not assumed, before `attempts > 1` is
  permitted for any class? [Completeness, Spec §FR-024] — directly states this, extending
  Constitution Principle XII's existing rule as a gating requirement on this spec's own
  `retryPolicy` field.

## Correct F07 Consumption (never a private parallel mechanism)

- [x] CHK-RT019 Does any FR in this spec reimplement any piece of F07's own admission/checkpoint/
  kill-switch sequence rather than calling it? [Conflict, Spec §FR-022, Contracts
  §execution-runtime-contract.md] — reviewed line by line; every mandatory F07 call point is
  delegated, never re-derived locally.
- [x] CHK-RT020 Is the boundary between "this spec's own `ExecutionUnit` finalization idempotency"
  and "F07's own budget/lease idempotency" stated clearly enough that an implementer would not
  conflate the two? [Ambiguity, Research §R6] — R6 states this spec's own obligation explicitly as
  a *different*, this-spec-owned guarantee layered beside F07's, not a restatement of it.

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied.
- This checklist's scope is deliberately narrower than `requirements.md` — it tests only the
  Execution Runtime bounded context's own safety-critical surface, mirroring F07's own
  `safety-killswitch.md`'s focus on its narrower domain.
