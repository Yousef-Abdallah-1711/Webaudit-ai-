-- Phase 7 (User Story 5) — billing, renewals, retention.
--
--  * BillingEvent  — the webhook idempotency ledger (T187). Keyed on the
--    provider's own event id so a retried delivery is a no-op.
--  * Subscription.renewalWarningSentAt — so the pre-renewal "you are about to
--    lose N plan credits" warning is sent once per period (T188, FR-078).
--  * Scan.retentionWarningSentAt / Scan.reportRemovedAt — the retention sweep's
--    two states: warned, then removed (T189, FR-092). The row survives removal
--    so the credit-movement history still resolves it.

ALTER TABLE "Subscription" ADD COLUMN "renewalWarningSentAt" TIMESTAMP(3);

ALTER TABLE "Scan" ADD COLUMN "retentionWarningSentAt" TIMESTAMP(3);
ALTER TABLE "Scan" ADD COLUMN "reportRemovedAt" TIMESTAMP(3);

CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingEvent_type_receivedAt_idx" ON "BillingEvent" ("type", "receivedAt");
