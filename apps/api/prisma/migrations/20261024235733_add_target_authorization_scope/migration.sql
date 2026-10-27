-- CreateEnum
CREATE TYPE "ExecutionClass" AS ENUM ('BROWSER', 'CRAWLER', 'SOURCE_EXECUTION', 'ACTIVE_SECURITY', 'AUTHENTICATED_WORKFLOW', 'LOAD_CAPACITY');

-- CreateEnum
CREATE TYPE "TargetEnvironmentClassification" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT');

-- CreateEnum
CREATE TYPE "ScopeTargetKind" AS ENUM ('WEB', 'REPOSITORY');

-- CreateTable
CREATE TABLE "TargetEnvironment" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "classification" "TargetEnvironmentClassification" NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classifiedBy" TEXT NOT NULL,

    CONSTRAINT "TargetEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeDefinition" (
    "id" TEXT NOT NULL,
    "targetKind" "ScopeTargetKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "includedHosts" TEXT[],
    "excludedHosts" TEXT[],
    "includedPathPrefixes" TEXT[],
    "excludedPathPrefixes" TEXT[],
    "schemes" TEXT[],
    "ports" INTEGER[],
    "repositoryFullName" TEXT,
    "includedRefs" TEXT[],
    "excludedRefs" TEXT[],
    "includedAccountRefs" TEXT[],
    "includedRoles" TEXT[],
    "includedActionCategories" TEXT[],

    CONSTRAINT "ScopeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAuthorization" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executionClasses" "ExecutionClass"[],
    "scopeId" TEXT NOT NULL,
    "environmentRestriction" "TargetEnvironmentClassification"[],
    "requestBudget" INTEGER NOT NULL,
    "concurrencyBudget" INTEGER NOT NULL,
    "durationBudget" INTEGER NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "TargetAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TargetEnvironment_targetId_idx" ON "TargetEnvironment"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetEnvironment_targetId_key" ON "TargetEnvironment"("targetId");

-- CreateIndex
CREATE INDEX "TargetAuthorization_targetId_userId_idx" ON "TargetAuthorization"("targetId", "userId");

-- CreateIndex
CREATE INDEX "TargetAuthorization_userId_idx" ON "TargetAuthorization"("userId");

-- AddForeignKey
ALTER TABLE "TargetEnvironment" ADD CONSTRAINT "TargetEnvironment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAuthorization" ADD CONSTRAINT "TargetAuthorization_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAuthorization" ADD CONSTRAINT "TargetAuthorization_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "ScopeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
