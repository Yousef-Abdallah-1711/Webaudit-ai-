-- Review finding H4 — FR-018 one-active-scan-per-target was enforced only by a
-- read-then-write check in create-scan.ts (a TOCTOU race: two concurrent
-- POST /scans for the same target both passed the findFirst and both debited).
--
-- A partial unique index makes "at most one non-terminal scan per (user, target)"
-- a database invariant. The second concurrent INSERT fails with 23505 before it
-- can debit; create-scan.ts catches it and returns DuplicateScanError.
--
-- Partial predicate, so completed/failed/cancelled/timed-out scans do not count
-- and a target can be re-scanned freely once its previous scan finishes.
CREATE UNIQUE INDEX "Scan_one_active_per_target"
  ON "Scan" ("userId", "targetId")
  WHERE "state" NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');
