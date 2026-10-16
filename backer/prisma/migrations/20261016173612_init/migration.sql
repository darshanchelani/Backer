-- CreateEnum
CREATE TYPE "CompanyStage" AS ENUM ('PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B_PLUS');

-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'SCALE');

-- CreateEnum
CREATE TYPE "InvestorType" AS ENUM ('LEAD', 'FOLLOW_ON', 'BOARD', 'ANGEL', 'OTHER');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('STRIPE', 'HUBSPOT', 'MIXPANEL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "MetricKind" AS ENUM ('MRR', 'REVENUE', 'NEW_CUSTOMERS', 'CHURNED_CUSTOMERS', 'REFUNDS', 'PIPELINE_VALUE', 'DEALS_OPEN', 'DEALS_WON', 'ACTIVE_USERS', 'NEW_SIGNUPS', 'EVENTS_TRACKED', 'BURN', 'CASH_ON_HAND', 'RUNWAY_MONTHS');

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('MATTER_OF_FACT', 'HYPE', 'CAUTIOUS');

-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('AI_DRAFT', 'AI_REGENERATED', 'FOUNDER_EDIT', 'REMINDER_PREFILL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'CONCERNED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "CompanyStage" NOT NULL,
    "website" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "cadence" "Cadence" NOT NULL DEFAULT 'MONTHLY',
    "cadenceAnchorDay" INTEGER,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "planRenewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firm" TEXT,
    "type" "InvestorType" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "externalAccountId" TEXT,
    "accountLabel" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "metric" "MetricKind" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT,
    "unit" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Update" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "UpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "tone" "Tone" NOT NULL DEFAULT 'MATTER_OF_FACT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "metricsContext" JSONB,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateVersion" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "source" "VersionSource" NOT NULL,
    "tone" "Tone",
    "model" TEXT,
    "promptMeta" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpdateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "providerId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "trackToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateEvent" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "investorId" TEXT,
    "emailMessageId" TEXT,
    "type" "EventType" NOT NULL,
    "url" TEXT,
    "userAgent" TEXT,
    "ipHash" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpdateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "investorId" TEXT,
    "emailMessageId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentiment" "Sentiment" NOT NULL DEFAULT 'UNKNOWN',
    "sentimentConfidence" DOUBLE PRECISION,
    "sentimentReason" TEXT,
    "raw" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadenceReminder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "updateId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadenceReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceSample" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerId_key" ON "Company"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripeCustomerId_key" ON "Company"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_stripeSubscriptionId_key" ON "Company"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Company_plan_idx" ON "Company"("plan");

-- CreateIndex
CREATE INDEX "Investor_companyId_idx" ON "Investor"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_companyId_email_key" ON "Investor"("companyId", "email");

-- CreateIndex
CREATE INDEX "Connection_status_idx" ON "Connection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_companyId_provider_key" ON "Connection"("companyId", "provider");

-- CreateIndex
CREATE INDEX "MetricSnapshot_companyId_metric_periodStart_idx" ON "MetricSnapshot"("companyId", "metric", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_companyId_provider_metric_periodStart_key" ON "MetricSnapshot"("companyId", "provider", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "Update_companyId_status_idx" ON "Update"("companyId", "status");

-- CreateIndex
CREATE INDEX "Update_companyId_sentAt_idx" ON "Update"("companyId", "sentAt");

-- CreateIndex
CREATE INDEX "UpdateVersion_updateId_idx" ON "UpdateVersion"("updateId");

-- CreateIndex
CREATE UNIQUE INDEX "UpdateVersion_updateId_version_key" ON "UpdateVersion"("updateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_trackToken_key" ON "EmailMessage"("trackToken");

-- CreateIndex
CREATE INDEX "EmailMessage_updateId_status_idx" ON "EmailMessage"("updateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_updateId_investorId_key" ON "EmailMessage"("updateId", "investorId");

-- CreateIndex
CREATE INDEX "UpdateEvent_updateId_type_idx" ON "UpdateEvent"("updateId", "type");

-- CreateIndex
CREATE INDEX "UpdateEvent_investorId_type_occurredAt_idx" ON "UpdateEvent"("investorId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "Reply_updateId_idx" ON "Reply"("updateId");

-- CreateIndex
CREATE INDEX "Reply_investorId_receivedAt_idx" ON "Reply"("investorId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CadenceReminder_companyId_periodStart_key" ON "CadenceReminder"("companyId", "periodStart");

-- CreateIndex
CREATE INDEX "VoiceSample_companyId_idx" ON "VoiceSample"("companyId");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_createdAt_idx" ON "WebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_externalId_key" ON "WebhookEvent"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Update" ADD CONSTRAINT "Update_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateVersion" ADD CONSTRAINT "UpdateVersion_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateEvent" ADD CONSTRAINT "UpdateEvent_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateEvent" ADD CONSTRAINT "UpdateEvent_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateEvent" ADD CONSTRAINT "UpdateEvent_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceReminder" ADD CONSTRAINT "CadenceReminder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadenceReminder" ADD CONSTRAINT "CadenceReminder_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "Update"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSample" ADD CONSTRAINT "VoiceSample_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
