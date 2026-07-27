CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'QUEUED', 'VALIDATING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'COMPLETED', 'FAILED', 'ARCHIVED');
CREATE TYPE "IngestionJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "KnowledgeBase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "projectId" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'ACTIVE', "createdById" UUID NOT NULL, "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Document" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "knowledgeBaseId" UUID NOT NULL, "originalFilename" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD', "mimeType" TEXT, "declaredMimeType" TEXT NOT NULL, "sizeBytes" BIGINT NOT NULL,
  "currentVersionId" UUID, "createdById" UUID NOT NULL, "archivedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DocumentVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "documentId" UUID NOT NULL, "version" INTEGER NOT NULL, "storageKey" TEXT NOT NULL,
  "checksumSha256" TEXT, "detectedMimeType" TEXT, "parserName" TEXT, "parserVersion" TEXT, "chunkerVersion" TEXT,
  "embeddingProvider" TEXT, "embeddingModel" TEXT, "embeddingDimension" INTEGER, "pageCount" INTEGER, "characterCount" INTEGER,
  "tokenCount" INTEGER, "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD', "errorCode" TEXT, "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DocumentChunk" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "documentVersionId" UUID NOT NULL, "chunkIndex" INTEGER NOT NULL, "content" TEXT NOT NULL,
  "tokenCount" INTEGER NOT NULL, "pageStart" INTEGER, "pageEnd" INTEGER, "headingPath" JSONB NOT NULL DEFAULT '[]', "metadata" JSONB NOT NULL DEFAULT '{}',
  "vectorPointId" TEXT NOT NULL, "contentHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IngestionJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "documentVersionId" UUID NOT NULL, "bullJobId" TEXT, "status" "IngestionJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempt" INTEGER NOT NULL DEFAULT 0, "progress" INTEGER NOT NULL DEFAULT 0, "currentStage" TEXT, "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "errorCode" TEXT, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentVersion_storageKey_key" ON "DocumentVersion"("storageKey");
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");
CREATE UNIQUE INDEX "DocumentChunk_vectorPointId_key" ON "DocumentChunk"("vectorPointId");
CREATE UNIQUE INDEX "DocumentChunk_documentVersionId_chunkIndex_key" ON "DocumentChunk"("documentVersionId", "chunkIndex");
CREATE INDEX "KnowledgeBase_projectId_status_createdAt_idx" ON "KnowledgeBase"("projectId", "status", "createdAt");
CREATE INDEX "KnowledgeBase_projectId_archivedAt_idx" ON "KnowledgeBase"("projectId", "archivedAt");
CREATE INDEX "Document_knowledgeBaseId_status_createdAt_idx" ON "Document"("knowledgeBaseId", "status", "createdAt");
CREATE INDEX "Document_knowledgeBaseId_archivedAt_idx" ON "Document"("knowledgeBaseId", "archivedAt");
CREATE INDEX "DocumentVersion_checksumSha256_idx" ON "DocumentVersion"("checksumSha256");
CREATE INDEX "DocumentVersion_documentId_status_createdAt_idx" ON "DocumentVersion"("documentId", "status", "createdAt");
CREATE INDEX "DocumentChunk_documentVersionId_idx" ON "DocumentChunk"("documentVersionId");
CREATE INDEX "IngestionJob_documentVersionId_status_createdAt_idx" ON "IngestionJob"("documentVersionId", "status", "createdAt");
CREATE INDEX "IngestionJob_status_queuedAt_idx" ON "IngestionJob"("status", "queuedAt");
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
