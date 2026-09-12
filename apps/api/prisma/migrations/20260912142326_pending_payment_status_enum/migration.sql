/*
  Hand-written raw SQL after Prisma generation: Prisma cannot express a
  non-destructive String-to-enum conversion with a one-time value backfill.
  Keep existing PENDING rows and map the legacy COMPLETED terminal value to
  SUCCEEDED before changing the column type.
*/
-- CreateEnum
CREATE TYPE "PendingPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "PendingPayment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PendingPayment"
  ALTER COLUMN "status" TYPE "PendingPaymentStatus"
  USING (
    CASE "status"
      WHEN 'PENDING' THEN 'PENDING'::"PendingPaymentStatus"
      WHEN 'COMPLETED' THEN 'SUCCEEDED'::"PendingPaymentStatus"
      -- Preserve rows with an unrecognised legacy terminal value instead of
      -- coercing them to NULL (which violates the new non-null enum column).
      -- FAILED is the conservative terminal state and can be reconciled from
      -- provider records later.
      ELSE 'FAILED'::"PendingPaymentStatus"
    END
  );
ALTER TABLE "PendingPayment" ALTER COLUMN "status" SET DEFAULT 'PENDING';
