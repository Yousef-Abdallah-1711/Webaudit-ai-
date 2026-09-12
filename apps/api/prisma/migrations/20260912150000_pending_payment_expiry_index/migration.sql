-- Supports the expiry worker's status + age candidate query.
CREATE INDEX "PendingPayment_status_createdAt_idx"
  ON "PendingPayment" ("status", "createdAt");
