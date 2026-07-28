import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Injectable } from "@nestjs/common";
import type { Job } from "bullmq";

import { AiServiceClient } from "../../infrastructure/http/ai-service.client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { DocumentStatus, IngestionJobStatus, Prisma } from "../../generated/prisma/client";

@Processor("ingestion")
@Injectable()
export class IngestionProcessor extends WorkerHost {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
  ) {
    super();
  }
  async process(job: Job<{ ingestionJobId: string; requestId: string }>): Promise<void> {
    const record = await this.prisma.ingestionJob.findUnique({
      where: { id: job.data.ingestionJobId },
      include: { documentVersion: { include: { document: { include: { knowledgeBase: true } } } } },
    });
    if (!record || record.status === IngestionJobStatus.COMPLETED) return;
    await this.prisma.$transaction([
      this.prisma.ingestionJob.update({
        where: { id: record.id },
        data: {
          status: IngestionJobStatus.RUNNING,
          attempt: job.attemptsMade + 1,
          progress: 5,
          currentStage: "VALIDATING",
          startedAt: new Date(),
        },
      }),
      this.prisma.document.update({
        where: { id: record.documentVersion.documentId },
        data: { status: DocumentStatus.VALIDATING },
      }),
      this.prisma.documentVersion.update({
        where: { id: record.documentVersionId },
        data: { status: DocumentStatus.VALIDATING },
      }),
    ]);
    try {
      const response = await this.ai.ingest({
        declaredMimeType: record.documentVersion.document.declaredMimeType,
        documentVersionId: record.documentVersionId,
        ingestionJobId: record.id,
        requestId: job.data.requestId,
        storageKey: record.documentVersion.storageKey,
        indexContext: {
          createdAt: record.documentVersion.createdAt.toISOString(),
          documentId: record.documentVersion.documentId,
          documentStatus: "COMPLETED",
          documentVersion: record.documentVersion.version,
          documentVersionId: record.documentVersionId,
          knowledgeBaseId: record.documentVersion.document.knowledgeBaseId,
          projectId: record.documentVersion.document.knowledgeBase.projectId,
        },
      });
      const priorVersionId = record.documentVersion.document.currentVersionId;
      if (priorVersionId && priorVersionId !== record.documentVersionId) {
        await this.ai.deactivateDocumentVersion(priorVersionId, job.data.requestId);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({
          where: { documentVersionId: record.documentVersionId },
        });
        await tx.documentChunk.createMany({
          data: response.chunks.map((chunk) => ({
            id: chunk.vectorPointId,
            documentVersionId: record.documentVersionId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            headingPath: chunk.headingPath,
            metadata: chunk.metadata as Prisma.InputJsonValue,
            vectorPointId: chunk.vectorPointId,
            contentHash: chunk.contentHash,
          })),
        });
        await tx.documentVersion.update({
          where: { id: record.documentVersionId },
          data: {
            checksumSha256: response.checksumSha256,
            detectedMimeType: response.detectedMimeType,
            parserName: response.parserName,
            parserVersion: response.parserVersion,
            chunkerVersion: "v1",
            embeddingProvider: "local-deterministic",
            embeddingModel: response.embeddingModel,
            embeddingDimension: response.embeddingDimension,
            characterCount: response.characterCount,
            tokenCount: response.tokenCount,
            status: DocumentStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await tx.document.update({
          where: { id: record.documentVersion.documentId },
          data: {
            currentVersionId: record.documentVersionId,
            mimeType: response.detectedMimeType,
            status: DocumentStatus.COMPLETED,
          },
        });
        await tx.ingestionJob.update({
          where: { id: record.id },
          data: {
            status: IngestionJobStatus.COMPLETED,
            progress: 100,
            currentStage: "COMPLETED",
            completedAt: new Date(),
          },
        });
      });
    } catch {
      await this.prisma.$transaction([
        this.prisma.ingestionJob.update({
          where: { id: record.id },
          data: {
            status: IngestionJobStatus.FAILED,
            currentStage: "FAILED",
            errorCode: "INGESTION_FAILED",
            errorMessage: "Document processing failed safely",
            completedAt: new Date(),
          },
        }),
        this.prisma.document.update({
          where: { id: record.documentVersion.documentId },
          data: { status: DocumentStatus.FAILED },
        }),
        this.prisma.documentVersion.update({
          where: { id: record.documentVersionId },
          data: {
            status: DocumentStatus.FAILED,
            errorCode: "INGESTION_FAILED",
            errorMessage: "Document processing failed safely",
          },
        }),
      ]);
      throw new Error("Ingestion failed");
    }
  }
}
