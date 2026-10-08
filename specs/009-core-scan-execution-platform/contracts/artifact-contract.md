# Artifact Contract

Per `spec.md` FR-032/FR-033/FR-034/FR-035. The one write path for `Artifact`, and the retention/
orphan-reclamation operations that keep every object this path creates provably cleaned up.

## `createArtifact`

```text
createArtifact(
  scanId: string, userId: string, executionUnitId: string,
  contentType: string, body: Uint8Array | ReadableStream,
) -> Artifact | BudgetExceededError
```

1. Compute `sizeBytes` (from the body, streamed if necessary — never buffering an unbounded body
   fully into memory first, per master-prompt §30's "no loading every artifact into memory" bound).
2. Check `sizeBytes` against the fixed per-object budget, and the sum of this `scanId`'s existing
   `Artifact.sizeBytes` plus this new object against the fixed per-scan cumulative budget (FR-033).
   Either check failing refuses the write entirely — no partial/truncated object is ever stored.
3. Compute `storageKey` = `artifacts/<scanId>/<executionUnitId>/<sha256-or-cuid>` (`research.md`
   R8) and `PUT` the object to R2 — **before** inserting any database row (R8's ordering rule,
   closing the "DB row exists, upload failed" direction of mismatch structurally).
4. Only after the R2 `PUT` succeeds: insert the `Artifact` row with `retentionPolicyRef: "report-
   retention-parity"` (FR-034's default).
5. If step 4's insert fails after step 3's upload succeeded: the object is now orphaned — `recla
   imOrphanedArtifacts` (below) is responsible for finding and deleting it; `createArtifact`
   itself does not retry the insert (a caller observing an error here should treat it as a failed
   evidence-recording attempt and retry the whole `recordEvidence` call, which will mint a new key).

## `reclaimOrphanedArtifacts` (maintenance sweep, FR-035)

```text
reclaimOrphanedArtifacts() -> void  // scheduled on the existing timeout-scheduler.ts pattern
```

Lists R2 objects under the `artifacts/` prefix older than a fixed grace period with no matching
`Artifact.storageKey` row, and deletes them — the direct, proactive closure of the shape of gap the
existing staged-ZIP-upload question (`UploadStorage.remove`, zero call sites) represents.

## `enforceArtifactRetention` (extends `apps/api/src/services/storage/retention.ts:
enforceRetention`, FR-034)

```text
enforceArtifactRetention(scanId: string) -> void  // called from within the existing per-scan
                                                    // retention-sweep transaction, never separately
```

Deletes every `Artifact` row (and its R2 object) for a scan whose report has crossed its existing
retention boundary, in the **same** transaction the existing sweep already uses to remove that
scan's report findings/artifacts/verdict — never a separate, later, or earlier pass that could
leave the two half-consistent (closing the "cleanup races with report viewing" adversarial
scenario structurally, by inheriting the existing mechanism's own proven atomicity rather than
adding a second one).

## Non-negotiable boundary rules

1. `createArtifact` is the only write path to `Artifact` — no engine writes an R2 object under the
   `artifacts/` prefix through any other code path (so `reclaimOrphanedArtifacts` can assume
   anything under that prefix with no matching row is genuinely orphaned, never a legitimate object
   some other writer created).
2. `storageKey` MUST match the exact `artifacts/<scanId>/<executionUnitId>/...` shape — a
   mismatched or manipulated key is refused before any R2 operation (closing the "artifact object
   key manipulated" adversarial scenario, mirroring `assertUploadKey`'s existing validation
   pattern).
3. `enforceArtifactRetention` MUST run inside the same transaction as the existing report-retention
   removal, never as an independently-scheduled, separately-timed sweep for the same scan.
4. No AI judgment may decide a budget check's outcome or a retention/reclamation decision (FR-046).
