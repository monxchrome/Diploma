CREATE TYPE "RetrievalMode" AS ENUM ('DENSE', 'SPARSE', 'HYBRID');
CREATE TYPE "RetrievalRunStatus" AS ENUM ('COMPLETED', 'FAILED');

CREATE TABLE "RetrievalRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "query" TEXT NOT NULL,
  "normalizedQuery" TEXT NOT NULL,
  "mode" "RetrievalMode" NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "status" "RetrievalRunStatus" NOT NULL DEFAULT 'COMPLETED',
  "timingsMs" JSONB NOT NULL DEFAULT '{}',
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetrievalRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagResponse" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "retrievalRunId" UUID NOT NULL,
  "answer" TEXT NOT NULL,
  "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagCitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ragResponseId" UUID NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "chunkId" UUID NOT NULL,
  "quote" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagCitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnswerFeedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ragResponseId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnswerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RagResponse_retrievalRunId_key" ON "RagResponse"("retrievalRunId");
CREATE UNIQUE INDEX "AnswerFeedback_ragResponseId_userId_key" ON "AnswerFeedback"("ragResponseId", "userId");
CREATE INDEX "RetrievalRun_projectId_userId_createdAt_idx" ON "RetrievalRun"("projectId", "userId", "createdAt");
CREATE INDEX "RetrievalRun_projectId_createdAt_idx" ON "RetrievalRun"("projectId", "createdAt");
CREATE INDEX "RagCitation_ragResponseId_idx" ON "RagCitation"("ragResponseId");
CREATE INDEX "RagCitation_documentId_idx" ON "RagCitation"("documentId");
CREATE INDEX "AnswerFeedback_userId_createdAt_idx" ON "AnswerFeedback"("userId", "createdAt");

ALTER TABLE "RetrievalRun" ADD CONSTRAINT "RetrievalRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetrievalRun" ADD CONSTRAINT "RetrievalRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RagResponse" ADD CONSTRAINT "RagResponse_retrievalRunId_fkey" FOREIGN KEY ("retrievalRunId") REFERENCES "RetrievalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagCitation" ADD CONSTRAINT "RagCitation_ragResponseId_fkey" FOREIGN KEY ("ragResponseId") REFERENCES "RagResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_ragResponseId_fkey" FOREIGN KEY ("ragResponseId") REFERENCES "RagResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnswerFeedback" ADD CONSTRAINT "AnswerFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
