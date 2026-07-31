CREATE TYPE "BillingCheckoutStatus" AS ENUM ('CREATED', 'COMPLETED', 'EXPIRED');

ALTER TABLE "PlanDefinition"
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'MONTH',
  ADD COLUMN "displayPrice" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "providerPriceKey" TEXT,
  ADD COLUMN "features" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "PlanDefinition"
SET "displayName" = "name"
WHERE "displayName" IS NULL;

ALTER TABLE "PlanDefinition"
  ALTER COLUMN "displayName" SET NOT NULL;

ALTER TABLE "Subscription"
  ADD COLUMN "lastProviderEventAt" TIMESTAMP(3);

CREATE TABLE "BillingCheckout" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "provider" "BillingProviderName" NOT NULL,
  "providerSessionId" TEXT NOT NULL,
  "planCode" "PlanCode" NOT NULL,
  "planVersion" TEXT NOT NULL,
  "status" "BillingCheckoutStatus" NOT NULL DEFAULT 'CREATED',
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingCheckout_providerSessionId_key" ON "BillingCheckout"("providerSessionId");
CREATE INDEX "BillingCheckout_userId_status_createdAt_idx" ON "BillingCheckout"("userId", "status", "createdAt");
CREATE INDEX "BillingCheckout_provider_status_idx" ON "BillingCheckout"("provider", "status");

ALTER TABLE "UsageEvent"
  ADD COLUMN "metric" TEXT NOT NULL DEFAULT 'unknown';

UPDATE "UsageEvent"
SET "metric" = "eventType"
WHERE "metric" = 'unknown';

INSERT INTO "UsageAggregate" (
  "id", "userId", "projectId", "scopeKey", "billingPeriod", "metric", "quantity", "updatedAt"
)
SELECT
  gen_random_uuid(),
  "userId",
  NULL,
  'user',
  "billingPeriod",
  "metric",
  SUM("quantity"),
  CURRENT_TIMESTAMP
FROM "UsageEvent"
GROUP BY "userId", "billingPeriod", "metric"
ON CONFLICT ("userId", "scopeKey", "billingPeriod", "metric")
DO UPDATE SET
  "quantity" = EXCLUDED."quantity",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "UsageReservation"
  ADD COLUMN "billingPeriod" TEXT NOT NULL DEFAULT 'legacy';

UPDATE "UsageReservation"
SET "billingPeriod" = to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE "billingPeriod" = 'legacy';

DROP INDEX "UsageReservation_userId_projectId_metric_status_expiresAt_idx";
CREATE INDEX "UsageReservation_userId_projectId_metric_billingPeriod_status_expiresAt_idx"
  ON "UsageReservation"("userId", "projectId", "metric", "billingPeriod", "status", "expiresAt");

ALTER TABLE "Document" ADD COLUMN "billingOwnerUserId" UUID;
UPDATE "Document" AS document
SET "billingOwnerUserId" = project."ownerId"
FROM "KnowledgeBase" AS knowledge_base
JOIN "Project" AS project ON project."id" = knowledge_base."projectId"
WHERE document."knowledgeBaseId" = knowledge_base."id";
ALTER TABLE "Document" ALTER COLUMN "billingOwnerUserId" SET NOT NULL;

ALTER TABLE "AnalysisRun" ADD COLUMN "billingOwnerUserId" UUID;
UPDATE "AnalysisRun" AS analysis_run
SET "billingOwnerUserId" = project."ownerId"
FROM "Project" AS project
WHERE analysis_run."projectId" = project."id";
ALTER TABLE "AnalysisRun" ALTER COLUMN "billingOwnerUserId" SET NOT NULL;
CREATE INDEX "AnalysisRun_billingOwnerUserId_status_createdAt_idx"
  ON "AnalysisRun"("billingOwnerUserId", "status", "createdAt");

ALTER TABLE "Experiment" ADD COLUMN "billingOwnerUserId" UUID;
UPDATE "Experiment" AS experiment
SET "billingOwnerUserId" = project."ownerId"
FROM "Project" AS project
WHERE experiment."projectId" = project."id";
ALTER TABLE "Experiment" ALTER COLUMN "billingOwnerUserId" SET NOT NULL;
