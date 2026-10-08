# Tenant / Security Boundaries Checklist: Core Scan & Execution Platform

**Purpose**: Validate the requirements-quality of this spec's own threat-model self-review
(master-prompt §29) — IDOR, queue-payload tampering, forged ids, replay, artifact-key
manipulation, Redis/Postgres trust boundaries, and the zero-structural-change claim against every
existing/frozen model this spec touches.
**Created**: 2026-10-07
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [data-model.md](../data-model.md)

**Review pass completed 2026-10-07 (same session)**: 16/16 items pass.

## Tenant Isolation (IDOR)

- [x] CHK-TS001 Is every one of this spec's eight new entities' tenant-scoping statement explicit
  and consistent (direct `userId` column vs. re-derivation chain)? [Completeness, Data-Model
  §each model] — `ScanPlan`/`ExecutionUnit`/`Artifact` carry a denormalized `userId` directly;
  `Evidence`/`ExecutionDependency`/`IssueEvidenceLink` re-derive through their owning
  `ExecutionUnit`/`Evidence` — both patterns stated explicitly, mirroring F01's/F07's own mixed
  pattern (`TargetAuthorization.userId` denormalized vs. `ScopeDefinition`'s re-derivation-only).
- [x] CHK-TS002 Is a cross-tenant id-guessing scenario named in the adversarial review with a
  specific resolving FR? [Coverage, Research §Adversarial Review #22] — resolved by FR-026/FR-041's
  `findFirst({ id, userId })`-equivalent pattern, cited directly.
- [x] CHK-TS003 Is `userId` re-derivation (never caller-supplied) stated for every denormalized
  column? [Security, Data-Model §Validation rules] — stated for `ScanPlan.userId` explicitly,
  matching F01's `TargetAuthorization.userId` precedent by name.

## Queue Payload / Forged-Id / Replay Resistance

- [x] CHK-TS004 Is it specified that a queue payload's content is never trusted as authoritative?
  [Security, Spec §FR-018] — "the worker re-reads the unit's full, current record from Postgres,"
  stated directly.
- [x] CHK-TS005 Does a forged/tampered `ExecutionUnit` id in a payload have a stated, checkable
  failure mode (never silent execution with attacker-supplied state)? [Clarity, Spec §FR-018] — "a
  tampered or forged payload id simply fails the subsequent tenant-scoped lookup," stated
  explicitly.
- [x] CHK-TS006 Is queue-payload replay given the same resolution as any other redelivery (never a
  separate, weaker guarantee)? [Consistency, Research §Adversarial Review #21] — explicitly
  resolved identically to redelivery (idempotency/lease/kill-switch mechanisms, unchanged).

## Artifact Key / Storage Integrity

- [x] CHK-TS007 Is the artifact key format validated before any R2 operation, closing manipulation?
  [Security, Contracts §artifact-contract.md rule 2] — stated, mirroring `assertUploadKey`'s
  existing validation pattern by name.
- [x] CHK-TS008 Does the key scheme prevent a cross-tenant object-key collision? [Security, Research
  §R8] — the `scanId` segment (itself tenant-scoped) is part of every key, and `storageKey` carries
  a `@@unique` constraint at the database level (`data-model.md`'s `Artifact` model).

## Progress / Evidence Spoofing

- [x] CHK-TS009 Is a progress write for an already-terminal unit rejected, closing the "progress
  spoofing after completion" risk? [Security, Spec §FR-027a] — stated as a rejection, logged as an
  anomaly, never applied.
- [x] CHK-TS010 Is `Evidence`/`IssueEvidenceLink` writable only through the two named shared
  functions, closing an engine's ability to fabricate evidence or provenance directly? [Security,
  Contracts §evidence-envelope-contract.md rule 1, §finding-materialization-contract.md rule 1] —
  both state "the only write path" explicitly.

## Redis / Postgres Trust Boundary

- [x] CHK-TS011 Is Redis ever treated as authoritative for anything this spec defines, or always an
  accelerant/ephemeral-delivery-only? [Conflict, Spec §FR-027, Plan §Technical Context] — stated
  as ephemeral-only, "never a system of record," consistent with the constitution's own Technology
  Constraints and F07's own R1/R4 precedent, reused unchanged.
- [x] CHK-TS012 Does any write this spec defines fail *open* on a Postgres unavailability, rather
  than closed? [Security, Research §Adversarial Review #9] — none found; every write this spec
  defines (plan resolution, finalization, evidence/artifact writes) fails closed, inheriting F07's
  own fail-closed posture for the admission/checkpoint calls it makes.

## Zero-Structural-Change Claim

- [x] CHK-TS013 Is the "zero `@relation` edges into any existing/frozen model" claim backed by a
  model-by-model check, not only asserted in prose? [Traceability, Data-Model §every model's own
  field list] — confirmed by direct inspection: every reference to `Target`/`Scan`/`Issue`/
  `TargetAuthorization`/`CapabilityExecution`/`User` across all eight new models is a plain scalar
  column with no `@relation` keyword.
- [x] CHK-TS014 Is the one apparent near-exception (`ExecutionUnit`'s conceptual "belongs to one
  Scan" relationship) correctly implemented as a scalar, with the reason stated? [Consistency,
  Research §R2] — stated and reasoned: a scalar reference costs nothing in practice since every
  real lookup already goes through a tenant-scoped service function.
- [x] CHK-TS015 Is the `ExecutionUnit`-is-not-`CapabilityExecution` decision's own security
  rationale (not polluting the `Capability` registry with non-capability rows) stated, not only
  its schema-feasibility rationale? [Completeness, Spec §Clarifications, Research §R1] — both
  rationales present in both documents.
- [x] CHK-TS016 Does `git status`/`git diff --name-only` (per SC-006) actually confirm zero files
  outside `specs/009-core-scan-execution-platform/` were touched by this planning pass, at the time
  this checklist is reviewed? [Verification, Spec §SC-006] — confirmed at the close of this
  planning pass (see this spec's own final report's Git Safety section).

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied.
- This checklist's scope (security/tenant self-review of this platform's *own* mechanisms) is
  explicitly distinct from any future customer-facing Security Testing engine (E14/SPEC 4) — per
  the master prompt's own §29 framing, restated here: "This is NOT the customer Security Testing
  engine. This is security of Fahes's own execution platform."
