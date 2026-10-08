# Visual Baseline Contract

Per `spec.md` FR-026/FR-026a. The approval lifecycle for a candidate screenshot becoming the
comparison point for future `SCREENSHOT_DIFF` findings — user-controlled, per this session's own
confirmed product-policy decision. **Revised during this spec's own closure pass** (`data-model.md`
Closure Finding CF-1) to use a pointer (`VisualBaseline`)/history (`VisualBaselineApproval`) split,
after the original single-table design was found infeasible as drafted.

## `getActiveBaseline`

```text
getActiveBaseline(userId: string, pageIdentity: PageIdentity, browserMatrixEntryHash: string) -> VisualBaselineApproval | null
```

A pure read: look up the `VisualBaseline` pointer row for this exact triple; if found, return the
`VisualBaselineApproval` row its `activeApprovalId` references; if no pointer row exists, return
`null` (no baseline has ever been approved for this triple).

## `approveBaseline`

```text
approveBaseline(
  userId: string, approvedBy: string, scanId: string,
  pageIdentity: PageIdentity, browserMatrixEntryHash: string,
  artifactId: string,
) -> VisualBaselineApproval
```

1. Verify `artifactId` references an `Artifact` whose own `executionUnitId` belongs to a
   `BROWSER`-class unit that produced a `SCREENSHOT`-kind Evidence (`data-model.md`'s own
   validation rule) — refuse otherwise.
2. In one transaction: insert the new `VisualBaselineApproval` row (`supersededAt: null`,
   `retentionExtended: true`). Atomically upsert the `VisualBaseline` pointer row — `INSERT ... ON
   CONFLICT (userId, pageIdentity, browserMatrixEntryHash) DO UPDATE SET activeApprovalId = <new
   row's id> RETURNING (the previous activeApprovalId, if any, via the DO UPDATE clause's own OLD
   reference)`. If a previous `activeApprovalId` existed: set that prior `VisualBaselineApproval`
   row's `supersededAt = now()` and `retentionExtended = false` in the same transaction.
3. Return the new `VisualBaselineApproval` row.

**Concurrency guarantee** (`data-model.md`'s own full explanation): step 2's single atomic upsert
statement acquires Postgres's own row-level lock on the pointer row, which is what makes two
simultaneous `approveBaseline` calls for the same triple serialize rather than race — the pointer
always ends pointing at exactly one row, and the loser of the race still has its own approval
recorded in history (immediately marked superseded), never silently dropped.

## `diffAgainstBaseline` (called by `frontend-ux-check-contract.md`'s own visual-regression check)

```text
diffAgainstBaseline(baseline: VisualBaselineApproval, candidateArtifactId: string) -> { withinThreshold: true } | { withinThreshold: false, diffArtifactId: string }
```

Produces a diff `Artifact` (via 009's own `createArtifact`) only when the comparison exceeds a
fixed threshold — a within-threshold result stores no diff artifact at all, avoiding unbounded
artifact growth for every unchanged pixel-level comparison.

## Retention (FR-026a — resolved during this closure pass as a confirmed product-policy decision)

A **currently-active** `VisualBaselineApproval` (`supersededAt IS NULL`, `retentionExtended =
true`) is excluded from 009's own `enforceArtifactRetention` sweep for its own `artifactId` — it
survives independent of its originating scan's own report-retention boundary, so visual regression
keeps working across scans over time rather than silently losing its comparison point the first
time an early scan's report ages out. Once superseded, `retentionExtended` is cleared and the prior
approval's `artifactId` becomes eligible for ordinary report-retention-parity sweeping after a
fixed, bounded audit-retention grace period (the specific duration is an implementation-time
tuning decision this contract does not fix, per this spec's own "mechanism, not number" posture) —
superseded baselines are retained briefly for audit purposes, not forever, and not instantly.

## Non-negotiable boundary rules

1. `approveBaseline` MUST be the only write path to `VisualBaseline`/`VisualBaselineApproval` — no
   other code path inserts or updates either table.
2. The pointer upsert and the history insert/supersession MUST happen in the same transaction —
   never a window where the pointer references an approval row that has not yet committed, and
   never a window where two pointer rows are simultaneously active for the same triple.
3. A pending (never-approved) candidate screenshot receives no special retention treatment — it is
   swept exactly like any other `Artifact` under 009's own FR-034 report-retention-parity rule
   (`research.md` R6); only an *approved* baseline's own `Artifact` gets the FR-026a extension above,
   and only while it remains the active (non-superseded) approval.
4. No AI judgment may decide an approval, a supersession, a retention-extension outcome, or a
   diff-threshold outcome (FR-053).
