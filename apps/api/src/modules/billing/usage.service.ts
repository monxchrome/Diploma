import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Prisma, UsageReservationStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";

export type UsageMetric =
  | "monthlyAnalysisRuns"
  | "monthlyExternalResearchQueries"
  | "monthlyFetchedExternalPages"
  | "monthlyExperimentRuns"
  | "maximumStorageBytes"
  | "modelInputTokens"
  | "modelOutputTokens"
  | "estimatedModelCost"
  | "exportOperations"
  | "activeProjectMembers";

type UsageInput = {
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

  async record(input: UsageInput) {
    if (!this.config.getOrThrow<boolean>("usage.enabled")) return null;
    return this.prisma.$transaction((tx) => this.recordInTransaction(tx, input));
  }

  async aggregates(userId: string, period = this.billingPeriod()) {
    return this.prisma.usageAggregate.findMany({
      where: { userId, billingPeriod: period },
      orderBy: [{ metric: "asc" }, { projectId: "asc" }],
    });
  }

  async rebuildAggregates(userId: string, period = this.billingPeriod()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const events = await tx.usageEvent.findMany({ where: { userId, billingPeriod: period } });
      await tx.usageAggregate.deleteMany({ where: { userId, billingPeriod: period } });
      const totals = new Map<
        string,
        { metric: string; projectId: string | null; quantity: Prisma.Decimal }
      >();
      for (const event of events) {
        const scopeKey = scopeFor(event.projectId);
        const key = `${scopeKey}:${event.eventType}`;
        const current = totals.get(key);
        totals.set(key, {
          metric: event.eventType,
          projectId: event.projectId,
          quantity: current ? current.quantity.add(event.quantity) : event.quantity,
        });
      }
      if (totals.size) {
        await tx.usageAggregate.createMany({
          data: [...totals.values()].map((total) => ({
            userId,
            projectId: total.projectId,
            scopeKey: scopeFor(total.projectId),
            billingPeriod: period,
            metric: total.metric,
            quantity: total.quantity,
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
      if (!reservation || reservation.status === UsageReservationStatus.FINALIZED) return;
      if (reservation.status !== UsageReservationStatus.ACTIVE) return;
      await this.recordInTransaction(tx, input.event);
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

  private async recordInTransaction(tx: Prisma.TransactionClient, input: UsageInput) {
    const billingPeriod = this.billingPeriod(input.occurredAt);
    try {
      const event = await tx.usageEvent.create({
        data: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          subscriptionId: input.subscriptionId ?? null,
          eventType: input.eventType,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          quantity: new Prisma.Decimal(input.quantity),
          unit: input.unit,
          estimatedCostMinorUnits: input.estimatedCostMinorUnits ?? null,
          currency:
            input.estimatedCostMinorUnits === undefined
              ? null
              : this.config.getOrThrow<string>("billing.currency"),
          billingPeriod,
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata ?? {},
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
      await tx.usageAggregate.upsert({
        where: {
          userId_scopeKey_billingPeriod_metric: {
            userId: input.userId,
            scopeKey: scopeFor(input.projectId),
            billingPeriod,
            metric: input.metric,
          },
        },
        create: {
          userId: input.userId,
          projectId: input.projectId ?? null,
          scopeKey: scopeFor(input.projectId),
          billingPeriod,
          metric: input.metric,
          quantity: new Prisma.Decimal(input.quantity),
        },
        update: { quantity: { increment: new Prisma.Decimal(input.quantity) } },
      });
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
