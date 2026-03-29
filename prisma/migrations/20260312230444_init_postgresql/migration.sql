-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ApiProvider" AS ENUM ('OPENAI', 'MESHY', 'RUNWAY', 'OLLAMA', 'VLLM', 'LLAMACPP');

-- CreateEnum
CREATE TYPE "BudgetApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FinOpsRemediationStatus" AS ENUM ('PROPOSED', 'APPLIED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ApiProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hasApiKey" BOOLEAN NOT NULL DEFAULT false,
    "encryptedApiKey" TEXT,
    "encryptedConfig" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedSettings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUsagePolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "hardStopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "warningThresholdRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "perProviderBudgetJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsagePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsageLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ApiProvider" NOT NULL,
    "period" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedUnits" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "lastAction" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderUsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUsageLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "provider" "ApiProvider" NOT NULL,
    "period" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedUnits" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "lastAction" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUsageAlertProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "totalWarningRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "providerWarningRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "projectWarningRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "includeLocalProviders" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsageAlertProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUsageGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "monthlyBudgetUsd" DOUBLE PRECISION NOT NULL,
    "warningRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUsageGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetApprovalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BudgetApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedMonthlyBudgetUsd" DOUBLE PRECISION,
    "requestedProviderBudgetJson" TEXT,
    "requestedProjectGoalsJson" TEXT,
    "reason" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "BudgetApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFinOpsAutopilot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "seasonalityEnabled" BOOLEAN NOT NULL DEFAULT true,
    "budgetBufferRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "lookbackMonths" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFinOpsAutopilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetApprovalPolicy" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "projectKey" TEXT,
    "autoApproveBelowUsd" DOUBLE PRECISION,
    "requireManualForProviderChanges" BOOLEAN NOT NULL DEFAULT true,
    "requireReason" BOOLEAN NOT NULL DEFAULT false,
    "alwaysRequireManual" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinOpsAutomationControl" (
    "id" TEXT NOT NULL,
    "controlKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "windowStartUtc" TEXT DEFAULT '01:00',
    "windowEndUtc" TEXT DEFAULT '06:00',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 240,
    "maxActionsPerRun" INTEGER NOT NULL DEFAULT 15,
    "minSeverity" TEXT NOT NULL DEFAULT 'high',
    "allowPolicyMutations" BOOLEAN NOT NULL DEFAULT true,
    "allowBudgetMutations" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinOpsAutomationControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinOpsRemediationLog" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" "FinOpsRemediationStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinOpsRemediationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiCredential_userId_idx" ON "ApiCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_userId_provider_key" ON "ApiCredential"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiSettings_userId_key" ON "UserApiSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsagePolicy_userId_key" ON "UserUsagePolicy"("userId");

-- CreateIndex
CREATE INDEX "ProviderUsageLedger_userId_period_idx" ON "ProviderUsageLedger"("userId", "period");

-- CreateIndex
CREATE INDEX "ProviderUsageLedger_provider_period_idx" ON "ProviderUsageLedger"("provider", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUsageLedger_userId_provider_period_key" ON "ProviderUsageLedger"("userId", "provider", "period");

-- CreateIndex
CREATE INDEX "ProjectUsageLedger_userId_projectKey_period_idx" ON "ProjectUsageLedger"("userId", "projectKey", "period");

-- CreateIndex
CREATE INDEX "ProjectUsageLedger_period_projectKey_idx" ON "ProjectUsageLedger"("period", "projectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUsageLedger_userId_projectKey_provider_period_key" ON "ProjectUsageLedger"("userId", "projectKey", "provider", "period");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsageAlertProfile_userId_key" ON "UserUsageAlertProfile"("userId");

-- CreateIndex
CREATE INDEX "ProjectUsageGoal_userId_isActive_idx" ON "ProjectUsageGoal"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUsageGoal_userId_projectKey_key" ON "ProjectUsageGoal"("userId", "projectKey");

-- CreateIndex
CREATE INDEX "BudgetApprovalRequest_userId_status_createdAt_idx" ON "BudgetApprovalRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BudgetApprovalRequest_status_createdAt_idx" ON "BudgetApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserFinOpsAutopilot_userId_key" ON "UserFinOpsAutopilot"("userId");

-- CreateIndex
CREATE INDEX "BudgetApprovalPolicy_role_projectKey_enabled_idx" ON "BudgetApprovalPolicy"("role", "projectKey", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "FinOpsAutomationControl_controlKey_key" ON "FinOpsAutomationControl"("controlKey");

-- CreateIndex
CREATE INDEX "FinOpsRemediationLog_period_createdAt_idx" ON "FinOpsRemediationLog"("period", "createdAt");

-- CreateIndex
CREATE INDEX "FinOpsRemediationLog_userId_createdAt_idx" ON "FinOpsRemediationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FinOpsRemediationLog_status_createdAt_idx" ON "FinOpsRemediationLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_userId_createdAt_idx" ON "SecurityAuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiSettings" ADD CONSTRAINT "UserApiSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsagePolicy" ADD CONSTRAINT "UserUsagePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsageLedger" ADD CONSTRAINT "ProviderUsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUsageLedger" ADD CONSTRAINT "ProjectUsageLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUsageAlertProfile" ADD CONSTRAINT "UserUsageAlertProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUsageGoal" ADD CONSTRAINT "ProjectUsageGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApprovalRequest" ADD CONSTRAINT "BudgetApprovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApprovalRequest" ADD CONSTRAINT "BudgetApprovalRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFinOpsAutopilot" ADD CONSTRAINT "UserFinOpsAutopilot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetApprovalPolicy" ADD CONSTRAINT "BudgetApprovalPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinOpsAutomationControl" ADD CONSTRAINT "FinOpsAutomationControl_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinOpsRemediationLog" ADD CONSTRAINT "FinOpsRemediationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAuditLog" ADD CONSTRAINT "SecurityAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
