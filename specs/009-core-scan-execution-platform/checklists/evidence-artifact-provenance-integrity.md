# Evidence / Artifact / Provenance Integrity Checklist: Core Scan & Execution Platform

**Purpose**: Validate the requirements-quality of this spec's Result/Evidence Platform context —
the typed Evidence envelope, Artifact storage/retention/budget/orphan-reclamation, Finding
provenance, redaction, and partial-completion coverage reporting.
**Created**: 2026-10-07
**Feature**: [spec.md](../spec.md), [data-model.md](../data-model.md), [contracts/](../contracts/)

**Review pass completed 2026-10-07 (same session)**: 18/18 items pass.

## Evidence Envelope

- [x] CHK-EV001 Is the many-to-many Evidence-Finding relationship stated as a correction to 006's
  own 1:1 sketch, with the specific requirement (master-prompt §20) that forced it? [Traceability,
  Spec §Clarifications, FR-028] — stated directly, quoting the master prompt's own requirement.
- [x] CHK-EV002 Is it specified which function is the *only* write path to `Evidence`? [Security,
  Contracts §evidence-envelope-contract.md rule 1] — `recordEvidence`, stated as the sole path.
- [x] CHK-EV003 Is the inline-vs-artifact decision given a concrete trigger condition, not left to
  each engine's own judgment? [Ambiguity, Research §R7] — a fixed inline-size ceiling, decided by
  the one shared writer, never the calling engine.
- [x] CHK-EV004 Is mandatory redaction scoped to the exact three execution classes 006's/F07's own
  FR-027/FR-024 already name, with no silent narrowing or widening? [Consistency, Spec §FR-030] —
  `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`SOURCE_EXECUTION`, matching both upstream citations
  exactly.
- [x] CHK-EV005 Is the redaction-failure behavior resolved to one concrete choice (not left open)?
  [Gap, Contracts §evidence-envelope-contract.md rule 2] — the row is still written with a fixed
  sentinel payload, directly reusing F07's own resolved choice for the identical problem.

## Artifact Storage, Budget, Retention, Orphan Reclamation

- [x] CHK-EV006 Is the R2 key scheme distinct from both existing R2 prefixes, and is the reason
  stated? [Clarity, Research §R8] — a new `artifacts/` prefix, with the reason (so the new
  retention-sweep extension can enumerate its own objects cleanly) stated explicitly.
- [x] CHK-EV007 Is the upload-then-row ordering specified precisely enough to structurally prevent
  the "DB row exists, upload failed" mismatch direction? [Gap, Contracts §artifact-contract.md
  step 3-4] — ordering is explicit and the structural-prevention claim is stated directly.
- [x] CHK-EV008 Is the opposite mismatch direction ("upload succeeded, DB write failed") given a
  named, scheduled recovery mechanism rather than left as an acknowledged-but-unresolved gap? [Gap,
  Spec §FR-035, Contracts §artifact-contract.md `reclaimOrphanedArtifacts`] — a maintenance sweep,
  extending the existing `timeout-scheduler.ts` pattern, is named explicitly.
- [x] CHK-EV009 Does this spec's own new `Artifact` mechanism actually close the *shape* of the
  existing staged-upload retention gap, or does it only note the gap exists? [Completeness, Plan
  §Current-State Architecture, Spec §FR-034] — closes it proactively for the new class (proven
  deletion call site, extending `enforceRetention`); the existing ZIP-upload gap itself is
  correctly left out of scope (FR-040 forbids touching today's intake path), and this distinction
  is stated explicitly rather than conflated.
- [x] CHK-EV010 Are both the per-object and per-scan cumulative size budgets specified as
  write-time-refusing (never silently truncating)? [Clarity, Spec §FR-033, Contracts
  §artifact-contract.md step 2] — "refuses... never truncates," stated in both documents.
- [x] CHK-EV011 Is the retention-sweep extension specified to run inside the *same* transaction as
  the existing report-retention removal, never a separately-timed second pass? [Consistency, Spec
  §FR-034, Contracts §artifact-contract.md `enforceArtifactRetention`] — stated explicitly, closing
  the "cleanup races with report viewing" adversarial scenario by construction.

## Finding Materialization and Provenance

- [x] CHK-EV012 Is the existing fingerprint/attribution mechanism stated as unchanged, with the
  specific file this spec does not touch named? [Traceability, Spec §FR-036] —
  `packages/scoring/src/fingerprint.ts:fingerprintOf`, named directly, with "this spec does not
  change `Issue`'s existing schema... in any way" stated.
- [x] CHK-EV013 Is `IssueEvidenceLink`'s own write path restricted to one function, preventing an
  engine from fabricating provenance directly? [Security, Data-Model §Validation rules, Contracts
  §finding-materialization-contract.md rule 1] — restricted to `materializeFinding` only.
- [x] CHK-EV014 Does the five-question operability bar (`spec.md` FR-009, for `ExecutionUnit`)
  extend to a Finding's own provenance with the same specificity? [Completeness, Spec §FR-037] —
  restated at the Finding level, naming the same five facts.

## Partial Completion / Coverage

- [x] CHK-EV015 Is it specified that a `COMPLETED` unit's Findings are never discarded due to a
  sibling unit's failure? [Clarity, Spec §FR-038] — stated as an unconditional guarantee.
- [x] CHK-EV016 Is the boundary between "this platform reports coverage facts" and "a future SPEC 6
  judges sufficiency" kept explicit, with no readiness-scoring logic accidentally designed here?
  [Conflict, Spec §FR-038/FR-039, Contracts §finding-materialization-contract.md
  `scanCoverageSummary`] — `scanCoverageSummary`'s own rule 3 states it computes no verdict, only
  facts.
- [x] CHK-EV017 Are all six non-`COMPLETED` terminal statuses (`FAILED`/`CANCELLED`/`KILLED`/
  `BLOCKED`/`SKIPPED`/`REFUSED`) each individually distinguishable in the coverage summary's own
  output shape? [Completeness, Contracts §finding-materialization-contract.md] — the
  `nonCompletedUnits` shape carries each unit's own `status` value directly, not a collapsed
  boolean.

## Tenant/Security

- [x] CHK-EV018 Is every new Evidence/Artifact/IssueEvidenceLink lookup tenant-scoped, and is the
  re-derivation path (through `Scan`/`ExecutionUnit`, never a bare id) stated explicitly? [Security,
  Spec §FR-041/FR-042, Data-Model §Validation rules] — stated for all three entities.

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied.
- This checklist mirrors `runtime-cancellation-recovery-safety.md`'s structure, scoped to the
  Result/Evidence Platform bounded context instead.
