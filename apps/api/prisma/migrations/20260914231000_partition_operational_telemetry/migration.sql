-- Hand-written raw SQL: Prisma cannot express native PostgreSQL table partitioning.
-- This mirrors the deliberate raw-SQL precedent in credits/debit.ts, where Prisma
-- cannot express the database primitive needed to preserve the required behavior.

BEGIN;

LOCK TABLE "AiInvocation", "CapabilityExecution" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "CapabilityExecution_partitioned" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "module" "ModuleType" NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "skippedReason" TEXT,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapabilityExecution_partitioned_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

CREATE TABLE "AiInvocation_partitioned" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "scanId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "chainPosition" INTEGER NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "outcome" "AiOutcome" NOT NULL,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInvocation_partitioned_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

DO $$
DECLARE
    partition_month TIMESTAMP(3);
    first_month TIMESTAMP(3);
    last_month TIMESTAMP(3);
BEGIN
    SELECT
        COALESCE(date_trunc('month', MIN("createdAt"))::TIMESTAMP(3), date_trunc('month', CURRENT_TIMESTAMP)::TIMESTAMP(3)),
        GREATEST(
            COALESCE(date_trunc('month', MAX("createdAt"))::TIMESTAMP(3), date_trunc('month', CURRENT_TIMESTAMP)::TIMESTAMP(3)),
            date_trunc('month', CURRENT_TIMESTAMP)::TIMESTAMP(3) + INTERVAL '24 months'
        )::TIMESTAMP(3)
    INTO first_month, last_month
    FROM (
        SELECT "createdAt" FROM "CapabilityExecution"
        UNION ALL
        SELECT "createdAt" FROM "AiInvocation"
    ) AS telemetry;

    FOR partition_month IN
        SELECT generate_series(first_month, last_month, INTERVAL '1 month')::TIMESTAMP(3)
    LOOP
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF "CapabilityExecution_partitioned" FOR VALUES FROM (%L) TO (%L)',
            'CapabilityExecution_' || to_char(partition_month, 'YYYY_MM'),
            partition_month,
            partition_month + INTERVAL '1 month'
        );
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF "AiInvocation_partitioned" FOR VALUES FROM (%L) TO (%L)',
            'AiInvocation_' || to_char(partition_month, 'YYYY_MM'),
            partition_month,
            partition_month + INTERVAL '1 month'
        );
    END LOOP;
END $$;

INSERT INTO "CapabilityExecution_partitioned" (
    "id", "scanId", "capabilityId", "module", "succeeded", "skippedReason",
    "findingCount", "durationMs", "costMicros", "errorMessage", "createdAt"
)
SELECT
    "id", "scanId", "capabilityId", "module", "succeeded", "skippedReason",
    "findingCount", "durationMs", "costMicros", "errorMessage", "createdAt"
FROM "CapabilityExecution";

INSERT INTO "AiInvocation_partitioned" (
    "id", "executionId", "scanId", "provider", "model", "chainPosition",
    "promptTokens", "outputTokens", "latencyMs", "costMicros", "outcome",
    "promptVersion", "createdAt"
)
SELECT
    "id", "executionId", "scanId", "provider", "model", "chainPosition",
    "promptTokens", "outputTokens", "latencyMs", "costMicros", "outcome",
    "promptVersion", "createdAt"
FROM "AiInvocation";

ALTER TABLE "AiInvocation" RENAME TO "AiInvocation_legacy";
ALTER TABLE "AiInvocation_partitioned" RENAME TO "AiInvocation";
DROP TABLE "AiInvocation_legacy";

ALTER TABLE "CapabilityExecution" RENAME TO "CapabilityExecution_legacy";
ALTER TABLE "CapabilityExecution_partitioned" RENAME TO "CapabilityExecution";
DROP TABLE "CapabilityExecution_legacy";

ALTER TABLE "CapabilityExecution"
    ADD CONSTRAINT "CapabilityExecution_scanId_fkey"
    FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CapabilityExecution"
    ADD CONSTRAINT "CapabilityExecution_capabilityId_fkey"
    FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiInvocation"
    ADD CONSTRAINT "AiInvocation_scanId_fkey"
    FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "cascadeAiInvocationOnCapabilityExecutionDelete"()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM "AiInvocation" WHERE "executionId" = OLD."id";
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CapabilityExecution_delete_ai_invocations"
AFTER DELETE ON "CapabilityExecution"
FOR EACH ROW EXECUTE FUNCTION "cascadeAiInvocationOnCapabilityExecutionDelete"();

CREATE INDEX "CapabilityExecution_scanId_idx" ON "CapabilityExecution"("scanId");
CREATE INDEX "CapabilityExecution_capabilityId_createdAt_idx"
    ON "CapabilityExecution"("capabilityId", "createdAt");
CREATE INDEX "AiInvocation_scanId_idx" ON "AiInvocation"("scanId");
CREATE INDEX "AiInvocation_executionId_idx" ON "AiInvocation"("executionId");
CREATE INDEX "AiInvocation_provider_createdAt_idx" ON "AiInvocation"("provider", "createdAt");

COMMIT;
