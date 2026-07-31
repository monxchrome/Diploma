import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  BillingProviderName,
  BillingWebhookEventStatus,
  PlanCode,
  SubscriptionStatus,
} from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ErrorCodes } from "../../common/errors/error-codes";
import { DeterministicFakeBillingProvider, StripeBillingProvider } from "./billing.providers";
import type { BillingProvider, ProviderSubscription } from "./billing.types";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class BillingService {
  private readonly provider: BillingProvider;

  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const providerName = this.config.getOrThrow<"fake" | "stripe">("billing.provider");
    if (providerName === "stripe") {
      const prices = this.config.getOrThrow<{ PRO?: string; TEAM?: string }>(
        "billing.stripe.priceIds",
      );
      this.provider = new StripeBillingProvider(
        this.config.getOrThrow<string>("billing.stripe.secretKey"),
        this.config.getOrThrow<string>("billing.stripe.webhookSecret"),
        new Map(
          [
            [prices.PRO, PlanCode.PRO],
            [prices.TEAM, PlanCode.TEAM],
          ].filter((entry): entry is [string, Exclude<PlanCode, "FREE">] => Boolean(entry[0])),
        ),
      );
    } else {
      this.provider = new DeterministicFakeBillingProvider(
        this.config.getOrThrow<string>("billing.fakeWebhookSecret"),
      );
    }
  }

  async plans() {
    const plans = await this.entitlements.getPlans();
    const configuredPrices = this.config.getOrThrow<{ PRO?: string; TEAM?: string }>(
      "billing.stripe.priceIds",
    );
    const prices: Record<PlanCode, string | undefined> = {
      FREE: undefined,
      PRO: configuredPrices.PRO,
      TEAM: configuredPrices.TEAM,
    };
    return plans.map((plan) => ({
      code: plan.code,
      description: plan.description,
      entitlements: plan.entitlements,
      name: plan.name,
      version: plan.version,
      checkoutAvailable:
        plan.code !== PlanCode.FREE &&
        (this.provider.providerName === "fake" || Boolean(prices[plan.code])),
    }));
  }

  async subscription(userId: string) {
    const subscription = await this.entitlements.ensureFreeSubscription(userId);
    return this.publicSubscription(subscription);
  }

  async entitlementSnapshot(userId: string) {
    return this.entitlements.getEntitlements({ userId });
  }

  async checkout(input: {
    planCode: Exclude<PlanCode, "FREE">;
    requestId: string;
    userId: string;
  }) {
    if (!this.config.getOrThrow<boolean>("billing.enabled")) {
      throw new ConflictException({
        code: ErrorCodes.BillingUnavailable,
        message: "Billing is disabled",
      });
    }
    const customer = await this.ensureCustomer(input.userId);
    const priceId = this.trustedPriceId(input.planCode);
    const result = await this.provider.createCheckoutSession({
      cancelUrl:
        this.config.get<string>("billing.stripe.cancelUrl") ??
        `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`,
      customerId: customer.providerCustomerId,
      idempotencyKey: `checkout:${input.userId}:${input.planCode}:${randomUUID()}`,
      metadata: { dip_plan_code: input.planCode, dip_user_id: input.userId },
      planCode: input.planCode,
      priceId,
      successUrl:
        this.config.get<string>("billing.stripe.successUrl") ??
        `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`,
    });
    await this.audit.record({
      action: "billing.checkout.created",
      actorUserId: input.userId,
      entityId: result.sessionId,
      entityType: "BillingCheckout",
      metadata: { planCode: input.planCode, provider: this.provider.providerName },
      requestId: input.requestId,
    });
    return result;
  }

  async portal(input: { requestId: string; userId: string }) {
    const customer = await this.prisma.billingCustomer.findUnique({
      where: { userId: input.userId },
    });
    if (!customer || customer.provider !== this.providerEnum()) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Billing customer not found",
      });
    }
    const result = await this.provider.createCustomerPortalSession({
      customerId: customer.providerCustomerId,
      returnUrl:
        this.config.get<string>("billing.stripe.portalReturnUrl") ??
        `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`,
    });
    await this.audit.record({
      action: "billing.portal.created",
      actorUserId: input.userId,
      entityType: "BillingPortal",
      metadata: { provider: this.provider.providerName },
      requestId: input.requestId,
    });
    return result;
  }

  async cancel(input: { requestId: string; userId: string }) {
    const subscription = await this.requireManagedSubscription(input.userId);
    const providerSubscriptionId = subscription.providerSubscriptionId;
    if (!providerSubscriptionId)
      throw new Error("Managed subscription is missing a provider identifier");
    const update = await this.provider.cancelSubscriptionAtPeriodEnd(providerSubscriptionId);
    const saved = await this.persistSubscription(input.userId, update);
    await this.audit.record({
      action: "billing.subscription.cancelled",
      actorUserId: input.userId,
      entityId: saved.id,
      entityType: "Subscription",
      metadata: { cancelAtPeriodEnd: true },
      requestId: input.requestId,
    });
    return this.publicSubscription(saved);
  }

  async resume(input: { requestId: string; userId: string }) {
    const subscription = await this.requireManagedSubscription(input.userId);
    const providerSubscriptionId = subscription.providerSubscriptionId;
    if (!providerSubscriptionId)
      throw new Error("Managed subscription is missing a provider identifier");
    const update = await this.provider.resumeSubscription(providerSubscriptionId);
    const saved = await this.persistSubscription(input.userId, update);
    await this.audit.record({
      action: "billing.subscription.resumed",
      actorUserId: input.userId,
      entityId: saved.id,
      entityType: "Subscription",
      metadata: { cancelAtPeriodEnd: false },
      requestId: input.requestId,
    });
    return this.publicSubscription(saved);
  }

  async handleWebhook(input: { rawBody: Buffer; requestId: string; signature?: string }) {
    if (!this.provider.verifyWebhook(input.rawBody, input.signature)) {
      await this.audit.record({
        action: "billing.webhook.rejected",
        entityType: "BillingWebhookEvent",
        metadata: { provider: this.provider.providerName },
        requestId: input.requestId,
      });
      throw new BadRequestException({
        code: ErrorCodes.InvalidWebhook,
        message: "Invalid webhook signature",
      });
    }
    const event = this.provider.parseWebhookEvent(input.rawBody, input.signature);
    const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
    try {
      await this.prisma.billingWebhookEvent.create({
        data: {
          provider: this.providerEnum(),
          providerEventId: event.eventId,
          eventType: event.eventType,
          payloadHash,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.audit.record({
          action: "billing.webhook.duplicate",
          entityType: "BillingWebhookEvent",
          metadata: { provider: this.provider.providerName },
          requestId: input.requestId,
        });
        return { duplicate: true, received: true };
      }
      throw error;
    }
    try {
      if (event.subscription)
        await this.applyProviderSubscription(event.eventType, event.subscription, input.requestId);
      await this.prisma.billingWebhookEvent.update({
        where: {
          provider_providerEventId: {
            provider: this.providerEnum(),
            providerEventId: event.eventId,
          },
        },
        data: {
          status: BillingWebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          processingAttempts: 1,
        },
      });
      return { duplicate: false, received: true };
    } catch (error) {
      await this.prisma.billingWebhookEvent.update({
        where: {
          provider_providerEventId: {
            provider: this.providerEnum(),
            providerEventId: event.eventId,
          },
        },
        data: {
          status: BillingWebhookEventStatus.FAILED,
          processingAttempts: 1,
          failureCode: "WEBHOOK_PROCESSING_FAILED",
          failureMessage: "Subscription update could not be applied",
        },
      });
      throw error;
    }
  }

  async health() {
    const [plans, provider] = await Promise.all([
      this.entitlements.getPlans(),
      this.provider.healthCheck(),
    ]);
    return {
      planCatalogLoaded: plans.length === 3,
      priceMappingValid:
        this.provider.providerName === "fake" || Boolean(this.trustedPriceId(PlanCode.PRO)),
      provider: this.provider.providerName,
      ready: provider.ready && plans.length === 3,
      webhookConfigured:
        this.provider.providerName === "fake" ||
        Boolean(this.config.get<string>("billing.stripe.webhookSecret")),
    };
  }

  private async ensureCustomer(userId: string) {
    const current = await this.prisma.billingCustomer.findUnique({ where: { userId } });
    if (current?.provider === this.providerEnum()) return current;
    const providerCustomerId = await this.provider.createCustomer({
      idempotencyKey: `customer:${userId}:${this.provider.providerName}`,
      userId,
    });
    return this.prisma.billingCustomer.upsert({
      where: { userId },
      create: { userId, provider: this.providerEnum(), providerCustomerId },
      update: { provider: this.providerEnum(), providerCustomerId },
    });
  }

  private async applyProviderSubscription(
    eventType: string,
    providerSubscription: ProviderSubscription,
    requestId: string,
  ): Promise<void> {
    const userId = providerSubscription.metadata.dip_user_id;
    if (!userId) throw new Error("Provider subscription is missing trusted user metadata");
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (
      existing?.currentPeriodEnd &&
      providerSubscription.currentPeriodEnd &&
      existing.currentPeriodEnd > providerSubscription.currentPeriodEnd
    ) {
      return;
    }
    await this.persistSubscription(userId, providerSubscription);
    const action = eventType.includes("payment_failed")
      ? "billing.payment_failed"
      : providerSubscription.cancelAtPeriodEnd
        ? "billing.subscription.cancelled"
        : "billing.subscription.updated";
    await this.audit.record({
      action,
      actorUserId: userId,
      entityId: providerSubscription.providerSubscriptionId,
      entityType: "Subscription",
      metadata: { planCode: providerSubscription.planCode, status: providerSubscription.status },
      requestId,
    });
  }

  private async persistSubscription(userId: string, value: ProviderSubscription) {
    const customer = value.customerId
      ? await this.prisma.billingCustomer.upsert({
          where: { userId },
          create: {
            userId,
            provider: this.providerEnum(),
            providerCustomerId: value.customerId,
          },
          update: {
            provider: this.providerEnum(),
            providerCustomerId: value.customerId,
          },
        })
      : null;
    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        billingCustomerId: customer?.id,
        planCode: value.planCode,
        planVersion: this.entitlements.catalogVersion(),
        provider: this.providerEnum(),
        providerSubscriptionId: value.providerSubscriptionId,
        providerPriceId: value.priceId,
        status: value.status,
        currentPeriodStart: value.currentPeriodStart,
        currentPeriodEnd: value.currentPeriodEnd,
        cancelAtPeriodEnd: value.cancelAtPeriodEnd,
        trialEndsAt: value.trialEndsAt,
        cancelledAt: value.status === SubscriptionStatus.CANCELLED ? new Date() : null,
        metadata: value.metadata,
      },
      update: {
        billingCustomerId: customer?.id,
        planCode: value.planCode,
        planVersion: this.entitlements.catalogVersion(),
        provider: this.providerEnum(),
        providerSubscriptionId: value.providerSubscriptionId,
        providerPriceId: value.priceId,
        status: value.status,
        currentPeriodStart: value.currentPeriodStart,
        currentPeriodEnd: value.currentPeriodEnd,
        cancelAtPeriodEnd: value.cancelAtPeriodEnd,
        trialEndsAt: value.trialEndsAt,
        cancelledAt: value.status === SubscriptionStatus.CANCELLED ? new Date() : null,
        metadata: value.metadata,
      },
    });
  }

  private async requireManagedSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
    if (!subscription?.providerSubscriptionId || subscription.provider !== this.providerEnum()) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Managed subscription not found",
      });
    }
    return subscription;
  }

  private trustedPriceId(planCode: Exclude<PlanCode, "FREE">): string {
    if (this.provider.providerName === "fake") return `fake_price_${planCode.toLowerCase()}`;
    const priceId = this.config.getOrThrow<{ PRO?: string; TEAM?: string }>(
      "billing.stripe.priceIds",
    )[planCode];
    if (!priceId)
      throw new ConflictException({
        code: ErrorCodes.BillingUnavailable,
        message: "Plan is unavailable",
      });
    return priceId;
  }

  private providerEnum(): BillingProviderName {
    return this.provider.providerName === "stripe"
      ? BillingProviderName.STRIPE
      : BillingProviderName.FAKE;
  }

  private publicSubscription(subscription: {
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    currentPeriodStart: Date | null;
    planCode: PlanCode;
    planVersion: string;
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
  }) {
    return {
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      planCode: subscription.planCode,
      planVersion: subscription.planVersion,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
