import { randomUUID } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";

import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { MinioService } from "../../infrastructure/storage/minio.service";
import { AiServiceClient } from "../../infrastructure/http/ai-service.client";
import { AuditService } from "../audit/audit.service";
import { canArchiveProject, canUpdateProject } from "../projects/project-permissions";
import {
  DocumentStatus,
  IngestionJobStatus,
  KnowledgeBaseStatus,
  ProjectMemberRole,
} from "../../generated/prisma/client";
import { documentDto, ingestionJobDto, knowledgeBaseDto } from "./knowledge-base.mapper";

const allowedMimeByExtension: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  markdown: ["text/markdown", "text/plain"],
  html: ["text/html"],
  htm: ["text/html"],
};

@Injectable()
export class KnowledgeBasesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MinioService) private readonly storage: MinioService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue("ingestion") private readonly queue: Queue,
  ) {}

  async list(projectId: string, status: "active" | "archived" | "all" = "active") {
    const where = {
      projectId,
      ...(status === "all"
        ? {}
        : {
            status: status === "active" ? KnowledgeBaseStatus.ACTIVE : KnowledgeBaseStatus.ARCHIVED,
          }),
    };
    return (
      await this.prisma.knowledgeBase.findMany({ where, orderBy: { createdAt: "desc" } })
    ).map(knowledgeBaseDto);
  }
  async get(projectId: string, id: string) {
    return knowledgeBaseDto(await this.requireKnowledgeBase(projectId, id));
  }
  async create(input: {
    projectId: string;
    userId: string;
    requestId: string;
    name: string;
    description?: string;
  }) {
    const knowledgeBase = await this.prisma.knowledgeBase.create({
      data: {
        projectId: input.projectId,
        createdById: input.userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
      },
    });
    await this.audit.record({
      action: "knowledge_base.created",
      actorUserId: input.userId,
      entityId: knowledgeBase.id,
      entityType: "KnowledgeBase",
      projectId: input.projectId,
      requestId: input.requestId,
    });
    return knowledgeBaseDto(knowledgeBase);
  }
  async update(input: {
    projectId: string;
    id: string;
    role: ProjectMemberRole;
    name?: string;
    description?: string | null;
  }) {
    this.requireEditor(input.role);
    await this.requireKnowledgeBase(input.projectId, input.id);
    return knowledgeBaseDto(
      await this.prisma.knowledgeBase.update({
        where: { id: input.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.description === undefined
            ? {}
            : { description: input.description?.trim() || null }),
        },
      }),
    );
  }
  async archive(input: {
    projectId: string;
    id: string;
    role: ProjectMemberRole;
    archived: boolean;
    requestId: string;
  }) {
    if (!canArchiveProject(input.role))
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Knowledge base not found",
      });
    await this.requireKnowledgeBase(input.projectId, input.id);
    const currentVersions = await this.prisma.documentVersion.findMany({
      where: {
        document: { knowledgeBaseId: input.id, currentVersionId: { not: null }, archivedAt: null },
        status: DocumentStatus.COMPLETED,
      },
      select: { id: true },
    });
    await this.ai.archiveKnowledgeBase(
      input.id,
      currentVersions.map((version) => version.id),
      input.archived,
      input.requestId,
    );
    const updated = await this.prisma.knowledgeBase.update({
      where: { id: input.id },
      data: {
        status: input.archived ? KnowledgeBaseStatus.ARCHIVED : KnowledgeBaseStatus.ACTIVE,
        archivedAt: input.archived ? new Date() : null,
      },
    });
    return knowledgeBaseDto(updated);
  }
  async createUploadIntent(input: {
    projectId: string;
    knowledgeBaseId: string;
    userId: string;
    role: ProjectMemberRole;
    requestId: string;
    filename: string;
    declaredMimeType: string;
    sizeBytes: number;
  }) {
    this.requireEditor(input.role);
    await this.requireKnowledgeBase(input.projectId, input.knowledgeBaseId);
    const validation = this.validateUpload(input.filename, input.declaredMimeType, input.sizeBytes);
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = `projects/${input.projectId}/knowledge-bases/${input.knowledgeBaseId}/documents/${documentId}/versions/1/${randomUUID()}-${validation.safeFilename}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: documentId,
          knowledgeBaseId: input.knowledgeBaseId,
          originalFilename: validation.safeFilename,
          displayName: validation.safeFilename,
          declaredMimeType: input.declaredMimeType,
          sizeBytes: BigInt(input.sizeBytes),
          createdById: input.userId,
        },
      });
      await tx.documentVersion.create({
        data: { id: versionId, documentId, version: 1, storageKey },
      });
      return document;
    });
    const upload = this.storage.createUploadUrl(storageKey, input.declaredMimeType);
    await this.audit.record({
      action: "document.upload_intent_created",
      actorUserId: input.userId,
      entityId: documentId,
      entityType: "Document",
      projectId: input.projectId,
      requestId: input.requestId,
      metadata: { sizeBytes: input.sizeBytes },
    });
    return {
      document: documentDto(result),
      documentVersionId: versionId,
      uploadUrl: upload.uploadUrl,
      uploadMethod: "PUT" as const,
      requiredHeaders: upload.requiredHeaders,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }
  async completeUpload(input: {
    projectId: string;
    knowledgeBaseId: string;
    documentId: string;
    role: ProjectMemberRole;
    userId: string;
    requestId: string;
  }) {
    this.requireEditor(input.role);
    const document = await this.prisma.document.findFirst({
      where: {
        id: input.documentId,
        knowledgeBaseId: input.knowledgeBaseId,
        knowledgeBase: { projectId: input.projectId },
      },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!document || !document.versions[0])
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Document not found" });
    const version = document.versions[0];
    const existing = await this.prisma.ingestionJob.findFirst({
      where: {
        documentVersionId: version.id,
        status: {
          in: [IngestionJobStatus.QUEUED, IngestionJobStatus.RUNNING, IngestionJobStatus.COMPLETED],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { document: documentDto(document), job: ingestionJobDto(existing) };
    if (document.status !== DocumentStatus.PENDING_UPLOAD)
      throw new BadRequestException({
        code: ErrorCodes.InvalidDocument,
        message: "Document cannot be completed from its current state",
      });
    const object = await this.storage.objectExists(version.storageKey);
    if (object.contentLength < 0)
      throw new BadRequestException({
        code: ErrorCodes.UploadNotFound,
        message: "Uploaded object was not found",
      });
    if (object.contentLength !== Number(document.sizeBytes))
      throw new BadRequestException({
        code: ErrorCodes.InvalidDocument,
        message: "Uploaded object size does not match the upload intent",
      });
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.QUEUED },
      });
      await tx.documentVersion.update({
        where: { id: version.id },
        data: { status: DocumentStatus.QUEUED },
      });
      return tx.ingestionJob.create({ data: { documentVersionId: version.id, bullJobId: null } });
    });
    await this.queue.add(
      "ingest",
      { ingestionJobId: job.id, requestId: input.requestId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        jobId: job.id,
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    const queued = await this.prisma.ingestionJob.update({
      where: { id: job.id },
      data: { bullJobId: job.id },
    });
    await this.audit.record({
      action: "document.upload_completed",
      actorUserId: input.userId,
      entityId: document.id,
      entityType: "Document",
      projectId: input.projectId,
      requestId: input.requestId,
    });
    return {
      document: documentDto({ ...document, status: DocumentStatus.QUEUED }),
      job: ingestionJobDto(queued),
    };
  }
  async getDocument(projectId: string, knowledgeBaseId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, knowledgeBaseId, knowledgeBase: { projectId } },
    });
    if (!document)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Document not found" });
    return documentDto(document);
  }
  private async requireKnowledgeBase(projectId: string, id: string) {
    const value = await this.prisma.knowledgeBase.findFirst({ where: { id, projectId } });
    if (!value)
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Knowledge base not found",
      });
    return value;
  }
  private requireEditor(role: ProjectMemberRole) {
    if (!canUpdateProject(role))
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Resource not found" });
  }
  private validateUpload(filename: string, mime: string, size: number) {
    const safeFilename = filename
      .replace(/[\\/\0]/g, "")
      .replace(/[^\w.() -]/g, "_")
      .trim();
    const extension = safeFilename.split(".").pop()?.toLowerCase() ?? "";
    const allowed = this.config.getOrThrow<string[]>("documents.allowedExtensions");
    if (
      !safeFilename ||
      !allowed.includes(extension) ||
      !allowedMimeByExtension[extension]?.includes(mime.toLowerCase()) ||
      size > this.config.getOrThrow<number>("documents.maxUploadBytes")
    )
      throw new BadRequestException({
        code: ErrorCodes.InvalidDocument,
        message: "Unsupported document upload",
      });
    return { safeFilename };
  }
}
