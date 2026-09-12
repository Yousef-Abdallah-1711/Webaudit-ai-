-- Phase 2 production-readiness payment plumbing.
--
-- Checkout initiation must not directly grant subscriptions or credits. This
-- row is the durable correlation point between a provider checkout reference
-- and the later webhook event that applies the ledger effect.
CREATE TABLE "PendingPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "amountMicros" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingPayment_providerReference_key" ON "PendingPayment"("providerReference");
CREATE INDEX "PendingPayment_userId_status_idx" ON "PendingPayment"("userId", "status");
ALTER TABLE "PendingPayment" ADD CONSTRAINT "PendingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
