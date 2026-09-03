-- T208 — the operator's declared AI provider chain (FR-087).
--
-- Records what an operator has chosen (vendor, model, fallback position,
-- enabled/disabled) and is validated with the real `buildChain` guard at
-- write time (see providers.service.ts's module note). Nothing reads this
-- table into a running process yet: `apps/worker/src/index.ts` still boots
-- its executor once, from `AI_CHAIN` / per-vendor env vars, via
-- `createExecutorFromEnv`. Live-reconfiguration is separate, later work.

CREATE TABLE "ProviderChainEntry" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderChainEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderChainEntry_position_key" ON "ProviderChainEntry"("position");

CREATE INDEX "ProviderChainEntry_vendor_idx" ON "ProviderChainEntry"("vendor");
