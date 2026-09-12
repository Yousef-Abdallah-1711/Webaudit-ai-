CREATE TABLE "Receipt" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "billingEventId" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amountMicros" INTEGER NOT NULL,
  "html" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Receipt_billingEventId_key" ON "Receipt"("billingEventId");
CREATE INDEX "Receipt_userId_createdAt_idx" ON "Receipt"("userId", "createdAt");

ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
