-- PLAN.md, Finding MED-3 — database-level enforcement of the invariant every
-- application code path (grant.ts, debit.ts, refund.ts, expiry.ts) already
-- maintains, so a future write path this careful review has not covered
-- cannot silently violate it.
--
-- Verified safe before writing this migration: a direct count query against
-- both live databases (webaudit: 3 rows; webaudit_test: 0 rows) found zero
-- rows violating these bounds. No data migration is needed.
--
-- amountRemaining must never go negative (would mean a debit oversold a lot)
-- and must never exceed amountGranted (would mean a refund minted credit the
-- lot never actually held).
ALTER TABLE "CreditLot"
  ADD CONSTRAINT "CreditLot_amountRemaining_bounds"
  CHECK ("amountRemaining" >= 0 AND "amountRemaining" <= "amountGranted");

ALTER TABLE "CreditLot"
  ADD CONSTRAINT "CreditLot_amountGranted_nonnegative"
  CHECK ("amountGranted" >= 0);

-- DB-003 — the schema comment on CreditTransaction.amount already says
-- "always positive; type carries the direction"; every write path
-- (grant.ts, debit.ts's `input.amount <= 0` guard, refund.ts's
-- `input.credits <= 0` guard) already enforces this in code. Added at the
-- database level too, at zero measured risk, once this migration already
-- establishes the CHECK-constraint pattern for this set of tables.
ALTER TABLE "CreditTransaction"
  ADD CONSTRAINT "CreditTransaction_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "CreditAllocation"
  ADD CONSTRAINT "CreditAllocation_amount_positive"
  CHECK ("amount" > 0);
