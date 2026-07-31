import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  BillingCheckoutStatus,
  BillingProviderName,
  BillingWebhookEventStatus,
  PlanCode,
  SubscriptionStatus,
} from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { DeterministicFakeBillingProvider, StripeBillingProvider } from "./billing.providers";
import type {
  BillingProvider,
  NormalizedBillingEvent,
  ProviderSubscription,
} from "./billing.types";
import { EntitlementsSchema } from "./billing.types";
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
      return;
    }
    if (!this.config.getOrThrow<boolean>("billing.fakeProviderEnabled")) {
      throw new Error("The fake billing provider is disabled");
    }
    this.provider = new DeterministicFakeBillingProvider(
      this.config.getOrThrow<string>("billing.fakeWebhookSecret"),
    );
  }

  async plans() {
    const plans = await this.entitlements.getPlans();
    return plans.map((plan) => ({
      billingInterval: plan.billingInterval,
      checkoutAvailable:
        plan.code !== PlanCode.FREE &&
        Boolean(plan.active) &&
        (this.provider.providerName === "fake" || Boolean(this.trustedPriceId(plan.code))),
      code: plan.code,
      currency: plan.currency,
      description: plan.description,
      displayName: plan.displayName,
      displayPrice: plan.displayPrice,
      entitlements: EntitlementsSchema.parse(plan.entitlements),
      features: stringList(plan.features),
      version: plan.version,
    }));
  }

  async subscription(userId: string) {
    const subscription = await this.entitlements.ensureFreeSubscription(userId);
    const effective = await this.entitlements.getEntitlements({ userId });
    return this.publicSubscription({
      ...subscription,
      planCode: effective.planCode,
      planVersion: effective.planVersion,
    });
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
    const [plan, user] = await Promise.all([
      this.entitlements.latestActiveDefinition(input.planCode),
      this.prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }),
    ]);
    if (!user)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "User not found" });
    const customer = await this.ensureCustomer({ email: user.email, userId: input.userId });
    const result = await this.provider.createCheckoutSession({
      cancelUrl: this.cancelUrl(),
      email: user.email,
      idempotencyKey: `checkout:${input.userId}:${input.planCode}:${input.requestId}`,
      metadata: {
        dip_plan_code: input.planCode,
        dip_plan_version: plan.version,
        dip_user_id: input.userId,
      },
      planCode: input.planCode,
      planVersion: plan.version,
      providerCustomerId: customer.providerCustomerId,
      successUrl: this.successUrl(),
      trustedPriceId: this.trustedPriceId(input.planCode),
      userId: input.userId,
    });
    await this.prisma.billingCheckout.upsert({
      where: { providerSessionId: result.sessionId },
      create: {
        expiresAt: result.expiresAt,
        planCode: input.planCode,
        planVersion: plan.version,
        provider: this.providerEnum(),
        providerSessionId: result.sessionId,
        userId: input.userId,
      },
      update: { expiresAt: result.expiresAt },
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

  async completeFakeCheckout(input: { requestId: string; sessionId: string; userId: string }) {
    if (
      this.provider.providerName !== "fake" ||
      this.config.getOrThrow<string>("app.environment") === "production" ||
      !this.config.getOrThrow<boolean>("billing.fakeProviderEnabled")
    ) {
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Checkout not found" });
    }
    const checkout = await this.prisma.billingCheckout.findFirst({
      where: {
        provider: BillingProviderName.FAKE,
        providerSessionId: input.sessionId,
        status: BillingCheckoutStatus.CREATED,
        userId: input.userId,
      },
    });
    if (!checkout)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Checkout not found" });
    const event = this.fakeProvider().completeCheckout({
      planCode: checkout.planCode as Exclude<PlanCode, "FREE">,
      planVersion: checkout.planVersion,
      sessionId: checkout.providerSessionId,
      userId: input.userId,
    });
    await this.processEvent(event, input.requestId);
    await this.prisma.billingCheckout.update({
      where: { id: checkout.id },
      data: { completedAt: new Date(), status: BillingCheckoutStatus.COMPLETED },
    });
    return this.subscription(input.userId);
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
      providerCustomerId: customer.providerCustomerId,
      returnUrl: this.portalReturnUrl(),
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
    const saved = await this.persistSubscription(input.userId, update, new Date());
    await this.audit.record({
      action: "billing.subscription.cancel_requested",
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
    const saved = await this.persistSubscription(input.userId, update, new Date());
    await this.audit.record({
      action: "billing.subscription.resume_requested",
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
    return this.processEvent(event, input.requestId);
  }

  async health() {
    const [plans, provider] = await Promise.all([
      this.entitlements.getPlans(),
      this.provider.healthCheck(),
    ]);
    return {
      planCatalogLoaded: plans.length === 3,
      priceMappingValid:
        this.provider.providerName === "fake" ||
        plans
          .filter((plan) => plan.code !== PlanCode.FREE)
          .every((plan) => Boolean(this.trustedPriceId(plan.code as Exclude<PlanCode, "FREE">))),
      provider: this.provider.providerName,
      ready: provider.ready && plans.length === 3,
      webhookConfigured:
        this.provider.providerName === "fake" ||
        Boolean(this.config.get<string>("billing.stripe.webhookSecret")),
    };
  }

  private async processEvent(event: NormalizedBillingEvent, requestId: string) {
    const created = await this.prisma.billingWebhookEvent
      .create({
        data: {
          eventType: event.eventType,
          payloadHash: event.payloadHash,
          provider: this.providerEnum(),
          providerEventId: event.providerEventId,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) return null;
        throw error;
      });
    if (!created) {
      await this.audit.record({
        action: "billing.webhook.duplicate",
        entityType: "BillingWebhookEvent",
        metadata: { provider: this.provider.providerName },
        requestId,
      });
      return { duplicate: true, received: true };
    }
    try {
      const applied = event.subscription
        ? await this.applyProviderSubscription(event, requestId)
        : false;
      if (event.eventType === "checkout.session.completed") {
        await this.prisma.billingCheckout.updateMany({
          where: {
            provider: this.providerEnum(),
            providerSessionId: event.checkoutSessionId ?? "",
          },
          data: { completedAt: new Date(), status: BillingCheckoutStatus.COMPLETED },
        });
      }
      await this.prisma.billingWebhookEvent.update({
        where: { id: created.id },
        data: {
          processedAt: new Date(),
          processingAttempts: 1,
          status:
            applied || !event.subscription
              ? BillingWebhookEventStatus.PROCESSED
              : BillingWebhookEventStatus.REJECTED,
        },
      });
      return { duplicate: false, received: true };
    } catch (error) {
      await this.prisma.billingWebhookEvent.update({
        where: { id: created.id },
        data: {
          failureCode: "WEBHOOK_PROCESSING_FAILED",
          failureMessage: "Subscription update could not be applied",
          processingAttempts: 1,
          status: BillingWebhookEventStatus.FAILED,
        },
      });
      throw error;
    }
  }

  private async ensureCustomer(input: { email: string; userId: string }) {
    const current = await this.prisma.billingCustomer.findUnique({
      where: { userId: input.userId },
    });
    if (current?.provider === this.providerEnum()) return current;
    const providerCustomerId = await this.provider.createOrGetCustomer({
      email: input.email,
      idempotencyKey: `customer:${input.userId}:${this.provider.providerName}`,
      userId: input.userId,
    });
    return this.prisma.billingCustomer.upsert({
      where: { userId: input.userId },
      create: { provider: this.providerEnum(), providerCustomerId, userId: input.userId },
      update: { provider: this.providerEnum(), providerCustomerId },
    });
  }

  private async applyProviderSubscription(
    event: NormalizedBillingEvent,
    requestId: string,
  ): Promise<boolean> {
    const providerSubscription = event.subscription;
    if (!providerSubscription) return false;
    const userId = providerSubscription.metadata.dip_user_id;
    const planVersion = providerSubscription.planVersion;
    if (!userId || !planVersion) return false;
    if (
      providerSubscription.metadata.dip_plan_code !== providerSubscription.planCode ||
      providerSubscription.metadata.dip_plan_version !== planVersion
    ) {
      return false;
    }
    const customer = await this.prisma.billingCustomer.findUnique({ where: { userId } });
    if (
      !customer ||
      customer.provider !== this.providerEnum() ||
      customer.providerCustomerId !== providerSubscription.customerId
    ) {
      return false;
    }
    await this.entitlements.definition(providerSubscription.planCode, planVersion);
    const existing = await this.prisma.subscription.findUnique({ where: { userId } });
    if (
      event.providerCreatedAt &&
      existing?.lastProviderEventAt &&
      event.providerCreatedAt < existing.lastProviderEventAt
    ) {
      return true;
    }
    const saved = await this.persistSubscription(
      userId,
      providerSubscription,
      event.providerCreatedAt ?? new Date(),
      customer.id,
    );
    const action =
      event.eventType === "invoice.payment_failed"
        ? "billing.payment_failed"
        : providerSubscription.cancelAtPeriodEnd
          ? "billing.subscription.cancelled"
          : "billing.subscription.updated";
    await this.audit.record({
      action,
      actorUserId: userId,
      entityId: saved.id,
      entityType: "Subscription",
      metadata: { planCode: providerSubscription.planCode, status: providerSubscription.status },
      requestId,
    });
    return true;
  }

  private async persistSubscription(
    userId: string,
    value: ProviderSubscription,
    providerEventAt: Date,
    billingCustomerId?: string,
  ) {
    const customer = billingCustomerId
      ? { id: billingCustomerId }
      : await this.prisma.billingCustomer.findUnique({ where: { userId } });
    if (!customer) throw new Error("Billing customer was not found");
    const planVersion = value.planVersion;
    if (!planVersion) throw new Error("Provider subscription is missing the plan version");
    return this.prisma.subscription.upsert({
      where: { userId },
      create: {
        billingCustomerId: customer.id,
        cancelAtPeriodEnd: value.cancelAtPeriodEnd,
        cancelledAt: value.status === SubscriptionStatus.CANCELLED ? new Date() : null,
        currentPeriodEnd: value.currentPeriodEnd,
        currentPeriodStart: value.currentPeriodStart,
        lastProviderEventAt: providerEventAt,
        metadata: value.metadata,
        planCode: value.planCode,
        planVersion,
        provider: this.providerEnum(),
        providerPriceId: value.priceId,
        providerSubscriptionId: value.providerSubscriptionId,
        status: value.status,
        trialEndsAt: value.trialEndsAt,
        userId,
      },
      update: {
        billingCustomerId: customer.id,
        cancelAtPeriodEnd: value.cancelAtPeriodEnd,
        cancelledAt: value.status === SubscriptionStatus.CANCELLED ? new Date() : null,
        currentPeriodEnd: value.currentPeriodEnd,
        currentPeriodStart: value.currentPeriodStart,
        lastProviderEventAt: providerEventAt,
        metadata: value.metadata,
        planCode: value.planCode,
        planVersion,
        provider: this.providerEnum(),
        providerPriceId: value.priceId,
        providerSubscriptionId: value.providerSubscriptionId,
        status: value.status,
        trialEndsAt: value.trialEndsAt,
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
    if (!priceId) {
      throw new ConflictException({
        code: ErrorCodes.BillingUnavailable,
        message: "Plan is unavailable",
      });
    }
    return priceId;
  }

  private providerEnum(): BillingProviderName {
    return this.provider.providerName === "stripe"
      ? BillingProviderName.STRIPE
      : BillingProviderName.FAKE;
  }

  private fakeProvider(): DeterministicFakeBillingProvider {
    if (!(this.provider instanceof DeterministicFakeBillingProvider)) {
      throw new Error("The fake billing provider is unavailable");
    }
    return this.provider;
  }

  private successUrl(): string {
    return (
      this.config.get<string>("billing.stripe.successUrl") ??
      `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`
    );
  }

  private cancelUrl(): string {
    return (
      this.config.get<string>("billing.stripe.cancelUrl") ??
      `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`
    );
  }

  private portalReturnUrl(): string {
    return (
      this.config.get<string>("billing.stripe.portalReturnUrl") ??
      `${this.config.getOrThrow<string>("app.baseUrl")}/settings/billing`
    );
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

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
