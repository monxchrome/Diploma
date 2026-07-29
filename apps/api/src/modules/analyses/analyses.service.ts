import { randomUUID } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AnalysisReportSchema,
  AnalysisPlanSchema,
  SearchResponseSchema,
  SpecialistResultSchema,
  type CreateAnalysisRequest,
} from "@dip/contracts";
import type { Queue } from "bullmq";
import { z } from "zod";

import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AiServiceClient } from "../../infrastructure/http/ai-service.client";
import {
  AgentRunStatus,
  AnalysisStatus,
  Prisma,
  ProjectMemberRole,
} from "../../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { canUpdateProject } from "../projects/project-permissions";

const ACTIVE = [AnalysisStatus.QUEUED, AnalysisStatus.RUNNING];

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue("analysis") private readonly queue: Queue,
  ) {}

  async create(input: {
    body: CreateAnalysisRequest;
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }) {
    this.requireEditor(input.role);
    await this.requireScope(input.projectId, input.body);
    const analysis = await this.prisma.decisionAnalysis.create({
      data: {
        projectId: input.projectId,
        createdById: input.userId,
        title: input.body.title,
        decisionQuestion: input.body.decisionQuestion,
        objectives: input.body.objectives,
        constraints: input.body.constraints,
        assumptions: input.body.assumptions,
        timeHorizon: input.body.timeHorizon ?? null,
        targetMarket: input.body.targetMarket ?? null,
        currency: input.body.currency ?? null,
        knowledgeBaseIds: input.body.knowledgeBaseIds,
        documentIds: input.body.documentIds,
        mode: input.body.mode,
        requestedSpecialists: input.body.requestedSpecialists,
        additionalContext: input.body.additionalContext ?? null,
      },
    });
    await this.audit.record({
      action: "analysis.created",
      actorUserId: input.userId,
      entityType: "DecisionAnalysis",
      entityId: analysis.id,
      projectId: input.projectId,
      requestId: input.requestId,
    });
    return analysis;
  }

  async list(projectId: string) {
    return this.prisma.decisionAnalysis.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  }

  async get(projectId: string, analysisId: string) {
    const analysis = await this.prisma.decisionAnalysis.findFirst({
      where: { id: analysisId, projectId },
      include: {
        runs: {
          orderBy: { createdAt: "desc" },
          include: { agentRuns: true, report: { include: { citations: true } } },
        },
      },
    });
    if (!analysis)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Analysis not found" });
    return analysis;
  }

  async run(input: {
    analysisId: string;
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }) {
    this.requireEditor(input.role);
    const analysis = await this.prisma.decisionAnalysis.findFirst({
      where: { id: input.analysisId, projectId: input.projectId, archivedAt: null },
    });
    if (!analysis)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Analysis not found" });
    const active = await this.prisma.analysisRun.findFirst({
      where: { analysisId: analysis.id, status: { in: ACTIVE } },
      orderBy: { createdAt: "desc" },
    });
    if (active) return active;
    await this.enforceLimits(input.projectId, input.userId);
    const id = randomUUID();
    const run = await this.prisma.analysisRun.create({
      data: {
        id,
        analysisId: analysis.id,
        projectId: input.projectId,
        userId: input.userId,
        status: AnalysisStatus.QUEUED,
        currentStage: "QUEUED",
        threadId: `analysis:${id}`,
        graphVersion: this.config.getOrThrow<string>("analysis.graphVersion"),
      },
    });
    await this.queue.add(
      "execute",
      { analysisRunId: run.id, requestId: input.requestId },
      {
        jobId: run.id,
        attempts: this.config.getOrThrow<number>("analysis.jobAttempts"),
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
    return this.prisma.analysisRun.update({ where: { id: run.id }, data: { bullJobId: run.id } });
  }

  async cancel(input: { analysisId: string; projectId: string; role: ProjectMemberRole }) {
    this.requireEditor(input.role);
    const run = await this.prisma.analysisRun.findFirst({
      where: { analysisId: input.analysisId, projectId: input.projectId, status: { in: ACTIVE } },
      orderBy: { createdAt: "desc" },
    });
    if (!run)
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Active analysis run not found",
      });
    await this.prisma.analysisRun.update({
      where: { id: run.id },
      data: { cancellationRequested: true },
    });
    if (run.status === AnalysisStatus.QUEUED) {
      await this.prisma.analysisRun.update({
        where: { id: run.id },
        data: {
          status: AnalysisStatus.CANCELLED,
          currentStage: "CANCELLED",
          completedAt: new Date(),
        },
      });
    }
    return { id: run.id, cancellationRequested: true };
  }

  async execute(runId: string, requestId: string): Promise<void> {
    const run = await this.prisma.analysisRun.findUnique({
      where: { id: runId },
      include: { analysis: true },
    });
    if (
      !run ||
      run.status === AnalysisStatus.COMPLETED ||
      run.status === AnalysisStatus.COMPLETED_WITH_LIMITATIONS
    )
      return;
    if (run.cancellationRequested) return this.cancelRun(run.id);
    await this.prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: AnalysisStatus.RUNNING,
        currentStage: "initial_retrieval",
        progress: 10,
        startedAt: new Date(),
      },
    });
    try {
      const retrieval = await this.ai.retrieve({
        projectId: run.projectId,
        query: run.analysis.decisionQuestion,
        requestId,
        mode: "HYBRID",
        topK: this.config.getOrThrow<number>("analysis.maxEvidencePerSpecialist"),
        generateAnswer: false,
        filters: {
          knowledgeBaseIds: run.analysis.knowledgeBaseIds,
          documentIds: run.analysis.documentIds,
        },
      });
      const raw = SearchResponseSchema.parse({
        ...(retrieval as object),
        retrievalRunId: randomUUID(),
      });
      const retrievalRun = await this.prisma.retrievalRun.create({
        data: {
          projectId: run.projectId,
          userId: run.userId,
          query: run.analysis.decisionQuestion,
          normalizedQuery: raw.normalizedQuery,
          mode: "HYBRID",
          filters: {
            knowledgeBaseIds: run.analysis.knowledgeBaseIds,
            documentIds: run.analysis.documentIds,
          },
          timingsMs: raw.timingsMs,
          resultCount: raw.evidence.length,
        },
      });
      const response = await this.ai.analyze(
        {
          analysisId: run.analysisId,
          analysisRunId: run.id,
          threadId: run.threadId,
          projectId: run.projectId,
          userId: run.userId,
          requestId,
          graphVersion: run.graphVersion,
          mode: run.analysis.mode,
          title: run.analysis.title,
          decisionQuestion: run.analysis.decisionQuestion,
          objectives: run.analysis.objectives,
          constraints: run.analysis.constraints,
          assumptions: run.analysis.assumptions,
          timeHorizon: run.analysis.timeHorizon,
          targetMarket: run.analysis.targetMarket,
          currency: run.analysis.currency,
          authorizedKnowledgeBaseIds: run.analysis.knowledgeBaseIds,
          authorizedDocumentIds: run.analysis.documentIds,
          requestedSpecialists: run.analysis.requestedSpecialists,
          additionalContext: run.analysis.additionalContext,
          initialRetrievalRunId: retrievalRun.id,
          initialEvidence: raw.evidence,
        },
        requestId,
      );
      const result = AnalysisExecutionSchema.parse(response);
      const minimumQualityScore = this.config.get<number>("analysis.minQualityScore", 0.7);
      const minimumGroundingScore = this.config.get<number>("analysis.minGroundingScore", 0.7);
      const completedWithLimitations =
        result.report.insufficientEvidence ||
        !result.report.qualityGatePassed ||
        result.report.qualityScore < minimumQualityScore ||
        result.report.groundingScore < minimumGroundingScore;
      const current = await this.prisma.analysisRun.findUniqueOrThrow({ where: { id: run.id } });
      if (current.cancellationRequested) return this.cancelRun(run.id);
      const evidenceById = new Map(raw.evidence.map((item) => [item.evidenceId, item]));
      const citations = result.report.citations.map((citation) => {
        const evidence = evidenceById.get(citation.evidenceId);
        if (
          !evidence ||
          evidence.documentId !== citation.documentId ||
          !evidence.snippet.includes(citation.quote)
        )
          throw new Error("Analysis citation was not validated");
        return {
          evidenceId: citation.evidenceId,
          documentId: citation.documentId,
          chunkId: evidence.chunkId,
          quote: citation.quote,
        };
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.analysisRun.update({
          where: { id: run.id },
          data: {
            status: completedWithLimitations
              ? AnalysisStatus.COMPLETED_WITH_LIMITATIONS
              : AnalysisStatus.COMPLETED,
            currentStage: result.currentStage,
            progress: 100,
            plan: result.plan ?? Prisma.JsonNull,
            initialRetrievalRunId: retrievalRun.id,
            completedAt: new Date(),
          },
        });
        for (const specialist of result.specialistResults) {
          await tx.agentRun.upsert({
            where: {
              analysisRunId_nodeName: {
                analysisRunId: run.id,
                nodeName: `specialist:${specialist.specialist}`,
              },
            },
            create: {
              analysisRunId: run.id,
              nodeName: `specialist:${specialist.specialist}`,
              specialist: specialist.specialist,
              status:
                specialist.status === "COMPLETED"
                  ? AgentRunStatus.COMPLETED
                  : AgentRunStatus.DEGRADED,
              result: specialist,
              completedAt: new Date(),
            },
            update: {
              status:
                specialist.status === "COMPLETED"
                  ? AgentRunStatus.COMPLETED
                  : AgentRunStatus.DEGRADED,
              result: specialist,
              completedAt: new Date(),
            },
          });
        }
        const report = await tx.analysisReport.upsert({
          where: { analysisRunId: run.id },
          create: { analysisRunId: run.id, report: result.report },
          update: { report: result.report },
        });
        await tx.analysisCitation.deleteMany({ where: { analysisReportId: report.id } });
        if (citations.length)
          await tx.analysisCitation.createMany({
            data: citations.map((citation) => ({ analysisReportId: report.id, ...citation })),
            skipDuplicates: true,
          });
        for (const nodeName of result.checkpoints)
          await tx.analysisCheckpoint.upsert({
            where: { analysisRunId_nodeName: { analysisRunId: run.id, nodeName } },
            create: {
              analysisRunId: run.id,
              nodeName,
              graphVersion: run.graphVersion,
              state: { stage: nodeName },
            },
            update: { graphVersion: run.graphVersion, state: { stage: nodeName } },
          });
      });
    } catch (error) {
      const failure = this.classifyExecutionFailure(error);
      await this.prisma.analysisRun.update({
        where: { id: run.id },
        data: {
          status: AnalysisStatus.FAILED,
          currentStage: "FAILED",
          errorCode: failure.code,
          errorMessage: failure.message,
          completedAt: new Date(),
        },
      });
      throw new Error(failure.message, { cause: error });
    }
  }

  private async requireScope(projectId: string, body: CreateAnalysisRequest): Promise<void> {
    const knowledgeBases = await this.prisma.knowledgeBase.count({
      where: { projectId, archivedAt: null, id: { in: body.knowledgeBaseIds } },
    });
    if (knowledgeBases !== body.knowledgeBaseIds.length)
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Knowledge base not found",
      });
    if (body.documentIds.length) {
      const documents = await this.prisma.document.count({
        where: {
          id: { in: body.documentIds },
          archivedAt: null,
          status: "COMPLETED",
          knowledgeBase: { projectId, id: { in: body.knowledgeBaseIds } },
        },
      });
      if (documents !== body.documentIds.length)
        throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Document not found" });
    }
  }

  private async enforceLimits(projectId: string, userId: string): Promise<void> {
    const [perProject, perUser] = await Promise.all([
      this.prisma.analysisRun.count({ where: { projectId, status: { in: ACTIVE } } }),
      this.prisma.analysisRun.count({ where: { userId, status: { in: ACTIVE } } }),
    ]);
    if (
      perProject >= this.config.getOrThrow<number>("analysis.maxConcurrentPerProject") ||
      perUser >= this.config.getOrThrow<number>("analysis.maxConcurrentPerUser")
    )
      throw new HttpException(
        { code: ErrorCodes.AccessDenied, message: "Analysis concurrency limit reached" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  private async cancelRun(runId: string): Promise<void> {
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisStatus.CANCELLED,
        currentStage: "CANCELLED",
        completedAt: new Date(),
      },
    });
  }
  private classifyExecutionFailure(error: unknown): { code: string; message: string } {
    const serialized =
      error instanceof HttpException
        ? JSON.stringify(error.getResponse())
        : error instanceof Error
          ? error.message
          : "";
    if (serialized.includes("MODEL_UNAVAILABLE")) {
      return {
        code: "MODEL_UNAVAILABLE",
        message: "The configured Phase 5 model is unavailable; no fallback report was created.",
      };
    }
    if (serialized.includes("MODEL_OUTPUT_INVALID")) {
      return {
        code: "MODEL_OUTPUT_INVALID",
        message:
          "A Phase 5 model returned invalid structured output; no fallback report was created.",
      };
    }
    return { code: "ANALYSIS_FAILED", message: "Analysis execution failed safely" };
  }
  private requireEditor(role: ProjectMemberRole): void {
    if (!canUpdateProject(role))
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Analysis not found" });
  }
}

const AnalysisExecutionSchema = z.object({
  plan: AnalysisPlanSchema.nullable(),
  specialistResults: z.array(SpecialistResultSchema),
  report: AnalysisReportSchema,
  checkpoints: z.array(z.string()),
  currentStage: z.string(),
});
