-- Closes PROGRESS.md's Open Decision #15 (Phases 4-7 remediation, Task 5's
-- own residual gap): grantLot had no idempotency key, so a billing-webhook
-- provider retry landing in the narrow window between an effect's own
-- transaction committing and the following BillingEvent.appliedAt write
-- could double-grant credits. billingEventId is nullable (only webhook-driven
-- grants set it) and unique -- Postgres treats multiple NULLs as distinct,
-- so registration's free grant and the direct dev/test billing routes are
-- unaffected.
ALTER TABLE "CreditTransaction" ADD COLUMN "billingEventId" TEXT;
CREATE UNIQUE INDEX "CreditTransaction_billingEventId_key" ON "CreditTransaction"("billingEventId");
