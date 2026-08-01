import { createHash, randomUUID } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
import { QuotaService } from "../billing/quota.service";
import { canUpdateProject } from "../projects/project-permissions";
import { ResearchService } from "../research/research.service";
import { ReportsService } from "../reports/reports.service";

const ACTIVE = [AnalysisStatus.QUEUED, AnalysisStatus.RUNNING];

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function analysisScopeKey(input: {
  analysisRunId: string;
  assumptions: string[];
  knowledgeBaseIds: string[];
  documentIds: string[];
  evidenceMode: string;
  researchRunId: string;
  graphVersion: string;
}): string {
  const canonical = JSON.stringify({
    analysisRunId: input.analysisRunId,
    assumptions: [...input.assumptions].sort(),
    knowledgeBaseIds: [...input.knowledgeBaseIds].sort(),
    documentIds: [...input.documentIds].sort(),
    evidenceMode: input.evidenceMode,
    researchRunId: input.researchRunId,
    graphVersion: input.graphVersion,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

@Injectable()
export class AnalysesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue("analysis") private readonly queue: Queue,
    @Inject(ResearchService) private readonly research: ResearchService,
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(ReportsService) private readonly reports: ReportsService,
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
        evidenceMode: input.body.evidenceMode,
        externalResearchEnabled: input.body.externalResearchEnabled,
        researchCountry: input.body.researchCountry ?? null,
        researchLanguages: input.body.researchLanguages,
        publishedAfter: input.body.publishedAfter ? new Date(input.body.publishedAfter) : null,
        publishedBefore: input.body.publishedBefore ? new Date(input.body.publishedBefore) : null,
        preferredDomains: input.body.preferredDomains,
        excludedDomains: input.body.excludedDomains,
        sourceTypes: input.body.sourceTypes,
        maximumExternalSources: input.body.maximumExternalSources ?? null,
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
          include: {
            agentRuns: true,
            report: { include: { citations: true, externalCitations: true } },
            reportSnapshot: {
              select: {
                contentHash: true,
                id: true,
                reportLineageId: true,
                status: true,
                versionNumber: true,
              },
            },
          },
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
    if (active) {
      const queueState = active.bullJobId
        ? await this.queue.getJobState(active.bullJobId)
        : "unknown";
      if (!["completed", "failed", "unknown"].includes(queueState)) return active;
      await this.prisma.analysisRun.update({
        where: { id: active.id },
        data: {
          status: AnalysisStatus.FAILED,
          currentStage: "FAILED",
          errorCode: "ANALYSIS_WORKER_UNAVAILABLE",
          errorMessage: "The analysis worker stopped before completing the run.",
          completedAt: new Date(),
        },
      });
    }
    const billingOwnerUserId = await this.quota.billingOwnerForProject(input.projectId);
    const id = randomUUID();
    const modeMetric =
      analysis.mode === "MULTI_AGENT" ? "monthlyMultiAgentRuns" : "monthlySingleAgentRuns";
    try {
      await this.quota.reserve({
        metric: "monthlyAnalysisRuns",
        projectId: input.projectId,
        quantity: 1,
        resourceId: `analysis:${id}`,
        userId: billingOwnerUserId,
      });
      await this.quota.reserve({
        metric: modeMetric,
        projectId: input.projectId,
        quantity: 1,
        resourceId: `analysis:${id}:mode`,
        userId: billingOwnerUserId,
      });
      await this.quota.reserve({
        metric: "maximumConcurrentAnalysisRuns",
        projectId: input.projectId,
        quantity: 1,
        resourceId: `analysis:${id}:concurrent`,
        userId: billingOwnerUserId,
      });
      if (analysis.externalResearchEnabled || analysis.evidenceMode !== "INTERNAL_ONLY") {
        await this.quota.assertFeature({
          feature: "externalResearchAvailable",
          projectId: input.projectId,
          userId: billingOwnerUserId,
        });
        await this.quota.reserve({
          metric: "monthlyExternalResearchQueries",
          projectId: input.projectId,
          quantity: this.config.getOrThrow<number>("research.maximumQueries"),
          resourceId: `research:${id}:queries`,
          userId: billingOwnerUserId,
        });
        await this.quota.reserve({
          metric: "monthlyFetchedExternalPages",
          projectId: input.projectId,
          quantity: this.config.getOrThrow<number>("research.maximumFetchedPages"),
          resourceId: `research:${id}:pages`,
          userId: billingOwnerUserId,
        });
        await this.quota.reserve({
          metric: "monthlyExternalBytes",
          projectId: input.projectId,
          quantity: this.config.getOrThrow<number>("research.maximumTotalBytes"),
          resourceId: `research:${id}:bytes`,
          userId: billingOwnerUserId,
        });
      }
    } catch (error) {
      await Promise.all([
        this.quota.releaseResourceReservation(`analysis:${id}`),
        this.quota.releaseResourceReservation(`analysis:${id}:mode`),
        this.quota.releaseResourceReservation(`analysis:${id}:concurrent`),
        this.quota.releaseResourceReservation(`research:${id}:queries`),
        this.quota.releaseResourceReservation(`research:${id}:pages`),
        this.quota.releaseResourceReservation(`research:${id}:bytes`),
      ]);
      throw error;
    }
    const run = await this.prisma.analysisRun.create({
      data: {
        id,
        analysisId: analysis.id,
        billingOwnerUserId,
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

  async cancel(input: {
    analysisId: string;
    projectId: string;
    role: ProjectMemberRole;
    requestId: string;
  }) {
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
    await this.research.cancelForAnalysisRun(run.id, input.requestId);
    await this.quota.releaseResourceReservation(`analysis:${run.id}:concurrent`);
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
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        startedAt: new Date(),
      },
    });
    try {
      let internalEvidence: z.infer<typeof SearchResponseSchema>["evidence"] = [];
      let retrievalRunId: string = randomUUID();
      const objectives = jsonStringArray(run.analysis.objectives);
      const constraints = jsonStringArray(run.analysis.constraints);
      const assumptions = jsonStringArray(run.analysis.assumptions);
      const knowledgeBaseIds = jsonStringArray(run.analysis.knowledgeBaseIds);
      const documentIds = jsonStringArray(run.analysis.documentIds);
      const retrievalParts: unknown[] = [
        run.analysis.decisionQuestion,
        run.analysis.title,
        run.analysis.targetMarket,
        ...objectives,
        ...constraints,
        ...assumptions,
        typeof run.analysis.additionalContext === "string" ? run.analysis.additionalContext : "",
      ];
      const retrievalQuery = retrievalParts
        .filter(
          (value: unknown): value is string => typeof value === "string" && value.trim().length > 0,
        )
        .join(" ")
        .slice(0, 4_000);
      if (run.analysis.evidenceMode !== "EXTERNAL_ONLY") {
        const retrieval = await this.ai.retrieve({
          projectId: run.projectId,
          query: retrievalQuery,
          requestId,
          mode: "HYBRID",
          topK: this.config.getOrThrow<number>("analysis.maxEvidencePerSpecialist"),
          generateAnswer: false,
          filters: {
            knowledgeBaseIds,
            documentIds,
          },
        });
        const raw = SearchResponseSchema.parse({
          ...(retrieval as object),
          retrievalRunId: randomUUID(),
        });
        internalEvidence = raw.evidence;
        const retrievalRun = await this.prisma.retrievalRun.create({
          data: {
            projectId: run.projectId,
            userId: run.userId,
            query: retrievalQuery,
            normalizedQuery: raw.normalizedQuery,
            mode: "HYBRID",
            filters: {
              knowledgeBaseIds,
              documentIds,
            },
            timingsMs: raw.timingsMs,
            resultCount: raw.evidence.length,
          },
        });
        retrievalRunId = retrievalRun.id;
      }
      const externalEvidence = run.analysis.externalResearchEnabled
        ? await this.research.executeForAnalysis({
            analysis: run.analysis,
            analysisRunId: run.id,
            internalEvidence,
            projectId: run.projectId,
            requestId,
          })
        : [];
      const evidence = [...internalEvidence, ...externalEvidence];
      const researchRun = await this.prisma.researchRun.findUnique({
        where: { analysisRunId: run.id },
        select: { id: true },
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
          evidenceMode: run.analysis.evidenceMode,
          externalResearchEnabled: run.analysis.externalResearchEnabled,
          title: run.analysis.title,
          decisionQuestion: run.analysis.decisionQuestion,
          objectives,
          constraints,
          assumptions,
          timeHorizon: run.analysis.timeHorizon,
          targetMarket: run.analysis.targetMarket,
          currency: run.analysis.currency,
          authorizedKnowledgeBaseIds: knowledgeBaseIds,
          authorizedDocumentIds: documentIds,
          requestedSpecialists: run.analysis.requestedSpecialists,
          additionalContext: run.analysis.additionalContext,
          initialRetrievalRunId: retrievalRunId,
          cacheKey: analysisScopeKey({
            analysisRunId: run.id,
            assumptions,
            knowledgeBaseIds,
            documentIds,
            evidenceMode: run.analysis.evidenceMode,
            researchRunId: researchRun?.id ?? "none",
            graphVersion: run.graphVersion,
          }),
          initialEvidence: evidence,
        },
        requestId,
      );
      const result = AnalysisExecutionSchema.parse(response);
      const minimumQualityScore = this.config.get<number>("analysis.minQualityScore", 0.7);
      const minimumGroundingScore = this.config.get<number>("analysis.minGroundingScore", 0.7);
      const completedWithLimitations =
        result.report.insufficientEvidence ||
        !result.report.decisionReady ||
        !result.report.qualityGatePassed ||
        result.report.qualityScore < minimumQualityScore ||
        result.report.groundingScore < minimumGroundingScore;
      const current = await this.prisma.analysisRun.findUniqueOrThrow({ where: { id: run.id } });
      if (current.cancellationRequested) return this.cancelRun(run.id);
      const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
      const internalCitations: Array<
        Pick<
          Prisma.AnalysisCitationCreateManyInput,
          "evidenceId" | "documentId" | "chunkId" | "quote"
        >
      > = [];
      const externalCitations: Array<
        Pick<
          Prisma.ExternalAnalysisCitationCreateManyInput,
          "evidenceId" | "researchRunId" | "researchSnapshotId" | "quote"
        >
      > = [];
      for (const citation of result.report.citations) {
        const evidence = evidenceById.get(citation.evidenceId);
        if (
          !evidence ||
          evidence.documentId !== citation.documentId ||
          !evidence.snippet.includes(citation.quote)
        )
          throw new Error("Analysis citation was not validated");
        if (citation.evidenceId.startsWith("W")) {
          externalCitations.push({
            evidenceId: citation.evidenceId,
            researchRunId: evidence.knowledgeBaseId,
            researchSnapshotId: evidence.chunkId,
            quote: citation.quote,
          });
        } else {
          internalCitations.push({
            evidenceId: citation.evidenceId,
            documentId: citation.documentId,
            chunkId: evidence.chunkId,
            quote: citation.quote,
          });
        }
      }
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
            initialRetrievalRunId:
              run.analysis.evidenceMode === "EXTERNAL_ONLY" ? null : retrievalRunId,
            completedAt: new Date(),
            tokenUsage: result.tokenUsage ?? {},
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
        if (internalCitations.length)
          await tx.analysisCitation.createMany({
            data: internalCitations.map((citation) => ({
              analysisReportId: report.id,
              ...citation,
            })),
            skipDuplicates: true,
          });
        await tx.externalAnalysisCitation.deleteMany({ where: { analysisReportId: report.id } });
        if (externalCitations.length)
          await tx.externalAnalysisCitation.createMany({
            data: externalCitations.map((citation) => ({
              analysisReportId: report.id,
              ...citation,
            })),
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
      await this.reports.ensureSnapshotForCompletedRun({ requestId, runId: run.id });
      await this.quota.finalizeReservation({
        event: {
          eventType: "monthlyAnalysisRuns",
          idempotencyKey: `usage:analysis:${run.id}`,
          metric: "monthlyAnalysisRuns",
          projectId: run.projectId,
          quantity: 1,
          resourceId: run.id,
          resourceType: "AnalysisRun",
          unit: "run",
          userId: run.billingOwnerUserId,
        },
        resourceId: `analysis:${run.id}`,
      });
      await this.quota.finalizeReservation({
        event: {
          eventType: modeMetricForRun(run.analysis.mode),
          idempotencyKey: `usage:analysis:mode:${run.id}`,
          metric: modeMetricForRun(run.analysis.mode),
          projectId: run.projectId,
          quantity: 1,
          resourceId: run.id,
          resourceType: "AnalysisRun",
          unit: "run",
          userId: run.billingOwnerUserId,
        },
        resourceId: `analysis:${run.id}:mode`,
      });
      await this.quota.releaseResourceReservation(`analysis:${run.id}:concurrent`);
      await this.recordModelUsage(run, result.tokenUsage);
      if (researchRun) {
        await this.finalizeResearchUsage({
          analysisRunId: run.id,
          projectId: run.projectId,
          userId: run.billingOwnerUserId,
        });
      }
    } catch (error) {
      await this.quota.releaseResourceReservation(`analysis:${run.id}`);
      await this.quota.releaseResourceReservation(`analysis:${run.id}:mode`);
      await this.quota.releaseResourceReservation(`analysis:${run.id}:concurrent`);
      await this.quota.releaseResourceReservation(`research:${run.id}:queries`);
      await this.quota.releaseResourceReservation(`research:${run.id}:pages`);
      await this.quota.releaseResourceReservation(`research:${run.id}:bytes`);
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

  private async finalizeResearchUsage(input: {
    analysisRunId: string;
    projectId: string;
    userId: string;
  }): Promise<void> {
    const researchRun = await this.prisma.researchRun.findUnique({
      where: { analysisRunId: input.analysisRunId },
      select: { fetchedPageCount: true, queryCount: true, totalFetchedBytes: true },
    });
    if (!researchRun) return;
    await this.quota.finalizeReservation({
      event: {
        eventType: "monthlyExternalResearchQueries",
        idempotencyKey: `usage:research:queries:${input.analysisRunId}`,
        metric: "monthlyExternalResearchQueries",
        projectId: input.projectId,
        quantity: researchRun.queryCount,
        resourceId: input.analysisRunId,
        resourceType: "ResearchRun",
        unit: "query",
        userId: input.userId,
      },
      resourceId: `research:${input.analysisRunId}:queries`,
    });
    await this.quota.finalizeReservation({
      event: {
        eventType: "monthlyFetchedExternalPages",
        idempotencyKey: `usage:research:pages:${input.analysisRunId}`,
        metric: "monthlyFetchedExternalPages",
        projectId: input.projectId,
        quantity: researchRun.fetchedPageCount,
        resourceId: input.analysisRunId,
        resourceType: "ResearchRun",
        unit: "page",
        userId: input.userId,
      },
      resourceId: `research:${input.analysisRunId}:pages`,
    });
    await this.quota.finalizeReservation({
      event: {
        eventType: "monthlyExternalBytes",
        idempotencyKey: `usage:research:bytes:${input.analysisRunId}`,
        metric: "monthlyExternalBytes",
        projectId: input.projectId,
        quantity: researchRun.totalFetchedBytes,
        resourceId: input.analysisRunId,
        resourceType: "ResearchRun",
        unit: "byte",
        userId: input.userId,
      },
      resourceId: `research:${input.analysisRunId}:bytes`,
    });
  }

  private async recordModelUsage(
    run: { billingOwnerUserId: string; id: string; projectId: string },
    tokenUsage:
      | {
          costVersion: string | null;
          estimatedCostMinorUnits: number | null;
          inputTokens: number | null;
          outputTokens: number | null;
        }
      | null
      | undefined,
  ): Promise<void> {
    if (!tokenUsage) return;
    const events = [];
    if (tokenUsage.inputTokens !== null && tokenUsage.inputTokens > 0) {
      events.push(
        this.quota.recordUsage({
          eventType: "model.input_tokens",
          idempotencyKey: `usage:model:input:${run.id}`,
          metric: "modelInputTokens",
          projectId: run.projectId,
          quantity: tokenUsage.inputTokens,
          resourceId: run.id,
          resourceType: "AnalysisRun",
          unit: "token",
          userId: run.billingOwnerUserId,
        }),
      );
    }
    if (tokenUsage.outputTokens !== null && tokenUsage.outputTokens > 0) {
      events.push(
        this.quota.recordUsage({
          eventType: "model.output_tokens",
          idempotencyKey: `usage:model:output:${run.id}`,
          metric: "modelOutputTokens",
          projectId: run.projectId,
          quantity: tokenUsage.outputTokens,
          resourceId: run.id,
          resourceType: "AnalysisRun",
          unit: "token",
          userId: run.billingOwnerUserId,
        }),
      );
    }
    if (tokenUsage.estimatedCostMinorUnits !== null && tokenUsage.estimatedCostMinorUnits > 0) {
      events.push(
        this.quota.recordUsage({
          estimatedCostMinorUnits: BigInt(tokenUsage.estimatedCostMinorUnits),
          eventType: "model.estimated_cost",
          idempotencyKey: `usage:model:cost:${run.id}`,
          metadata: { costVersion: tokenUsage.costVersion },
          metric: "estimatedModelCost",
          projectId: run.projectId,
          quantity: tokenUsage.estimatedCostMinorUnits,
          resourceId: run.id,
          resourceType: "AnalysisRun",
          unit: "minor_currency_unit",
          userId: run.billingOwnerUserId,
        }),
      );
    }
    await Promise.all(events);
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

  private async cancelRun(runId: string): Promise<void> {
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisStatus.CANCELLED,
        currentStage: "CANCELLED",
        completedAt: new Date(),
      },
    });
    await this.quota.releaseResourceReservation(`analysis:${runId}:concurrent`);
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
  tokenUsage: z
    .object({
      inputTokens: z.number().int().nonnegative().nullable(),
      outputTokens: z.number().int().nonnegative().nullable(),
      estimatedCostMinorUnits: z.number().int().nonnegative().nullable(),
      costVersion: z.string().max(100).nullable(),
    })
    .nullable()
    .optional(),
});

function modeMetricForRun(mode: "SINGLE_AGENT" | "MULTI_AGENT") {
  return mode === "MULTI_AGENT" ? "monthlyMultiAgentRuns" : "monthlySingleAgentRuns";
}
