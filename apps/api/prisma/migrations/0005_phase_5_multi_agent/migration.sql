CREATE TYPE "AnalysisMode" AS ENUM ('SINGLE_AGENT', 'MULTI_AGENT');
CREATE TYPE "AnalysisStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED', 'ARCHIVED');
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'DEGRADED', 'FAILED', 'SKIPPED');
CREATE TYPE "SpecialistType" AS ENUM ('MARKET', 'FINANCIAL', 'LEGAL_REGULATORY', 'RISK', 'STRATEGY');

CREATE TABLE "DecisionAnalysis" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "decisionQuestion" TEXT NOT NULL,
  "objectives" JSONB NOT NULL DEFAULT '[]',
  "constraints" JSONB NOT NULL DEFAULT '[]',
  "assumptions" JSONB NOT NULL DEFAULT '[]',
  "timeHorizon" TEXT,
  "targetMarket" TEXT,
  "currency" TEXT,
  "knowledgeBaseIds" JSONB NOT NULL,
  "documentIds" JSONB NOT NULL DEFAULT '[]',
  "mode" "AnalysisMode" NOT NULL,
  "requestedSpecialists" JSONB NOT NULL DEFAULT '[]',
  "additionalContext" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DecisionAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnalysisRun" (
  "id" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "AnalysisStatus" NOT NULL DEFAULT 'DRAFT',
  "threadId" TEXT NOT NULL,
  "graphVersion" TEXT NOT NULL,
  "promptVersions" JSONB NOT NULL DEFAULT '{}',
  "bullJobId" TEXT,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "currentStage" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "plan" JSONB,
  "initialRetrievalRunId" UUID,
  "tokenUsage" JSONB NOT NULL DEFAULT '{}',
  "estimatedCost" DECIMAL(12,6),
  "timingsMs" JSONB NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentRun" (
  "id" UUID NOT NULL,
  "analysisRunId" UUID NOT NULL,
  "specialist" "SpecialistType",
  "nodeName" TEXT NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "tokenUsage" JSONB NOT NULL DEFAULT '{}',
  "timingsMs" JSONB NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnalysisReport" (
  "id" UUID NOT NULL,
  "analysisRunId" UUID NOT NULL,
  "report" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnalysisCitation" (
  "id" UUID NOT NULL,
  "analysisReportId" UUID NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "chunkId" UUID NOT NULL,
  "quote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalysisCitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AnalysisCheckpoint" (
  "id" UUID NOT NULL,
  "analysisRunId" UUID NOT NULL,
  "graphVersion" TEXT NOT NULL,
  "nodeName" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalysisCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnalysisRun_threadId_key" ON "AnalysisRun"("threadId");
CREATE UNIQUE INDEX "AnalysisRun_bullJobId_key" ON "AnalysisRun"("bullJobId");
CREATE UNIQUE INDEX "AgentRun_analysisRunId_nodeName_key" ON "AgentRun"("analysisRunId", "nodeName");
CREATE UNIQUE INDEX "AnalysisReport_analysisRunId_key" ON "AnalysisReport"("analysisRunId");
CREATE UNIQUE INDEX "AnalysisCitation_analysisReportId_evidenceId_chunkId_key" ON "AnalysisCitation"("analysisReportId", "evidenceId", "chunkId");
CREATE UNIQUE INDEX "AnalysisCheckpoint_analysisRunId_nodeName_key" ON "AnalysisCheckpoint"("analysisRunId", "nodeName");
CREATE INDEX "DecisionAnalysis_projectId_archivedAt_createdAt_idx" ON "DecisionAnalysis"("projectId", "archivedAt", "createdAt");
CREATE INDEX "AnalysisRun_projectId_status_createdAt_idx" ON "AnalysisRun"("projectId", "status", "createdAt");
CREATE INDEX "AnalysisRun_userId_status_createdAt_idx" ON "AnalysisRun"("userId", "status", "createdAt");
CREATE INDEX "AgentRun_analysisRunId_status_idx" ON "AgentRun"("analysisRunId", "status");
CREATE INDEX "AnalysisCitation_documentId_idx" ON "AnalysisCitation"("documentId");
CREATE INDEX "AnalysisCheckpoint_createdAt_idx" ON "AnalysisCheckpoint"("createdAt");
ALTER TABLE "DecisionAnalysis" ADD CONSTRAINT "DecisionAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionAnalysis" ADD CONSTRAINT "DecisionAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "DecisionAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_initialRetrievalRunId_fkey" FOREIGN KEY ("initialRetrievalRunId") REFERENCES "RetrievalRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisCitation" ADD CONSTRAINT "AnalysisCitation_analysisReportId_fkey" FOREIGN KEY ("analysisReportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisCheckpoint" ADD CONSTRAINT "AnalysisCheckpoint_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
