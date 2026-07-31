import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  PlanCode,
  Prisma,
  SubscriptionStatus,
  UsageReservationStatus,
} from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";

export type UsageMetric =
  | "maximumConcurrentAnalysisRuns"
  | "maximumConcurrentExperimentRuns"
  | "maximumConcurrentResearchRuns"
  | "maximumStorageBytes"
  | "modelInputTokens"
  | "modelOutputTokens"
  | "estimatedModelCost"
  | "exportCsvOperations"
  | "exportJsonOperations"
  | "monthlyAnalysisRuns"
  | "monthlyExternalBytes"
  | "monthlyExternalResearchQueries"
  | "monthlyExperimentRuns"
  | "monthlyFetchedExternalPages"
  | "monthlyMultiAgentRuns"
  | "monthlySingleAgentRuns";

export type UsageInput = {
  billingPeriod?: string;
  estimatedCostMinorUnits?: bigint;
  eventType: string;
  idempotencyKey: string;
  metadata?: Record<string, boolean | number | string | null>;
  metric: UsageMetric;
  occurredAt?: Date;
  projectId?: string;
  quantity: number;
  resourceId: string;
  resourceType: string;
  subscriptionId?: string;
  unit: string;
  userId: string;
};

@Injectable()
export class UsageService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  billingPeriod(date = new Date()): string {
    const timezone = this.config.getOrThrow<string>("usage.billingPeriodTimezone");
    const parts = new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const year = parts.find((part) => part.type === "year")?.value;
    if (!month || !year) throw new Error("Unable to derive the billing period");
    return `${year}-${month}`;
  }

  async billingPeriodForUser(userId: string, date = new Date()): Promise<string> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        currentPeriodEnd: true,
        currentPeriodStart: true,
        id: true,
        planCode: true,
        status: true,
      },
    });
    if (
      subscription &&
      subscription.planCode !== PlanCode.FREE &&
      subscription.currentPeriodStart &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > date &&
      PAID_USAGE_STATUSES.has(subscription.status)
    ) {
      return `paid:${subscription.id}:${subscription.currentPeriodStart.toISOString()}`;
    }
    return this.billingPeriod(date);
  }

  async resetAtForUser(userId: string, date = new Date()): Promise<Date> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { currentPeriodEnd: true, planCode: true, status: true },
    });
    if (
      subscription &&
      subscription.planCode !== PlanCode.FREE &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > date &&
      PAID_USAGE_STATUSES.has(subscription.status)
    ) {
      return subscription.currentPeriodEnd;
    }
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }

  async record(input: UsageInput) {
    this.assertValidInput(input);
    if (!this.config.getOrThrow<boolean>("usage.enabled")) return null;
    return this.prisma.$transaction((tx) => this.recordInTransaction(tx, input));
  }

  async aggregates(userId: string, period: string) {
    return this.prisma.usageAggregate.findMany({
      where: { userId, billingPeriod: period, projectId: null },
      orderBy: [{ metric: "asc" }, { projectId: "asc" }],
    });
  }

  async rebuildAggregates(userId: string, period: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const events = await tx.usageEvent.findMany({ where: { userId, billingPeriod: period } });
      await tx.usageAggregate.deleteMany({ where: { userId, billingPeriod: period } });
      const totals = new Map<
        string,
        { metric: string; projectId: string | null; quantity: Prisma.Decimal }
      >();
      for (const event of events) {
        for (const projectId of event.projectId ? [null, event.projectId] : [null]) {
          const scopeKey = scopeFor(projectId);
          const key = `${scopeKey}:${event.metric}`;
          const current = totals.get(key);
          totals.set(key, {
            metric: event.metric,
            projectId,
            quantity: current ? current.quantity.add(event.quantity) : event.quantity,
          });
        }
      }
      if ([...totals.values()].some((total) => total.quantity.isNegative())) {
        throw new Error("Usage ledger would rebuild to a negative aggregate");
      }
      if (totals.size) {
        await tx.usageAggregate.createMany({
          data: [...totals.values()].map((total) => ({
            billingPeriod: period,
            metric: total.metric,
            projectId: total.projectId,
            quantity: total.quantity,
            scopeKey: scopeFor(total.projectId),
            userId,
          })),
        });
      }
    });
  }

  async finalizeReservation(input: { event: UsageInput; reservationId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.usageReservation.findUnique({
        where: { id: input.reservationId },
      });
      if (!reservation || reservation.status !== UsageReservationStatus.ACTIVE) return;
      await this.recordInTransaction(tx, {
        ...input.event,
        billingPeriod: reservation.billingPeriod,
        userId: reservation.userId,
      });
      await tx.usageReservation.update({
        where: { id: reservation.id },
        data: { finalizedAt: new Date(), status: UsageReservationStatus.FINALIZED },
      });
    });
  }

  async releaseReservation(reservationId: string): Promise<void> {
    await this.prisma.usageReservation.updateMany({
      where: { id: reservationId, status: UsageReservationStatus.ACTIVE },
      data: { status: UsageReservationStatus.RELEASED },
    });
  }

  private assertValidInput(input: UsageInput): void {
    if (!Number.isFinite(input.quantity) || input.quantity === 0) {
      throw new BadRequestException({
        code: ErrorCodes.AccessDenied,
        message: "Usage quantity must be a non-zero finite number",
      });
    }
    if (input.quantity < 0 && input.eventType !== "storage.deleted") {
      throw new BadRequestException({
        code: ErrorCodes.AccessDenied,
        message: "Negative usage is only allowed for completed storage deletion",
      });
    }
  }

  private async recordInTransaction(tx: Prisma.TransactionClient, input: UsageInput) {
    this.assertValidInput(input);
    const billingPeriod =
      input.billingPeriod ?? (await this.billingPeriodForUser(input.userId, input.occurredAt));
    try {
      const event = await tx.usageEvent.create({
        data: {
          billingPeriod,
          currency:
            input.estimatedCostMinorUnits === undefined
              ? null
              : this.config.getOrThrow<string>("billing.currency"),
          estimatedCostMinorUnits: input.estimatedCostMinorUnits ?? null,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata ?? {},
          metric: input.metric,
          occurredAt: input.occurredAt ?? new Date(),
          projectId: input.projectId ?? null,
          quantity: new Prisma.Decimal(input.quantity),
          resourceId: input.resourceId,
          resourceType: input.resourceType,
          subscriptionId: input.subscriptionId ?? null,
          unit: input.unit,
          userId: input.userId,
        },
      });
      for (const projectId of input.projectId ? [undefined, input.projectId] : [undefined]) {
        const scopeKey = scopeFor(projectId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.userId}:${scopeKey}:${billingPeriod}:${input.metric}`}))`;
        const aggregate = await tx.usageAggregate.findUnique({
          where: {
            userId_scopeKey_billingPeriod_metric: {
              billingPeriod,
              metric: input.metric,
              scopeKey,
              userId: input.userId,
            },
          },
        });
        const nextQuantity = new Prisma.Decimal(aggregate?.quantity ?? 0).add(input.quantity);
        if (nextQuantity.isNegative()) throw new Error("Usage aggregate cannot become negative");
        await tx.usageAggregate.upsert({
          where: {
            userId_scopeKey_billingPeriod_metric: {
              billingPeriod,
              metric: input.metric,
              scopeKey,
              userId: input.userId,
            },
          },
          create: {
            billingPeriod,
            metric: input.metric,
            projectId: projectId ?? null,
            quantity: nextQuantity,
            scopeKey,
            userId: input.userId,
          },
          update: { quantity: nextQuantity },
        });
      }
      return event;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return tx.usageEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      }
      throw error;
    }
  }
}

function scopeFor(projectId: string | undefined | null): string {
  return projectId ? `project:${projectId}` : "user";
}

const PAID_USAGE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]);
