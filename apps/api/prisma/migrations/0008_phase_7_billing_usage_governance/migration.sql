CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PRO', 'TEAM');
CREATE TYPE "BillingProviderName" AS ENUM ('FAKE', 'STRIPE');
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSED', 'CANCELLED', 'INCOMPLETE', 'EXPIRED');
CREATE TYPE "BillingWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'REJECTED', 'FAILED');
CREATE TYPE "UsageReservationStatus" AS ENUM ('ACTIVE', 'FINALIZED', 'RELEASED', 'EXPIRED');

CREATE TABLE "PlanDefinition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" "PlanCode" NOT NULL,
  "version" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "entitlements" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingCustomer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "billingCustomerId" UUID,
  "planCode" "PlanCode" NOT NULL DEFAULT 'FREE',
  "planVersion" TEXT NOT NULL,
  "provider" "BillingProviderName" NOT NULL DEFAULT 'FAKE',
  "providerSubscriptionId" TEXT,
  "providerPriceId" TEXT,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "trialEndsAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" "BillingProviderName" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "BillingWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payloadHash" TEXT NOT NULL,
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "projectId" UUID,
  "subscriptionId" UUID,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "unit" TEXT NOT NULL,
  "estimatedCostMinorUnits" BIGINT,
  "currency" TEXT,
  "billingPeriod" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageAggregate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "projectId" UUID,
  "scopeKey" TEXT NOT NULL,
  "billingPeriod" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageAggregate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageReservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "projectId" UUID,
  "metric" TEXT NOT NULL,
  "reservedQuantity" DECIMAL(18,6) NOT NULL,
  "status" "UsageReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "resourceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntitlementOverride" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID,
  "projectId" UUID,
  "entitlement" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanDefinition_code_version_key" ON "PlanDefinition"("code", "version");
CREATE INDEX "PlanDefinition_active_code_idx" ON "PlanDefinition"("active", "code");
CREATE UNIQUE INDEX "BillingCustomer_userId_key" ON "BillingCustomer"("userId");
CREATE UNIQUE INDEX "BillingCustomer_providerCustomerId_key" ON "BillingCustomer"("providerCustomerId");
CREATE INDEX "BillingCustomer_provider_providerCustomerId_idx" ON "BillingCustomer"("provider", "providerCustomerId");
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
CREATE UNIQUE INDEX "Subscription_billingCustomerId_key" ON "Subscription"("billingCustomerId");
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");
CREATE INDEX "Subscription_provider_providerSubscriptionId_idx" ON "Subscription"("provider", "providerSubscriptionId");
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_providerEventId_key" ON "BillingWebhookEvent"("provider", "providerEventId");
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx" ON "BillingWebhookEvent"("status", "createdAt");
CREATE UNIQUE INDEX "UsageEvent_idempotencyKey_key" ON "UsageEvent"("idempotencyKey");
CREATE INDEX "UsageEvent_userId_billingPeriod_eventType_idx" ON "UsageEvent"("userId", "billingPeriod", "eventType");
CREATE INDEX "UsageEvent_projectId_billingPeriod_eventType_idx" ON "UsageEvent"("projectId", "billingPeriod", "eventType");
CREATE INDEX "UsageEvent_resourceType_resourceId_idx" ON "UsageEvent"("resourceType", "resourceId");
CREATE UNIQUE INDEX "UsageAggregate_userId_scopeKey_billingPeriod_metric_key" ON "UsageAggregate"("userId", "scopeKey", "billingPeriod", "metric");
CREATE INDEX "UsageAggregate_userId_projectId_billingPeriod_idx" ON "UsageAggregate"("userId", "projectId", "billingPeriod");
CREATE UNIQUE INDEX "UsageReservation_idempotencyKey_key" ON "UsageReservation"("idempotencyKey");
CREATE INDEX "UsageReservation_userId_projectId_metric_status_expiresAt_idx" ON "UsageReservation"("userId", "projectId", "metric", "status", "expiresAt");
CREATE INDEX "UsageReservation_resourceId_idx" ON "UsageReservation"("resourceId");
CREATE INDEX "EntitlementOverride_userId_entitlement_startsAt_expiresAt_idx" ON "EntitlementOverride"("userId", "entitlement", "startsAt", "expiresAt");
CREATE INDEX "EntitlementOverride_projectId_entitlement_startsAt_expiresAt_idx" ON "EntitlementOverride"("projectId", "entitlement", "startsAt", "expiresAt");
