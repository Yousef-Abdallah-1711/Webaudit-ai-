-- CreateEnum
CREATE TYPE "ModuleType" AS ENUM ('PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO');

-- CreateEnum
CREATE TYPE "CapabilityLayer" AS ENUM ('CODE', 'AI', 'BOTH');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('VENDORED', 'INSTALLED');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('URL', 'REPOSITORY', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "ControlLevel" AS ENUM ('NONE', 'ATTESTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('FILE', 'DNS');

-- CreateEnum
CREATE TYPE "ScanKind" AS ENUM ('INITIAL', 'READINESS');

-- CreateEnum
CREATE TYPE "ScanState" AS ENUM ('QUEUED', 'RUNNING_PHASE_1', 'AWAITING_QUESTIONNAIRE', 'RUNNING_PHASE_2', 'RUNNING_PHASE_3', 'RUNNING_MASTER', 'RUNNING_DOCS', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "ModuleState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'DEGRADED', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Attribution" AS ENUM ('MEASURED', 'AI_JUDGMENT');

-- CreateEnum
CREATE TYPE "IssueState" AS ENUM ('OPEN', 'ASSERTED_FIXED', 'RESOLVED', 'UNVERIFIABLE', 'REOPENED');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('PASSED', 'FAILED', 'UNVERIFIABLE', 'ERRORED');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('PLAN', 'PURCHASED');

-- CreateEnum
CREATE TYPE "LotSource" AS ENUM ('FREE_GRANT', 'PLAN_RENEWAL', 'PURCHASE', 'REFUND', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('GRANT', 'DEBIT', 'REFUND', 'EXPIRE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('SUCCESS', 'SCHEMA_INVALID', 'RATE_LIMITED', 'TIMEOUT', 'ERROR');

-- CreateEnum
CREATE TYPE "IntentSource" AS ENUM ('SUPPLIED', 'SKIPPED', 'DEFAULTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "githubTokenEnc" BYTEA,
    "githubTokenIv" BYTEA,
    "githubLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,

    CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyCredits" INTEGER NOT NULL,
    "creditsRecur" BOOLEAN NOT NULL,
    "allowedInputTypes" "InputType"[],
    "allowLoadGeneration" BOOLEAN NOT NULL,
    "allowReadinessPass" BOOLEAN NOT NULL,
    "allowCreditPurchase" BOOLEAN NOT NULL,
    "allowCustomCapability" BOOLEAN NOT NULL,
    "concurrentScanLimit" INTEGER NOT NULL,
    "queuePriority" INTEGER NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "externalCustomerId" TEXT,
    "externalSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "source" "LotSource" NOT NULL,
    "amountGranted" INTEGER NOT NULL,
    "amountRemaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "scanId" TEXT,
    "issueId" TEXT,
    "reversesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAllocation" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "CreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Target" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputType" "InputType" NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "controlLevel" "ControlLevel" NOT NULL DEFAULT 'NONE',
    "attestedAt" TIMESTAMP(3),
    "attestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Target_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetVerification" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "token" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TargetVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" "ScanKind" NOT NULL DEFAULT 'INITIAL',
    "state" "ScanState" NOT NULL DEFAULT 'QUEUED',
    "requestedModules" "ModuleType"[],
    "capabilitySnapshot" JSONB NOT NULL,
    "quotedCredits" INTEGER NOT NULL,
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER,
    "summary" TEXT,
    "baselineScanId" TEXT,
    "questionnaireDeadline" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "workspacePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleResult" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "module" "ModuleType" NOT NULL,
    "state" "ModuleState" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER,
    "summary" TEXT,
    "skippedReason" TEXT,
    "degradedReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ModuleResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "moduleResultId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "location" TEXT,
    "evidence" JSONB,
    "attribution" "Attribution" NOT NULL,
    "fixPrompt" TEXT NOT NULL,
    "state" "IssueState" NOT NULL DEFAULT 'OPEN',
    "requiredControlLevel" "ControlLevel" NOT NULL DEFAULT 'NONE',
    "assertedFixedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "previouslyResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAttempt" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "evidence" JSONB,
    "creditsCharged" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "module" "ModuleType" NOT NULL,
    "layer" "CapabilityLayer" NOT NULL,
    "trust" "TrustLevel" NOT NULL,
    "originalSource" TEXT,
    "license" TEXT,
    "requiresCode" BOOLEAN NOT NULL DEFAULT false,
    "requiresScreenshot" BOOLEAN NOT NULL DEFAULT false,
    "requiredControlLevel" "ControlLevel" NOT NULL DEFAULT 'NONE',
    "estimatedTokens" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "vendoredAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityPlan" (
    "capabilityId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "CapabilityPlan_pkey" PRIMARY KEY ("capabilityId","planId")
);

-- CreateTable
CREATE TABLE "CapabilityExecution" (
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

    CONSTRAINT "CapabilityExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInvocation" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignIntent" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "source" "IntentSource" NOT NULL,
    "audience" TEXT,
    "stylePreference" TEXT,
    "admiredReferences" TEXT[],
    "brandColors" TEXT[],
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "DesignIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessVerdict" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "baselineScanId" TEXT NOT NULL,
    "isReady" BOOLEAN NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "baselineScore" INTEGER NOT NULL,
    "moduleOutcomes" JSONB NOT NULL,
    "regressions" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "blockers" TEXT[],
    "certificateKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadinessVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_provider_providerUserId_key" ON "OAuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "EmailToken_expiresAt_idx" ON "EmailToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_periodEnd_idx" ON "Subscription"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "CreditLot_userId_expiresAt_createdAt_idx" ON "CreditLot"("userId", "expiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLot_userId_kind_idx" ON "CreditLot"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_reversesId_key" ON "CreditTransaction"("reversesId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_scanId_idx" ON "CreditTransaction"("scanId");

-- CreateIndex
CREATE INDEX "CreditTransaction_issueId_idx" ON "CreditTransaction"("issueId");

-- CreateIndex
CREATE INDEX "CreditAllocation_lotId_idx" ON "CreditAllocation"("lotId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAllocation_transactionId_lotId_key" ON "CreditAllocation"("transactionId", "lotId");

-- CreateIndex
CREATE INDEX "Target_userId_idx" ON "Target"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Target_userId_inputType_canonicalValue_key" ON "Target"("userId", "inputType", "canonicalValue");

-- CreateIndex
CREATE INDEX "TargetVerification_targetId_confirmedAt_idx" ON "TargetVerification"("targetId", "confirmedAt");

-- CreateIndex
CREATE INDEX "Scan_userId_createdAt_idx" ON "Scan"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_state_idx" ON "Scan"("state");

-- CreateIndex
CREATE INDEX "Scan_targetId_kind_completedAt_idx" ON "Scan"("targetId", "kind", "completedAt");

-- CreateIndex
CREATE INDEX "Scan_baselineScanId_idx" ON "Scan"("baselineScanId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleResult_scanId_module_key" ON "ModuleResult"("scanId", "module");

-- CreateIndex
CREATE INDEX "Issue_scanId_severity_state_idx" ON "Issue"("scanId", "severity", "state");

-- CreateIndex
CREATE INDEX "Issue_fingerprint_idx" ON "Issue"("fingerprint");

-- CreateIndex
CREATE INDEX "Issue_moduleResultId_idx" ON "Issue"("moduleResultId");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_scanId_fingerprint_key" ON "Issue"("scanId", "fingerprint");

-- CreateIndex
CREATE INDEX "VerificationAttempt_issueId_createdAt_idx" ON "VerificationAttempt"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "Capability_module_layer_isEnabled_idx" ON "Capability"("module", "layer", "isEnabled");

-- CreateIndex
CREATE INDEX "Capability_trust_idx" ON "Capability"("trust");

-- CreateIndex
CREATE INDEX "CapabilityPlan_planId_idx" ON "CapabilityPlan"("planId");

-- CreateIndex
CREATE INDEX "CapabilityExecution_scanId_idx" ON "CapabilityExecution"("scanId");

-- CreateIndex
CREATE INDEX "CapabilityExecution_capabilityId_createdAt_idx" ON "CapabilityExecution"("capabilityId", "createdAt");

-- CreateIndex
CREATE INDEX "AiInvocation_scanId_idx" ON "AiInvocation"("scanId");

-- CreateIndex
CREATE INDEX "AiInvocation_executionId_idx" ON "AiInvocation"("executionId");

-- CreateIndex
CREATE INDEX "AiInvocation_provider_createdAt_idx" ON "AiInvocation"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DesignIntent_scanId_key" ON "DesignIntent"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessVerdict_scanId_key" ON "ReadinessVerdict"("scanId");

-- CreateIndex
CREATE INDEX "ReadinessVerdict_baselineScanId_idx" ON "ReadinessVerdict"("baselineScanId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_actorId_createdAt_idx" ON "AuditLogEntry"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_subjectType_subjectId_idx" ON "AuditLogEntry"("subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "OAuthIdentity" ADD CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLot" ADD CONSTRAINT "CreditLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "CreditTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "CreditTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CreditLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Target" ADD CONSTRAINT "Target_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetVerification" ADD CONSTRAINT "TargetVerification_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Target"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_baselineScanId_fkey" FOREIGN KEY ("baselineScanId") REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleResult" ADD CONSTRAINT "ModuleResult_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_moduleResultId_fkey" FOREIGN KEY ("moduleResultId") REFERENCES "ModuleResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAttempt" ADD CONSTRAINT "VerificationAttempt_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityPlan" ADD CONSTRAINT "CapabilityPlan_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityPlan" ADD CONSTRAINT "CapabilityPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityExecution" ADD CONSTRAINT "CapabilityExecution_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityExecution" ADD CONSTRAINT "CapabilityExecution_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation" ADD CONSTRAINT "AiInvocation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "CapabilityExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvocation" ADD CONSTRAINT "AiInvocation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignIntent" ADD CONSTRAINT "DesignIntent_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessVerdict" ADD CONSTRAINT "ReadinessVerdict_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
