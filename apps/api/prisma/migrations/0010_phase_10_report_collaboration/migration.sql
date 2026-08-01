CREATE TYPE "ReportSnapshotStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'DOCX', 'MARKDOWN', 'PRINT_HTML');
CREATE TYPE "ExportJobStatus" AS ENUM ('QUEUED', 'GENERATING', 'VALIDATING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ShareAccessMode" AS ENUM ('PUBLIC_READ_ONLY', 'AUTHENTICATED_READ_ONLY', 'PROJECT_MEMBERS_ONLY', 'AUTHENTICATED_COMMENT');
CREATE TYPE "CommentTargetType" AS ENUM ('REPORT_GENERAL', 'REPORT_SECTION', 'CITATION', 'EVIDENCE_SUMMARY');
CREATE TYPE "CommentThreadStatus" AS ENUM ('OPEN', 'RESOLVED', 'DELETED');
CREATE TYPE "CollaborationNotificationType" AS ENUM ('MENTIONED_IN_COMMENT', 'REPLIED_TO_COMMENT', 'THREAD_RESOLVED', 'THREAD_REOPENED', 'EXPORT_COMPLETED', 'EXPORT_FAILED', 'SHARE_LINK_CREATED', 'SHARE_LINK_REVOKED');

CREATE TABLE "ReportLineage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "projectId" UUID NOT NULL,
  "rootAnalysisId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportLineage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportLineageId" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "previousSnapshotId" UUID,
  "versionNumber" INTEGER NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "status" "ReportSnapshotStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "userQuestion" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "sanitizationWarnings" JSONB NOT NULL DEFAULT '[]',
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportSnapshotSource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "snapshotId" UUID NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "safeUrl" TEXT,
  "excerpt" TEXT,
  "pageNumber" INTEGER,
  "publicationDate" TIMESTAMP(3),
  "retrievalDate" TIMESTAMP(3),
  "warningCode" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ReportSnapshotSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExportJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "snapshotId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "options" JSONB NOT NULL DEFAULT '{}',
  "templateVersion" TEXT NOT NULL,
  "brandingSnapshotHash" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "progressStage" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExportArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "exportJobId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "ownerUserId" UUID NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShareLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "snapshotId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "accessMode" "ShareAccessMode" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" UUID,
  "allowDownload" BOOLEAN NOT NULL DEFAULT false,
  "allowPdfExport" BOOLEAN NOT NULL DEFAULT false,
  "allowDocxExport" BOOLEAN NOT NULL DEFAULT false,
  "allowMarkdownExport" BOOLEAN NOT NULL DEFAULT false,
  "allowComments" BOOLEAN NOT NULL DEFAULT false,
  "showSources" BOOLEAN NOT NULL DEFAULT true,
  "showTechnicalAppendix" BOOLEAN NOT NULL DEFAULT false,
  "showBranding" BOOLEAN NOT NULL DEFAULT true,
  "maximumViews" INTEGER,
  "currentViewCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommentThread" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "snapshotId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "targetType" "CommentTargetType" NOT NULL,
  "targetAnchor" TEXT NOT NULL,
  "createdById" UUID NOT NULL,
  "status" "CommentThreadStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedById" UUID,
  "resolvedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommentThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "bodyFormat" TEXT NOT NULL DEFAULT 'PLAIN_TEXT',
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedById" UUID,
  "deletionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mention" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "commentId" UUID NOT NULL,
  "mentionedUserId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CollaborationNotification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipientUserId" UUID NOT NULL,
  "actorUserId" UUID,
  "type" "CollaborationNotificationType" NOT NULL,
  "projectId" UUID,
  "snapshotId" UUID,
  "threadId" UUID,
  "commentId" UUID,
  "exportJobId" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "legalName" TEXT,
  "logoObjectKey" TEXT,
  "logoChecksum" TEXT,
  "accentColor" TEXT NOT NULL,
  "secondaryColor" TEXT,
  "footerText" TEXT,
  "disclaimer" TEXT,
  "websiteUrl" TEXT,
  "contactEmail" TEXT,
  "confidentialityLabel" TEXT,
  "showPlatformAttribution" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectBrandProfile" (
  "projectId" UUID NOT NULL,
  "brandProfileId" UUID NOT NULL,
  "selectedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectBrandProfile_pkey" PRIMARY KEY ("projectId")
);

CREATE UNIQUE INDEX "ReportLineage_projectId_rootAnalysisId_key" ON "ReportLineage"("projectId", "rootAnalysisId");
CREATE INDEX "ReportLineage_projectId_idx" ON "ReportLineage"("projectId");
CREATE INDEX "ReportLineage_rootAnalysisId_idx" ON "ReportLineage"("rootAnalysisId");
CREATE UNIQUE INDEX "ReportSnapshot_analysisId_key" ON "ReportSnapshot"("analysisId");
CREATE UNIQUE INDEX "ReportSnapshot_reportLineageId_versionNumber_key" ON "ReportSnapshot"("reportLineageId", "versionNumber");
CREATE INDEX "ReportSnapshot_projectId_idx" ON "ReportSnapshot"("projectId");
CREATE INDEX "ReportSnapshot_status_idx" ON "ReportSnapshot"("status");
CREATE INDEX "ReportSnapshot_contentHash_idx" ON "ReportSnapshot"("contentHash");
CREATE INDEX "ReportSnapshot_createdAt_idx" ON "ReportSnapshot"("createdAt");
CREATE UNIQUE INDEX "ReportSnapshotSource_snapshotId_evidenceId_key" ON "ReportSnapshotSource"("snapshotId", "evidenceId");
CREATE INDEX "ReportSnapshotSource_snapshotId_idx" ON "ReportSnapshotSource"("snapshotId");
CREATE UNIQUE INDEX "ExportJob_idempotencyKey_key" ON "ExportJob"("idempotencyKey");
CREATE INDEX "ExportJob_snapshotId_idx" ON "ExportJob"("snapshotId");
CREATE INDEX "ExportJob_requestedById_idx" ON "ExportJob"("requestedById");
CREATE INDEX "ExportJob_status_idx" ON "ExportJob"("status");
CREATE INDEX "ExportJob_createdAt_idx" ON "ExportJob"("createdAt");
CREATE UNIQUE INDEX "ExportArtifact_exportJobId_key" ON "ExportArtifact"("exportJobId");
CREATE INDEX "ExportArtifact_snapshotId_idx" ON "ExportArtifact"("snapshotId");
CREATE INDEX "ExportArtifact_ownerUserId_idx" ON "ExportArtifact"("ownerUserId");
CREATE INDEX "ExportArtifact_expiresAt_idx" ON "ExportArtifact"("expiresAt");
CREATE UNIQUE INDEX "ShareLink_tokenHash_key" ON "ShareLink"("tokenHash");
CREATE INDEX "ShareLink_snapshotId_idx" ON "ShareLink"("snapshotId");
CREATE INDEX "ShareLink_projectId_idx" ON "ShareLink"("projectId");
CREATE INDEX "ShareLink_createdById_idx" ON "ShareLink"("createdById");
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");
CREATE INDEX "ShareLink_revokedAt_idx" ON "ShareLink"("revokedAt");
CREATE INDEX "ShareLink_tokenPrefix_idx" ON "ShareLink"("tokenPrefix");
CREATE INDEX "CommentThread_snapshotId_idx" ON "CommentThread"("snapshotId");
CREATE INDEX "CommentThread_projectId_idx" ON "CommentThread"("projectId");
CREATE INDEX "CommentThread_targetType_targetAnchor_idx" ON "CommentThread"("targetType", "targetAnchor");
CREATE INDEX "CommentThread_status_idx" ON "CommentThread"("status");
CREATE INDEX "Comment_threadId_idx" ON "Comment"("threadId");
CREATE INDEX "Comment_authorUserId_idx" ON "Comment"("authorUserId");
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");
CREATE UNIQUE INDEX "Mention_commentId_mentionedUserId_key" ON "Mention"("commentId", "mentionedUserId");
CREATE INDEX "CollaborationNotification_recipientUserId_readAt_idx" ON "CollaborationNotification"("recipientUserId", "readAt");
CREATE INDEX "CollaborationNotification_recipientUserId_createdAt_idx" ON "CollaborationNotification"("recipientUserId", "createdAt");
CREATE INDEX "BrandProfile_ownerUserId_idx" ON "BrandProfile"("ownerUserId");
CREATE INDEX "BrandProfile_createdAt_idx" ON "BrandProfile"("createdAt");
CREATE INDEX "ProjectBrandProfile_brandProfileId_idx" ON "ProjectBrandProfile"("brandProfileId");

ALTER TABLE "ReportLineage" ADD CONSTRAINT "ReportLineage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportLineage" ADD CONSTRAINT "ReportLineage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_reportLineageId_fkey" FOREIGN KEY ("reportLineageId") REFERENCES "ReportLineage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportSnapshotSource" ADD CONSTRAINT "ReportSnapshotSource_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_exportJobId_fkey" FOREIGN KEY ("exportJobId") REFERENCES "ExportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentThread" ADD CONSTRAINT "CommentThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationNotification" ADD CONSTRAINT "CollaborationNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollaborationNotification" ADD CONSTRAINT "CollaborationNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BrandProfile" ADD CONSTRAINT "BrandProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBrandProfile" ADD CONSTRAINT "ProjectBrandProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectBrandProfile" ADD CONSTRAINT "ProjectBrandProfile_brandProfileId_fkey" FOREIGN KEY ("brandProfileId") REFERENCES "BrandProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectBrandProfile" ADD CONSTRAINT "ProjectBrandProfile_selectedById_fkey" FOREIGN KEY ("selectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
