import { randomUUID } from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreateExperimentRequest,
  ExperimentCaseRequestSchema,
  ExperimentVariantRequestSchema,
} from "@dip/contracts";
import type { Queue } from "bullmq";
import type { z } from "zod";

import { ErrorCodes } from "../../common/errors/error-codes";
import {
  ExperimentRunStatus,
  ExperimentStatus,
  Prisma,
  ProjectMemberRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { QuotaService } from "../billing/quota.service";
import { canUpdateProject } from "../projects/project-permissions";

type VariantInput = z.infer<typeof ExperimentVariantRequestSchema>;
type CaseInput = z.infer<typeof ExperimentCaseRequestSchema>;
type Metric = { metadata: Prisma.InputJsonValue; name: string; value: number };

@Injectable()
export class ExperimentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue("experiments") private readonly queue: Queue,
    @Inject(QuotaService) private readonly quota: QuotaService,
  ) {}

  async create(input: {
    body: CreateExperimentRequest;
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }) {
    this.requireEditor(input.role);
    await this.quota.assertFeature({
      feature: "experimentAvailable",
      projectId: input.projectId,
      userId: input.userId,
    });
    const experiment = await this.prisma.experiment.create({
      data: {
        projectId: input.projectId,
        createdById: input.userId,
        name: input.body.name,
        description: input.body.description ?? null,
        datasetId: input.body.datasetId,
        configuration: { repetitions: input.body.repetitions },
      },
    });
    await this.audit.record({
      action: "experiment.created",
      actorUserId: input.userId,
      entityType: "Experiment",
      entityId: experiment.id,
      projectId: input.projectId,
      requestId: input.requestId,
    });
    return experiment;
  }

  async list(projectId: string) {
    return this.prisma.experiment.findMany({
      where: { projectId },
      include: { _count: { select: { cases: true, runs: true, variants: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(projectId: string, experimentId: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id: experimentId, projectId },
      include: {
        variants: { orderBy: { createdAt: "asc" } },
        cases: { orderBy: { caseIndex: "asc" } },
        runs: {
          include: { experimentCase: true, metrics: true, variant: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!experiment) throw this.notFound();
    return experiment;
  }

  async update(input: {
    body: { description?: string | null; name?: string };
    experimentId: string;
    projectId: string;
    role: ProjectMemberRole;
  }) {
    this.requireEditor(input.role);
    await this.requireExperiment(input.projectId, input.experimentId);
    return this.prisma.experiment.update({
      where: { id: input.experimentId },
      data: { description: input.body.description, name: input.body.name },
    });
  }

  async remove(projectId: string, experimentId: string, role: ProjectMemberRole) {
    this.requireEditor(role);
    await this.requireExperiment(projectId, experimentId);
    await this.prisma.experiment.delete({ where: { id: experimentId } });
    return { id: experimentId, deleted: true };
  }

  async addVariant(input: {
    body: VariantInput;
    experimentId: string;
    projectId: string;
    role: ProjectMemberRole;
  }) {
    this.requireEditor(input.role);
    await this.requireExperiment(input.projectId, input.experimentId);
    const count = await this.prisma.experimentVariant.count({
      where: { experimentId: input.experimentId },
    });
    const experiment = await this.requireExperiment(input.projectId, input.experimentId);
    await this.quota.assertCurrentResourceLimit({
      currentUsage: count,
      entitlement: "maximumExperimentVariants",
      projectId: input.projectId,
      userId: experiment.createdById,
    });
    if (count >= this.config.getOrThrow<number>("experiments.maximumVariants")) {
      throw this.limit("Experiment variant limit reached");
    }
    return this.prisma.experimentVariant.create({
      data: {
        experimentId: input.experimentId,
        name: input.body.name,
        analysisMode: input.body.analysisMode,
        evidenceMode: input.body.evidenceMode,
        retrievalConfiguration: input.body.retrievalConfiguration,
        agentConfiguration: {},
        criticConfiguration: input.body.criticConfiguration,
        modelConfiguration: {},
      },
    });
  }

  async addCase(input: {
    body: CaseInput;
    experimentId: string;
    projectId: string;
    role: ProjectMemberRole;
  }) {
    this.requireEditor(input.role);
    await this.requireExperiment(input.projectId, input.experimentId);
    const caseIndex = await this.prisma.experimentCase.count({
      where: { experimentId: input.experimentId },
    });
    if (caseIndex >= this.config.getOrThrow<number>("experiments.maximumCases")) {
      throw this.limit("Experiment case limit reached");
    }
    return this.prisma.experimentCase.create({
      data: {
        experimentId: input.experimentId,
        caseIndex,
        title: input.body.title,
        question: input.body.question,
        objectives: input.body.objectives,
        constraints: input.body.constraints,
        assumptions: input.body.assumptions,
        scope: jsonValue(input.body.scope),
        expectedEvidence: input.body.expectedEvidence,
        rubric: jsonValue(input.body.rubric),
      },
    });
  }

  async run(input: {
    experimentId: string;
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }) {
    this.requireEditor(input.role);
    const experiment = await this.get(input.projectId, input.experimentId);
    if (!experiment.variants.length || !experiment.cases.length) {
      throw this.limit("At least one controlled variant and one case are required");
    }
    const repetitions = numericField(experiment.configuration, "repetitions", 1);
    const maxRepetitions = this.config.getOrThrow<number>("experiments.maximumRepetitions");
    if (repetitions > maxRepetitions) throw this.limit("Experiment repetition limit reached");
    const runCount = experiment.variants.length * experiment.cases.length * repetitions;
    if (runCount > this.config.getOrThrow<number>("experiments.maximumRuns")) {
      throw this.limit("Experiment run limit reached");
    }
    const estimatedCost = experiment.variants.reduce(
      (total, variant) =>
        total +
        (variant.analysisMode === "MULTI_AGENT" ? 0.018 : 0.009) *
          experiment.cases.length *
          repetitions,
      0,
    );
    if (estimatedCost > this.config.getOrThrow<number>("experiments.maximumEstimatedCost")) {
      throw this.limit("Experiment estimated cost limit reached");
    }
    await this.quota.reserve({
      metric: "monthlyExperimentRuns",
      projectId: input.projectId,
      quantity: runCount,
      resourceId: `experiment:${experiment.id}`,
      userId: input.userId,
    });
    await this.prisma.$transaction(async (tx) => {
      for (const variant of experiment.variants) {
        for (const testCase of experiment.cases) {
          for (let repetition = 1; repetition <= repetitions; repetition += 1) {
            await tx.experimentRun.upsert({
              where: {
                experimentVariantId_experimentCaseId_repetition: {
                  experimentVariantId: variant.id,
                  experimentCaseId: testCase.id,
                  repetition,
                },
              },
              create: {
                id: randomUUID(),
                experimentId: experiment.id,
                experimentVariantId: variant.id,
                experimentCaseId: testCase.id,
                repetition,
                seed: repetition,
              },
              update: { status: ExperimentRunStatus.QUEUED, errorCode: null, completedAt: null },
            });
          }
        }
      }
      await tx.experiment.update({
        where: { id: experiment.id },
        data: { status: ExperimentStatus.QUEUED, cancellationRequested: false },
      });
    });
    await this.queue.add(
      "execute",
      { experimentId: experiment.id, requestId: input.requestId },
      {
        jobId: experiment.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
    return this.prisma.experiment.update({
      where: { id: experiment.id },
      data: { bullJobId: experiment.id },
    });
  }

  async cancel(projectId: string, experimentId: string, role: ProjectMemberRole) {
    this.requireEditor(role);
    await this.requireExperiment(projectId, experimentId);
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { cancellationRequested: true },
    });
    await this.quota.releaseResourceReservation(`experiment:${experimentId}`);
    return { id: experimentId, cancellationRequested: true };
  }

  async execute(experimentId: string): Promise<void> {
    const experiment = await this.getExperimentForExecution(experimentId);
    if (!experiment || experiment.status === ExperimentStatus.COMPLETED) return;
    if (experiment.cancellationRequested) return this.markCancelled(experimentId);
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: ExperimentStatus.RUNNING },
    });
    for (const run of experiment.runs) {
      const current = await this.prisma.experiment.findUniqueOrThrow({
        where: { id: experimentId },
      });
      if (current.cancellationRequested) return this.markCancelled(experimentId);
      await this.prisma.experimentRun.update({
        where: { id: run.id },
        data: { status: ExperimentRunStatus.RUNNING, startedAt: new Date() },
      });
      const metrics = deterministicMetrics(run.variant, run.experimentCase, run.repetition);
      await this.prisma.$transaction(async (tx) => {
        for (const metric of metrics) {
          await tx.experimentMetric.upsert({
            where: {
              experimentRunId_metricName_metricVersion: {
                experimentRunId: run.id,
                metricName: metric.name,
                metricVersion: "phase-6-v1",
              },
            },
            create: {
              experimentRunId: run.id,
              metricName: metric.name,
              metricVersion: "phase-6-v1",
              numericValue: metric.value,
              metadata: metric.metadata,
            },
            update: { numericValue: metric.value, metadata: metric.metadata },
          });
        }
        await tx.experimentRun.update({
          where: { id: run.id },
          data: {
            status: ExperimentRunStatus.COMPLETED_WITH_LIMITATIONS,
            completedAt: new Date(),
            errorCode: "SYNTHETIC_EVALUATION",
          },
        });
      });
    }
    await this.prisma.experiment.update({
      where: { id: experimentId },
      data: { status: ExperimentStatus.COMPLETED_WITH_LIMITATIONS, completedAt: new Date() },
    });
    await this.quota.finalizeReservation({
      event: {
        eventType: "monthlyExperimentRuns",
        idempotencyKey: `usage:experiment:${experiment.id}`,
        metric: "monthlyExperimentRuns",
        projectId: experiment.projectId,
        quantity: experiment.runs.length,
        resourceId: experiment.id,
        resourceType: "Experiment",
        unit: "run",
        userId: experiment.createdById,
      },
      resourceId: `experiment:${experiment.id}`,
    });
  }

  async listRuns(projectId: string, experimentId: string) {
    await this.requireExperiment(projectId, experimentId);
    return this.prisma.experimentRun.findMany({
      where: { experimentId },
      include: { metrics: true, variant: true, experimentCase: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async metrics(projectId: string, experimentId: string) {
    const runs = await this.listRuns(projectId, experimentId);
    return aggregateMetrics(runs);
  }

  async report(projectId: string, experimentId: string) {
    const experiment = await this.get(projectId, experimentId);
    return {
      experiment: { id: experiment.id, name: experiment.name, status: experiment.status },
      sampleSize: experiment.runs.length,
      failedRuns: experiment.runs.filter((run) => run.status === ExperimentRunStatus.FAILED).length,
      metrics: aggregateMetrics(experiment.runs),
      blindComparison: blindComparison(experiment.runs),
    };
  }

  async evaluate(input: {
    experimentId: string;
    projectId: string;
    runId: string;
    userId: string;
    scores: Prisma.InputJsonValue;
    notes?: string;
  }) {
    const run = await this.prisma.experimentRun.findFirst({
      where: {
        id: input.runId,
        experimentId: input.experimentId,
        experiment: { projectId: input.projectId },
      },
    });
    if (!run) throw this.notFound();
    return this.prisma.humanEvaluation.upsert({
      where: {
        experimentRunId_evaluatorUserId: {
          experimentRunId: input.runId,
          evaluatorUserId: input.userId,
        },
      },
      create: {
        experimentRunId: input.runId,
        evaluatorUserId: input.userId,
        rubricVersion: this.config.getOrThrow<string>("experiments.rubricVersion"),
        scores: input.scores,
        notes: input.notes ?? null,
      },
      update: { scores: input.scores, notes: input.notes ?? null },
    });
  }

  async exportJson(projectId: string, experimentId: string, userId: string) {
    await this.quota.assertFeature({ feature: "jsonCsvExportAvailable", projectId, userId });
    return this.get(projectId, experimentId);
  }

  async exportCsv(projectId: string, experimentId: string, userId: string): Promise<string> {
    await this.quota.assertFeature({ feature: "jsonCsvExportAvailable", projectId, userId });
    const runs = await this.listRuns(projectId, experimentId);
    const rows = ["run_id,case,variant,status,metric,value"];
    for (const run of runs) {
      for (const metric of run.metrics) {
        rows.push(
          [
            run.id,
            run.experimentCase.title,
            run.variant.name,
            run.status,
            metric.metricName,
            metric.numericValue ?? "",
          ]
            .map(escapeCsv)
            .join(","),
        );
      }
    }
    return rows.join("\n");
  }

  private async requireExperiment(projectId: string, experimentId: string) {
    const experiment = await this.prisma.experiment.findFirst({
      where: { id: experimentId, projectId },
    });
    if (!experiment) throw this.notFound();
    return experiment;
  }

  private async getExperimentForExecution(experimentId: string) {
    return this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: {
        runs: {
          where: { status: ExperimentRunStatus.QUEUED },
          include: { variant: true, experimentCase: true },
        },
      },
    });
  }

  private async markCancelled(experimentId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.experimentRun.updateMany({
        where: {
          experimentId,
          status: { in: [ExperimentRunStatus.QUEUED, ExperimentRunStatus.RUNNING] },
        },
        data: { status: ExperimentRunStatus.CANCELLED, completedAt: new Date() },
      }),
      this.prisma.experiment.update({
        where: { id: experimentId },
        data: { status: ExperimentStatus.CANCELLED, completedAt: new Date() },
      }),
    ]);
  }

  private requireEditor(role: ProjectMemberRole): void {
    if (!canUpdateProject(role)) throw this.notFound();
  }

  private limit(message: string): HttpException {
    return new HttpException(
      { code: ErrorCodes.AccessDenied, message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.NotFound, message: "Experiment not found" });
  }
}

function deterministicMetrics(
  variant: {
    analysisMode: string;
    evidenceMode: string;
    criticConfiguration: Prisma.JsonValue;
    retrievalConfiguration: Prisma.JsonValue;
  },
  testCase: { expectedEvidence: Prisma.JsonValue; question: string },
  repetition: number,
): Metric[] {
  const expected = stringList(testCase.expectedEvidence).length;
  const hybrid = variant.evidenceMode === "HYBRID";
  const multiAgent = variant.analysisMode === "MULTI_AGENT";
  const reranker = booleanField(variant.retrievalConfiguration, "rerankerEnabled", false);
  const critic = booleanField(variant.criticConfiguration, "enabled", true);
  const base = hybrid ? 0.82 : 0.75;
  const quality = Math.min(1, base + (multiAgent ? 0.08 : 0) + (critic ? 0.04 : 0));
  const latency = 180 + (multiAgent ? 140 : 0) + (hybrid ? 90 : 0) + repetition * 3;
  const metadata = {
    executionMode: "synthetic_fixture",
    expectedEvidenceCount: expected,
    rerankerEnabled: reranker,
  };
  const measurements: Array<[string, number]> = [
    ["retrieval.recall_at_k", Math.min(1, 0.6 + expected * 0.08 + (reranker ? 0.08 : 0))],
    ["retrieval.precision_at_k", Math.min(1, 0.62 + (reranker ? 0.1 : 0))],
    ["retrieval.mrr", 0.68 + (reranker ? 0.1 : 0)],
    ["retrieval.ndcg_at_k", 0.7 + (reranker ? 0.1 : 0)],
    ["retrieval.hit_rate", expected ? 1 : 0],
    ["retrieval.selected_evidence_count", Math.max(1, expected)],
    ["research.source_precision", hybrid ? 0.8 : 0],
    ["research.usable_source_rate", hybrid ? 0.75 : 0],
    ["research.fetch_success_rate", hybrid ? 0.9 : 0],
    ["research.freshness_compliance", hybrid ? 0.8 : 0],
    ["research.duplicate_rate", 0],
    ["research.credibility_warning_rate", hybrid ? 0.2 : 0],
    ["research.evidence_gap_resolution_rate", hybrid ? 0.75 : 0],
    ["grounding.citation_validity", 1],
    ["grounding.citation_precision", quality],
    ["grounding.quote_validity", 1],
    ["grounding.supported_claim_ratio", quality],
    ["grounding.unsupported_claim_count", quality >= 0.9 ? 0 : 1],
    ["grounding.evidence_coverage", quality],
    ["grounding.internal_external_citation_balance", hybrid ? 0.5 : 1],
    ["report.required_section_coverage", 1],
    ["report.decision_question_coverage", quality],
    ["report.recommendation_usefulness", quality],
    ["report.alternatives_coverage", multiAgent ? 1 : 0.7],
    ["report.risk_coverage", quality],
    ["report.uncertainty_disclosure", critic ? 0.95 : 0.72],
    ["report.missing_information_disclosure", hybrid ? 0.9 : 0.8],
    ["report.contradiction_count", 0],
    ["runtime.total_latency_ms", latency],
    ["runtime.retrieval_latency_ms", 70 + (reranker ? 20 : 0)],
    ["runtime.research_latency_ms", hybrid ? 90 : 0],
    ["runtime.specialist_latency_ms", multiAgent ? 130 : 40],
    ["runtime.coordinator_latency_ms", multiAgent ? 70 : 35],
    ["runtime.critic_latency_ms", critic ? 40 : 0],
    ["runtime.revision_count", critic ? 1 : 0],
    ["runtime.input_tokens", multiAgent ? 2_200 : 1_200],
    ["runtime.output_tokens", multiAgent ? 1_600 : 900],
    ["runtime.estimated_cost", multiAgent ? 0.018 : 0.009],
    ["runtime.critic_revision_rate", critic ? 0.1 : 0],
    ["runtime.failure_rate", 0],
    ["runtime.cancellation_rate", 0],
    [
      "evaluation.insufficient_evidence_accuracy",
      testCase.question.toLowerCase().includes("ceo") ? 1 : 0.8,
    ],
  ];
  return measurements.map(([name, value]) => ({ name, value, metadata }));
}

function aggregateMetrics(
  runs: Array<{
    variant: { id: string; name: string };
    metrics: Array<{ metricName: string; numericValue: number | null }>;
  }>,
) {
  const summaries = new Map<
    string,
    { count: number; metrics: Map<string, { count: number; total: number }>; name: string }
  >();
  for (const run of runs) {
    const summary: {
      count: number;
      metrics: Map<string, { count: number; total: number }>;
      name: string;
    } = summaries.get(run.variant.id) ?? {
      count: 0,
      metrics: new Map<string, { count: number; total: number }>(),
      name: run.variant.name,
    };
    summary.count += 1;
    for (const metric of run.metrics) {
      if (metric.numericValue === null) continue;
      const value = summary.metrics.get(metric.metricName) ?? { count: 0, total: 0 };
      value.count += 1;
      value.total += metric.numericValue;
      summary.metrics.set(metric.metricName, value);
    }
    summaries.set(run.variant.id, summary);
  }
  return [...summaries.entries()].map(([variantId, summary]) => ({
    variantId,
    variantName: summary.name,
    sampleSize: summary.count,
    metrics: [...summary.metrics.entries()].map(([name, value]) => ({
      name,
      value: value.total / value.count,
    })),
  }));
}

function blindComparison(
  runs: Array<{
    id: string;
    experimentCaseId: string;
    repetition: number;
    metrics: Array<{ metricName: string; numericValue: number | null }>;
  }>,
) {
  const groups = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = `${run.experimentCaseId}:${run.repetition}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()].flatMap((group) => {
    const [first, second] = group;
    if (!first || !second) return [];
    return [
      {
        labelA: "Variant A",
        labelB: "Variant B",
        runA: first.id,
        runB: second.id,
        metricsA: first.metrics,
        metricsB: second.metrics,
      },
    ];
  });
}

function stringList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numericField(value: Prisma.JsonValue, key: string, fallback: number): number {
  return isRecord(value) && typeof value[key] === "number" ? value[key] : fallback;
}

function booleanField(value: Prisma.JsonValue, key: string, fallback: boolean): boolean {
  return isRecord(value) && typeof value[key] === "boolean" ? value[key] : fallback;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
