# Finding Materialization Contract

Per `spec.md` FR-036/FR-037/FR-038/FR-039. How `Evidence` becomes a Finding (`Issue`, existing,
unchanged) and how provenance/partial-completion coverage is tracked. This is the one place a new
execution class's engine connects to the existing, untouched fingerprint/attribution/`Issue`
machinery.

## `materializeFinding`

```text
materializeFinding(
  executionUnitId: string,
  fingerprintParts: readonly unknown[],     // the engine's own declared parts — existing mechanism, unchanged
  findingShape: { severity, title, explanation, consequence, location?, fixPrompt, fixable },
  supportingEvidenceIds: string[],          // Evidence.id values this Finding depends on (FR-037)
) -> Issue  // existing model; attribution assigned by the runner, exactly as today, never by this function's caller
```

1. Compute the fingerprint via the existing, unchanged mechanism
   (`packages/scoring/src/fingerprint.ts:fingerprintOf`) from `fingerprintParts` — this function
   does not invent a parallel identity scheme (FR-036).
2. Upsert the `Issue` row exactly as today's existing `persistModuleResult` pathway does for a
   vendored capability's findings (same `@@unique([scanId, fingerprint])` semantics) — this
   function does not change `Issue`'s schema, state machine, or attribution assignment in any way.
3. For each `supportingEvidenceIds` entry: create an `IssueEvidenceLink` row (`data-model.md`) —
   skipping any id already linked to this `Issue` (idempotent against a retried call).

## `scanCoverageSummary` (FR-038/FR-039 — the report-level read path's own completeness metadata)

```text
scanCoverageSummary(scanPlanId: string) -> {
  completedUnits: ExecutionUnitRef[],
  nonCompletedUnits: { unit: ExecutionUnitRef, status: ExecutionUnitStatus, reason?: string }[],
}
```

A pure read over `ExecutionUnit` rows for the plan — this function computes no readiness verdict,
no pass/fail judgment, and no score (that remains a future SPEC 6's own concern, FR-038); it only
answers "what ran, what didn't, and why," which is this platform's own complete obligation.

## Non-negotiable boundary rules

1. `IssueEvidenceLink` rows are only ever written by `materializeFinding` — never directly by an
   engine, so a Finding's provenance (FR-037) is always traceable to a known, auditable code path
   (`data-model.md`'s own validation rule).
2. `materializeFinding` never discards or hides a `COMPLETED` unit's Findings because a sibling
   unit in the same plan failed/was cancelled/was killed (FR-038) — every `COMPLETED` unit's
   Findings materialize independently of every other unit's outcome.
3. `scanCoverageSummary` never fabricates a completeness verdict ("good enough"/"not good
   enough") — it reports facts (which units completed, which didn't, and why) for a future
   consumer (SPEC 6) to judge, never judging itself.
4. No AI judgment may decide a fingerprint, an attribution, a provenance link, or a coverage fact
   (FR-046) — every output of this contract is a deterministic function of its inputs and the
   existing, unchanged fingerprint mechanism.
