import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Prisma, UsageReservationStatus } from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import type { EntitlementKey } from "./billing.types";
import { EntitlementsService } from "./entitlements.service";
import { UsageService, type UsageInput, type UsageMetric } from "./usage.service";

type MeteredEntitlement = Extract<EntitlementKey, UsageMetric>;

@Injectable()
export class QuotaService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async billingOwnerForProject(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Project not found" });
    return project.ownerId;
  }

  async reserve(input: {
    metric: MeteredEntitlement;
    projectId?: string;
    quantity: number;
    resourceId: string;
    scope?: "account" | "project";
    userId: string;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error("Quota reservation quantity must be positive");
    }
    const idempotencyKey = `reservation:${input.metric}:${input.resourceId}`;
    const existing = await this.prisma.usageReservation.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const [entitlement, period] = await Promise.all([
      this.entitlements.getEntitlements({ projectId: input.projectId, userId: input.userId }),
      this.usage.billingPeriodForUser(input.userId),
    ]);
    const limit = entitlement.entitlements[input.metric];
    if (typeof limit !== "number") throw new Error(`Quota metric ${input.metric} must be numeric`);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.getOrThrow<number>("usage.reservationTtlSeconds") * 1_000,
    );
    const quotaScope = input.scope ?? "account";
    const scopeProjectId = quotaScope === "project" ? input.projectId : undefined;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${scopeProjectId ?? "user"}:${input.metric}:${period}`}))`;
      await tx.usageReservation.updateMany({
        where: { status: UsageReservationStatus.ACTIVE, expiresAt: { lte: now } },
        data: { status: UsageReservationStatus.EXPIRED },
      });
      const aggregate = await tx.usageAggregate.findUnique({
        where: {
          userId_scopeKey_billingPeriod_metric: {
            billingPeriod: period,
            metric: input.metric,
            scopeKey: scopeProjectId ? `project:${scopeProjectId}` : "user",
            userId: input.userId,
          },
        },
      });
      const reservations = await tx.usageReservation.aggregate({
        where: {
          billingPeriod: period,
          metric: input.metric,
          status: UsageReservationStatus.ACTIVE,
          userId: input.userId,
          expiresAt: { gt: now },
          ...(scopeProjectId ? { projectId: scopeProjectId } : {}),
        },
        _sum: { reservedQuantity: true },
      });
      const currentUsage = Number(aggregate?.quantity ?? 0);
      const reserved = Number(reservations._sum.reservedQuantity ?? 0);
      if (currentUsage + reserved + input.quantity > limit) {
        throw quotaExceeded({
          currentUsage: currentUsage + reserved,
          limit,
          metric: input.metric,
          resetAt: await this.usage.resetAtForUser(input.userId, now),
        });
      }
      return tx.usageReservation.create({
        data: {
          billingPeriod: period,
          expiresAt,
          idempotencyKey,
          metric: input.metric,
          projectId: input.projectId ?? null,
          reservedQuantity: new Prisma.Decimal(input.quantity),
          resourceId: input.resourceId,
          userId: input.userId,
        },
      });
    });
  }

  async assertFeature(input: {
    feature: Extract<
      EntitlementKey,
      | "experimentCsvExportAvailable"
      | "experimentJsonExportAvailable"
      | "experimentsAvailable"
      | "externalResearchAvailable"
      | "reportPdfExportAvailable"
      | "reportDocxExportAvailable"
      | "reportMarkdownExportAvailable"
      | "publicSharingAvailable"
      | "authenticatedSharingAvailable"
      | "collaborationCommentsAvailable"
      | "customBrandingAvailable"
      | "externalCommentingAvailable"
      | "versionComparisonAvailable"
      | "benchmarkExecutionAvailable"
      | "externalProviderBenchmarkAvailable"
      | "localModelBenchmarkAvailable"
      | "heterogeneousBenchmarkAvailable"
      | "humanEvaluationAvailable"
    >;
    projectId?: string;
    userId: string;
  }) {
    const snapshot = await this.entitlements.getEntitlements(input);
    if (snapshot.entitlements[input.feature] !== true) {
      throw quotaExceeded({ currentUsage: 0, limit: 0, metric: input.feature, resetAt: null });
    }
  }

  async assertCurrentResourceLimit(input: {
    currentUsage: number;
    entitlement: Extract<
      EntitlementKey,
      | "maximumDocumentsPerKnowledgeBase"
      | "maximumExperimentCases"
      | "maximumExperimentRepetitions"
      | "maximumExperimentVariants"
      | "maximumKnowledgeBasesPerProject"
      | "maximumMembersPerProject"
      | "maximumOwnedProjects"
      | "maximumTotalDocuments"
      | "maximumActiveShareLinks"
      | "maximumExportArtifactsPerPeriod"
      | "maximumBrandProfiles"
      | "monthlyBenchmarkRuns"
    >;
    projectId?: string;
    userId: string;
  }) {
    const snapshot = await this.entitlements.getEntitlements(input);
    const limit = snapshot.entitlements[input.entitlement];
    if (typeof limit !== "number" || input.currentUsage >= limit) {
      throw quotaExceeded({
        currentUsage: input.currentUsage,
        limit: typeof limit === "number" ? limit : 0,
        metric: input.entitlement,
        resetAt: null,
      });
    }
  }

  async assertUploadSize(input: { projectId: string; sizeBytes: number; userId: string }) {
    const snapshot = await this.entitlements.getEntitlements(input);
    const limit = snapshot.entitlements.maximumUploadBytesPerFile;
    if (input.sizeBytes > limit) {
      throw quotaExceeded({
        currentUsage: input.sizeBytes,
        limit,
        metric: "maximumUploadBytesPerFile",
        resetAt: null,
      });
    }
  }

  async finalizeReservation(input: { event: UsageInput; resourceId: string }): Promise<void> {
    const reservation = await this.prisma.usageReservation.findFirst({
      where: { resourceId: input.resourceId, status: UsageReservationStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
    if (!reservation) return;
    if (input.event.quantity <= 0) {
      await this.usage.releaseReservation(reservation.id);
      return;
    }
    await this.usage.finalizeReservation({ event: input.event, reservationId: reservation.id });
  }

  async recordUsage(event: UsageInput) {
    return this.usage.record(event);
  }

  async releaseResourceReservation(resourceId: string): Promise<void> {
    await this.prisma.usageReservation.updateMany({
      where: { resourceId, status: UsageReservationStatus.ACTIVE },
      data: { status: UsageReservationStatus.RELEASED },
    });
  }

  async expireReservations(now = new Date()): Promise<number> {
    const result = await this.prisma.usageReservation.updateMany({
      where: { status: UsageReservationStatus.ACTIVE, expiresAt: { lte: now } },
      data: { status: UsageReservationStatus.EXPIRED },
    });
    return result.count;
  }
}

function quotaExceeded(input: {
  currentUsage: number;
  limit: number;
  metric: string;
  resetAt: Date | null;
}): HttpException {
  return new HttpException(
    {
      allowedPlanOptions: ["PRO", "TEAM"],
      code: ErrorCodes.QuotaExceeded,
      currentUsage: input.currentUsage,
      limit: input.limit,
      message: "The current plan limit has been reached",
      resetAt: input.resetAt?.toISOString() ?? null,
      resource: input.metric,
      upgradeRequired: true,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
