import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import Stripe from "stripe";

import type { PlanCode, SubscriptionStatus } from "../../generated/prisma/client";
import type {
  BillingCheckoutRequest,
  BillingCheckoutResult,
  BillingPortalRequest,
  BillingPortalResult,
  BillingProvider,
  NormalizedBillingEvent,
  ProviderSubscription,
} from "./billing.types";

type FakeProviderSubscriptionWire = Omit<
  ProviderSubscription,
  "currentPeriodEnd" | "currentPeriodStart" | "trialEndsAt"
> & {
  currentPeriodEnd: Date | string | null;
  currentPeriodStart: Date | string | null;
  trialEndsAt: Date | string | null;
};

type FakeWebhookPayload = {
  createdAt?: Date | string;
  eventId: string;
  eventType: string;
  subscription?: FakeProviderSubscriptionWire;
};

type FakeCheckout = {
  planCode: Exclude<PlanCode, "FREE">;
  planVersion: string;
  userId: string;
};

export class DeterministicFakeBillingProvider implements BillingProvider {
  readonly providerName = "fake" as const;
  readonly providerVersion = "phase-8-v1";
  private readonly checkouts = new Map<string, FakeCheckout>();
  private readonly subscriptions = new Map<string, ProviderSubscription>();

  constructor(private readonly webhookSecret: string) {}

  createOrGetCustomer(input: {
    email: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<string> {
    return Promise.resolve(`fake_customer_${input.userId}`);
  }

  createCheckoutSession(input: BillingCheckoutRequest): Promise<BillingCheckoutResult> {
    const sessionId = `fake_checkout_${input.idempotencyKey.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
    this.checkouts.set(sessionId, {
      planCode: input.planCode,
      planVersion: input.planVersion,
      userId: input.userId,
    });
    return Promise.resolve({
      checkoutUrl: `${input.successUrl}?session_id=${encodeURIComponent(sessionId)}`,
      expiresAt: null,
      provider: this.providerName,
      sessionId,
    });
  }

  createCustomerPortalSession(input: BillingPortalRequest): Promise<BillingPortalResult> {
    return Promise.resolve({
      expiresAt: null,
      portalUrl: `${input.returnUrl}?fake_customer=${encodeURIComponent(input.providerCustomerId)}`,
    });
  }

  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null> {
    return Promise.resolve(this.subscriptions.get(providerSubscriptionId) ?? null);
  }

  cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<ProviderSubscription> {
    const subscription = this.requireSubscription(providerSubscriptionId);
    const updated = { ...subscription, cancelAtPeriodEnd: true };
    this.subscriptions.set(providerSubscriptionId, updated);
    return Promise.resolve(updated);
  }

  resumeSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    const subscription = this.requireSubscription(providerSubscriptionId);
    const updated = { ...subscription, cancelAtPeriodEnd: false };
    this.subscriptions.set(providerSubscriptionId, updated);
    return Promise.resolve(updated);
  }

  healthCheck(): Promise<{ ready: boolean }> {
    return Promise.resolve({ ready: true });
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    const received = signature.replace(/^v1=/, "");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(received, "utf8");
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): NormalizedBillingEvent {
    if (!this.verifyWebhook(rawBody, signature))
      throw new Error("Invalid fake billing webhook signature");
    const payload = JSON.parse(rawBody.toString("utf8")) as FakeWebhookPayload;
    if (!payload.eventId || !payload.eventType)
      throw new Error("Invalid fake billing webhook payload");
    const subscription = payload.subscription
      ? fakeSubscriptionFromWire(payload.subscription)
      : null;
    if (subscription) this.subscriptions.set(subscription.providerSubscriptionId, subscription);
    const occurredAt = dateFromFakeValue(payload.createdAt ?? null);
    return normalizedEvent({
      eventType: payload.eventType,
      occurredAt,
      provider: this.providerName,
      providerEventId: payload.eventId,
      rawBody,
      subscription,
    });
  }

  completeCheckout(input: {
    planCode: Exclude<PlanCode, "FREE">;
    planVersion: string;
    sessionId: string;
    userId: string;
  }): NormalizedBillingEvent {
    const checkout = this.checkouts.get(input.sessionId);
    if (
      !checkout ||
      checkout.userId !== input.userId ||
      checkout.planCode !== input.planCode ||
      checkout.planVersion !== input.planVersion
    ) {
      throw new Error("Fake checkout is not available");
    }
    const now = new Date();
    const providerSubscriptionId = `fake_subscription_${createHash("sha256")
      .update(input.sessionId)
      .digest("hex")
      .slice(0, 24)}`;
    const subscription: ProviderSubscription = {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()),
      ),
      currentPeriodStart: now,
      customerId: `fake_customer_${input.userId}`,
      metadata: {
        dip_plan_code: input.planCode,
        dip_plan_version: input.planVersion,
        dip_user_id: input.userId,
      },
      planCode: input.planCode,
      planVersion: input.planVersion,
      priceId: `fake_price_${input.planCode.toLowerCase()}`,
      providerSubscriptionId,
      status: "ACTIVE",
      trialEndsAt: null,
    };
    this.subscriptions.set(providerSubscriptionId, subscription);
    const payload = Buffer.from(
      JSON.stringify({
        eventId: `fake_event_${createHash("sha256").update(input.sessionId).digest("hex").slice(0, 24)}`,
        eventType: "customer.subscription.created",
        subscription,
      }),
    );
    return normalizedEvent({
      eventType: "customer.subscription.created",
      occurredAt: now,
      provider: this.providerName,
      providerEventId: `fake_event_${createHash("sha256").update(input.sessionId).digest("hex").slice(0, 24)}`,
      rawBody: payload,
      subscription,
    });
  }

  private requireSubscription(providerSubscriptionId: string): ProviderSubscription {
    const subscription = this.subscriptions.get(providerSubscriptionId);
    if (!subscription) throw new Error("Fake subscription was not found");
    return subscription;
  }
}

export class StripeBillingProvider implements BillingProvider {
  readonly providerName = "stripe" as const;
  readonly providerVersion = "stripe-sdk-v1";
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly planByPriceId: Map<string, Exclude<PlanCode, "FREE">>,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 1, timeout: 10_000 });
  }

  async createOrGetCustomer(input: {
    email: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<string> {
    const customer = await this.stripe.customers.create(
      { email: input.email, metadata: { dip_user_id: input.userId } },
      { idempotencyKey: input.idempotencyKey },
    );
    return customer.id;
  }

  async createCheckoutSession(input: BillingCheckoutRequest): Promise<BillingCheckoutResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        ...(input.providerCustomerId
          ? { customer: input.providerCustomerId }
          : { customer_email: input.email }),
        line_items: [{ price: input.trustedPriceId, quantity: 1 }],
        metadata: input.metadata,
        mode: "subscription",
        subscription_data: { metadata: input.metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe checkout session did not include a URL");
    return {
      checkoutUrl: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1_000) : null,
      provider: this.providerName,
      sessionId: session.id,
    };
  }

  async createCustomerPortalSession(input: BillingPortalRequest): Promise<BillingPortalResult> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.providerCustomerId,
      return_url: input.returnUrl,
    });
    return { expiresAt: null, portalUrl: session.url };
  }

  async getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null> {
    try {
      return this.toSubscription(await this.stripe.subscriptions.retrieve(providerSubscriptionId));
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.statusCode === 404)
        return null;
      throw error;
    }
  }

  async cancelSubscriptionAtPeriodEnd(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscription> {
    return this.toSubscription(
      await this.stripe.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: true,
      }),
    );
  }

  async resumeSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    return this.toSubscription(
      await this.stripe.subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: false,
      }),
    );
  }

  async healthCheck(): Promise<{ ready: boolean }> {
    try {
      await this.stripe.balance.retrieve();
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    try {
      this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): NormalizedBillingEvent {
    if (!signature) throw new Error("Stripe webhook signature is required");
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const object = event.data.object;
    const eventObject = object as StripeWebhookObject;
    const subscription = object.object === "subscription" ? this.toSubscription(object) : null;
    const customerId = subscription?.customerId ?? customerIdForStripeObject(object);
    const subscriptionId =
      subscription?.providerSubscriptionId ?? subscriptionIdForStripeObject(object);
    return normalizedEvent({
      customerId,
      checkoutSessionId:
        eventObject.object === "checkout.session" ? (eventObject.id ?? null) : null,
      eventType: event.type,
      occurredAt: event.created ? new Date(event.created * 1_000) : null,
      provider: this.providerName,
      providerEventId: event.id,
      rawBody,
      subscription,
      subscriptionId,
    });
  }

  private toSubscription(value: Stripe.Subscription): ProviderSubscription {
    const item = value.items.data[0];
    const priceId = item?.price.id ?? null;
    const planCode = priceId ? this.planByPriceId.get(priceId) : undefined;
    if (!planCode) throw new Error("Stripe subscription uses an untrusted price");
    return {
      cancelAtPeriodEnd: value.cancel_at_period_end,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1_000) : null,
      currentPeriodStart: item ? new Date(item.current_period_start * 1_000) : null,
      customerId: stripeObjectId(value.customer),
      metadata: value.metadata,
      planCode,
      planVersion: value.metadata.dip_plan_version ?? null,
      priceId,
      providerSubscriptionId: value.id,
      status: mapStripeStatus(value.status),
      trialEndsAt: value.trial_end ? new Date(value.trial_end * 1_000) : null,
    };
  }
}

function normalizedEvent(input: {
  checkoutSessionId?: string | null;
  customerId?: string | null;
  eventType: string;
  occurredAt: Date | null;
  provider: "fake" | "stripe";
  providerEventId: string;
  rawBody: Buffer;
  subscription: ProviderSubscription | null;
  subscriptionId?: string | null;
}): NormalizedBillingEvent {
  const subscription = input.subscription;
  return {
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? null,
    checkoutSessionId: input.checkoutSessionId ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    customerId: subscription?.customerId ?? input.customerId ?? null,
    eventType: input.eventType,
    metadata: subscription?.metadata ?? {},
    payloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
    priceId: subscription?.priceId ?? null,
    provider: input.provider,
    providerCreatedAt: input.occurredAt,
    providerEventId: input.providerEventId,
    status: subscription?.status ?? null,
    subscription,
    subscriptionId: subscription?.providerSubscriptionId ?? input.subscriptionId ?? null,
    trialEndsAt: subscription?.trialEndsAt ?? null,
  };
}

function fakeSubscriptionFromWire(value: FakeProviderSubscriptionWire): ProviderSubscription {
  return {
    ...value,
    currentPeriodEnd: dateFromFakeValue(value.currentPeriodEnd),
    currentPeriodStart: dateFromFakeValue(value.currentPeriodStart),
    planVersion: value.planVersion ?? value.metadata.dip_plan_version ?? null,
    trialEndsAt: dateFromFakeValue(value.trialEndsAt),
  };
}

function dateFromFakeValue(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Fake subscription contains an invalid date");
  return date;
}

type StripeWebhookObject = {
  customer?: string | { id?: string } | null;
  id?: string;
  object?: string;
  subscription?: string | { id?: string } | null;
};

function customerIdForStripeObject(object: Stripe.Event.Data.Object): string | null {
  return stripeObjectId((object as StripeWebhookObject).customer);
}

function subscriptionIdForStripeObject(object: Stripe.Event.Data.Object): string | null {
  const candidate = object as StripeWebhookObject;
  if (candidate.object === "checkout.session" || candidate.object === "invoice") {
    return stripeObjectId(candidate.subscription);
  }
  return null;
}

function stripeObjectId(value: string | { id?: string } | null | undefined): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
      return "INCOMPLETE";
    default:
      return "EXPIRED";
  }
}
