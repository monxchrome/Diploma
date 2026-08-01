import { createHash, randomBytes } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBrandProfileRequestSchema,
  CreateCommentRequestSchema,
  CreateExportRequestSchema,
  CreateShareLinkRequestSchema,
  ExportOptionsSchema,
  ReportSnapshotContentSchema,
  type ExportFormat,
  type ReportSnapshotContent,
  UpdateBrandProfileRequestSchema,
  UpdateCommentRequestSchema,
} from "@dip/contracts";
import type { Queue } from "bullmq";

import { ErrorCodes } from "../../common/errors/error-codes";
import {
  AnalysisStatus,
  CommentThreadStatus,
  ExportFormat as PrismaExportFormat,
  ExportJobStatus,
  Prisma,
  ProjectMemberRole,
  ReportSnapshotStatus,
  ShareAccessMode,
} from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { MinioService } from "../../infrastructure/storage/minio.service";
import { AuditService } from "../audit/audit.service";
import { QuotaService } from "../billing/quota.service";
import { checksum, renderReport } from "./report-renderer";
import { ReportSnapshotSanitizer } from "./report-snapshot-sanitizer";

const completedAnalysisStatuses: AnalysisStatus[] = [
  AnalysisStatus.COMPLETED,
  AnalysisStatus.COMPLETED_WITH_LIMITATIONS,
];
const exportFormats = new Set<ExportFormat>(["PDF", "DOCX", "MARKDOWN", "PRINT_HTML"]);

@Injectable()
export class ReportsService {
  private readonly sanitizer = new ReportSnapshotSanitizer();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MinioService) private readonly storage: MinioService,
    @Inject(QuotaService) private readonly quota: QuotaService,
    @InjectQueue("report-export") private readonly exportQueue: Queue,
  ) {}

  async ensureSnapshotForCompletedRun(input: { requestId: string; runId: string }) {
    if (!this.config.getOrThrow<boolean>("reports.snapshot.enabled")) return null;
    const existing = await this.prisma.reportSnapshot.findUnique({
      where: { analysisId: input.runId },
    });
    if (existing) return existing;
    const run = await this.prisma.analysisRun.findUnique({
      where: { id: input.runId },
      include: { analysis: true, report: true },
    });
    if (!run || !completedAnalysisStatuses.includes(run.status) || !run.report) return null;
    const rawReport = asRecord(run.report.report);
    const sanitized = this.sanitizer.sanitize({
      analysisMode: run.analysis.mode,
      report: rawReport,
    });
    const contentHash = this.sanitizer.contentHash(sanitized.content);
    const lineage = await this.prisma.reportLineage.upsert({
      where: {
        projectId_rootAnalysisId: { projectId: run.projectId, rootAnalysisId: run.analysisId },
      },
      create: { createdById: run.userId, projectId: run.projectId, rootAnalysisId: run.analysisId },
      update: {},
    });
    const previous = await this.prisma.reportSnapshot.findFirst({
      where: { reportLineageId: lineage.id },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true },
    });
    try {
      const snapshot = await this.prisma.reportSnapshot.create({
        data: {
          analysisId: run.id,
          content: sanitized.content,
          contentHash,
          createdById: run.userId,
          previousSnapshotId: previous?.id,
          projectId: run.projectId,
          reportLineageId: lineage.id,
          sanitizationWarnings: sanitized.warnings,
          schemaVersion: this.config.getOrThrow<string>("reports.snapshot.schemaVersion"),
          title: run.analysis.title,
          userQuestion: run.analysis.decisionQuestion,
          versionNumber: (previous?.versionNumber ?? 0) + 1,
          sources: {
            create: sanitized.content.citations.map((citation) => ({
              evidenceId: citation.evidenceId,
              excerpt: citation.excerpt,
              metadata: {},
              safeUrl: citation.url ?? null,
              sourceType: citation.sourceType,
              title: citation.title ?? `${citation.evidenceId} evidence`,
            })),
          },
        },
      });
      await this.audit.record({
        action: "report.snapshot.created",
        actorUserId: run.userId,
        entityId: snapshot.id,
        entityType: "ReportSnapshot",
        metadata: { contentHash, versionNumber: snapshot.versionNumber },
        projectId: run.projectId,
        requestId: input.requestId,
      });
      return snapshot;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const snapshot = await this.prisma.reportSnapshot.findUnique({
          where: { analysisId: run.id },
        });
        if (snapshot) return snapshot;
      }
      throw error;
    }
  }

  async createSnapshotForAnalysis(input: {
    analysisId: string;
    requestId: string;
    userId: string;
  }) {
    const run = await this.prisma.analysisRun.findFirst({
      where: { analysisId: input.analysisId, status: { in: completedAnalysisStatuses } },
      orderBy: { completedAt: "desc" },
    });
    if (!run) throw this.notFound("Completed analysis run not found");
    await this.assertMember(run.projectId, input.userId);
    return this.ensureSnapshotForCompletedRun({ requestId: input.requestId, runId: run.id });
  }

  async listVersions(input: { lineageId: string; projectId: string; userId: string }) {
    await this.assertMember(input.projectId, input.userId);
    return this.prisma.reportSnapshot.findMany({
      where: { projectId: input.projectId, reportLineageId: input.lineageId },
      orderBy: { versionNumber: "desc" },
      select: {
        contentHash: true,
        createdAt: true,
        id: true,
        publishedAt: true,
        reportLineageId: true,
        status: true,
        title: true,
        versionNumber: true,
        _count: { select: { exportJobs: true, shareLinks: { where: { revokedAt: null } } } },
      },
    });
  }

  async getSnapshot(snapshotId: string, userId: string) {
    const snapshot = await this.requireSnapshot(snapshotId);
    await this.assertMember(snapshot.projectId, userId);
    return this.privateSnapshot(snapshot);
  }

  async publish(input: { requestId: string; snapshotId: string; userId: string }) {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.requireManager(snapshot.projectId, input.userId);
    if (snapshot.status === ReportSnapshotStatus.ARCHIVED)
      throw new BadRequestException("Archived snapshots cannot be published");
    const result = await this.prisma.reportSnapshot.update({
      where: { id: snapshot.id },
      data: {
        publishedAt: snapshot.publishedAt ?? new Date(),
        status: ReportSnapshotStatus.PUBLISHED,
      },
    });
    await this.audit.record({
      action: "report.snapshot.published",
      actorUserId: input.userId,
      entityId: snapshot.id,
      entityType: "ReportSnapshot",
      projectId: snapshot.projectId,
      requestId: input.requestId,
      metadata: { versionNumber: snapshot.versionNumber },
    });
    return this.privateSnapshot(result);
  }

  async archive(input: { requestId: string; snapshotId: string; userId: string }) {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.requireManager(snapshot.projectId, input.userId);
    const result = await this.prisma.reportSnapshot.update({
      where: { id: snapshot.id },
      data: {
        archivedAt: snapshot.archivedAt ?? new Date(),
        status: ReportSnapshotStatus.ARCHIVED,
      },
    });
    await this.audit.record({
      action: "report.snapshot.archived",
      actorUserId: input.userId,
      entityId: snapshot.id,
      entityType: "ReportSnapshot",
      projectId: snapshot.projectId,
      requestId: input.requestId,
      metadata: { versionNumber: snapshot.versionNumber },
    });
    return this.privateSnapshot(result);
  }

  async compare(input: {
    leftSnapshotId: string;
    requestId: string;
    rightSnapshotId: string;
    userId: string;
  }) {
    const [left, right] = await Promise.all([
      this.requireSnapshot(input.leftSnapshotId),
      this.requireSnapshot(input.rightSnapshotId),
    ]);
    if (left.reportLineageId !== right.reportLineageId)
      throw new BadRequestException("Snapshots must belong to the same report lineage");
    await this.assertMember(left.projectId, input.userId);
    await this.quota.assertFeature({
      feature: "versionComparisonAvailable",
      projectId: left.projectId,
      userId: await this.quota.billingOwnerForProject(left.projectId),
    });
    const before = content(left.content);
    const after = content(right.content);
    const diff = {
      citations: diffStrings(
        before.citations.map((citation) => citation.evidenceId),
        after.citations.map((citation) => citation.evidenceId),
      ),
      decisionReadinessChanged: before.decisionReadiness !== after.decisionReadiness,
      recommendationChanged: before.recommendation !== after.recommendation,
      risks: diffStrings(before.risks, after.risks),
      sections: after.sections.map((section) => ({
        anchor: section.anchor,
        changed:
          section.content !==
          before.sections.find((candidate) => candidate.anchor === section.anchor)?.content,
        title: section.title,
      })),
    };
    await this.audit.record({
      action: "report.version.compared",
      actorUserId: input.userId,
      entityId: right.id,
      entityType: "ReportSnapshot",
      projectId: left.projectId,
      requestId: input.requestId,
      metadata: { leftSnapshotId: left.id, rightSnapshotId: right.id },
    });
    return { left: this.privateSnapshot(left), right: this.privateSnapshot(right), diff };
  }

  async createExport(input: {
    body: unknown;
    requestId: string;
    snapshotId: string;
    userId: string;
  }) {
    const request = CreateExportRequestSchema.parse(input.body);
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.assertMember(snapshot.projectId, input.userId);
    this.requireExportEnabled(request.format);
    const billingOwner = await this.quota.billingOwnerForProject(snapshot.projectId);
    await this.quota.assertFeature({
      feature: exportFeature(request.format),
      projectId: snapshot.projectId,
      userId: billingOwner,
    });
    const completedExports = await this.prisma.exportJob.count({
      where: { requestedById: input.userId, status: ExportJobStatus.COMPLETED },
    });
    await this.quota.assertCurrentResourceLimit({
      currentUsage: completedExports,
      entitlement: "maximumExportArtifactsPerPeriod",
      projectId: snapshot.projectId,
      userId: billingOwner,
    });
    const key = hash(
      `${input.userId}:${snapshot.id}:${request.format}:${this.config.getOrThrow<string>("reports.export.templateVersion")}:${JSON.stringify(request.options)}:${request.idempotencyKey}`,
    );
    const existing = await this.prisma.exportJob.findUnique({
      where: { idempotencyKey: key },
      include: { artifact: true },
    });
    if (existing) return this.exportSummary(existing);
    const job = await this.prisma.exportJob.create({
      data: {
        expiresAt: addDays(
          new Date(),
          this.config.getOrThrow<number>("reports.export.retentionDays"),
        ),
        format: request.format,
        idempotencyKey: key,
        options: request.options,
        requestedById: input.userId,
        snapshotId: snapshot.id,
        templateVersion: this.config.getOrThrow<string>("reports.export.templateVersion"),
      },
    });
    await this.exportQueue.add(
      "render",
      { exportJobId: job.id, requestId: input.requestId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        jobId: job.id,
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
    await this.audit.record({
      action: "report.export.requested",
      actorUserId: input.userId,
      entityId: job.id,
      entityType: "ExportJob",
      projectId: snapshot.projectId,
      requestId: input.requestId,
      metadata: { format: request.format, snapshotId: snapshot.id },
    });
    return this.exportSummary(job);
  }

  async executeExport(input: { exportJobId: string; requestId: string }): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: input.exportJobId },
      include: { artifact: true, snapshot: true },
    });
    if (
      !job ||
      job.artifact ||
      job.status === ExportJobStatus.CANCELLED ||
      job.status === ExportJobStatus.COMPLETED
    )
      return;
    try {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          progressStage: "Creating document",
          startedAt: new Date(),
          status: ExportJobStatus.GENERATING,
        },
      });
      const options = ExportOptionsSchema.parse(job.options);
      const document = renderReport({
        content: content(job.snapshot.content),
        contentHash: job.snapshot.contentHash,
        format: job.format,
        generatedAt: new Date(),
        options,
        title: job.snapshot.title,
        versionNumber: job.snapshot.versionNumber,
      });
      if (document.body.length > this.config.getOrThrow<number>("reports.export.maxArtifactBytes"))
        throw new Error("Export artifact exceeds the configured size limit");
      const fileName = safeFilename(
        job.snapshot.title,
        job.snapshot.versionNumber,
        document.extension,
      );
      const objectKey = `exports/${job.snapshot.projectId}/${job.snapshot.id}/${job.id}/${fileName}`;
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: { progressStage: "Uploading", status: ExportJobStatus.UPLOADING },
      });
      await this.storage.putObject({
        body: document.body,
        bucket: this.config.getOrThrow<string>("reports.export.bucket"),
        contentType: document.contentType,
        key: objectKey,
      });
      const artifact = await this.prisma.exportArtifact.create({
        data: {
          byteSize: document.body.length,
          checksum: checksum(document.body),
          contentType: document.contentType,
          exportJobId: job.id,
          expiresAt: job.expiresAt,
          fileName,
          format: job.format,
          objectKey,
          ownerUserId: job.requestedById,
          snapshotId: job.snapshotId,
        },
      });
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          completedAt: new Date(),
          progressStage: "Ready",
          status: ExportJobStatus.COMPLETED,
        },
      });
      await this.quota.recordUsage({
        eventType: `report.${job.format.toLowerCase()}.exported`,
        idempotencyKey: `usage:report-export:${job.id}`,
        metric: exportUsageMetric(job.format),
        projectId: job.snapshot.projectId,
        quantity: 1,
        resourceId: artifact.id,
        resourceType: "ExportArtifact",
        unit: "export",
        userId: job.requestedById,
      });
      await this.audit.record({
        action: "report.export.completed",
        actorUserId: job.requestedById,
        entityId: job.id,
        entityType: "ExportJob",
        projectId: job.snapshot.projectId,
        requestId: input.requestId,
        metadata: {
          artifactByteSize: artifact.byteSize,
          format: job.format,
          snapshotId: job.snapshotId,
        },
      });
    } catch (error) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          completedAt: new Date(),
          failureCode: "EXPORT_GENERATION_FAILED",
          failureMessage: "The export could not be generated.",
          status: ExportJobStatus.FAILED,
        },
      });
      await this.audit.record({
        action: "report.export.failed",
        actorUserId: job.requestedById,
        entityId: job.id,
        entityType: "ExportJob",
        projectId: job.snapshot.projectId,
        requestId: input.requestId,
        metadata: { format: job.format, safeFailureCode: "EXPORT_GENERATION_FAILED" },
      });
      throw error;
    }
  }

  async listExports(input: { snapshotId?: string; userId: string }) {
    return this.prisma.exportJob
      .findMany({
        where: {
          requestedById: input.userId,
          ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}),
        },
        include: { artifact: true },
        orderBy: { createdAt: "desc" },
      })
      .then((jobs) => jobs.map((job) => this.exportSummary(job)));
  }

  async getExport(input: { exportJobId: string; userId: string }) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: input.exportJobId },
      include: { artifact: true, snapshot: true },
    });
    if (!job) throw this.notFound("Export not found");
    await this.assertMember(job.snapshot.projectId, input.userId);
    return this.exportSummary(job);
  }

  async downloadExport(input: { exportJobId: string; requestId: string; userId: string }) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: input.exportJobId },
      include: { artifact: true, snapshot: true },
    });
    if (
      !job?.artifact ||
      job.status !== ExportJobStatus.COMPLETED ||
      job.artifact.deletedAt ||
      (job.artifact.expiresAt && job.artifact.expiresAt <= new Date())
    )
      throw this.notFound("Export artifact not found");
    await this.assertMember(job.snapshot.projectId, input.userId);
    const download = this.storage.createDownloadUrl(
      job.artifact.objectKey,
      this.config.getOrThrow<string>("reports.export.bucket"),
      this.config.getOrThrow<number>("reports.export.signedUrlTtlSeconds"),
    );
    await this.audit.record({
      action: "report.export.downloaded",
      actorUserId: input.userId,
      entityId: job.id,
      entityType: "ExportJob",
      projectId: job.snapshot.projectId,
      requestId: input.requestId,
      metadata: { format: job.format },
    });
    return {
      expiresAt: download.expiresAt.toISOString(),
      fileName: job.artifact.fileName,
      url: download.url,
    };
  }

  async cancelExport(input: { exportJobId: string; requestId: string; userId: string }) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: input.exportJobId },
      include: { snapshot: true },
    });
    if (!job) throw this.notFound("Export not found");
    await this.assertMember(job.snapshot.projectId, input.userId);
    if (job.status !== ExportJobStatus.QUEUED && job.status !== ExportJobStatus.GENERATING)
      throw new BadRequestException("Export cannot be cancelled");
    await this.exportQueue.getJob(job.id).then((queued) => queued?.remove());
    return this.prisma.exportJob.update({
      where: { id: job.id },
      data: { cancelledAt: new Date(), status: ExportJobStatus.CANCELLED },
    });
  }

  async createShareLink(input: {
    body: unknown;
    requestId: string;
    snapshotId: string;
    userId: string;
  }) {
    const request = CreateShareLinkRequestSchema.parse(input.body);
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.requireManager(snapshot.projectId, input.userId);
    const billingOwner = await this.quota.billingOwnerForProject(snapshot.projectId);
    await this.quota.assertFeature({
      feature:
        request.accessMode === "PUBLIC_READ_ONLY"
          ? "publicSharingAvailable"
          : "authenticatedSharingAvailable",
      projectId: snapshot.projectId,
      userId: billingOwner,
    });
    const activeLinks = await this.prisma.shareLink.count({
      where: {
        projectId: snapshot.projectId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    await this.quota.assertCurrentResourceLimit({
      currentUsage: activeLinks,
      entitlement: "maximumActiveShareLinks",
      projectId: snapshot.projectId,
      userId: billingOwner,
    });
    if (snapshot.status !== ReportSnapshotStatus.PUBLISHED)
      throw new BadRequestException("Only published snapshots can be shared");
    if (
      request.accessMode === "PUBLIC_READ_ONLY" &&
      !this.config.getOrThrow<boolean>("reports.share.publicEnabled")
    )
      throw new ForbiddenException("Public sharing is disabled");
    if (request.allowComments && request.accessMode !== "AUTHENTICATED_COMMENT")
      throw new BadRequestException("Comments require authenticated comment access");
    const expiresAt = this.validateExpiry(request.expiresAt);
    const token = randomBytes(this.config.getOrThrow<number>("reports.share.tokenBytes")).toString(
      "base64url",
    );
    const link = await this.prisma.shareLink.create({
      data: {
        accessMode: request.accessMode,
        allowComments: request.allowComments,
        allowDocxExport: request.allowedExportFormats.includes("DOCX"),
        allowDownload: request.allowDownload,
        allowMarkdownExport: request.allowedExportFormats.includes("MARKDOWN"),
        allowPdfExport: request.allowedExportFormats.includes("PDF"),
        createdById: input.userId,
        expiresAt,
        maximumViews: request.maximumViews ?? null,
        projectId: snapshot.projectId,
        showBranding: request.showBranding,
        showSources: request.showSources,
        showTechnicalAppendix: request.showTechnicalAppendix,
        snapshotId: snapshot.id,
        tokenHash: hash(token),
        tokenPrefix: token.slice(0, 8),
      },
    });
    await this.audit.record({
      action: "report.share.created",
      actorUserId: input.userId,
      entityId: link.id,
      entityType: "ShareLink",
      projectId: snapshot.projectId,
      requestId: input.requestId,
      metadata: { accessMode: link.accessMode, tokenPrefix: link.tokenPrefix },
    });
    return {
      ...this.shareSummary(link),
      url: `${this.config.getOrThrow<string>("app.baseUrl")}/shared/${token}`,
    };
  }

  async listShareLinks(input: { snapshotId: string; userId: string }) {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.requireManager(snapshot.projectId, input.userId);
    return this.prisma.shareLink
      .findMany({ where: { snapshotId: snapshot.id }, orderBy: { createdAt: "desc" } })
      .then((links) => links.map((link) => this.shareSummary(link)));
  }

  async revokeShareLink(input: { requestId: string; shareLinkId: string; userId: string }) {
    const link = await this.prisma.shareLink.findUnique({ where: { id: input.shareLinkId } });
    if (!link) throw this.notFound("Share link not found");
    await this.requireManager(link.projectId, input.userId);
    const revoked = await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: link.revokedAt ?? new Date(), revokedById: input.userId },
    });
    await this.audit.record({
      action: "report.share.revoked",
      actorUserId: input.userId,
      entityId: link.id,
      entityType: "ShareLink",
      projectId: link.projectId,
      requestId: input.requestId,
      metadata: { tokenPrefix: link.tokenPrefix },
    });
    return this.shareSummary(revoked);
  }

  async rotateShareLink(input: { requestId: string; shareLinkId: string; userId: string }) {
    const link = await this.prisma.shareLink.findUnique({ where: { id: input.shareLinkId } });
    if (!link) throw this.notFound("Share link not found");
    await this.requireManager(link.projectId, input.userId);
    const token = randomBytes(this.config.getOrThrow<number>("reports.share.tokenBytes")).toString(
      "base64url",
    );
    const updated = await this.prisma.shareLink.update({
      where: { id: link.id },
      data: { tokenHash: hash(token), tokenPrefix: token.slice(0, 8) },
    });
    await this.audit.record({
      action: "report.share.rotated",
      actorUserId: input.userId,
      entityId: link.id,
      entityType: "ShareLink",
      projectId: link.projectId,
      requestId: input.requestId,
      metadata: { tokenPrefix: updated.tokenPrefix },
    });
    return {
      ...this.shareSummary(updated),
      url: `${this.config.getOrThrow<string>("app.baseUrl")}/shared/${token}`,
    };
  }

  async publicSharedReport(token: string, userId?: string) {
    const link = await this.validShareLink(token);
    await this.assertShareAccess(link, userId);
    if (this.config.getOrThrow<boolean>("reports.share.viewCountEnabled"))
      await this.consumeView(link);
    const snapshot = await this.prisma.reportSnapshot.findUnique({
      where: { id: link.snapshotId },
    });
    if (!snapshot || snapshot.status !== ReportSnapshotStatus.PUBLISHED)
      throw this.notFound("Shared report not found");
    const safe = content(snapshot.content);
    const contentForShare = link.showSources ? safe : { ...safe, citations: [] };
    return {
      content: contentForShare,
      publishedAt: snapshot.publishedAt?.toISOString(),
      share: {
        allowComments: link.allowComments,
        allowDownload: link.allowDownload,
        showSources: link.showSources,
      },
      title: snapshot.title,
      versionNumber: snapshot.versionNumber,
    };
  }

  async createComment(input: {
    body: unknown;
    requestId: string;
    snapshotId: string;
    userId: string;
  }) {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.assertMember(snapshot.projectId, input.userId);
    await this.quota.assertFeature({
      feature: "collaborationCommentsAvailable",
      projectId: snapshot.projectId,
      userId: await this.quota.billingOwnerForProject(snapshot.projectId),
    });
    return this.createCommentForSnapshot({ ...input, snapshot, external: false });
  }

  async createSharedComment(input: {
    body: unknown;
    requestId: string;
    token: string;
    userId: string;
  }) {
    const link = await this.validShareLink(input.token);
    if (link.accessMode !== ShareAccessMode.AUTHENTICATED_COMMENT || !link.allowComments)
      throw new ForbiddenException("Comments are not allowed for this share link");
    const snapshot = await this.requireSnapshot(link.snapshotId);
    await this.quota.assertFeature({
      feature: "externalCommentingAvailable",
      projectId: snapshot.projectId,
      userId: await this.quota.billingOwnerForProject(snapshot.projectId),
    });
    return this.createCommentForSnapshot({ ...input, snapshot, external: true });
  }

  async listComments(input: { snapshotId: string; userId: string }) {
    const snapshot = await this.requireSnapshot(input.snapshotId);
    await this.assertMember(snapshot.projectId, input.userId);
    return this.prisma.commentThread.findMany({
      where: { snapshotId: snapshot.id },
      include: {
        comments: {
          include: { author: { select: { displayName: true, id: true } }, mentions: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async updateComment(input: {
    body: unknown;
    commentId: string;
    requestId: string;
    userId: string;
  }) {
    const request = UpdateCommentRequestSchema.parse(input.body);
    const comment = await this.prisma.comment.findUnique({
      where: { id: input.commentId },
      include: { thread: true },
    });
    if (!comment) throw this.notFound("Comment not found");
    await this.assertMember(comment.thread.projectId, input.userId);
    if (comment.authorUserId !== input.userId)
      throw new ForbiddenException("Only the author can edit this comment");
    return this.prisma.comment.update({
      where: { id: comment.id },
      data: { body: sanitizeComment(request.body), editedAt: new Date() },
    });
  }

  async deleteComment(input: { commentId: string; requestId: string; userId: string }) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: input.commentId },
      include: { thread: true },
    });
    if (!comment) throw this.notFound("Comment not found");
    const membership = await this.assertMember(comment.thread.projectId, input.userId);
    if (comment.authorUserId !== input.userId && membership.role !== ProjectMemberRole.OWNER)
      throw new ForbiddenException("Only the author or owner can delete this comment");
    return this.prisma.comment.update({
      where: { id: comment.id },
      data: {
        deletedAt: new Date(),
        deletedById: input.userId,
        deletionReason:
          comment.authorUserId === input.userId ? "AUTHOR_DELETED" : "OWNER_MODERATION",
      },
    });
  }

  async resolveThread(input: {
    requestId: string;
    threadId: string;
    userId: string;
    reopen?: boolean;
  }) {
    const thread = await this.prisma.commentThread.findUnique({ where: { id: input.threadId } });
    if (!thread) throw this.notFound("Comment thread not found");
    await this.requireManager(thread.projectId, input.userId);
    const resolved = !input.reopen;
    const result = await this.prisma.commentThread.update({
      where: { id: thread.id },
      data: resolved
        ? {
            resolvedAt: new Date(),
            resolvedById: input.userId,
            status: CommentThreadStatus.RESOLVED,
          }
        : { resolvedAt: null, resolvedById: null, status: CommentThreadStatus.OPEN },
    });
    await this.audit.record({
      action: resolved ? "report.thread.resolved" : "report.thread.reopened",
      actorUserId: input.userId,
      entityId: thread.id,
      entityType: "CommentThread",
      projectId: thread.projectId,
      requestId: input.requestId,
    });
    return result;
  }

  async listNotifications(userId: string) {
    return this.prisma.collaborationNotification.findMany({
      where: { recipientUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async markNotificationRead(input: { notificationId: string; userId: string }) {
    const notification = await this.prisma.collaborationNotification.findFirst({
      where: { id: input.notificationId, recipientUserId: input.userId },
    });
    if (!notification) throw this.notFound("Notification not found");
    return this.prisma.collaborationNotification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }
  async markAllNotificationsRead(userId: string) {
    await this.prisma.collaborationNotification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async listBrandProfiles(userId: string) {
    return this.prisma.brandProfile.findMany({
      where: { ownerUserId: userId },
      orderBy: { createdAt: "desc" },
    });
  }
  async createBrandProfile(input: { body: unknown; requestId: string; userId: string }) {
    const body = CreateBrandProfileRequestSchema.parse(input.body);
    await this.quota.assertFeature({ feature: "customBrandingAvailable", userId: input.userId });
    const count = await this.prisma.brandProfile.count({ where: { ownerUserId: input.userId } });
    await this.quota.assertCurrentResourceLimit({
      currentUsage: count,
      entitlement: "maximumBrandProfiles",
      userId: input.userId,
    });
    const profile = await this.prisma.brandProfile.create({
      data: { ...body, ownerUserId: input.userId },
    });
    await this.audit.record({
      action: "brand.profile.created",
      actorUserId: input.userId,
      entityId: profile.id,
      entityType: "BrandProfile",
      requestId: input.requestId,
    });
    return profile;
  }
  async updateBrandProfile(input: {
    body: unknown;
    brandProfileId: string;
    requestId: string;
    userId: string;
  }) {
    const body = UpdateBrandProfileRequestSchema.parse(input.body);
    const profile = await this.prisma.brandProfile.findFirst({
      where: { id: input.brandProfileId, ownerUserId: input.userId },
    });
    if (!profile) throw this.notFound("Brand profile not found");
    const updated = await this.prisma.brandProfile.update({
      where: { id: profile.id },
      data: body,
    });
    await this.audit.record({
      action: "brand.profile.updated",
      actorUserId: input.userId,
      entityId: profile.id,
      entityType: "BrandProfile",
      requestId: input.requestId,
    });
    return updated;
  }
  async deleteBrandProfile(input: { brandProfileId: string; requestId: string; userId: string }) {
    const profile = await this.prisma.brandProfile.findFirst({
      where: { id: input.brandProfileId, ownerUserId: input.userId },
    });
    if (!profile) throw this.notFound("Brand profile not found");
    await this.prisma.brandProfile.delete({ where: { id: profile.id } });
    await this.audit.record({
      action: "brand.profile.deleted",
      actorUserId: input.userId,
      entityId: profile.id,
      entityType: "BrandProfile",
      requestId: input.requestId,
    });
    return { ok: true };
  }
  async selectBrandProfile(input: {
    brandProfileId: string;
    projectId: string;
    requestId: string;
    userId: string;
  }) {
    await this.requireManager(input.projectId, input.userId);
    const profile = await this.prisma.brandProfile.findFirst({
      where: { id: input.brandProfileId, ownerUserId: input.userId },
    });
    if (!profile) throw this.notFound("Brand profile not found");
    return this.prisma.projectBrandProfile.upsert({
      where: { projectId: input.projectId },
      create: {
        brandProfileId: profile.id,
        projectId: input.projectId,
        selectedById: input.userId,
      },
      update: { brandProfileId: profile.id, selectedById: input.userId },
    });
  }

  private async createCommentForSnapshot(input: {
    body: unknown;
    external: boolean;
    requestId: string;
    snapshot: Awaited<ReturnType<ReportsService["requireSnapshot"]>>;
    userId: string;
  }) {
    const request = CreateCommentRequestSchema.parse(input.body);
    if (!this.config.getOrThrow<boolean>("reports.comments.enabled"))
      throw new ForbiddenException("Comments are disabled");
    this.validateAnchor(input.snapshot, request.targetType, request.targetAnchor);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId: input.snapshot.projectId, userId: { in: request.mentions } },
      select: { userId: true },
    });
    if (members.length !== request.mentions.length)
      throw new BadRequestException("Mentioned users must be project members");
    const body = sanitizeComment(request.body);
    const result = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.commentThread.create({
        data: {
          createdById: input.userId,
          projectId: input.snapshot.projectId,
          snapshotId: input.snapshot.id,
          targetAnchor: request.targetAnchor,
          targetType: request.targetType,
        },
      });
      const comment = await tx.comment.create({
        data: {
          authorUserId: input.userId,
          body,
          threadId: thread.id,
          mentions: {
            create: request.mentions.map((mentionedUserId) => ({
              createdById: input.userId,
              mentionedUserId,
            })),
          },
        },
      });
      if (request.mentions.length)
        await tx.collaborationNotification.createMany({
          data: request.mentions
            .filter((userId) => userId !== input.userId)
            .map((recipientUserId) => ({
              actorUserId: input.userId,
              commentId: comment.id,
              metadata: { preview: "You were mentioned in a report comment." },
              projectId: input.snapshot.projectId,
              recipientUserId,
              snapshotId: input.snapshot.id,
              threadId: thread.id,
              type: "MENTIONED_IN_COMMENT",
            })),
        });
      return { comment, thread };
    });
    await this.audit.record({
      action: "report.comment.created",
      actorUserId: input.userId,
      entityId: result.comment.id,
      entityType: "Comment",
      projectId: input.snapshot.projectId,
      requestId: input.requestId,
      metadata: { snapshotId: input.snapshot.id, targetAnchor: request.targetAnchor },
    });
    return result;
  }

  private validateAnchor(
    snapshot: Awaited<ReturnType<ReportsService["requireSnapshot"]>>,
    targetType: "REPORT_GENERAL" | "REPORT_SECTION" | "CITATION" | "EVIDENCE_SUMMARY",
    anchor: string,
  ) {
    if (targetType === "REPORT_GENERAL" && anchor === "report:general") return;
    const snapshotContent = content(snapshot.content);
    const valid =
      targetType === "REPORT_SECTION"
        ? snapshotContent.sections.some((section) => section.anchor === anchor)
        : targetType === "CITATION"
          ? snapshotContent.citations.some(
              (citation) => `citation:${citation.evidenceId}` === anchor,
            )
          : targetType === "EVIDENCE_SUMMARY" && anchor === "evidence:summary";
    if (!valid) throw new BadRequestException("Comment anchor does not exist in this snapshot");
  }
  private requireExportEnabled(format: ExportFormat) {
    if (!exportFormats.has(format) || !this.config.getOrThrow<boolean>("reports.export.enabled"))
      throw new ForbiddenException("Report export is disabled");
    if (format === "PDF" && !this.config.getOrThrow<boolean>("reports.export.pdfEnabled"))
      throw new ForbiddenException("PDF export is disabled");
    if (format === "DOCX" && !this.config.getOrThrow<boolean>("reports.export.docxEnabled"))
      throw new ForbiddenException("DOCX export is disabled");
    if (format === "MARKDOWN" && !this.config.getOrThrow<boolean>("reports.export.markdownEnabled"))
      throw new ForbiddenException("Markdown export is disabled");
  }
  private validateExpiry(value?: string | null): Date | null {
    if (!value) {
      if (!this.config.getOrThrow<boolean>("reports.share.noExpiryEnabled"))
        return addDays(
          new Date(),
          this.config.getOrThrow<number>("reports.share.defaultExpiryDays"),
        );
      return null;
    }
    const expiry = new Date(value);
    const max = addDays(new Date(), this.config.getOrThrow<number>("reports.share.maxExpiryDays"));
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date() || expiry > max)
      throw new BadRequestException("Share expiry is outside the allowed range");
    return expiry;
  }
  private async validShareLink(token: string) {
    if (!/^[A-Za-z0-9_-]{32,200}$/.test(token)) throw this.notFound("Shared report not found");
    const link = await this.prisma.shareLink.findUnique({ where: { tokenHash: hash(token) } });
    if (!link || link.revokedAt || (link.expiresAt && link.expiresAt <= new Date()))
      throw this.notFound("Shared report not found");
    return link;
  }
  private async assertShareAccess(
    link: { accessMode: ShareAccessMode; projectId: string },
    userId?: string,
  ) {
    if (link.accessMode === ShareAccessMode.PUBLIC_READ_ONLY) return;
    if (!userId) throw new ForbiddenException("Authentication is required");
    if (link.accessMode === ShareAccessMode.PROJECT_MEMBERS_ONLY)
      await this.assertMember(link.projectId, userId);
  }
  private async consumeView(link: {
    currentViewCount: number;
    id: string;
    maximumViews: number | null;
  }) {
    if (link.maximumViews === null) {
      await this.prisma.shareLink.update({
        where: { id: link.id },
        data: { currentViewCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
      return;
    }
    const result = await this.prisma.shareLink.updateMany({
      where: { id: link.id, currentViewCount: { lt: link.maximumViews }, revokedAt: null },
      data: { currentViewCount: { increment: 1 }, lastAccessedAt: new Date() },
    });
    if (result.count !== 1) throw this.notFound("Shared report not found");
  }
  private async requireSnapshot(snapshotId: string) {
    const snapshot = await this.prisma.reportSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) throw this.notFound("Report snapshot not found");
    return snapshot;
  }
  private async assertMember(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member) throw this.notFound("Project not found");
    return member;
  }
  private async requireManager(projectId: string, userId: string) {
    const member = await this.assertMember(projectId, userId);
    if (member.role !== ProjectMemberRole.OWNER && member.role !== ProjectMemberRole.EDITOR)
      throw new ForbiddenException("Project editor permission is required");
    return member;
  }
  private privateSnapshot(snapshot: Awaited<ReturnType<ReportsService["requireSnapshot"]>>) {
    return {
      content: content(snapshot.content),
      contentHash: snapshot.contentHash,
      createdAt: snapshot.createdAt.toISOString(),
      id: snapshot.id,
      projectId: snapshot.projectId,
      publishedAt: snapshot.publishedAt?.toISOString() ?? null,
      reportLineageId: snapshot.reportLineageId,
      sanitizationWarnings: snapshot.sanitizationWarnings,
      status: snapshot.status,
      title: snapshot.title,
      userQuestion: snapshot.userQuestion,
      versionNumber: snapshot.versionNumber,
    };
  }
  private exportSummary(job: {
    artifact?: { byteSize: number; contentType: string; fileName: string } | null;
    completedAt?: Date | null;
    failureCode?: string | null;
    format: PrismaExportFormat;
    id: string;
    progressStage?: string | null;
    status: ExportJobStatus;
  }) {
    return {
      artifact: job.artifact
        ? {
            byteSize: job.artifact.byteSize,
            contentType: job.artifact.contentType,
            fileName: job.artifact.fileName,
          }
        : null,
      completedAt: job.completedAt?.toISOString() ?? null,
      failureCode: job.failureCode ?? null,
      format: job.format,
      id: job.id,
      progress: friendlyStage(job.progressStage, job.status),
      status: job.status,
    };
  }
  private shareSummary(link: {
    accessMode: ShareAccessMode;
    createdAt: Date;
    currentViewCount: number;
    expiresAt: Date | null;
    id: string;
    revokedAt: Date | null;
    tokenPrefix: string;
  }) {
    return {
      accessMode: link.accessMode,
      createdAt: link.createdAt.toISOString(),
      currentViewCount: link.currentViewCount,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      id: link.id,
      revokedAt: link.revokedAt?.toISOString() ?? null,
      tokenPrefix: link.tokenPrefix,
    };
  }
  private notFound(message: string) {
    return new NotFoundException({ code: ErrorCodes.NotFound, message });
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function content(value: Prisma.JsonValue): ReportSnapshotContent {
  return ReportSnapshotContentSchema.parse(value);
}
function diffStrings(left: string[], right: string[]) {
  return {
    added: right.filter((value) => !left.includes(value)),
    removed: left.filter((value) => !right.includes(value)),
  };
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}
function safeFilename(title: string, version: number, extension: string): string {
  const slug =
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 70) || "report";
  return `decision-report-${slug}-v${version}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
function friendlyStage(stage: string | null | undefined, status: ExportJobStatus): string {
  if (status === ExportJobStatus.COMPLETED) return "Ready";
  if (status === ExportJobStatus.FAILED) return "Failed";
  if (stage === "Uploading") return "Finalizing";
  if (stage === "Creating document") return "Creating document";
  return "Preparing export";
}
function sanitizeComment(body: string): string {
  const cleaned = body
    .replace(/<[^>]*>/g, "")
    .replace(/\b(?:javascript|data|vbscript):[^\s)]+/gi, "")
    .replaceAll(String.fromCharCode(0), "")
    .trim();
  if (!cleaned) throw new BadRequestException("Comment body is empty after sanitization");
  return cleaned;
}
function exportFeature(
  format: ExportFormat,
): "reportDocxExportAvailable" | "reportMarkdownExportAvailable" | "reportPdfExportAvailable" {
  if (format === "DOCX") return "reportDocxExportAvailable";
  if (format === "PDF") return "reportPdfExportAvailable";
  return "reportMarkdownExportAvailable";
}
function exportUsageMetric(
  format: PrismaExportFormat,
): "reportDocxExports" | "reportMarkdownExports" | "reportPdfExports" {
  if (format === PrismaExportFormat.DOCX) return "reportDocxExports";
  if (format === PrismaExportFormat.PDF) return "reportPdfExports";
  return "reportMarkdownExports";
}
