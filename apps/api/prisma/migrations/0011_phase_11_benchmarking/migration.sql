CREATE TYPE "ModelProviderCode" AS ENUM ('OPENAI', 'ANTHROPIC', 'OLLAMA');
CREATE TYPE "ModelRuntime" AS ENUM ('CLOUD', 'LOCAL_OLLAMA');
CREATE TYPE "BenchmarkArchitecture" AS ENUM ('SINGLE_AGENT', 'HOMOGENEOUS_MULTI_AGENT', 'HETEROGENEOUS_MULTI_AGENT', 'ABLATION');
CREATE TYPE "BenchmarkProtocol" AS ENUM ('CONTROLLED_EVIDENCE', 'END_TO_END');
CREATE TYPE "BenchmarkBudgetProtocol" AS ENUM ('EQUAL_TOTAL_TOKEN_BUDGET', 'PRODUCTION_DEFAULT_BUDGET');
CREATE TYPE "BenchmarkSuiteStatus" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "BenchmarkRunStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'PAUSED', 'EVALUATING', 'AGGREGATING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED');
CREATE TYPE "BenchmarkCaseRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED', 'INVALID');
CREATE TYPE "BenchmarkAgentRole" AS ENUM ('SINGLE_AGENT', 'PLANNER', 'MARKET_SPECIALIST', 'FINANCE_SPECIALIST', 'LEGAL_SPECIALIST', 'RISK_SPECIALIST', 'STRATEGY_SPECIALIST', 'COORDINATOR', 'CRITIC');
CREATE TYPE "AutomaticEvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "HumanEvaluationTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'INVALIDATED');
CREATE TYPE "HumanEvaluationPreference" AS ENUM ('LEFT', 'RIGHT', 'TIE', 'CANNOT_EVALUATE');
CREATE TYPE "ReproducibilityArtifactStatus" AS ENUM ('QUEUED', 'GENERATING', 'COMPLETED', 'FAILED', 'EXPIRED');

CREATE TABLE "ModelCostProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "provider" "ModelProviderCode" NOT NULL,
  "exactModelId" TEXT NOT NULL, "version" TEXT NOT NULL, "currency" TEXT NOT NULL,
  "inputCostPerMillionTokens" DECIMAL(18,6), "cachedInputCostPerMillionTokens" DECIMAL(18,6),
  "outputCostPerMillionTokens" DECIMAL(18,6), "reasoningCostPerMillionTokens" DECIMAL(18,6),
  "effectiveFrom" TIMESTAMP(3) NOT NULL, "sourceNote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelCostProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LocalHardwareProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "cpu" TEXT NOT NULL, "gpu" TEXT NOT NULL, "gpuMemoryBytes" BIGINT, "ramBytes" BIGINT,
  "operatingSystem" TEXT NOT NULL, "runtimeVersion" TEXT NOT NULL, "driverVersion" TEXT,
  "powerEstimateWatts" INTEGER, "energyPriceMinorPerKwh" INTEGER, "currency" TEXT, "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalHardwareProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ModelProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "version" TEXT NOT NULL,
  "displayName" TEXT NOT NULL, "provider" "ModelProviderCode" NOT NULL, "family" TEXT NOT NULL,
  "exactModelId" TEXT NOT NULL, "runtime" "ModelRuntime" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "benchmarkEligible" BOOLEAN NOT NULL DEFAULT false, "capabilities" JSONB NOT NULL DEFAULT '{}',
  "contextWindowTokens" INTEGER, "maximumOutputTokens" INTEGER, "defaultParameters" JSONB NOT NULL DEFAULT '{}',
  "costProfileId" UUID, "localHardwareProfileId" UUID, "metadata" JSONB NOT NULL DEFAULT '{}',
  "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ModelProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PromptVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "role" "BenchmarkAgentRole" NOT NULL, "version" TEXT NOT NULL,
  "templateHash" TEXT NOT NULL, "schemaVersion" TEXT NOT NULL, "sourcePath" TEXT NOT NULL,
  "changelog" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkDataset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT, "domain" TEXT NOT NULL, "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkDataset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkDatasetVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "datasetId" UUID NOT NULL, "version" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL, "contentHash" TEXT NOT NULL, "caseCount" INTEGER NOT NULL DEFAULT 0,
  "sourcePackageHash" TEXT, "frozenAt" TIMESTAMP(3), "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkDatasetVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "datasetVersionId" UUID NOT NULL, "code" TEXT NOT NULL,
  "title" TEXT NOT NULL, "domain" TEXT NOT NULL, "question" TEXT NOT NULL, "scenario" TEXT NOT NULL,
  "objectives" JSONB NOT NULL DEFAULT '[]', "constraints" JSONB NOT NULL DEFAULT '[]',
  "assumptions" JSONB NOT NULL DEFAULT '[]', "expectedDecisionType" TEXT NOT NULL,
  "referenceFacts" JSONB NOT NULL DEFAULT '[]', "criticalRisks" JSONB NOT NULL DEFAULT '[]',
  "expectedAlternatives" JSONB NOT NULL DEFAULT '[]', "knownUnknowns" JSONB NOT NULL DEFAULT '[]',
  "goldCitationMappings" JSONB, "difficulty" TEXT NOT NULL, "tags" JSONB NOT NULL DEFAULT '[]',
  "sensitivity" TEXT NOT NULL DEFAULT 'SYNTHETIC', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkEvidencePackage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkCaseId" UUID NOT NULL, "version" TEXT NOT NULL,
  "protocol" "BenchmarkProtocol" NOT NULL, "internalEvidence" JSONB NOT NULL DEFAULT '[]',
  "externalEvidence" JSONB NOT NULL DEFAULT '[]', "citationMappings" JSONB NOT NULL DEFAULT '{}',
  "sourceMetadata" JSONB NOT NULL DEFAULT '{}', "retrievalConfiguration" JSONB NOT NULL DEFAULT '{}',
  "researchConfiguration" JSONB NOT NULL DEFAULT '{}', "contentHash" TEXT NOT NULL,
  "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkEvidencePackage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EvaluationRubric" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "version" TEXT NOT NULL,
  "title" TEXT NOT NULL, "criteria" JSONB NOT NULL, "scale" JSONB NOT NULL, "weights" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL, "frozenAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluationRubric_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkSuite" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "projectId" UUID NOT NULL, "datasetVersionId" UUID,
  "code" TEXT NOT NULL, "version" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "researchQuestions" JSONB NOT NULL DEFAULT '[]', "hypotheses" JSONB NOT NULL DEFAULT '[]', "domain" TEXT NOT NULL,
  "defaultEvaluationRubricId" UUID, "status" "BenchmarkSuiteStatus" NOT NULL DEFAULT 'DRAFT',
  "statisticalPlan" JSONB NOT NULL DEFAULT '{}', "createdById" UUID NOT NULL, "frozenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkSuite_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkVariant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "suiteId" UUID NOT NULL, "code" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "architecture" "BenchmarkArchitecture" NOT NULL,
  "baselineVariantId" UUID, "ablationConfiguration" JSONB, "budgetConfiguration" JSONB NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true, "contentHash" TEXT NOT NULL, "frozenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentModelAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkVariantId" UUID NOT NULL,
  "role" "BenchmarkAgentRole" NOT NULL, "modelProfileId" UUID NOT NULL, "promptVersionId" UUID NOT NULL,
  "parameters" JSONB NOT NULL DEFAULT '{}', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "executionOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentModelAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JudgePolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "version" TEXT NOT NULL,
  "primaryJudgeModelProfileId" UUID, "secondaryJudgeModelProfileId" UUID, "promptVersionId" UUID NOT NULL,
  "rubricId" UUID NOT NULL, "configuration" JSONB NOT NULL DEFAULT '{}', "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "JudgePolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExperimentEnvironmentSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "codeRevision" TEXT, "workingTreeDirty" BOOLEAN NOT NULL,
  "nodeVersion" TEXT NOT NULL, "pythonVersion" TEXT NOT NULL, "operatingSystem" TEXT NOT NULL,
  "dependencyHashes" JSONB NOT NULL DEFAULT '{}', "schemaHashes" JSONB NOT NULL DEFAULT '{}',
  "providerSdkVersions" JSONB NOT NULL DEFAULT '{}', "serviceVersions" JSONB NOT NULL DEFAULT '{}',
  "featureFlags" JSONB NOT NULL DEFAULT '{}', "hardwareProfileIds" JSONB NOT NULL DEFAULT '[]',
  "contentHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentEnvironmentSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "suiteId" UUID NOT NULL, "datasetVersionId" UUID NOT NULL,
  "status" "BenchmarkRunStatus" NOT NULL DEFAULT 'DRAFT', "protocol" "BenchmarkProtocol" NOT NULL,
  "budgetProtocol" "BenchmarkBudgetProtocol" NOT NULL, "repetitions" INTEGER NOT NULL, "randomizationSeed" INTEGER NOT NULL,
  "judgePolicyId" UUID, "environmentSnapshotId" UUID, "startedById" UUID NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "executionPlan" JSONB NOT NULL DEFAULT '{}', "evaluationPolicy" JSONB NOT NULL DEFAULT '{}',
  "estimatedCostMinorUnits" BIGINT, "actualCostMinorUnits" BIGINT, "currency" TEXT,
  "workingTreeDirty" BOOLEAN NOT NULL DEFAULT false, "pauseRequested" BOOLEAN NOT NULL DEFAULT false,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3), "failureSummary" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkCaseRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkRunId" UUID NOT NULL, "benchmarkCaseId" UUID NOT NULL,
  "benchmarkVariantId" UUID NOT NULL, "repetitionIndex" INTEGER NOT NULL, "executionOrder" INTEGER NOT NULL,
  "status" "BenchmarkCaseRunStatus" NOT NULL DEFAULT 'QUEUED', "attempt" INTEGER NOT NULL DEFAULT 0,
  "evidencePackageId" UUID, "analysisRunId" UUID, "outputSnapshot" JSONB, "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "latencyMs" INTEGER, "totalProviderCalls" INTEGER NOT NULL DEFAULT 0,
  "totalInputTokens" INTEGER, "totalOutputTokens" INTEGER, "totalCachedTokens" INTEGER,
  "totalCostMinorUnits" BIGINT, "currency" TEXT, "failureCode" TEXT, "failureMessage" TEXT,
  "resultHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "BenchmarkCaseRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ModelInvocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkCaseRunId" UUID NOT NULL,
  "agentRole" "BenchmarkAgentRole" NOT NULL, "sequenceIndex" INTEGER NOT NULL, "modelProfileId" UUID NOT NULL,
  "promptVersionId" UUID, "provider" "ModelProviderCode" NOT NULL, "exactModelId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "responseHash" TEXT, "parameters" JSONB NOT NULL DEFAULT '{}',
  "inputTokens" INTEGER, "outputTokens" INTEGER, "cachedTokens" INTEGER, "reasoningTokens" INTEGER,
  "latencyMs" INTEGER NOT NULL, "timeToFirstTokenMs" INTEGER, "estimatedCostMinorUnits" BIGINT,
  "currency" TEXT, "finishReason" TEXT NOT NULL, "status" TEXT NOT NULL, "providerRequestIdHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModelInvocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AutomaticEvaluation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkCaseRunId" UUID NOT NULL,
  "evaluatorType" TEXT NOT NULL, "evaluatorVersion" TEXT NOT NULL, "rubricId" UUID,
  "judgeModelProfileId" UUID, "metrics" JSONB NOT NULL DEFAULT '{}', "score" DECIMAL(12,6),
  "confidence" DECIMAL(12,6), "rawResultHash" TEXT, "status" "AutomaticEvaluationStatus" NOT NULL DEFAULT 'PENDING',
  "failureCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomaticEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HumanEvaluationTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkRunId" UUID NOT NULL, "benchmarkCaseId" UUID NOT NULL,
  "leftCaseRunId" UUID NOT NULL, "rightCaseRunId" UUID NOT NULL, "leftDisplayPosition" INTEGER NOT NULL,
  "assignedEvaluatorId" UUID, "status" "HumanEvaluationTaskStatus" NOT NULL DEFAULT 'PENDING', "rubricId" UUID NOT NULL,
  "deadline" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "HumanEvaluationTask_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BenchmarkHumanEvaluation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "taskId" UUID NOT NULL, "evaluatorId" UUID NOT NULL,
  "preferredOutput" "HumanEvaluationPreference" NOT NULL, "criterionScores" JSONB NOT NULL DEFAULT '{}',
  "confidence" INTEGER NOT NULL, "notes" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenchmarkHumanEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StatisticalComparison" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkRunId" UUID NOT NULL, "leftVariantId" UUID NOT NULL,
  "rightVariantId" UUID NOT NULL, "metric" TEXT NOT NULL, "sampleSize" INTEGER NOT NULL, "testName" TEXT NOT NULL,
  "assumptions" JSONB NOT NULL DEFAULT '{}', "descriptiveStatistics" JSONB NOT NULL DEFAULT '{}',
  "effectSize" DECIMAL(12,6), "confidenceInterval" JSONB NOT NULL DEFAULT '{}', "pValue" DECIMAL(12,6),
  "adjustedPValue" DECIMAL(12,6), "correctionMethod" TEXT, "interpretation" TEXT NOT NULL,
  "warnings" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StatisticalComparison_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReproducibilityArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "benchmarkRunId" UUID NOT NULL,
  "status" "ReproducibilityArtifactStatus" NOT NULL DEFAULT 'QUEUED', "objectKey" TEXT, "checksum" TEXT,
  "byteSize" INTEGER, "manifestHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3), "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "ReproducibilityArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelCostProfile_provider_exactModelId_version_key" ON "ModelCostProfile"("provider", "exactModelId", "version");
CREATE INDEX "ModelCostProfile_provider_exactModelId_effectiveFrom_idx" ON "ModelCostProfile"("provider", "exactModelId", "effectiveFrom");
CREATE UNIQUE INDEX "LocalHardwareProfile_code_key" ON "LocalHardwareProfile"("code");
CREATE INDEX "LocalHardwareProfile_active_code_idx" ON "LocalHardwareProfile"("active", "code");
CREATE UNIQUE INDEX "ModelProfile_code_version_key" ON "ModelProfile"("code", "version");
CREATE INDEX "ModelProfile_provider_exactModelId_idx" ON "ModelProfile"("provider", "exactModelId");
CREATE INDEX "ModelProfile_active_benchmarkEligible_idx" ON "ModelProfile"("active", "benchmarkEligible");
CREATE UNIQUE INDEX "PromptVersion_role_version_key" ON "PromptVersion"("role", "version");
CREATE INDEX "PromptVersion_templateHash_idx" ON "PromptVersion"("templateHash");
CREATE UNIQUE INDEX "BenchmarkDataset_code_key" ON "BenchmarkDataset"("code");
CREATE UNIQUE INDEX "BenchmarkDatasetVersion_datasetId_version_key" ON "BenchmarkDatasetVersion"("datasetId", "version");
CREATE INDEX "BenchmarkDatasetVersion_contentHash_idx" ON "BenchmarkDatasetVersion"("contentHash");
CREATE UNIQUE INDEX "BenchmarkCase_datasetVersionId_code_key" ON "BenchmarkCase"("datasetVersionId", "code");
CREATE INDEX "BenchmarkCase_datasetVersionId_domain_idx" ON "BenchmarkCase"("datasetVersionId", "domain");
CREATE UNIQUE INDEX "BenchmarkEvidencePackage_benchmarkCaseId_version_protocol_key" ON "BenchmarkEvidencePackage"("benchmarkCaseId", "version", "protocol");
CREATE INDEX "BenchmarkEvidencePackage_contentHash_idx" ON "BenchmarkEvidencePackage"("contentHash");
CREATE UNIQUE INDEX "EvaluationRubric_code_version_key" ON "EvaluationRubric"("code", "version");
CREATE INDEX "EvaluationRubric_contentHash_idx" ON "EvaluationRubric"("contentHash");
CREATE UNIQUE INDEX "BenchmarkSuite_code_version_key" ON "BenchmarkSuite"("code", "version");
CREATE INDEX "BenchmarkSuite_projectId_status_createdAt_idx" ON "BenchmarkSuite"("projectId", "status", "createdAt");
CREATE UNIQUE INDEX "BenchmarkVariant_suiteId_code_key" ON "BenchmarkVariant"("suiteId", "code");
CREATE INDEX "BenchmarkVariant_suiteId_enabled_idx" ON "BenchmarkVariant"("suiteId", "enabled");
CREATE UNIQUE INDEX "AgentModelAssignment_benchmarkVariantId_role_key" ON "AgentModelAssignment"("benchmarkVariantId", "role");
CREATE INDEX "AgentModelAssignment_modelProfileId_idx" ON "AgentModelAssignment"("modelProfileId");
CREATE UNIQUE INDEX "JudgePolicy_code_version_key" ON "JudgePolicy"("code", "version");
CREATE INDEX "ExperimentEnvironmentSnapshot_contentHash_idx" ON "ExperimentEnvironmentSnapshot"("contentHash");
CREATE UNIQUE INDEX "BenchmarkRun_idempotencyKey_key" ON "BenchmarkRun"("idempotencyKey");
CREATE INDEX "BenchmarkRun_suiteId_status_createdAt_idx" ON "BenchmarkRun"("suiteId", "status", "createdAt");
CREATE INDEX "BenchmarkRun_startedById_createdAt_idx" ON "BenchmarkRun"("startedById", "createdAt");
CREATE UNIQUE INDEX "BenchmarkCaseRun_benchmarkRunId_benchmarkCaseId_benchmarkVariantId_repetitionIndex_key" ON "BenchmarkCaseRun"("benchmarkRunId", "benchmarkCaseId", "benchmarkVariantId", "repetitionIndex");
CREATE INDEX "BenchmarkCaseRun_benchmarkRunId_status_executionOrder_idx" ON "BenchmarkCaseRun"("benchmarkRunId", "status", "executionOrder");
CREATE UNIQUE INDEX "ModelInvocation_benchmarkCaseRunId_sequenceIndex_key" ON "ModelInvocation"("benchmarkCaseRunId", "sequenceIndex");
CREATE INDEX "ModelInvocation_modelProfileId_createdAt_idx" ON "ModelInvocation"("modelProfileId", "createdAt");
CREATE INDEX "AutomaticEvaluation_benchmarkCaseRunId_evaluatorType_idx" ON "AutomaticEvaluation"("benchmarkCaseRunId", "evaluatorType");
CREATE INDEX "HumanEvaluationTask_benchmarkRunId_status_idx" ON "HumanEvaluationTask"("benchmarkRunId", "status");
CREATE INDEX "HumanEvaluationTask_assignedEvaluatorId_status_idx" ON "HumanEvaluationTask"("assignedEvaluatorId", "status");
CREATE UNIQUE INDEX "BenchmarkHumanEvaluation_taskId_evaluatorId_key" ON "BenchmarkHumanEvaluation"("taskId", "evaluatorId");
CREATE INDEX "BenchmarkHumanEvaluation_evaluatorId_createdAt_idx" ON "BenchmarkHumanEvaluation"("evaluatorId", "createdAt");
CREATE INDEX "StatisticalComparison_benchmarkRunId_metric_idx" ON "StatisticalComparison"("benchmarkRunId", "metric");
CREATE INDEX "ReproducibilityArtifact_benchmarkRunId_status_idx" ON "ReproducibilityArtifact"("benchmarkRunId", "status");

ALTER TABLE "ModelProfile" ADD CONSTRAINT "ModelProfile_costProfileId_fkey" FOREIGN KEY ("costProfileId") REFERENCES "ModelCostProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelProfile" ADD CONSTRAINT "ModelProfile_localHardwareProfileId_fkey" FOREIGN KEY ("localHardwareProfileId") REFERENCES "LocalHardwareProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkDatasetVersion" ADD CONSTRAINT "BenchmarkDatasetVersion_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "BenchmarkDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkCase" ADD CONSTRAINT "BenchmarkCase_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "BenchmarkDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkEvidencePackage" ADD CONSTRAINT "BenchmarkEvidencePackage_benchmarkCaseId_fkey" FOREIGN KEY ("benchmarkCaseId") REFERENCES "BenchmarkCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkSuite" ADD CONSTRAINT "BenchmarkSuite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BenchmarkSuite" ADD CONSTRAINT "BenchmarkSuite_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "BenchmarkDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkSuite" ADD CONSTRAINT "BenchmarkSuite_defaultEvaluationRubricId_fkey" FOREIGN KEY ("defaultEvaluationRubricId") REFERENCES "EvaluationRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkVariant" ADD CONSTRAINT "BenchmarkVariant_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkVariant" ADD CONSTRAINT "BenchmarkVariant_baselineVariantId_fkey" FOREIGN KEY ("baselineVariantId") REFERENCES "BenchmarkVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentModelAssignment" ADD CONSTRAINT "AgentModelAssignment_benchmarkVariantId_fkey" FOREIGN KEY ("benchmarkVariantId") REFERENCES "BenchmarkVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentModelAssignment" ADD CONSTRAINT "AgentModelAssignment_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentModelAssignment" ADD CONSTRAINT "AgentModelAssignment_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JudgePolicy" ADD CONSTRAINT "JudgePolicy_primaryJudgeModelProfileId_fkey" FOREIGN KEY ("primaryJudgeModelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JudgePolicy" ADD CONSTRAINT "JudgePolicy_secondaryJudgeModelProfileId_fkey" FOREIGN KEY ("secondaryJudgeModelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JudgePolicy" ADD CONSTRAINT "JudgePolicy_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JudgePolicy" ADD CONSTRAINT "JudgePolicy_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EvaluationRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "BenchmarkSuite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "BenchmarkDatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_judgePolicyId_fkey" FOREIGN KEY ("judgePolicyId") REFERENCES "JudgePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkRun" ADD CONSTRAINT "BenchmarkRun_environmentSnapshotId_fkey" FOREIGN KEY ("environmentSnapshotId") REFERENCES "ExperimentEnvironmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkCaseRun" ADD CONSTRAINT "BenchmarkCaseRun_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkCaseRun" ADD CONSTRAINT "BenchmarkCaseRun_benchmarkCaseId_fkey" FOREIGN KEY ("benchmarkCaseId") REFERENCES "BenchmarkCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkCaseRun" ADD CONSTRAINT "BenchmarkCaseRun_benchmarkVariantId_fkey" FOREIGN KEY ("benchmarkVariantId") REFERENCES "BenchmarkVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkCaseRun" ADD CONSTRAINT "BenchmarkCaseRun_evidencePackageId_fkey" FOREIGN KEY ("evidencePackageId") REFERENCES "BenchmarkEvidencePackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_benchmarkCaseRunId_fkey" FOREIGN KEY ("benchmarkCaseRunId") REFERENCES "BenchmarkCaseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomaticEvaluation" ADD CONSTRAINT "AutomaticEvaluation_benchmarkCaseRunId_fkey" FOREIGN KEY ("benchmarkCaseRunId") REFERENCES "BenchmarkCaseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomaticEvaluation" ADD CONSTRAINT "AutomaticEvaluation_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EvaluationRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AutomaticEvaluation" ADD CONSTRAINT "AutomaticEvaluation_judgeModelProfileId_fkey" FOREIGN KEY ("judgeModelProfileId") REFERENCES "ModelProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluationTask" ADD CONSTRAINT "HumanEvaluationTask_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluationTask" ADD CONSTRAINT "HumanEvaluationTask_benchmarkCaseId_fkey" FOREIGN KEY ("benchmarkCaseId") REFERENCES "BenchmarkCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluationTask" ADD CONSTRAINT "HumanEvaluationTask_leftCaseRunId_fkey" FOREIGN KEY ("leftCaseRunId") REFERENCES "BenchmarkCaseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluationTask" ADD CONSTRAINT "HumanEvaluationTask_rightCaseRunId_fkey" FOREIGN KEY ("rightCaseRunId") REFERENCES "BenchmarkCaseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluationTask" ADD CONSTRAINT "HumanEvaluationTask_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "EvaluationRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BenchmarkHumanEvaluation" ADD CONSTRAINT "BenchmarkHumanEvaluation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HumanEvaluationTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatisticalComparison" ADD CONSTRAINT "StatisticalComparison_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatisticalComparison" ADD CONSTRAINT "StatisticalComparison_leftVariantId_fkey" FOREIGN KEY ("leftVariantId") REFERENCES "BenchmarkVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatisticalComparison" ADD CONSTRAINT "StatisticalComparison_rightVariantId_fkey" FOREIGN KEY ("rightVariantId") REFERENCES "BenchmarkVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReproducibilityArtifact" ADD CONSTRAINT "ReproducibilityArtifact_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
