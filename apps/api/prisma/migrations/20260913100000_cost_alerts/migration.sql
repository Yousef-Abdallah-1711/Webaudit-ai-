CREATE TABLE "CostAlertThreshold" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "windowMinutes" INTEGER NOT NULL,
  "thresholdMicros" INTEGER NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CostAlertThreshold_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CostAlertThreshold_scope_key" ON "CostAlertThreshold"("scope");

CREATE TABLE "CostAlertEvent" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "userId" TEXT,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "observedMicros" INTEGER NOT NULL,
  "thresholdMicros" INTEGER NOT NULL,
  "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CostAlertEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostAlertEvent_scope_userId_windowEnd_idx"
  ON "CostAlertEvent"("scope", "userId", "windowEnd");
