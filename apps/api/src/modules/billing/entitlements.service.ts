import { ConflictException, Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PlanCode, SubscriptionStatus, type PlanDefinition } from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import {
  ENTITLEMENT_KEYS,
  EntitlementsSchema,
  PLAN_CATALOG,
  type EntitlementKey,
  type Entitlements,
} from "./billing.types";

@Injectable()
export class EntitlementsService implements OnModuleInit {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCatalog();
  }

  async ensureCatalog(): Promise<void> {
    const version = this.catalogVersion();
    const currency = this.config.getOrThrow<string>("billing.currency");
    await this.prisma.$transaction(
      Object.values(PLAN_CATALOG).map((entry) =>
        this.prisma.planDefinition.upsert({
          where: { code_version: { code: entry.code, version } },
          create: {
            active: true,
            billingInterval: entry.billingInterval,
            code: entry.code,
            currency,
            description: entry.description,
            displayName: entry.displayName,
            displayOrder: entry.displayOrder,
            displayPrice: entry.displayPrice,
            entitlements: entry.entitlements,
            features: entry.features,
            name: entry.displayName,
            providerPriceKey: entry.providerPriceKey,
            version,
          },
          update: {
            active: true,
            billingInterval: entry.billingInterval,
            currency,
            description: entry.description,
            displayName: entry.displayName,
            displayOrder: entry.displayOrder,
            displayPrice: entry.displayPrice,
            entitlements: entry.entitlements,
            features: entry.features,
            name: entry.displayName,
            providerPriceKey: entry.providerPriceKey,
          },
        }),
      ),
    );
  }

  async getPlans(): Promise<PlanDefinition[]> {
    await this.ensureCatalog();
    return this.prisma.planDefinition.findMany({
      where: { active: true, version: this.catalogVersion() },
      orderBy: { displayOrder: "asc" },
    });
  }

  async getEntitlements(input: { projectId?: string; userId: string }): Promise<{
    entitlements: Entitlements;
    planCode: PlanCode;
    planVersion: string;
    status: SubscriptionStatus;
  }> {
    const subscription = await this.ensureFreeSubscription(input.userId);
    const definition = await this.effectivePlanDefinition(subscription);
    const entitlements = EntitlementsSchema.parse(definition.entitlements);
    const overrides = await this.activeOverrides(input);
    for (const override of overrides) {
      if (!isEntitlementKey(override.entitlement)) continue;
      const parsed = EntitlementsSchema.safeParse({
        ...entitlements,
        [override.entitlement]: override.value,
      });
      if (parsed.success) Object.assign(entitlements, parsed.data);
    }
    return {
      entitlements,
      planCode: definition.code,
      planVersion: definition.version,
      status: subscription.status,
    };
  }

  async ensureFreeSubscription(userId: string) {
    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        planCode: PlanCode.FREE,
        planVersion: this.catalogVersion(),
        provider: "FAKE",
        status: SubscriptionStatus.NONE,
        userId,
      },
      update: {},
    });
  }

  catalogVersion(): string {
    return this.config.getOrThrow<string>("billing.planCatalogVersion");
  }

  async latestActiveDefinition(planCode: PlanCode): Promise<PlanDefinition> {
    await this.ensureCatalog();
    const definition = await this.prisma.planDefinition.findFirst({
      where: { active: true, code: planCode, version: this.catalogVersion() },
    });
    if (!definition) throw this.catalogUnavailable(planCode, this.catalogVersion());
    return definition;
  }

  async definition(planCode: PlanCode, version: string): Promise<PlanDefinition> {
    const definition = await this.prisma.planDefinition.findUnique({
      where: { code_version: { code: planCode, version } },
    });
    if (!definition) throw this.catalogUnavailable(planCode, version);
    return definition;
  }

  private async effectivePlanDefinition(subscription: {
    currentPeriodEnd: Date | null;
    planCode: PlanCode;
    planVersion: string;
    status: SubscriptionStatus;
  }): Promise<PlanDefinition> {
    if (subscription.planCode !== PlanCode.FREE && this.paidPlanIsEffective(subscription)) {
      return this.definition(subscription.planCode, subscription.planVersion);
    }
    if (subscription.planCode === PlanCode.FREE) {
      return this.definition(PlanCode.FREE, subscription.planVersion);
    }
    return this.latestActiveDefinition(PlanCode.FREE);
  }

  private paidPlanIsEffective(subscription: {
    currentPeriodEnd: Date | null;
    status: SubscriptionStatus;
  }): boolean {
    const periodIsActive =
      !subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date();
    return periodIsActive && PAID_EFFECTIVE_STATUSES.has(subscription.status);
  }

  private async activeOverrides(input: { projectId?: string; userId: string }) {
    const now = new Date();
    return this.prisma.entitlementOverride.findMany({
      where: {
        AND: [
          {
            OR: [
              { userId: input.userId },
              ...(input.projectId ? [{ projectId: input.projectId }] : []),
            ],
          },
          { startsAt: { lte: now } },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  private catalogUnavailable(planCode: PlanCode, version: string): ConflictException {
    return new ConflictException({
      code: ErrorCodes.BillingUnavailable,
      message: `Plan catalog entry ${planCode}/${version} is unavailable`,
    });
  }
}

function isEntitlementKey(value: string): value is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}

const PAID_EFFECTIVE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.CANCELLED,
]);
