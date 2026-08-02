import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { platform, release } from "node:os";

import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { z } from "zod";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { ErrorCodes } from "../../common/errors/error-codes";
import {
  AutomaticEvaluationStatus,
  BenchmarkAgentRole,
  BenchmarkCaseRunStatus,
  BenchmarkRunStatus,
  BenchmarkSuiteStatus,
  ModelProviderCode,
  Prisma,
  ProjectMemberRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AiServiceClient } from "../../infrastructure/http/ai-service.client";
import { MinioService } from "../../infrastructure/storage/minio.service";
import { AuditService } from "../audit/audit.service";
import { QuotaService } from "../billing/quota.service";
import { canUpdateProject } from "../projects/project-permissions";
import { BenchmarkStatisticsService, type MetricObservation } from "./benchmark-statistics.service";
import { BUILT_IN_VARIANT_TEMPLATES } from "./benchmark-templates";

const PROFILE_INPUT = z.object({
  active: z.boolean().default(true),
  benchmarkEligible: z.boolean().default(true),
  capabilities: z.record(z.string(), z.boolean()).default({}),
  code: z.string().trim().min(1).max(100),
  contextWindowTokens: z.number().int().positive().nullable().optional(),
  costProfileId: z.string().uuid().nullable().optional(),
  displayName: z.string().trim().min(1).max(200),
  exactModelId: z.string().trim().min(1).max(300),
  family: z.string().trim().min(1).max(100),
  localHardwareProfileId: z.string().uuid().nullable().optional(),
  maximumOutputTokens: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  provider: z.enum(["OPENAI", "ANTHROPIC", "OLLAMA"]),
  runtime: z.enum(["CLOUD", "LOCAL_OLLAMA"]),
  version: z.string().trim().min(1).max(100),
});

const DATASET_INPUT = z.object({
  code: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2_000).optional(),
  domain: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(100).default("v1"),
});

const CASE_INPUT = z.object({
  assumptions: z.array(z.string().trim().max(2_000)).max(30).default([]),
  code: z.string().trim().min(1).max(80),
  constraints: z.array(z.string().trim().max(2_000)).max(30).default([]),
  criticalRisks: z.array(z.string().trim().max(2_000)).max(30).default([]),
  difficulty: z.string().trim().min(1).max(40).default("MEDIUM"),
  domain: z.string().trim().min(1).max(100),
  expectedAlternatives: z.array(z.string().trim().max(2_000)).max(30).default([]),
  expectedDecisionType: z.string().trim().min(1).max(100),
  goldCitationMappings: z.record(z.string(), z.unknown()).optional(),
  knownUnknowns: z.array(z.string().trim().max(2_000)).max(30).default([]),
  objectives: z.array(z.string().trim().max(2_000)).max(30).default([]),
  question: z.string().trim().min(1).max(8_000),
  referenceFacts: z.array(z.string().trim().max(4_000)).max(100).default([]),
  scenario: z.string().trim().min(1).max(12_000),
  sensitivity: z.enum(["SYNTHETIC", "LOW", "MEDIUM", "HIGH"]).default("SYNTHETIC"),
  tags: z.array(z.string().trim().max(100)).max(30).default([]),
  title: z.string().trim().min(1).max(200),
});

const SUITE_INPUT = z.object({
  code: z.string().trim().min(1).max(100),
  datasetVersionId: z.string().uuid(),
  description: z.string().trim().max(2_000).optional(),
  domain: z.string().trim().min(1).max(100),
  hypotheses: z.array(z.string().trim().max(4_000)).min(1).max(20),
  projectId: z.string().uuid(),
  researchQuestions: z.array(z.string().trim().max(4_000)).min(1).max(20),
  title: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(100).default("v1"),
});

const ASSIGNMENT_INPUT = z.object({
  enabled: z.boolean().default(true),
  executionOrder: z.number().int().min(0),
  modelProfileId: z.string().uuid(),
  parameters: z
    .object({
      maxOutputTokens: z.number().int().positive().max(16_000),
      seed: z.number().int().nullable().default(null),
      temperature: z.number().min(0).max(2),
      timeoutSeconds: z.number().positive().max(600),
      topP: z.number().min(0).max(1),
    })
    .strict(),
  promptVersionId: z.string().uuid(),
  role: z.enum([
    "SINGLE_AGENT",
    "PLANNER",
    "MARKET_SPECIALIST",
    "FINANCE_SPECIALIST",
    "LEGAL_SPECIALIST",
    "RISK_SPECIALIST",
    "STRATEGY_SPECIALIST",
    "COORDINATOR",
    "CRITIC",
  ]),
});

const VARIANT_INPUT = z.object({
  ablationConfiguration: z.record(z.string(), z.unknown()).optional(),
  architecture: z.enum([
    "SINGLE_AGENT",
    "HOMOGENEOUS_MULTI_AGENT",
    "HETEROGENEOUS_MULTI_AGENT",
    "ABLATION",
  ]),
  assignments: z.array(ASSIGNMENT_INPUT).min(1).max(9),
  budgetConfiguration: z.record(z.string(), z.unknown()).default({}),
  code: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2_000).optional(),
  enabled: z.boolean().default(true),
  title: z.string().trim().min(1).max(200),
});

const EVIDENCE_INPUT = z.object({
  citationMappings: z.record(z.string(), z.unknown()).default({}),
  externalEvidence: z.array(z.record(z.string(), z.unknown())).max(100).default([]),
  internalEvidence: z.array(z.record(z.string(), z.unknown())).max(100).default([]),
  researchConfiguration: z.record(z.string(), z.unknown()).default({}),
  retrievalConfiguration: z.record(z.string(), z.unknown()).default({}),
  sourceMetadata: z.record(z.string(), z.unknown()).default({}),
  version: z.string().trim().min(1).max(100).default("v1"),
});

const RUN_INPUT = z.object({
  budgetProtocol: z.enum(["EQUAL_TOTAL_TOKEN_BUDGET", "PRODUCTION_DEFAULT_BUDGET"]),
  evaluationPolicy: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().uuid(),
  protocol: z.enum(["CONTROLLED_EVIDENCE", "END_TO_END"]),
  randomizationSeed: z.number().int(),
  repetitions: z.number().int().min(1).max(25),
  selectedVariantIds: z.array(z.string().uuid()).min(1).max(10),
  suiteVersionId: z.string().uuid(),
});

type BenchmarkCaseRunForExecution = Prisma.BenchmarkCaseRunGetPayload<{
  include: {
    benchmarkCase: true;
    evidencePackage: true;
    benchmarkVariant: {
      include: {
        assignments: {
          include: { modelProfile: true; promptVersion: true };
        };
      };
    };
  };
}>;

type BenchmarkRunEstimate = {
  estimatedCalls: number;
  estimatedCostMinorUnitsHigh: number | null;
  estimatedCostMinorUnitsLow: number | null;
  estimatedDurationSecondsHigh: number;
  estimatedDurationSecondsLow: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalCaseRuns: number;
  warnings: string[];
};

@Injectable()
export class BenchmarksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(QuotaService) private readonly quota: QuotaService,
    @Inject(AiServiceClient) private readonly aiService: AiServiceClient,
    @Inject(BenchmarkStatisticsService) private readonly statistics: BenchmarkStatisticsService,
    @Inject(MinioService) private readonly storage: MinioService,
    @InjectQueue("benchmarks") private readonly queue: Queue,
  ) {}

  async listModelProfiles(user: AuthenticatedUser): Promise<unknown[]> {
    this.requireAdmin(user);
    return this.prisma.modelProfile.findMany({
      include: { costProfile: true, localHardwareProfile: true },
      orderBy: [{ code: "asc" }, { version: "asc" }],
    });
  }

  listVariantTemplates(): typeof BUILT_IN_VARIANT_TEMPLATES {
    return BUILT_IN_VARIANT_TEMPLATES;
  }

  async createModelProfile(
    user: AuthenticatedUser,
    body: unknown,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const input = PROFILE_INPUT.parse(body);
    this.validateProfile(input);
    const profile = await this.prisma.modelProfile.create({
      data: {
        ...input,
        capabilities: input.capabilities,
        metadata: json(input.metadata),
        costProfileId: input.costProfileId ?? null,
        localHardwareProfileId: input.localHardwareProfileId ?? null,
        contextWindowTokens: input.contextWindowTokens ?? null,
        maximumOutputTokens: input.maximumOutputTokens ?? null,
      },
    });
    await this.auditEvent("model.profile.created", user, requestId, "ModelProfile", profile.id);
    return profile;
  }

  async updateModelProfile(
    user: AuthenticatedUser,
    id: string,
    body: unknown,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const profile = await this.prisma.modelProfile.findUnique({ where: { id } });
    if (!profile) throw this.notFound("Model profile");
    if (profile.usedAt) throw new ConflictException("A used model profile version is immutable");
    const input = PROFILE_INPUT.parse(body);
    this.validateProfile(input);
    const updated = await this.prisma.modelProfile.update({
      where: { id },
      data: {
        ...input,
        capabilities: input.capabilities,
        metadata: json(input.metadata),
        costProfileId: input.costProfileId ?? null,
        localHardwareProfileId: input.localHardwareProfileId ?? null,
        contextWindowTokens: input.contextWindowTokens ?? null,
        maximumOutputTokens: input.maximumOutputTokens ?? null,
      },
    });
    await this.auditEvent("model.profile.updated", user, requestId, "ModelProfile", id);
    return updated;
  }

  async healthCheckModelProfile(
    user: AuthenticatedUser,
    id: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const profile = await this.prisma.modelProfile.findUnique({ where: { id } });
    if (!profile) throw this.notFound("Model profile");
    const result = await this.aiService.healthCheckBenchmarkModel(
      {
        id: profile.id,
        provider: profile.provider,
        exactModelId: profile.exactModelId,
        family: profile.family,
        runtime: profile.runtime,
        capabilities: profile.capabilities,
        metadata: profile.metadata,
      },
      requestId,
    );
    await this.auditEvent("model.profile.health_checked", user, requestId, "ModelProfile", id);
    return result;
  }

  async modelProviderHealth(user: AuthenticatedUser, requestId: string): Promise<unknown[]> {
    this.requireAdmin(user);
    const profiles = await this.prisma.modelProfile.findMany({
      where: { active: true, benchmarkEligible: true },
      orderBy: [{ provider: "asc" }, { code: "asc" }],
    });
    return Promise.all(
      profiles.map(async (profile) => ({
        profile: { code: profile.code, displayName: profile.displayName, id: profile.id },
        result: await this.healthCheckModelProfile(user, profile.id, requestId),
      })),
    );
  }

  async listDatasets(user: AuthenticatedUser): Promise<unknown[]> {
    this.requireAdmin(user);
    return this.prisma.benchmarkDataset.findMany({
      include: { versions: true },
      orderBy: { code: "asc" },
    });
  }

  async createDataset(user: AuthenticatedUser, body: unknown, requestId: string): Promise<unknown> {
    this.requireAdmin(user);
    const input = DATASET_INPUT.parse(body);
    const dataset = await this.prisma.benchmarkDataset.create({
      data: {
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        domain: input.domain,
        createdById: user.id,
        versions: {
          create: {
            version: input.version,
            schemaVersion: "phase-11-v1",
            contentHash: hash({ cases: [], dataset: input }),
            createdById: user.id,
          },
        },
      },
      include: { versions: true },
    });
    await this.auditEvent(
      "benchmark.dataset.created",
      user,
      requestId,
      "BenchmarkDataset",
      dataset.id,
    );
    return dataset;
  }

  async addDatasetVersion(
    user: AuthenticatedUser,
    datasetId: string,
    body: unknown,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const input = DATASET_INPUT.parse(body);
    const dataset = await this.prisma.benchmarkDataset.findUnique({ where: { id: datasetId } });
    if (!dataset) throw this.notFound("Benchmark dataset");
    return this.prisma.benchmarkDatasetVersion.create({
      data: {
        datasetId,
        version: input.version,
        schemaVersion: "phase-11-v1",
        contentHash: hash({ cases: [], dataset: input }),
        createdById: user.id,
      },
    });
  }

  async listDatasetCases(user: AuthenticatedUser, versionId: string): Promise<unknown[]> {
    this.requireAdmin(user);
    return this.prisma.benchmarkCase.findMany({
      where: { datasetVersionId: versionId },
      orderBy: { code: "asc" },
    });
  }

  async addDatasetCase(
    user: AuthenticatedUser,
    versionId: string,
    body: unknown,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const version = await this.prisma.benchmarkDatasetVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw this.notFound("Benchmark dataset version");
    if (version.frozenAt) throw new ConflictException("Frozen dataset versions are immutable");
    const input = CASE_INPUT.parse(body);
    const result = await this.prisma.$transaction(async (tx) => {
      const testCase = await tx.benchmarkCase.create({
        data: {
          ...input,
          datasetVersionId: versionId,
          goldCitationMappings: input.goldCitationMappings
            ? json(input.goldCitationMappings)
            : undefined,
        },
      });
      const cases = await tx.benchmarkCase.findMany({
        where: { datasetVersionId: versionId },
        orderBy: { code: "asc" },
      });
      await tx.benchmarkDatasetVersion.update({
        where: { id: versionId },
        data: { caseCount: cases.length, contentHash: hash(cases.map(caseHashShape)) },
      });
      return testCase;
    });
    return result;
  }

  async freezeDatasetVersion(
    user: AuthenticatedUser,
    versionId: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const version = await this.prisma.benchmarkDatasetVersion.findUnique({
      where: { id: versionId },
      include: { cases: { include: { evidencePackages: true }, orderBy: { code: "asc" } } },
    });
    if (!version) throw this.notFound("Benchmark dataset version");
    if (!version.cases.length)
      throw new BadRequestException("A benchmark dataset needs at least one case");
    const frozen = await this.prisma.benchmarkDatasetVersion.update({
      where: { id: versionId },
      data: {
        frozenAt: version.frozenAt ?? new Date(),
        contentHash: hash(version.cases.map(caseHashShape)),
      },
    });
    await this.auditEvent(
      "benchmark.dataset.frozen",
      user,
      requestId,
      "BenchmarkDatasetVersion",
      versionId,
    );
    return frozen;
  }

  async addEvidencePackage(
    user: AuthenticatedUser,
    caseId: string,
    body: unknown,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const input = EVIDENCE_INPUT.parse(body);
    const testCase = await this.prisma.benchmarkCase.findUnique({
      where: { id: caseId },
      include: { datasetVersion: true },
    });
    if (!testCase) throw this.notFound("Benchmark case");
    if (testCase.datasetVersion.frozenAt)
      throw new ConflictException("Frozen dataset evidence is immutable");
    const payload = { ...input, benchmarkCaseId: caseId, protocol: "CONTROLLED_EVIDENCE" as const };
    return this.prisma.benchmarkEvidencePackage.create({
      data: {
        ...payload,
        contentHash: hash(payload),
        citationMappings: json(input.citationMappings),
        internalEvidence: json(input.internalEvidence),
        externalEvidence: json(input.externalEvidence),
        sourceMetadata: json(input.sourceMetadata),
        retrievalConfiguration: json(input.retrievalConfiguration),
        researchConfiguration: json(input.researchConfiguration),
      },
    });
  }

  async listSuites(user: AuthenticatedUser): Promise<unknown[]> {
    return this.prisma.benchmarkSuite.findMany({
      where: { project: { members: { some: { userId: user.id } } } },
      include: {
        datasetVersion: true,
        variants: { include: { assignments: true } },
        _count: { select: { runs: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createSuite(user: AuthenticatedUser, body: unknown, requestId: string): Promise<unknown> {
    this.requireEnabled();
    const input = SUITE_INPUT.parse(body);
    await this.requireProjectEditor(input.projectId, user.id);
    const datasetVersion = await this.prisma.benchmarkDatasetVersion.findUnique({
      where: { id: input.datasetVersionId },
    });
    if (!datasetVersion) throw this.notFound("Benchmark dataset version");
    const rubric = await this.defaultRubric();
    const suite = await this.prisma.benchmarkSuite.create({
      data: {
        ...input,
        description: input.description ?? null,
        defaultEvaluationRubricId: rubric.id,
        statisticalPlan: { correction: "HOLM", confidenceInterval: "BOOTSTRAP_95" },
        createdById: user.id,
      },
    });
    await this.auditEvent(
      "benchmark.suite.created",
      user,
      requestId,
      "BenchmarkSuite",
      suite.id,
      input.projectId,
    );
    return suite;
  }

  async getSuite(user: AuthenticatedUser, id: string): Promise<unknown> {
    return this.requireSuite(id, user, false, {
      datasetVersion: { include: { cases: true } },
      variants: {
        include: { assignments: { include: { modelProfile: true, promptVersion: true } } },
      },
    });
  }

  async updateSuite(user: AuthenticatedUser, id: string, body: unknown): Promise<unknown> {
    const suite = await this.requireSuite(id, user, true);
    if (suite.frozenAt) throw new ConflictException("Frozen suite versions are immutable");
    const input = z
      .object({
        description: z.string().trim().max(2_000).nullable().optional(),
        title: z.string().trim().min(1).max(200).optional(),
      })
      .parse(body);
    return this.prisma.benchmarkSuite.update({ where: { id }, data: input });
  }

  async addVariant(
    user: AuthenticatedUser,
    suiteId: string,
    body: unknown,
    requestId: string,
  ): Promise<unknown> {
    const suite = await this.requireSuite(suiteId, user, true);
    if (suite.frozenAt) throw new ConflictException("Frozen suite versions are immutable");
    const input = VARIANT_INPUT.parse(body);
    if (input.assignments.length > this.config.getOrThrow<number>("benchmark.maxVariants")) {
      throw new BadRequestException("Too many role assignments");
    }
    await this.validateAssignments(input.architecture, input.assignments);
    const variant = await this.prisma.benchmarkVariant.create({
      data: {
        suiteId,
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        architecture: input.architecture,
        ablationConfiguration: input.ablationConfiguration
          ? json(input.ablationConfiguration)
          : undefined,
        budgetConfiguration: json(input.budgetConfiguration),
        enabled: input.enabled,
        contentHash: hash(input),
        assignments: {
          create: input.assignments.map((assignment) => ({
            ...assignment,
            parameters: json(assignment.parameters),
          })),
        },
      },
      include: { assignments: true },
    });
    await this.auditEvent(
      "benchmark.variant.created",
      user,
      requestId,
      "BenchmarkVariant",
      variant.id,
      suite.projectId,
    );
    return variant;
  }

  async freezeSuite(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const suite = await this.requireSuite(id, user, true, {
      datasetVersion: true,
      variants: { include: { assignments: true } },
    });
    if (!suite.datasetVersion?.frozenAt)
      throw new BadRequestException("Dataset version must be frozen first");
    if (!suite.variants.length) throw new BadRequestException("Suite needs at least one variant");
    for (const variant of suite.variants) {
      await this.validateAssignments(
        variant.architecture,
        variant.assignments.map(toAssignmentInput),
      );
    }
    const timestamp = suite.frozenAt ?? new Date();
    await this.prisma.$transaction([
      this.prisma.benchmarkVariant.updateMany({
        where: { suiteId: id },
        data: { frozenAt: timestamp },
      }),
      this.prisma.benchmarkSuite.update({
        where: { id },
        data: { frozenAt: timestamp, status: BenchmarkSuiteStatus.READY },
      }),
    ]);
    await this.auditEvent(
      "benchmark.suite.frozen",
      user,
      requestId,
      "BenchmarkSuite",
      id,
      suite.projectId,
    );
    return this.getSuite(user, id);
  }

  async cloneSuite(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const suite = await this.requireSuite(id, user, false, {
      variants: { include: { assignments: true } },
    });
    const code = `${suite.code}-clone-${Date.now()}`.slice(0, 100);
    const clone = await this.prisma.benchmarkSuite.create({
      data: {
        projectId: suite.projectId,
        datasetVersionId: suite.datasetVersionId,
        code,
        version: "v1",
        title: `${suite.title} (clone)`,
        description: suite.description,
        researchQuestions: json(suite.researchQuestions),
        hypotheses: json(suite.hypotheses),
        domain: suite.domain,
        defaultEvaluationRubricId: suite.defaultEvaluationRubricId,
        statisticalPlan: json(suite.statisticalPlan),
        createdById: user.id,
        variants: {
          create: suite.variants.map((variant) => ({
            code: variant.code,
            title: variant.title,
            description: variant.description,
            architecture: variant.architecture,
            ablationConfiguration: variant.ablationConfiguration
              ? json(variant.ablationConfiguration)
              : undefined,
            budgetConfiguration: json(variant.budgetConfiguration),
            enabled: variant.enabled,
            contentHash: variant.contentHash,
            assignments: {
              create: variant.assignments.map((assignment) => ({
                enabled: assignment.enabled,
                executionOrder: assignment.executionOrder,
                modelProfileId: assignment.modelProfileId,
                parameters: json(assignment.parameters),
                promptVersionId: assignment.promptVersionId,
                role: assignment.role,
              })),
            },
          })),
        },
      },
    });
    await this.auditEvent(
      "benchmark.suite.created",
      user,
      requestId,
      "BenchmarkSuite",
      clone.id,
      suite.projectId,
    );
    return clone;
  }

  async estimateRun(user: AuthenticatedUser, body: unknown, requestId: string): Promise<unknown> {
    const input = RUN_INPUT.parse(body);
    const plan = await this.resolveRunPlan(user, input);
    const estimate = this.estimate(plan);
    await this.auditEvent(
      "benchmark.run.estimated",
      user,
      requestId,
      "BenchmarkSuite",
      plan.suite.id,
      plan.suite.projectId,
    );
    return estimate;
  }

  async createRun(user: AuthenticatedUser, body: unknown, requestId: string): Promise<unknown> {
    this.requireEnabled();
    const input = RUN_INPUT.parse(body);
    const existing = await this.prisma.benchmarkRun.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const plan = await this.resolveRunPlan(user, input);
    const estimate = this.estimate(plan);
    if (estimate.totalCaseRuns > this.config.getOrThrow<number>("benchmark.maxCaseRuns")) {
      throw new BadRequestException("Benchmark exceeds maximum case runs");
    }
    if (
      estimate.estimatedCostMinorUnitsHigh !== null &&
      estimate.estimatedCostMinorUnitsHigh >
        this.config.getOrThrow<number>("benchmark.maxEstimatedCostMinor")
    ) {
      throw new BadRequestException("Benchmark estimated cost exceeds the configured guard");
    }
    const role = await this.projectRole(plan.suite.id, user.id);
    if (user.globalRole !== "ADMIN" && role !== ProjectMemberRole.OWNER) {
      throw new ForbiddenException("Only a project owner may start a benchmark run");
    }
    await this.quota.assertFeature({
      feature: "benchmarkExecutionAvailable",
      projectId: plan.suite.projectId,
      userId: user.id,
    });
    const providers = new Set(
      plan.variants.flatMap((variant) =>
        variant.assignments
          .filter((assignment) => assignment.enabled)
          .map((assignment) => assignment.modelProfile.provider),
      ),
    );
    if (providers.has(ModelProviderCode.OPENAI) || providers.has(ModelProviderCode.ANTHROPIC)) {
      await this.quota.assertFeature({
        feature: "externalProviderBenchmarkAvailable",
        projectId: plan.suite.projectId,
        userId: user.id,
      });
    }
    if (providers.has(ModelProviderCode.OLLAMA)) {
      await this.quota.assertFeature({
        feature: "localModelBenchmarkAvailable",
        projectId: plan.suite.projectId,
        userId: user.id,
      });
    }
    if (plan.variants.some((variant) => variant.architecture === "HETEROGENEOUS_MULTI_AGENT")) {
      await this.quota.assertFeature({
        feature: "heterogeneousBenchmarkAvailable",
        projectId: plan.suite.projectId,
        userId: user.id,
      });
    }
    if (objectValue(input.evaluationPolicy, "humanEvaluation")["enabled"] === true) {
      await this.quota.assertFeature({
        feature: "humanEvaluationAvailable",
        projectId: plan.suite.projectId,
        userId: user.id,
      });
    }
    const runId = randomUUID();
    await this.quota.reserve({
      metric: "monthlyBenchmarkRuns",
      projectId: plan.suite.projectId,
      quantity: 1,
      resourceId: runId,
      scope: "project",
      userId: user.id,
    });
    const environment = await this.captureEnvironment();
    const order = shuffled(
      plan.cases.flatMap((testCase) =>
        plan.variants.flatMap((variant) =>
          Array.from({ length: input.repetitions }, (_, repetitionIndex) => ({
            caseId: testCase.id,
            repetitionIndex: repetitionIndex + 1,
            variantId: variant.id,
          })),
        ),
      ),
      input.randomizationSeed,
    );
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.benchmarkRun.create({
        data: {
          id: runId,
          suiteId: plan.suite.id,
          datasetVersionId: plan.suite.datasetVersionId ?? plan.datasetVersion.id,
          status: BenchmarkRunStatus.QUEUED,
          protocol: input.protocol,
          budgetProtocol: input.budgetProtocol,
          repetitions: input.repetitions,
          randomizationSeed: input.randomizationSeed,
          judgePolicyId: plan.judgePolicyId,
          environmentSnapshotId: environment.id,
          startedById: user.id,
          idempotencyKey: input.idempotencyKey,
          executionPlan: json({ order }),
          evaluationPolicy: json(input.evaluationPolicy),
          estimatedCostMinorUnits:
            estimate.estimatedCostMinorUnitsHigh === null
              ? null
              : BigInt(estimate.estimatedCostMinorUnitsHigh),
          currency: this.config.getOrThrow<string>("benchmark.defaultCurrency"),
          workingTreeDirty: environment.workingTreeDirty,
          caseRuns: {
            create: order.map((item, index) => ({
              benchmarkCaseId: item.caseId,
              benchmarkVariantId: item.variantId,
              repetitionIndex: item.repetitionIndex,
              executionOrder: index,
              evidencePackageId:
                input.protocol === "CONTROLLED_EVIDENCE"
                  ? plan.evidenceByCase.get(item.caseId)?.id
                  : undefined,
            })),
          },
        },
      });
      await tx.benchmarkSuite.update({
        where: { id: plan.suite.id },
        data: { status: BenchmarkSuiteStatus.RUNNING },
      });
      await tx.modelProfile.updateMany({
        where: { id: { in: plan.profileIds } },
        data: { usedAt: new Date() },
      });
      return created;
    });
    await this.queue.add(
      "execute",
      { benchmarkRunId: run.id, requestId },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        jobId: `benchmark-run-${run.id}`,
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    );
    await this.auditEvent(
      "benchmark.run.created",
      user,
      requestId,
      "BenchmarkRun",
      run.id,
      plan.suite.projectId,
    );
    return {
      id: run.id,
      status: run.status,
      totalCaseRuns: estimate.totalCaseRuns,
      estimate,
    };
  }

  async listRuns(user: AuthenticatedUser): Promise<unknown[]> {
    const memberships = await this.prisma.projectMember.findMany({
      select: { projectId: true },
      where: { userId: user.id },
    });
    const projectIds = memberships.map((membership) => membership.projectId);

    if (projectIds.length === 0) return [];

    return this.prisma.benchmarkRun.findMany({
      where: { suite: { projectId: { in: projectIds } } },
      select: {
        createdAt: true,
        id: true,
        protocol: true,
        repetitions: true,
        status: true,
        suite: { select: { code: true, title: true, version: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getRun(user: AuthenticatedUser, id: string): Promise<unknown> {
    await this.requireRun(id, user);
    return this.prisma.benchmarkRun.findUniqueOrThrow({
      where: { id },
      select: {
        budgetProtocol: true,
        id: true,
        protocol: true,
        randomizationSeed: true,
        repetitions: true,
        status: true,
        suite: { select: { code: true, title: true, version: true } },
      },
    });
  }

  async pauseRun(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const run = await this.requireRun(id, user);
    if (!canUpdateProject(await this.projectRole(run.suiteId, user.id)))
      throw this.notFound("Benchmark run");
    const updated = await this.prisma.benchmarkRun.update({
      where: { id },
      data: { pauseRequested: true, status: BenchmarkRunStatus.PAUSED },
    });
    await this.auditEvent("benchmark.run.paused", user, requestId, "BenchmarkRun", id);
    return updated;
  }

  async resumeRun(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const run = await this.requireRun(id, user);
    if (!canUpdateProject(await this.projectRole(run.suiteId, user.id)))
      throw this.notFound("Benchmark run");
    const updated = await this.prisma.benchmarkRun.update({
      where: { id },
      data: { pauseRequested: false, status: BenchmarkRunStatus.QUEUED },
    });
    await this.queue.add(
      "execute",
      { benchmarkRunId: id, requestId },
      { jobId: `benchmark-run-${id}-${Date.now()}`, removeOnComplete: 1_000, removeOnFail: 1_000 },
    );
    await this.auditEvent("benchmark.run.resumed", user, requestId, "BenchmarkRun", id);
    return updated;
  }

  async cancelRun(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const run = await this.requireRun(id, user);
    if (!canUpdateProject(await this.projectRole(run.suiteId, user.id)))
      throw this.notFound("Benchmark run");
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.benchmarkCaseRun.updateMany({
        where: { benchmarkRunId: id, status: BenchmarkCaseRunStatus.QUEUED },
        data: { status: BenchmarkCaseRunStatus.CANCELLED, completedAt: new Date() },
      });
      return tx.benchmarkRun.update({
        where: { id },
        data: {
          cancellationRequested: true,
          cancelledAt: new Date(),
          status: BenchmarkRunStatus.CANCELLED,
        },
      });
    });
    await this.auditEvent("benchmark.run.cancelled", user, requestId, "BenchmarkRun", id);
    return updated;
  }

  async retryFailed(user: AuthenticatedUser, id: string, requestId: string): Promise<unknown> {
    const run = await this.requireRun(id, user);
    if (!canUpdateProject(await this.projectRole(run.suiteId, user.id)))
      throw this.notFound("Benchmark run");
    const result = await this.prisma.benchmarkCaseRun.updateMany({
      where: { benchmarkRunId: id, status: BenchmarkCaseRunStatus.FAILED },
      data: {
        status: BenchmarkCaseRunStatus.QUEUED,
        attempt: { increment: 1 },
        failureCode: null,
        failureMessage: null,
      },
    });
    await this.prisma.benchmarkRun.update({
      where: { id },
      data: { status: BenchmarkRunStatus.QUEUED, cancellationRequested: false },
    });
    await this.queue.add(
      "execute",
      { benchmarkRunId: id, requestId },
      { jobId: `benchmark-run-${id}-${Date.now()}`, removeOnComplete: 1_000, removeOnFail: 1_000 },
    );
    return { queued: result.count };
  }

  async listCaseRuns(user: AuthenticatedUser, runId: string): Promise<unknown[]> {
    await this.requireRun(runId, user);
    const caseRuns = await this.prisma.benchmarkCaseRun.findMany({
      where: { benchmarkRunId: runId },
      include: {
        benchmarkCase: true,
        benchmarkVariant: true,
        evidencePackage: true,
        evaluations: true,
        invocations: true,
      },
      orderBy: { executionOrder: "asc" },
    });
    return caseRuns.map(jsonSerializable);
  }

  async results(user: AuthenticatedUser, runId: string): Promise<unknown> {
    await this.requireRun(runId, user);
    const records = await this.prisma.benchmarkCaseRun.findMany({
      where: { benchmarkRunId: runId },
      select: {
        benchmarkVariantId: true,
        evaluations: { select: { metrics: true, score: true } },
        latencyMs: true,
        status: true,
        totalCostMinorUnits: true,
      },
    });
    return {
      completedRuns: records.filter((item) => item.status === BenchmarkCaseRunStatus.COMPLETED)
        .length,
      failedRuns: records.filter((item) => item.status === BenchmarkCaseRunStatus.FAILED).length,
      intentionToRun: aggregateResult(records, false),
      completedOnly: aggregateResult(records, true),
    };
  }

  async statisticsForRun(user: AuthenticatedUser, runId: string): Promise<unknown[]> {
    await this.requireRun(runId, user);
    return this.prisma.statisticalComparison.findMany({
      where: { benchmarkRunId: runId },
      orderBy: [{ metric: "asc" }, { createdAt: "asc" }],
    });
  }

  async listHumanTasks(user: AuthenticatedUser): Promise<unknown[]> {
    return this.prisma.humanEvaluationTask.findMany({
      where: {
        OR: [
          { assignedEvaluatorId: user.id },
          {
            benchmarkRun: {
              suite: {
                project: { members: { some: { userId: user.id, role: ProjectMemberRole.OWNER } } },
              },
            },
          },
        ],
      },
      include: { benchmarkCase: true, leftCaseRun: true, rightCaseRun: true, rubric: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async startHumanTask(user: AuthenticatedUser, taskId: string): Promise<unknown> {
    const task = await this.requireHumanTask(taskId, user);
    return this.prisma.humanEvaluationTask.update({
      where: { id: task.id },
      data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? new Date() },
    });
  }

  async submitHumanTask(
    user: AuthenticatedUser,
    taskId: string,
    body: unknown,
    requestId: string,
  ): Promise<unknown> {
    const task = await this.requireHumanTask(taskId, user);
    if (task.status === "INVALIDATED")
      throw new ConflictException("Evaluation task is invalidated");
    const input = z
      .object({
        confidence: z.number().int().min(1).max(5),
        criterionScores: z.record(z.string(), z.number().min(1).max(5)),
        notes: z.string().trim().max(4_000).optional(),
        preferredOutput: z.enum(["LEFT", "RIGHT", "TIE", "CANNOT_EVALUATE"]),
      })
      .parse(body);
    const existing = await this.prisma.benchmarkHumanEvaluation.findUnique({
      where: { taskId_evaluatorId: { taskId, evaluatorId: user.id } },
    });
    if (existing) throw new ConflictException("Evaluation was already submitted");
    const evaluation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.benchmarkHumanEvaluation.create({
        data: {
          taskId,
          evaluatorId: user.id,
          ...input,
          criterionScores: json(input.criterionScores),
          startedAt: task.startedAt ?? new Date(),
          completedAt: new Date(),
        },
      });
      await tx.humanEvaluationTask.update({
        where: { id: taskId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return created;
    });
    await this.auditEvent(
      "benchmark.human.evaluation.submitted",
      user,
      requestId,
      "HumanEvaluationTask",
      taskId,
    );
    return evaluation;
  }

  async skipHumanTask(user: AuthenticatedUser, taskId: string): Promise<unknown> {
    await this.requireHumanTask(taskId, user);
    return this.prisma.humanEvaluationTask.update({
      where: { id: taskId },
      data: { status: "SKIPPED", completedAt: new Date() },
    });
  }

  async invalidateHumanTask(
    user: AuthenticatedUser,
    taskId: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const task = await this.prisma.humanEvaluationTask.findUnique({ where: { id: taskId } });
    if (!task) throw this.notFound("Human evaluation task");
    const result = await this.prisma.humanEvaluationTask.update({
      where: { id: taskId },
      data: { status: "INVALIDATED", invalidatedAt: new Date() },
    });
    await this.auditEvent(
      "benchmark.human.task.assigned",
      user,
      requestId,
      "HumanEvaluationTask",
      taskId,
    );
    return result;
  }

  async assignHumanTask(
    user: AuthenticatedUser,
    taskId: string,
    evaluatorId: string,
    requestId: string,
  ): Promise<unknown> {
    this.requireAdmin(user);
    const task = await this.prisma.humanEvaluationTask.update({
      where: { id: taskId },
      data: { assignedEvaluatorId: evaluatorId },
    });
    await this.auditEvent(
      "benchmark.human.task.assigned",
      user,
      requestId,
      "HumanEvaluationTask",
      taskId,
    );
    return task;
  }

  async requestReproducibilityExport(
    user: AuthenticatedUser,
    runId: string,
    requestId: string,
  ): Promise<unknown> {
    await this.requireRun(runId, user);
    const manifest = await this.reproducibilityManifest(runId);
    const artifact = await this.prisma.reproducibilityArtifact.create({
      data: { benchmarkRunId: runId, manifestHash: hash(manifest), status: "GENERATING" },
    });
    try {
      const archive = await this.reproducibilityArchive(runId, manifest);
      const objectKey = `benchmarks/reproducibility/${runId}/${artifact.id}.zip`;
      const expiresAt = new Date(
        Date.now() +
          this.config.getOrThrow<number>("benchmark.artifactRetentionDays") * 24 * 60 * 60 * 1_000,
      );
      await this.storage.putObject({
        body: archive,
        bucket: this.config.getOrThrow<string>("benchmark.reproducibilityBucket"),
        contentType: "application/zip",
        key: objectKey,
      });
      const completed = await this.prisma.reproducibilityArtifact.update({
        where: { id: artifact.id },
        data: {
          byteSize: archive.byteLength,
          checksum: createHash("sha256").update(archive).digest("hex"),
          completedAt: new Date(),
          expiresAt,
          objectKey,
          status: "COMPLETED",
        },
      });
      await this.auditEvent(
        "benchmark.reproducibility.requested",
        user,
        requestId,
        "BenchmarkRun",
        runId,
      );
      return {
        ...completed,
        download: this.storage.createDownloadUrl(
          objectKey,
          this.config.getOrThrow<string>("benchmark.reproducibilityBucket"),
        ),
      };
    } catch (error) {
      await this.prisma.reproducibilityArtifact.update({
        where: { id: artifact.id },
        data: { failureCode: "ARCHIVE_GENERATION_FAILED", status: "FAILED" },
      });
      throw error;
    }
  }

  async getReproducibilityDownload(
    user: AuthenticatedUser,
    runId: string,
    artifactId: string,
  ): Promise<unknown> {
    await this.requireRun(runId, user);
    const artifact = await this.prisma.reproducibilityArtifact.findFirst({
      where: { benchmarkRunId: runId, id: artifactId },
    });
    if (!artifact) throw this.notFound("Reproducibility artifact");
    if (artifact.status !== "COMPLETED" || !artifact.objectKey) {
      throw new ConflictException("The reproducibility export is not available");
    }
    if (artifact.expiresAt && artifact.expiresAt <= new Date()) {
      await this.prisma.reproducibilityArtifact.update({
        where: { id: artifact.id },
        data: { status: "EXPIRED" },
      });
      throw new ConflictException("The reproducibility export has expired");
    }
    return {
      artifactId: artifact.id,
      checksum: artifact.checksum,
      byteSize: artifact.byteSize,
      download: this.storage.createDownloadUrl(
        artifact.objectKey,
        this.config.getOrThrow<string>("benchmark.reproducibilityBucket"),
      ),
    };
  }

  private async reproducibilityArchive(
    runId: string,
    manifest: Record<string, unknown>,
  ): Promise<Buffer> {
    const [caseRuns, comparisons] = await Promise.all([
      this.prisma.benchmarkCaseRun.findMany({
        where: { benchmarkRunId: runId },
        include: {
          evaluations: true,
          invocations: {
            select: {
              agentRole: true,
              cachedTokens: true,
              currency: true,
              estimatedCostMinorUnits: true,
              exactModelId: true,
              finishReason: true,
              inputTokens: true,
              latencyMs: true,
              outputTokens: true,
              parameters: true,
              provider: true,
              requestHash: true,
              responseHash: true,
              status: true,
            },
          },
        },
        orderBy: { executionOrder: "asc" },
      }),
      this.prisma.statisticalComparison.findMany({
        where: { benchmarkRunId: runId },
        orderBy: [{ metric: "asc" }, { leftVariantId: "asc" }, { rightVariantId: "asc" }],
      }),
    ]);
    const caseRunExport = caseRuns.map((caseRun) => ({
      benchmarkCaseId: caseRun.benchmarkCaseId,
      benchmarkVariantId: caseRun.benchmarkVariantId,
      completedAt: caseRun.completedAt,
      executionOrder: caseRun.executionOrder,
      failureCode: caseRun.failureCode,
      output: caseRun.outputSnapshot,
      resultHash: caseRun.resultHash,
      repetitionIndex: caseRun.repetitionIndex,
      status: caseRun.status,
      usage: {
        currency: caseRun.currency,
        latencyMs: caseRun.latencyMs,
        totalCostMinorUnits: caseRun.totalCostMinorUnits,
        totalInputTokens: caseRun.totalInputTokens,
        totalOutputTokens: caseRun.totalOutputTokens,
        totalProviderCalls: caseRun.totalProviderCalls,
      },
      invocations: caseRun.invocations,
      evaluations: caseRun.evaluations,
    }));
    return zipArchive([
      { name: "manifest.json", value: manifest },
      { name: "case-runs.json", value: caseRunExport },
      { name: "statistical-comparisons.json", value: comparisons },
      {
        name: "README.txt",
        value:
          "Phase 11 reproducibility archive. Outputs are structured decision artifacts; provider prompts, raw provider payloads, chain-of-thought, and secrets are deliberately excluded.\n",
      },
    ]);
  }

  async reproducibilityManifest(runId: string): Promise<Record<string, unknown>> {
    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id: runId },
      include: {
        suite: {
          include: {
            datasetVersion: { include: { cases: { include: { evidencePackages: true } } } },
            variants: {
              include: {
                assignments: {
                  include: {
                    modelProfile: { include: { costProfile: true, localHardwareProfile: true } },
                    promptVersion: true,
                  },
                },
              },
            },
          },
        },
        environmentSnapshot: true,
        caseRuns: {
          select: {
            benchmarkCaseId: true,
            benchmarkVariantId: true,
            repetitionIndex: true,
            executionOrder: true,
            evidencePackageId: true,
          },
        },
      },
    });
    if (!run) throw this.notFound("Benchmark run");
    return {
      schemaVersion: "phase-11-v1",
      suite: {
        id: run.suite.id,
        code: run.suite.code,
        version: run.suite.version,
        frozenAt: run.suite.frozenAt?.toISOString() ?? null,
      },
      dataset: {
        id: run.datasetVersionId,
        contentHash: run.suite.datasetVersion?.contentHash ?? null,
      },
      evidenceHashes:
        run.suite.datasetVersion?.cases.flatMap((testCase) =>
          testCase.evidencePackages.map((item) => item.contentHash),
        ) ?? [],
      variants: run.suite.variants.map((variant) => ({
        code: variant.code,
        contentHash: variant.contentHash,
        assignments: variant.assignments.map((assignment) => ({
          role: assignment.role,
          exactModelId: assignment.modelProfile.exactModelId,
          provider: assignment.modelProfile.provider,
          family: assignment.modelProfile.family,
          runtime: assignment.modelProfile.runtime,
          modelMetadata: assignment.modelProfile.metadata,
          promptHash: assignment.promptVersion.templateHash,
          promptSchemaVersion: assignment.promptVersion.schemaVersion,
          parameters: assignment.parameters,
          costProfileVersion: assignment.modelProfile.costProfile?.version ?? null,
          localHardwareProfile: assignment.modelProfile.localHardwareProfile?.code ?? null,
        })),
      })),
      protocol: run.protocol,
      budgetProtocol: run.budgetProtocol,
      randomizationSeed: run.randomizationSeed,
      repetitions: run.repetitions,
      executionOrder: run.caseRuns,
      environment: run.environmentSnapshot,
      knownLimitations: [
        "Cloud providers may change backend behaviour and do not guarantee exact determinism.",
        "Provider token accounting and cost estimates are not directly interchangeable.",
        "Ollama is a local runtime; the model family, exact ID, digest, size, and quantization determine local results.",
      ],
    };
  }

  async getReproducibilityManifest(
    user: AuthenticatedUser,
    runId: string,
  ): Promise<Record<string, unknown>> {
    await this.requireRun(runId, user);
    return this.reproducibilityManifest(runId);
  }

  async execute(benchmarkRunId: string, requestId: string): Promise<void> {
    const run = await this.prisma.benchmarkRun.findUnique({ where: { id: benchmarkRunId } });
    if (
      !run ||
      run.status === BenchmarkRunStatus.COMPLETED ||
      run.status === BenchmarkRunStatus.CANCELLED
    )
      return;
    if (run.pauseRequested || run.cancellationRequested) return;
    await this.prisma.benchmarkRun.update({
      where: { id: benchmarkRunId },
      data: { status: BenchmarkRunStatus.RUNNING, startedAt: run.startedAt ?? new Date() },
    });
    await this.audit.record({
      action: "benchmark.run.started",
      entityType: "BenchmarkRun",
      entityId: benchmarkRunId,
      requestId,
    });
    const queued = await this.prisma.benchmarkCaseRun.findMany({
      where: { benchmarkRunId, status: BenchmarkCaseRunStatus.QUEUED },
      include: {
        benchmarkCase: true,
        evidencePackage: true,
        benchmarkVariant: {
          include: { assignments: { include: { modelProfile: true, promptVersion: true } } },
        },
      },
      orderBy: { executionOrder: "asc" },
    });
    for (const caseRun of queued) {
      const state = await this.prisma.benchmarkRun.findUniqueOrThrow({
        where: { id: benchmarkRunId },
        select: { cancellationRequested: true, pauseRequested: true },
      });
      if (state.cancellationRequested || state.pauseRequested) return;
      await this.executeCaseRun(caseRun, run.protocol, requestId);
    }
    const remaining = await this.prisma.benchmarkCaseRun.count({
      where: { benchmarkRunId, status: BenchmarkCaseRunStatus.QUEUED },
    });
    if (remaining) return;
    await this.aggregate(benchmarkRunId, requestId);
  }

  private async executeCaseRun(
    caseRun: BenchmarkCaseRunForExecution,
    protocol: "CONTROLLED_EVIDENCE" | "END_TO_END",
    requestId: string,
  ): Promise<void> {
    const started = Date.now();
    await this.prisma.benchmarkCaseRun.update({
      where: { id: caseRun.id },
      data: { status: BenchmarkCaseRunStatus.RUNNING, startedAt: new Date() },
    });
    await this.audit.record({
      action: "benchmark.case.started",
      entityType: "BenchmarkCaseRun",
      entityId: caseRun.id,
      requestId,
    });
    try {
      const evidence =
        caseRun.evidencePackage ?? (await this.createEndToEndEvidence(caseRun.benchmarkCase));
      const payload = {
        benchmarkRunId: caseRun.benchmarkRunId,
        caseRunId: caseRun.id,
        protocol,
        case: {
          code: stringValue(caseRun.benchmarkCase, "code"),
          question: stringValue(caseRun.benchmarkCase, "question"),
          scenario: stringValue(caseRun.benchmarkCase, "scenario"),
          objectives: stringArray(caseRun.benchmarkCase, "objectives"),
          constraints: stringArray(caseRun.benchmarkCase, "constraints"),
          assumptions: stringArray(caseRun.benchmarkCase, "assumptions"),
        },
        evidencePackage: evidence,
        assignments: caseRun.benchmarkVariant.assignments.map((assignment) => ({
          role: assignment.role,
          modelProfile: {
            id: assignment.modelProfileId,
            provider: assignment.modelProfile.provider,
            exactModelId: stringValue(assignment.modelProfile, "exactModelId"),
            family: stringValue(assignment.modelProfile, "family"),
            runtime: assignment.modelProfile.runtime,
            capabilities: objectValue(assignment.modelProfile, "capabilities"),
            metadata: objectValue(assignment.modelProfile, "metadata"),
          },
          promptVersionId: assignment.promptVersionId,
          promptHash: stringValue(assignment.promptVersion, "templateHash"),
          ...assignmentParameters(assignment.parameters),
          enabled: assignment.enabled,
          order: assignment.executionOrder,
        })),
        requestId,
      };
      const response = objectValue(await this.aiService.executeBenchmarkCase(payload, requestId));
      const invocations = arrayValue(response, "invocations");
      const metrics = objectValue(response, "metrics");
      const output = objectValue(response, "output");
      const profileByRole = new Map<
        BenchmarkAgentRole,
        { modelProfileId: string; promptVersionId: string; parameters: Prisma.JsonValue }
      >(caseRun.benchmarkVariant.assignments.map((assignment) => [assignment.role, assignment]));
      const invocationRows = invocations.map((value, index) =>
        invocationData(value, caseRun.id, index, profileByRole),
      );
      const totals = invocationTotals(invocationRows);
      await this.prisma.$transaction(async (tx) => {
        for (const row of invocationRows) {
          await tx.modelInvocation.upsert({
            where: {
              benchmarkCaseRunId_sequenceIndex: {
                benchmarkCaseRunId: caseRun.id,
                sequenceIndex: row.sequenceIndex,
              },
            },
            create: row,
            update: row,
          });
        }
        await tx.automaticEvaluation.create({
          data: {
            benchmarkCaseRunId: caseRun.id,
            evaluatorType: "RULE_BASED",
            evaluatorVersion: "phase-11-v1",
            metrics: json(metrics),
            score: structuralScore(metrics),
            rawResultHash: hash(output),
            status: AutomaticEvaluationStatus.COMPLETED,
          },
        });
        await tx.benchmarkCaseRun.update({
          where: { id: caseRun.id },
          data: {
            status: BenchmarkCaseRunStatus.COMPLETED,
            outputSnapshot: json({
              output,
              draft: response["draft"],
              critique: response["critique"],
              warnings: response["warnings"],
            }),
            completedAt: new Date(),
            latencyMs: Date.now() - started,
            totalProviderCalls: invocationRows.length,
            totalInputTokens: totals.inputTokens,
            totalOutputTokens: totals.outputTokens,
            totalCachedTokens: totals.cachedTokens,
            totalCostMinorUnits: totals.costMinor,
            currency: this.config.getOrThrow<string>("benchmark.defaultCurrency"),
            resultHash: hash(output),
          },
        });
      });
      await this.audit.record({
        action: "benchmark.case.completed",
        entityType: "BenchmarkCaseRun",
        entityId: caseRun.id,
        requestId,
      });
    } catch (error) {
      await this.prisma.benchmarkCaseRun.update({
        where: { id: caseRun.id },
        data: {
          status: BenchmarkCaseRunStatus.FAILED,
          completedAt: new Date(),
          failureCode: "BENCHMARK_CASE_FAILED",
          failureMessage: safeError(error),
        },
      });
      await this.audit.record({
        action: "benchmark.case.failed",
        entityType: "BenchmarkCaseRun",
        entityId: caseRun.id,
        requestId,
        metadata: { code: "BENCHMARK_CASE_FAILED" },
      });
    }
  }

  private async aggregate(runId: string, requestId: string): Promise<void> {
    await this.prisma.benchmarkRun.update({
      where: { id: runId },
      data: { status: BenchmarkRunStatus.AGGREGATING },
    });
    const runs = await this.prisma.benchmarkCaseRun.findMany({
      where: { benchmarkRunId: runId },
      include: { evaluations: true },
    });
    const observations = observationsFromRuns(runs);
    await this.prisma.statisticalComparison.deleteMany({ where: { benchmarkRunId: runId } });
    for (const metric of distinct(observations.map((item) => item.metric))) {
      const metricItems = observations.filter((item) => item.metric === metric);
      const variants = distinct(metricItems.map((item) => item.variantId));
      const comparisons = pairs(variants).map(([left, right]) => ({
        left,
        right,
        result: this.statistics.comparePaired(
          metricItems.filter((item) => item.variantId === left),
          metricItems.filter((item) => item.variantId === right),
          hashToSeed(`${runId}:${metric}:${left}:${right}`),
        ),
      }));
      for (const { left, right, result } of comparisons.map((item, index, all) => ({
        ...item,
        result:
          this.statistics.holm(all.map((candidate) => candidate.result))[index] ?? item.result,
      }))) {
        await this.prisma.statisticalComparison.create({
          data: {
            benchmarkRunId: runId,
            leftVariantId: left,
            rightVariantId: right,
            metric,
            sampleSize: result.sampleSize,
            testName: result.testName,
            assumptions: json(result.assumptions),
            descriptiveStatistics: json(result.descriptiveStatistics),
            effectSize: result.effectSize,
            confidenceInterval: json(result.confidenceInterval),
            pValue: result.pValue,
            adjustedPValue: result.adjustedPValue,
            correctionMethod: result.pValue === null ? null : "HOLM",
            interpretation:
              "Descriptive comparison only; inspect effect size, confidence interval, failures, and limitations.",
            warnings: json(result.warnings),
          },
        });
      }
    }
    const failed = runs.filter((item) => item.status === BenchmarkCaseRunStatus.FAILED).length;
    const status = failed
      ? BenchmarkRunStatus.COMPLETED_WITH_LIMITATIONS
      : BenchmarkRunStatus.COMPLETED;
    await this.prisma.benchmarkRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        actualCostMinorUnits: runs.reduce(
          (sum, item) => sum + (item.totalCostMinorUnits ?? 0n),
          0n,
        ),
        failureSummary: json({ failed, scheduled: runs.length }),
      },
    });
    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id: runId },
      select: {
        actualCostMinorUnits: true,
        startedById: true,
        suite: { select: { projectId: true } },
      },
    });
    if (run) {
      await this.quota.finalizeReservation({
        resourceId: runId,
        event: {
          estimatedCostMinorUnits: run.actualCostMinorUnits ?? undefined,
          eventType: "benchmark.run.completed",
          idempotencyKey: `usage:benchmark-run:${runId}`,
          metric: "monthlyBenchmarkRuns",
          projectId: run.suite.projectId,
          quantity: 1,
          resourceId: runId,
          resourceType: "BenchmarkRun",
          unit: "run",
          userId: run.startedById,
        },
      });
    }
    await this.createHumanEvaluationTasks(runId, runs);
    await this.audit.record({
      action: "benchmark.statistics.generated",
      entityType: "BenchmarkRun",
      entityId: runId,
      requestId,
    });
    await this.audit.record({
      action: "benchmark.run.completed",
      entityType: "BenchmarkRun",
      entityId: runId,
      requestId,
    });
  }

  private async resolveRunPlan(user: AuthenticatedUser, input: z.infer<typeof RUN_INPUT>) {
    const suite = await this.requireSuite(input.suiteVersionId, user, true, {
      datasetVersion: { include: { cases: true } },
      variants: {
        where: { id: { in: input.selectedVariantIds }, enabled: true },
        include: {
          assignments: {
            include: { modelProfile: { include: { costProfile: true } }, promptVersion: true },
          },
        },
      },
    });
    if (!suite.frozenAt || suite.status !== BenchmarkSuiteStatus.READY)
      throw new ConflictException("Benchmark suite must be frozen and ready");
    if (!suite.datasetVersion?.frozenAt)
      throw new ConflictException("Benchmark dataset must be frozen");
    if (suite.variants.length !== input.selectedVariantIds.length)
      throw new BadRequestException("Selected variants are unavailable");
    if (input.repetitions > this.config.getOrThrow<number>("benchmark.maxRepetitions"))
      throw new BadRequestException("Too many repetitions");
    if (suite.variants.length > this.config.getOrThrow<number>("benchmark.maxVariants"))
      throw new BadRequestException("Too many variants");
    const evidence =
      input.protocol === "CONTROLLED_EVIDENCE"
        ? await this.prisma.benchmarkEvidencePackage.findMany({
            where: {
              benchmarkCaseId: { in: suite.datasetVersion.cases.map((item) => item.id) },
              protocol: "CONTROLLED_EVIDENCE",
            },
            orderBy: { createdAt: "desc" },
          })
        : [];
    const evidenceByCase = new Map<string, (typeof evidence)[number]>();
    for (const item of evidence)
      if (!evidenceByCase.has(item.benchmarkCaseId)) evidenceByCase.set(item.benchmarkCaseId, item);
    if (
      input.protocol === "CONTROLLED_EVIDENCE" &&
      evidenceByCase.size !== suite.datasetVersion.cases.length
    )
      throw new BadRequestException("Every controlled case needs one frozen evidence package");
    const profileIds = suite.variants.flatMap((variant) =>
      variant.assignments.map((assignment) => assignment.modelProfileId),
    );
    for (const variant of suite.variants)
      await this.validateAssignments(
        variant.architecture,
        variant.assignments.map(toAssignmentInput),
      );
    return {
      cases: suite.datasetVersion.cases,
      datasetVersion: suite.datasetVersion,
      evidenceByCase,
      judgePolicyId: null,
      profileIds: distinct(profileIds),
      suite,
      variants: suite.variants,
    };
  }

  private async createHumanEvaluationTasks(
    runId: string,
    caseRuns: Array<{
      benchmarkCaseId: string;
      benchmarkVariantId: string;
      id: string;
      repetitionIndex: number;
      status: BenchmarkCaseRunStatus;
    }>,
  ): Promise<void> {
    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id: runId },
      select: {
        evaluationPolicy: true,
        randomizationSeed: true,
        suite: { select: { defaultEvaluationRubricId: true } },
      },
    });
    const humanPolicy = objectValue(run?.evaluationPolicy);
    const configured =
      humanPolicy["humanEvaluation"] === true ||
      objectValue(humanPolicy, "humanEvaluation")["enabled"] === true;
    if (!configured || !run?.suite.defaultEvaluationRubricId) return;
    const completed = caseRuns.filter((item) => item.status === BenchmarkCaseRunStatus.COMPLETED);
    const groups = new Map<string, typeof completed>();
    for (const item of completed) {
      const key = `${item.benchmarkCaseId}:${item.repetitionIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const [key, items] of groups) {
      for (const [index, [first, second]] of pairs(items).entries()) {
        const [left, right] = shuffled(
          [first, second],
          hashToSeed(`${run.randomizationSeed}:${key}:${index}`),
        );
        if (!left || !right) continue;
        await this.prisma.humanEvaluationTask.create({
          data: {
            benchmarkRunId: runId,
            benchmarkCaseId: left.benchmarkCaseId,
            leftCaseRunId: left.id,
            rightCaseRunId: right.id,
            leftDisplayPosition: 1,
            rubricId: run.suite.defaultEvaluationRubricId,
          },
        });
      }
    }
  }

  private estimate(
    plan: Awaited<ReturnType<BenchmarksService["resolveRunPlan"]>>,
  ): BenchmarkRunEstimate {
    const totalCaseRuns = plan.cases.length * plan.variants.length;
    const estimatedCalls =
      plan.variants.reduce(
        (sum, variant) =>
          sum + variant.assignments.filter((assignment) => assignment.enabled).length,
        0,
      ) * plan.cases.length;
    const estimatedOutputTokens =
      plan.variants.reduce(
        (sum, variant) =>
          sum +
          variant.assignments
            .filter((assignment) => assignment.enabled)
            .reduce(
              (inner, assignment) =>
                inner + (assignmentParameters(assignment.parameters).maxOutputTokens ?? 0),
              0,
            ),
        0,
      ) * plan.cases.length;
    return {
      totalCaseRuns,
      estimatedCalls,
      estimatedInputTokens: estimatedCalls * 1_000,
      estimatedOutputTokens,
      estimatedCostMinorUnitsLow: null,
      estimatedCostMinorUnitsHigh: null,
      estimatedDurationSecondsLow: Math.ceil(estimatedCalls * 2),
      estimatedDurationSecondsHigh: Math.ceil(estimatedCalls * 30),
      warnings: [
        "Cost is unavailable until trusted cost profiles are configured.",
        "Cloud token accounting is provider-specific; equal token budgets are an approximation.",
      ],
    };
  }

  private async captureEnvironment() {
    const dependencyHash = hash(readFile("../../../pnpm-lock.yaml"));
    const schemaHash = hash(readFile("../../prisma/schema.prisma"));
    const value = {
      codeRevision: this.config.getOrThrow<string>("app.version"),
      workingTreeDirty: false,
      nodeVersion: process.version,
      pythonVersion: "captured-by-ai-service",
      operatingSystem: `${platform()} ${release()}`,
      dependencyHashes: { pnpm: dependencyHash },
      schemaHashes: { prisma: schemaHash },
      providerSdkVersions: { openai: "http-api", anthropic: "http-api", ollama: "api" },
      serviceVersions: {},
      featureFlags: { benchmark: this.config.getOrThrow<boolean>("benchmark.enabled") },
      hardwareProfileIds: [],
    };
    return this.prisma.experimentEnvironmentSnapshot.create({
      data: {
        ...value,
        contentHash: hash(value),
        dependencyHashes: json(value.dependencyHashes),
        schemaHashes: json(value.schemaHashes),
        providerSdkVersions: json(value.providerSdkVersions),
        serviceVersions: json(value.serviceVersions),
        featureFlags: json(value.featureFlags),
        hardwareProfileIds: json(value.hardwareProfileIds),
      },
    });
  }

  private async createEndToEndEvidence(testCase: { [key: string]: unknown }) {
    const facts = stringArray(testCase, "referenceFacts");
    const internalEvidence = facts.map((excerpt, index) => ({
      evidenceId: `E${index + 1}`,
      excerpt,
      sourceType: "SYNTHETIC_CASE_REFERENCE",
    }));
    const payload = {
      benchmarkCaseId: stringValue(testCase, "id"),
      version: `run-${randomUUID()}`,
      protocol: "END_TO_END" as const,
      internalEvidence,
      externalEvidence: [],
      citationMappings: Object.fromEntries(
        internalEvidence.map((item) => [item.evidenceId, item.evidenceId]),
      ),
      sourceMetadata: { synthetic: true },
      retrievalConfiguration: {
        executed: false,
        reason: "Synthetic benchmark case has no project retrieval source.",
      },
      researchConfiguration: {
        executed: false,
        reason: "No live research in synthetic benchmark fixture.",
      },
    };
    return this.prisma.benchmarkEvidencePackage.create({
      data: {
        ...payload,
        contentHash: hash(payload),
        internalEvidence: json(payload.internalEvidence),
        externalEvidence: json(payload.externalEvidence),
        citationMappings: json(payload.citationMappings),
        sourceMetadata: json(payload.sourceMetadata),
        retrievalConfiguration: json(payload.retrievalConfiguration),
        researchConfiguration: json(payload.researchConfiguration),
      },
    });
  }

  private async validateAssignments(
    architecture: string,
    assignments: Array<z.infer<typeof ASSIGNMENT_INPUT>>,
  ): Promise<void> {
    const enabled = assignments.filter((assignment) => assignment.enabled);
    const roles = new Set(enabled.map((assignment) => assignment.role));
    if (new Set(enabled.map((assignment) => assignment.role)).size !== enabled.length)
      throw new BadRequestException("Each agent role may have one model assignment");
    if (architecture === "SINGLE_AGENT" && (enabled.length !== 1 || !roles.has("SINGLE_AGENT")))
      throw new BadRequestException(
        "Single-agent variants require exactly one SINGLE_AGENT assignment",
      );
    if (architecture !== "SINGLE_AGENT" && (!roles.has("PLANNER") || !roles.has("COORDINATOR")))
      throw new BadRequestException(
        "Multi-agent variants require planner and coordinator assignments",
      );
    const profiles = await this.prisma.modelProfile.findMany({
      where: { id: { in: enabled.map((item) => item.modelProfileId) } },
    });
    if (
      profiles.length !== enabled.length ||
      profiles.some((profile) => !profile.active || !profile.benchmarkEligible)
    )
      throw new BadRequestException("Variant references an unavailable trusted model profile");
    if (
      architecture === "HOMOGENEOUS_MULTI_AGENT" &&
      new Set(profiles.map((profile) => profile.id)).size !== 1
    )
      throw new BadRequestException("Homogeneous variants must use one exact model profile");
    if (
      architecture === "HETEROGENEOUS_MULTI_AGENT" &&
      new Set(profiles.map((profile) => profile.provider)).size < 2
    )
      throw new BadRequestException("Heterogeneous variants require at least two providers");
  }

  private validateProfile(profile: z.infer<typeof PROFILE_INPUT>): void {
    if (profile.exactModelId.toLowerCase().endsWith("latest"))
      throw new BadRequestException("Floating model aliases are not benchmark-eligible");
    if (
      profile.provider === "OLLAMA" &&
      (profile.runtime !== "LOCAL_OLLAMA" || profile.family.toUpperCase() === "OLLAMA")
    )
      throw new BadRequestException(
        "Ollama is a local runtime; the model family must identify the underlying model, such as QWEN",
      );
    if (profile.provider !== "OLLAMA" && profile.runtime !== "CLOUD")
      throw new BadRequestException("Cloud provider profiles require CLOUD runtime");
  }

  private async defaultRubric() {
    const criteria = [
      "factual support",
      "citation correctness",
      "completeness",
      "decision usefulness",
      "risk analysis",
      "uncertainty",
      "alternatives",
      "clarity",
      "actionability",
      "evidence-to-recommendation consistency",
    ];
    const contentHash = hash({ criteria, scale: "1-5", version: "phase-11-v1" });
    return this.prisma.evaluationRubric.upsert({
      where: { code_version: { code: "decision-support", version: "phase-11-v1" } },
      create: {
        code: "decision-support",
        version: "phase-11-v1",
        title: "Decision-support benchmark rubric",
        criteria,
        scale: { min: 1, max: 5 },
        weights: {},
        contentHash,
      },
      update: {},
    });
  }

  private async requireSuite(
    id: string,
    user: AuthenticatedUser,
    write: boolean,
  ): Promise<Prisma.BenchmarkSuiteGetPayload<Record<string, never>>>;
  private async requireSuite<T extends Prisma.BenchmarkSuiteInclude>(
    id: string,
    user: AuthenticatedUser,
    write: boolean,
    include: T,
  ): Promise<Prisma.BenchmarkSuiteGetPayload<{ include: T }>>;
  private async requireSuite(
    id: string,
    user: AuthenticatedUser,
    write: boolean,
    include?: Prisma.BenchmarkSuiteInclude,
  ): Promise<unknown> {
    const suite = await this.prisma.benchmarkSuite.findFirst({
      where: {
        id,
        project: {
          members: {
            some: {
              userId: user.id,
              ...(write
                ? { role: { in: [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR] } }
                : {}),
            },
          },
        },
      },
      ...(include ? { include } : {}),
    });
    if (!suite) throw this.notFound("Benchmark suite");
    return suite;
  }

  private async requireRun(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Prisma.BenchmarkRunGetPayload<Record<string, never>>>;
  private async requireRun<T extends Prisma.BenchmarkRunInclude>(
    id: string,
    user: AuthenticatedUser,
    include: T,
  ): Promise<Prisma.BenchmarkRunGetPayload<{ include: T }>>;
  private async requireRun(
    id: string,
    user: AuthenticatedUser,
    include?: Prisma.BenchmarkRunInclude,
  ): Promise<unknown> {
    const access = await this.prisma.benchmarkRun.findUnique({
      where: { id },
      select: { suite: { select: { projectId: true } } },
    });
    const member = access
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: access.suite.projectId, userId: user.id } },
        })
      : null;
    if (!member) throw this.notFound("Benchmark run");

    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id },
      ...(include ? { include } : {}),
    });
    if (!run) throw this.notFound("Benchmark run");
    return run;
  }

  private async requireProjectEditor(projectId: string, userId: string): Promise<void> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!member || !canUpdateProject(member.role)) throw this.notFound("Project");
  }

  private async projectRole(suiteId: string, userId: string): Promise<ProjectMemberRole> {
    const suite = await this.prisma.benchmarkSuite.findUnique({
      where: { id: suiteId },
      select: { projectId: true },
    });
    const member = suite
      ? await this.prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: suite.projectId, userId } },
        })
      : null;
    return member?.role ?? ProjectMemberRole.VIEWER;
  }

  private async requireHumanTask(taskId: string, user: AuthenticatedUser) {
    const task = await this.prisma.humanEvaluationTask.findFirst({
      where: {
        id: taskId,
        OR: [
          { assignedEvaluatorId: user.id },
          {
            benchmarkRun: {
              suite: {
                project: { members: { some: { userId: user.id, role: ProjectMemberRole.OWNER } } },
              },
            },
          },
        ],
      },
    });
    if (!task) throw this.notFound("Human evaluation task");
    if (
      task.assignedEvaluatorId &&
      task.assignedEvaluatorId !== user.id &&
      user.globalRole !== "ADMIN"
    )
      throw this.notFound("Human evaluation task");
    return task;
  }

  private requireEnabled(): void {
    if (!this.config.getOrThrow<boolean>("benchmark.enabled"))
      throw new ForbiddenException("Benchmarking is disabled");
  }

  private requireAdmin(user: AuthenticatedUser): void {
    if (user.globalRole !== "ADMIN")
      throw new ForbiddenException("Benchmark administrator access is required");
  }

  private notFound(resource: string): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.NotFound, message: `${resource} not found` });
  }

  private async auditEvent(
    action: string,
    user: AuthenticatedUser,
    requestId: string,
    entityType: string,
    entityId: string,
    projectId?: string,
  ): Promise<void> {
    await this.audit.record({
      action,
      actorUserId: user.id,
      entityType,
      entityId,
      projectId,
      requestId,
    });
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value, Object.keys(value as object).sort()))
    .digest("hex");
}

function zipArchive(entries: ReadonlyArray<{ name: string; value: unknown }>): Buffer {
  if (entries.length > 0xffff) throw new BadRequestException("Too many archive entries");
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body =
      typeof entry.value === "string"
        ? Buffer.from(entry.value, "utf8")
        : Buffer.from(
            JSON.stringify(
              entry.value,
              (_key, nestedValue: unknown) =>
                typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
              2,
            ),
            "utf8",
          );
    if (body.byteLength > 0xffffffff || offset > 0xffffffff) {
      throw new BadRequestException("Reproducibility archive exceeds ZIP32 limits");
    }
    const crc = crc32(body);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(body.byteLength, 18);
    localHeader.writeUInt32LE(body.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localRecords.push(localHeader, name, body);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(body.byteLength, 20);
    centralHeader.writeUInt32LE(body.byteLength, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralRecords.push(centralHeader, name);
    offset += localHeader.byteLength + name.byteLength + body.byteLength;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  if (centralDirectory.byteLength > 0xffffffff || offset > 0xffffffff) {
    throw new BadRequestException("Reproducibility archive exceeds ZIP32 limits");
  }
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  return Buffer.concat([...localRecords, centralDirectory, endOfCentralDirectory]);
}

function crc32(input: Buffer): number {
  let result = 0xffffffff;
  for (const byte of input) result = (result >>> 8) ^ CRC32_TABLE[(result ^ byte) & 0xff]!;
  return (result ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function readFile(relative: string): string {
  try {
    return readFileSync(new URL(relative, import.meta.url), "utf8");
  } catch {
    return "unavailable";
  }
}

function toAssignmentInput(assignment: {
  enabled: boolean;
  executionOrder: number;
  modelProfileId: string;
  parameters: Prisma.JsonValue;
  promptVersionId: string;
  role: string;
}) {
  return {
    enabled: assignment.enabled,
    executionOrder: assignment.executionOrder,
    modelProfileId: assignment.modelProfileId,
    parameters: assignmentParameters(assignment.parameters),
    promptVersionId: assignment.promptVersionId,
    role: assignment.role,
  } as z.infer<typeof ASSIGNMENT_INPUT>;
}

function assignmentParameters(value: Prisma.JsonValue) {
  const input = objectValue(value);
  return {
    maxOutputTokens: numberValue(input, "maxOutputTokens", 1_024),
    seed: numberValue(input, "seed", null),
    temperature: numberValue(input, "temperature", 0),
    timeoutSeconds: numberValue(input, "timeoutSeconds", 120),
    topP: numberValue(input, "topP", 1),
  };
}

function invocationData(
  value: unknown,
  caseRunId: string,
  sequenceIndex: number,
  profileByRole: Map<
    BenchmarkAgentRole,
    { modelProfileId: string; promptVersionId: string; parameters: Prisma.JsonValue }
  >,
): Prisma.ModelInvocationUncheckedCreateInput {
  const record = objectValue(value);
  const result = objectValue(record, "result");
  const role = stringValue(record, "role") as BenchmarkAgentRole;
  const assignment = profileByRole.get(role);
  if (!assignment) {
    throw new BadRequestException(
      `Provider returned an invocation for an unassigned role: ${role}`,
    );
  }
  const provider = stringValue(result, "provider") as ModelProviderCode;
  if (!Object.values(ModelProviderCode).includes(provider)) {
    throw new BadRequestException("Provider returned an unsupported model provider code");
  }
  return {
    benchmarkCaseRunId: caseRunId,
    agentRole: role,
    sequenceIndex,
    modelProfileId: assignment.modelProfileId,
    promptVersionId: assignment.promptVersionId,
    provider,
    exactModelId: stringValue(result, "exactModelId"),
    requestHash: hash({ caseRunId, sequenceIndex, role }),
    responseHash: stringValue(result, "rawResponseHash") || null,
    parameters: json(assignmentParameters(assignment.parameters)),
    inputTokens: nullableNumber(result, "inputTokens"),
    outputTokens: nullableNumber(result, "outputTokens"),
    cachedTokens: nullableNumber(result, "cachedInputTokens"),
    reasoningTokens: nullableNumber(result, "reasoningTokens"),
    latencyMs: numberValue(result, "latencyMs", 0) ?? 0,
    timeToFirstTokenMs: nullableNumber(result, "timeToFirstTokenMs"),
    estimatedCostMinorUnits: null,
    currency: null,
    finishReason: stringValue(result, "finishReason", "UNKNOWN"),
    status: "COMPLETED",
    providerRequestIdHash: stringValue(result, "providerRequestId")
      ? hash(stringValue(result, "providerRequestId"))
      : null,
  };
}

function invocationTotals(
  rows: Array<{
    inputTokens?: number | null;
    outputTokens?: number | null;
    cachedTokens?: number | null;
  }>,
) {
  return {
    inputTokens: sumNullable(rows.map((item) => item.inputTokens ?? null)),
    outputTokens: sumNullable(rows.map((item) => item.outputTokens ?? null)),
    cachedTokens: sumNullable(rows.map((item) => item.cachedTokens ?? null)),
    costMinor: 0n,
  };
}

function structuralScore(metrics: Record<string, unknown>): number | null {
  const values = Object.values(metrics).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function observationsFromRuns(
  runs: Array<{
    benchmarkCaseId: string;
    benchmarkVariantId: string;
    repetitionIndex: number;
    status: BenchmarkCaseRunStatus;
    evaluations: Array<{ metrics: Prisma.JsonValue }>;
  }>,
) {
  return runs.flatMap((run) =>
    run.status === BenchmarkCaseRunStatus.COMPLETED
      ? run.evaluations.flatMap((evaluation) =>
          Object.entries(objectValue(evaluation.metrics)).flatMap(([metric, value]) =>
            typeof value === "number" && Number.isFinite(value)
              ? [
                  {
                    caseId: run.benchmarkCaseId,
                    metric,
                    repetitionIndex: run.repetitionIndex,
                    value,
                    variantId: run.benchmarkVariantId,
                  },
                ]
              : [],
          ),
        )
      : [],
  ) as Array<MetricObservation & { metric: string }>;
}

function aggregateResult(
  runs: Array<{
    benchmarkVariantId: string;
    status: BenchmarkCaseRunStatus;
    totalCostMinorUnits: bigint | null;
    latencyMs: number | null;
    evaluations: Array<{ metrics: Prisma.JsonValue; score: Prisma.Decimal | null }>;
  }>,
  completedOnly: boolean,
) {
  const values = new Map<
    string,
    {
      costs: bigint[];
      latencies: number[];
      metrics: Map<string, number[]>;
      scheduled: number;
      completed: number;
      failed: number;
    }
  >();
  for (const run of runs) {
    const current = values.get(run.benchmarkVariantId) ?? {
      costs: [] as bigint[],
      latencies: [] as number[],
      metrics: new Map<string, number[]>(),
      scheduled: 0,
      completed: 0,
      failed: 0,
    };
    current.scheduled += 1;
    if (run.status === BenchmarkCaseRunStatus.COMPLETED) {
      current.completed += 1;
      if (run.totalCostMinorUnits !== null) current.costs.push(run.totalCostMinorUnits);
      if (run.latencyMs !== null) current.latencies.push(run.latencyMs);
      for (const evaluation of run.evaluations)
        for (const [metric, value] of Object.entries(objectValue(evaluation.metrics)))
          if (typeof value === "number")
            current.metrics.set(metric, [...(current.metrics.get(metric) ?? []), value]);
    } else if (run.status === BenchmarkCaseRunStatus.FAILED) current.failed += 1;
    values.set(run.benchmarkVariantId, current);
  }
  return [...values.entries()].map(([variantId, value]) => ({
    variantId,
    scheduledRuns: value.scheduled,
    completedRuns: value.completed,
    failedRuns: value.failed,
    failureRate: value.scheduled ? value.failed / value.scheduled : 0,
    totalCostMinorUnits: value.costs.reduce((sum, cost) => sum + cost, 0n).toString(),
    latencyMedianMs: median(value.latencies),
    metrics: [...value.metrics.entries()].map(([name, items]) => ({
      name,
      sampleSize: items.length,
      value: items.reduce((sum, item) => sum + item, 0) / items.length,
    })),
    policy: completedOnly ? "COMPLETED_ONLY" : "INTENTION_TO_RUN",
  }));
}

function objectValue(value: unknown, key?: string): Record<string, unknown> {
  const candidate =
    key && typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)[key]
      : value;
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : {};
}
function arrayValue(value: Record<string, unknown>, key: string): unknown[] {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}
function stringValue(value: { [key: string]: unknown }, key: string, fallback = ""): string {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : fallback;
}
function stringArray(value: { [key: string]: unknown }, key: string): string[] {
  const candidate = value[key];
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string")
    : [];
}
function numberValue(
  value: Record<string, unknown>,
  key: string,
  fallback: number | null,
): number | null {
  const candidate = value[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}
function nullableNumber(value: Record<string, unknown>, key: string): number | null {
  return numberValue(value, key, null);
}
function sumNullable(values: Array<number | null>): number | null {
  const actual = values.filter((value): value is number => value !== null);
  return actual.length ? actual.reduce((sum, value) => sum + value, 0) : null;
}
function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}
function pairs<T>(values: T[]): Array<[T, T]> {
  return values.flatMap((left, index) =>
    values.slice(index + 1).map((right) => [left, right] as [T, T]),
  );
}
function shuffled<T>(values: T[], seed: number): T[] {
  const output = [...values];
  let state = seed >>> 0;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const other = state % (index + 1);
    [output[index], output[other]] = [output[other] as T, output[index] as T];
  }
  return output;
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[index] ?? null)
    : ((sorted[index - 1] ?? 0) + (sorted[index] ?? 0)) / 2;
}
function hashToSeed(value: string): number {
  return Number.parseInt(hash(value).slice(0, 8), 16);
}
function caseHashShape(value: { [key: string]: unknown }) {
  return {
    code: value.code,
    question: value.question,
    scenario: value.scenario,
    objectives: value.objectives,
    constraints: value.constraints,
    assumptions: value.assumptions,
  };
}
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Benchmark case execution failed";
  return message
    .replaceAll(/(?:sk-[\w-]+|Bearer\s+\S+|x-api-key\s+\S+)/gi, "[REDACTED]")
    .slice(0, 500);
}

function jsonSerializable(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSerializable);
  if (value && typeof value === "object") {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === "function") return jsonSerializable(withJson.toJSON());
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSerializable(item)]),
    );
  }
  return value;
}
