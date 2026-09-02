-- Fixes a real bug (Phase 7 engineering review, 2026-09-02, Finding 6): the
-- webhook's idempotency INSERT and its effect application were two separate
-- steps, and a transient failure in the second step got permanently and
-- silently swallowed by the first, because "the row exists" was treated as
-- "handled" on every subsequent retry from the provider.
--
-- appliedAt distinguishes "received" from "applied": a retry of a
-- received-but-not-applied event now re-attempts the effect.
ALTER TABLE "BillingEvent" ADD COLUMN "appliedAt" TIMESTAMP(3);
