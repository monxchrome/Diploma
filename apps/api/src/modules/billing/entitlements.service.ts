import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PlanCode, SubscriptionStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import {
  ENTITLEMENT_KEYS,
  PLAN_ENTITLEMENTS,
  type EntitlementKey,
  type Entitlements,
} from "./billing.types";

const PLAN_COPY: Record<PlanCode, { description: string; name: string }> = {
  FREE: { name: "Free", description: "A bounded local and evaluation plan." },
  PRO: { name: "Pro", description: "For individual teams with expanded decision workflows." },
  TEAM: { name: "Team", description: "For collaborative teams with higher shared limits." },
};

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
    await Promise.all(
      (Object.keys(PLAN_ENTITLEMENTS) as PlanCode[]).map((code) =>
        this.prisma.planDefinition.upsert({
          where: { code_version: { code, version } },
          create: {
            code,
            version,
            name: PLAN_COPY[code].name,
            description: PLAN_COPY[code].description,
            entitlements: PLAN_ENTITLEMENTS[code],
          },
          update: {
            active: true,
            description: PLAN_COPY[code].description,
            entitlements: PLAN_ENTITLEMENTS[code],
            name: PLAN_COPY[code].name,
          },
        }),
      ),
    );
  }

  async getPlans() {
    await this.ensureCatalog();
    return this.prisma.planDefinition.findMany({
      where: { active: true, version: this.catalogVersion() },
      orderBy: { code: "asc" },
    });
  }

  async getEntitlements(input: { projectId?: string; userId: string }): Promise<{
    entitlements: Entitlements;
    planCode: PlanCode;
    planVersion: string;
    status: SubscriptionStatus;
  }> {
    const subscription = await this.ensureFreeSubscription(input.userId);
    const eligiblePaidPlan =
      subscription.planCode !== PlanCode.FREE &&
      (subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIALING) &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > new Date());
    const planCode = eligiblePaidPlan ? subscription.planCode : PlanCode.FREE;
    const entitlements = { ...PLAN_ENTITLEMENTS[planCode] };
    const overrides = await this.activeOverrides(input);
    for (const override of overrides) {
      if (!isEntitlementKey(override.entitlement)) continue;
      const value = override.value;
      if (typeof value === "number" || typeof value === "boolean")
        entitlements[override.entitlement] = value;
    }
    return {
      entitlements,
      planCode,
      planVersion: subscription.planVersion,
      status: subscription.status,
    };
  }

  async ensureFreeSubscription(userId: string) {
    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        planCode: PlanCode.FREE,
        planVersion: this.catalogVersion(),
        provider: "FAKE",
        status: SubscriptionStatus.NONE,
      },
      update: {},
    });
  }

  catalogVersion(): string {
    return this.config.getOrThrow<string>("billing.planCatalogVersion");
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
}

function isEntitlementKey(value: string): value is EntitlementKey {
  return (ENTITLEMENT_KEYS as readonly string[]).includes(value);
}
