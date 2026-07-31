import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Prisma, UsageReservationStatus } from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import type { EntitlementKey } from "./billing.types";
import { EntitlementsService } from "./entitlements.service";
import { UsageService, type UsageMetric } from "./usage.service";

@Injectable()
export class QuotaService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async reserve(input: {
    metric: Extract<EntitlementKey, UsageMetric>;
    projectId?: string;
    quantity: number;
    resourceId: string;
    userId: string;
  }) {
    const idempotencyKey = `reservation:${input.metric}:${input.resourceId}`;
    const existing = await this.prisma.usageReservation.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const entitlement = await this.entitlements.getEntitlements({
      userId: input.userId,
      projectId: input.projectId,
    });
    const limit = entitlement.entitlements[input.metric];
    if (typeof limit !== "number") throw new Error(`Quota metric ${input.metric} must be numeric`);
    const period = this.usage.billingPeriod();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.getOrThrow<number>("usage.reservationTtlSeconds") * 1_000,
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${input.projectId ?? "user"}:${input.metric}:${period}`}))`;
      await tx.usageReservation.updateMany({
        where: { status: UsageReservationStatus.ACTIVE, expiresAt: { lte: now } },
        data: { status: UsageReservationStatus.EXPIRED },
      });
      const aggregate = await tx.usageAggregate.findUnique({
        where: {
          userId_scopeKey_billingPeriod_metric: {
            userId: input.userId,
            scopeKey: input.projectId ? `project:${input.projectId}` : "user",
            billingPeriod: period,
            metric: input.metric,
          },
        },
      });
      const reservations = await tx.usageReservation.aggregate({
        where: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          metric: input.metric,
          status: UsageReservationStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        _sum: { reservedQuantity: true },
      });
      const currentUsage = Number(aggregate?.quantity ?? 0);
      const reserved = Number(reservations._sum.reservedQuantity ?? 0);
      if (currentUsage + reserved + input.quantity > limit) {
        throw quotaExceeded({
          currentUsage,
          limit,
          metric: input.metric,
          resetAt: nextPeriod(now),
        });
      }
      return tx.usageReservation.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          metric: input.metric,
          reservedQuantity: new Prisma.Decimal(input.quantity),
          resourceId: input.resourceId,
          idempotencyKey,
          expiresAt,
        },
      });
    });
  }

  async assertFeature(input: {
    feature: Extract<
      EntitlementKey,
      "externalResearchAvailable" | "experimentAvailable" | "jsonCsvExportAvailable"
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
      | "maximumProjects"
      | "maximumKnowledgeBasesPerProject"
      | "maximumDocumentsPerKnowledgeBase"
      | "maximumMembersPerProject"
      | "maximumConcurrentAnalysisRuns"
      | "maximumConcurrentExperimentRuns"
      | "maximumExperimentVariants"
      | "maximumExperimentRepetitions"
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
    if (typeof limit !== "number" || input.sizeBytes > limit) {
      throw quotaExceeded({
        currentUsage: input.sizeBytes,
        limit: typeof limit === "number" ? limit : 0,
        metric: "maximumUploadBytesPerFile",
        resetAt: null,
      });
    }
  }

  async finalizeReservation(input: {
    event: Parameters<UsageService["record"]>[0];
    resourceId: string;
  }): Promise<void> {
    const reservation = await this.prisma.usageReservation.findFirst({
      where: { resourceId: input.resourceId, status: UsageReservationStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    });
    if (reservation)
      await this.usage.finalizeReservation({ event: input.event, reservationId: reservation.id });
  }

  async releaseResourceReservation(resourceId: string): Promise<void> {
    await this.prisma.usageReservation.updateMany({
      where: { resourceId, status: UsageReservationStatus.ACTIVE },
      data: { status: UsageReservationStatus.RELEASED },
    });
  }
}

function nextPeriod(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function quotaExceeded(input: {
  currentUsage: number;
  limit: number;
  metric: string;
  resetAt: string | null;
}): HttpException {
  return new HttpException(
    {
      code: ErrorCodes.QuotaExceeded,
      currentUsage: input.currentUsage,
      limit: input.limit,
      message: "The current plan limit has been reached",
      resource: input.metric,
      resetAt: input.resetAt,
      upgradeRequired: true,
      allowedPlanOptions: ["PRO", "TEAM"],
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
