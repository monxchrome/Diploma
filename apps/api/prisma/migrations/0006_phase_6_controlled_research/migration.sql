CREATE TYPE "EvidenceMode" AS ENUM ('INTERNAL_ONLY', 'EXTERNAL_ONLY', 'HYBRID');
CREATE TYPE "ResearchRunStatus" AS ENUM ('QUEUED', 'PLANNING', 'SEARCHING', 'FETCHING', 'EXTRACTING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED');
CREATE TYPE "ResearchQueryStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "ResearchFetchStatus" AS ENUM ('FETCHED', 'REJECTED', 'FAILED');
CREATE TYPE "EvidenceConflictStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED');
CREATE TYPE "ExperimentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_LIMITATIONS', 'FAILED', 'CANCELLED');

ALTER TABLE "DecisionAnalysis"
  ADD COLUMN "evidenceMode" "EvidenceMode" NOT NULL DEFAULT 'INTERNAL_ONLY',
  ADD COLUMN "externalResearchEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "researchCountry" TEXT,
  ADD COLUMN "researchLanguages" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "publishedAfter" TIMESTAMP(3),
  ADD COLUMN "publishedBefore" TIMESTAMP(3),
  ADD COLUMN "preferredDomains" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "excludedDomains" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "sourceTypes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "maximumExternalSources" INTEGER;

CREATE TABLE "ResearchRun" (
  "id" UUID NOT NULL, "analysisRunId" UUID NOT NULL, "projectId" UUID NOT NULL,
  "status" "ResearchRunStatus" NOT NULL DEFAULT 'QUEUED', "evidenceMode" "EvidenceMode" NOT NULL,
  "provider" TEXT NOT NULL, "policyVersion" TEXT NOT NULL, "plan" JSONB,
  "queryCount" INTEGER NOT NULL DEFAULT 0, "resultCount" INTEGER NOT NULL DEFAULT 0,
  "fetchedPageCount" INTEGER NOT NULL DEFAULT 0, "selectedSourceCount" INTEGER NOT NULL DEFAULT 0,
  "totalFetchedBytes" INTEGER NOT NULL DEFAULT 0, "totalExtractedCharacters" INTEGER NOT NULL DEFAULT 0,
  "totalDurationMs" INTEGER, "searchDurationMs" INTEGER, "fetchDurationMs" INTEGER,
  "extractionDurationMs" INTEGER, "failureCode" TEXT, "failureMessage" TEXT, "requestId" TEXT NOT NULL,
  "cancellationRequested" BOOLEAN NOT NULL DEFAULT false, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchQuery" (
  "id" UUID NOT NULL, "researchRunId" UUID NOT NULL, "queryIndex" INTEGER NOT NULL, "query" TEXT NOT NULL,
  "purpose" TEXT NOT NULL, "country" TEXT, "languages" JSONB NOT NULL DEFAULT '[]',
  "publishedAfter" TIMESTAMP(3), "publishedBefore" TIMESTAMP(3),
  "status" "ResearchQueryStatus" NOT NULL DEFAULT 'PENDING', "resultCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER, "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchQuery_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchSearchResult" (
  "id" UUID NOT NULL, "researchQueryId" UUID NOT NULL, "providerRank" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "url" TEXT NOT NULL, "normalizedUrl" TEXT NOT NULL, "domain" TEXT NOT NULL, "snippet" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3), "sourceType" TEXT, "selectedForFetch" BOOLEAN NOT NULL DEFAULT false,
  "rejectionReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchSearchResult_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchSource" (
  "id" UUID NOT NULL, "normalizedUrl" TEXT NOT NULL, "domain" TEXT NOT NULL, "canonicalUrl" TEXT,
  "title" TEXT NOT NULL, "publisher" TEXT, "author" TEXT, "sourceType" TEXT, "language" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResearchSnapshot" (
  "id" UUID NOT NULL, "researchSourceId" UUID NOT NULL, "contentHash" TEXT NOT NULL,
  "fetchStatus" "ResearchFetchStatus" NOT NULL, "httpStatus" INTEGER, "contentType" TEXT,
  "publishedAt" TIMESTAMP(3), "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "extractedTitle" TEXT, "extractedText" TEXT NOT NULL, "extractedMetadata" JSONB NOT NULL DEFAULT '{}',
  "credibilityAssessment" JSONB NOT NULL DEFAULT '{}', "extractionVersion" TEXT NOT NULL,
  "fetchDurationMs" INTEGER, "extractedCharacterCount" INTEGER NOT NULL DEFAULT 0, "warnings" JSONB NOT NULL DEFAULT '[]',
  "errorCode" TEXT, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResearchSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExternalEvidence" (
  "id" UUID NOT NULL, "researchRunId" UUID NOT NULL, "researchSnapshotId" UUID NOT NULL, "evidenceId" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL, "relevanceScore" DOUBLE PRECISION, "selected" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalEvidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExternalAnalysisCitation" (
  "id" UUID NOT NULL, "analysisReportId" UUID NOT NULL, "researchRunId" UUID NOT NULL,
  "researchSnapshotId" UUID NOT NULL, "evidenceId" TEXT NOT NULL, "quote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalAnalysisCitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EvidenceConflict" (
  "id" UUID NOT NULL, "analysisRunId" UUID NOT NULL, "topic" TEXT NOT NULL,
  "internalEvidenceIds" JSONB NOT NULL DEFAULT '[]', "externalEvidenceIds" JSONB NOT NULL DEFAULT '[]',
  "description" TEXT NOT NULL, "resolution" TEXT, "status" "EvidenceConflictStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceConflict_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Experiment" (
  "id" UUID NOT NULL, "projectId" UUID NOT NULL, "createdById" UUID NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT', "datasetId" TEXT NOT NULL,
  "configuration" JSONB NOT NULL DEFAULT '{}', "bullJobId" TEXT, "cancellationRequested" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3),
  CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExperimentVariant" (
  "id" UUID NOT NULL, "experimentId" UUID NOT NULL, "name" TEXT NOT NULL, "analysisMode" "AnalysisMode" NOT NULL,
  "evidenceMode" "EvidenceMode" NOT NULL, "retrievalConfiguration" JSONB NOT NULL DEFAULT '{}',
  "agentConfiguration" JSONB NOT NULL DEFAULT '{}', "criticConfiguration" JSONB NOT NULL DEFAULT '{}',
  "modelConfiguration" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentVariant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExperimentCase" (
  "id" UUID NOT NULL, "experimentId" UUID NOT NULL, "caseIndex" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "question" TEXT NOT NULL, "objectives" JSONB NOT NULL DEFAULT '[]', "constraints" JSONB NOT NULL DEFAULT '[]',
  "assumptions" JSONB NOT NULL DEFAULT '[]', "scope" JSONB NOT NULL DEFAULT '{}', "expectedEvidence" JSONB NOT NULL DEFAULT '[]',
  "rubric" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExperimentRun" (
  "id" UUID NOT NULL, "experimentId" UUID NOT NULL, "experimentVariantId" UUID NOT NULL, "experimentCaseId" UUID NOT NULL,
  "analysisRunId" UUID, "repetition" INTEGER NOT NULL, "status" "ExperimentRunStatus" NOT NULL DEFAULT 'QUEUED', "seed" INTEGER,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExperimentRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExperimentMetric" (
  "id" UUID NOT NULL, "experimentRunId" UUID NOT NULL, "metricName" TEXT NOT NULL, "metricVersion" TEXT NOT NULL,
  "numericValue" DOUBLE PRECISION, "textValue" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ExperimentMetric_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "HumanEvaluation" (
  "id" UUID NOT NULL, "experimentRunId" UUID NOT NULL, "evaluatorUserId" UUID NOT NULL, "rubricVersion" TEXT NOT NULL,
  "scores" JSONB NOT NULL, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "HumanEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResearchRun_analysisRunId_key" ON "ResearchRun"("analysisRunId");
CREATE INDEX "ResearchRun_projectId_status_createdAt_idx" ON "ResearchRun"("projectId", "status", "createdAt");
CREATE UNIQUE INDEX "ResearchQuery_researchRunId_queryIndex_key" ON "ResearchQuery"("researchRunId", "queryIndex");
CREATE INDEX "ResearchQuery_researchRunId_status_idx" ON "ResearchQuery"("researchRunId", "status");
CREATE INDEX "ResearchSearchResult_researchQueryId_providerRank_idx" ON "ResearchSearchResult"("researchQueryId", "providerRank");
CREATE INDEX "ResearchSearchResult_normalizedUrl_idx" ON "ResearchSearchResult"("normalizedUrl");
CREATE UNIQUE INDEX "ResearchSource_normalizedUrl_key" ON "ResearchSource"("normalizedUrl");
CREATE INDEX "ResearchSource_domain_lastSeenAt_idx" ON "ResearchSource"("domain", "lastSeenAt");
CREATE UNIQUE INDEX "ResearchSnapshot_researchSourceId_contentHash_key" ON "ResearchSnapshot"("researchSourceId", "contentHash");
CREATE INDEX "ResearchSnapshot_retrievedAt_idx" ON "ResearchSnapshot"("retrievedAt");
CREATE UNIQUE INDEX "ExternalEvidence_researchRunId_evidenceId_key" ON "ExternalEvidence"("researchRunId", "evidenceId");
CREATE UNIQUE INDEX "ExternalEvidence_researchRunId_researchSnapshotId_key" ON "ExternalEvidence"("researchRunId", "researchSnapshotId");
CREATE INDEX "ExternalEvidence_researchRunId_selected_idx" ON "ExternalEvidence"("researchRunId", "selected");
CREATE UNIQUE INDEX "ExternalAnalysisCitation_analysisReportId_evidenceId_key" ON "ExternalAnalysisCitation"("analysisReportId", "evidenceId");
CREATE INDEX "ExternalAnalysisCitation_researchRunId_evidenceId_idx" ON "ExternalAnalysisCitation"("researchRunId", "evidenceId");
CREATE INDEX "EvidenceConflict_analysisRunId_status_idx" ON "EvidenceConflict"("analysisRunId", "status");
CREATE UNIQUE INDEX "Experiment_bullJobId_key" ON "Experiment"("bullJobId");
CREATE INDEX "Experiment_projectId_status_createdAt_idx" ON "Experiment"("projectId", "status", "createdAt");
CREATE UNIQUE INDEX "ExperimentVariant_experimentId_name_key" ON "ExperimentVariant"("experimentId", "name");
CREATE UNIQUE INDEX "ExperimentCase_experimentId_caseIndex_key" ON "ExperimentCase"("experimentId", "caseIndex");
CREATE UNIQUE INDEX "ExperimentRun_experimentVariantId_experimentCaseId_repetition_key" ON "ExperimentRun"("experimentVariantId", "experimentCaseId", "repetition");
CREATE INDEX "ExperimentRun_experimentId_status_createdAt_idx" ON "ExperimentRun"("experimentId", "status", "createdAt");
CREATE UNIQUE INDEX "ExperimentMetric_experimentRunId_metricName_metricVersion_key" ON "ExperimentMetric"("experimentRunId", "metricName", "metricVersion");
CREATE INDEX "ExperimentMetric_metricName_metricVersion_idx" ON "ExperimentMetric"("metricName", "metricVersion");
CREATE UNIQUE INDEX "HumanEvaluation_experimentRunId_evaluatorUserId_key" ON "HumanEvaluation"("experimentRunId", "evaluatorUserId");
CREATE INDEX "HumanEvaluation_evaluatorUserId_createdAt_idx" ON "HumanEvaluation"("evaluatorUserId", "createdAt");

ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchQuery" ADD CONSTRAINT "ResearchQuery_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSearchResult" ADD CONSTRAINT "ResearchSearchResult_researchQueryId_fkey" FOREIGN KEY ("researchQueryId") REFERENCES "ResearchQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchSnapshot" ADD CONSTRAINT "ResearchSnapshot_researchSourceId_fkey" FOREIGN KEY ("researchSourceId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalEvidence" ADD CONSTRAINT "ExternalEvidence_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalEvidence" ADD CONSTRAINT "ExternalEvidence_researchSnapshotId_fkey" FOREIGN KEY ("researchSnapshotId") REFERENCES "ResearchSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalAnalysisCitation" ADD CONSTRAINT "ExternalAnalysisCitation_analysisReportId_fkey" FOREIGN KEY ("analysisReportId") REFERENCES "AnalysisReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceConflict" ADD CONSTRAINT "EvidenceConflict_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentCase" ADD CONSTRAINT "ExperimentCase_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_experimentVariantId_fkey" FOREIGN KEY ("experimentVariantId") REFERENCES "ExperimentVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_experimentCaseId_fkey" FOREIGN KEY ("experimentCaseId") REFERENCES "ExperimentCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperimentRun" ADD CONSTRAINT "ExperimentRun_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExperimentMetric" ADD CONSTRAINT "ExperimentMetric_experimentRunId_fkey" FOREIGN KEY ("experimentRunId") REFERENCES "ExperimentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluation" ADD CONSTRAINT "HumanEvaluation_experimentRunId_fkey" FOREIGN KEY ("experimentRunId") REFERENCES "ExperimentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanEvaluation" ADD CONSTRAINT "HumanEvaluation_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
