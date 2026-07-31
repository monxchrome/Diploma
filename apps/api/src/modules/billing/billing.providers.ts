import { createHmac, timingSafeEqual } from "node:crypto";

import axios, { type AxiosInstance } from "axios";

import type { PlanCode, SubscriptionStatus } from "../../generated/prisma/client";
import type {
  BillingProvider,
  ProviderCheckout,
  ProviderPortal,
  ProviderSubscription,
  ProviderWebhookEvent,
} from "./billing.types";

type FakeWebhookPayload = {
  eventId: string;
  eventType: string;
  subscription?: FakeProviderSubscriptionWire;
};

type FakeProviderSubscriptionWire = Omit<
  ProviderSubscription,
  "currentPeriodEnd" | "currentPeriodStart" | "trialEndsAt"
> & {
  currentPeriodEnd: Date | string | null;
  currentPeriodStart: Date | string | null;
  trialEndsAt: Date | string | null;
};

export class DeterministicFakeBillingProvider implements BillingProvider {
  readonly providerName = "fake" as const;
  readonly providerVersion = "phase-7-v1";
  private readonly subscriptions = new Map<string, ProviderSubscription>();

  constructor(private readonly webhookSecret: string) {}

  createCheckoutSession(input: {
    customerId: string | null;
    idempotencyKey: string;
    metadata: Record<string, string>;
    planCode: Exclude<PlanCode, "FREE">;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderCheckout> {
    const sessionId = `fake_checkout_${input.idempotencyKey.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}`;
    return Promise.resolve({
      checkoutUrl: `${input.successUrl}?session_id=${encodeURIComponent(sessionId)}`,
      sessionId,
    });
  }

  createCustomer(input: { idempotencyKey: string; userId: string }): Promise<string> {
    return Promise.resolve(`fake_customer_${input.userId}`);
  }

  createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<ProviderPortal> {
    return Promise.resolve({
      portalUrl: `${input.returnUrl}?fake_customer=${encodeURIComponent(input.customerId)}`,
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

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): ProviderWebhookEvent {
    if (!this.verifyWebhook(rawBody, signature))
      throw new Error("Invalid fake billing webhook signature");
    const payload = JSON.parse(rawBody.toString("utf8")) as FakeWebhookPayload;
    if (!payload.eventId || !payload.eventType)
      throw new Error("Invalid fake billing webhook payload");
    const subscription = payload.subscription
      ? fakeSubscriptionFromWire(payload.subscription)
      : null;
    if (subscription) this.subscriptions.set(subscription.providerSubscriptionId, subscription);
    return {
      eventId: payload.eventId,
      eventType: payload.eventType,
      subscription,
    };
  }

  private requireSubscription(providerSubscriptionId: string): ProviderSubscription {
    const subscription = this.subscriptions.get(providerSubscriptionId);
    if (!subscription) throw new Error("Fake subscription was not found");
    return subscription;
  }
}

type StripeSubscriptionWire = {
  cancel_at_period_end: boolean;
  current_period_end?: number;
  current_period_start?: number;
  customer: string;
  id: string;
  items?: { data?: Array<{ price?: { id?: string } }> };
  metadata?: Record<string, string>;
  status: string;
  trial_end?: number | null;
};

export class StripeBillingProvider implements BillingProvider {
  readonly providerName = "stripe" as const;
  readonly providerVersion = "stripe-rest-v1";
  private readonly client: AxiosInstance;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly planByPriceId: Map<string, Exclude<PlanCode, "FREE">>,
  ) {
    this.client = axios.create({
      auth: { password: "", username: secretKey },
      baseURL: "https://api.stripe.com/v1",
      timeout: 10_000,
    });
  }

  async createCheckoutSession(input: {
    customerId: string | null;
    idempotencyKey: string;
    metadata: Record<string, string>;
    planCode: Exclude<PlanCode, "FREE">;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderCheckout> {
    const form = new URLSearchParams({
      cancel_url: input.cancelUrl,
      mode: "subscription",
      success_url: input.successUrl,
    });
    form.set("line_items[0][price]", input.priceId);
    form.set("line_items[0][quantity]", "1");
    if (input.customerId) form.set("customer", input.customerId);
    for (const [key, value] of Object.entries(input.metadata)) form.set(`metadata[${key}]`, value);
    const response = await this.client.post<{ id: string; url: string }>(
      "/checkout/sessions",
      form,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": input.idempotencyKey,
        },
      },
    );
    return { checkoutUrl: response.data.url, sessionId: response.data.id };
  }

  async createCustomer(input: { idempotencyKey: string; userId: string }): Promise<string> {
    const form = new URLSearchParams();
    form.set("metadata[dip_user_id]", input.userId);
    const response = await this.client.post<{ id: string }>("/customers", form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
    });
    return response.data.id;
  }

  async createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<ProviderPortal> {
    const form = new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl });
    const response = await this.client.post<{ url: string }>("/billing_portal/sessions", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return { portalUrl: response.data.url };
  }

  async getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null> {
    try {
      const response = await this.client.get<StripeSubscriptionWire>(
        `/subscriptions/${providerSubscriptionId}`,
      );
      return this.toSubscription(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  }

  async cancelSubscriptionAtPeriodEnd(
    providerSubscriptionId: string,
  ): Promise<ProviderSubscription> {
    const form = new URLSearchParams({ cancel_at_period_end: "true" });
    const response = await this.client.post<StripeSubscriptionWire>(
      `/subscriptions/${providerSubscriptionId}`,
      form,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    return this.toSubscription(response.data);
  }

  async resumeSubscription(providerSubscriptionId: string): Promise<ProviderSubscription> {
    const form = new URLSearchParams({ cancel_at_period_end: "false" });
    const response = await this.client.post<StripeSubscriptionWire>(
      `/subscriptions/${providerSubscriptionId}`,
      form,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    return this.toSubscription(response.data);
  }

  async healthCheck(): Promise<{ ready: boolean }> {
    try {
      await this.client.get("/balance");
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const components = Object.fromEntries(
      signature.split(",").map((part) => {
        const [key, value] = part.split("=", 2);
        return [key ?? "", value ?? ""];
      }),
    );
    const timestamp = components.t;
    const received = components.v1;
    if (!timestamp || !received || !/^\d+$/.test(timestamp)) return false;
    const ageSeconds = Math.abs(Date.now() / 1_000 - Number(timestamp));
    if (ageSeconds > 300) return false;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(received, "utf8");
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): ProviderWebhookEvent {
    if (!this.verifyWebhook(rawBody, signature))
      throw new Error("Invalid Stripe webhook signature");
    const event = JSON.parse(rawBody.toString("utf8")) as {
      data?: { object?: StripeSubscriptionWire };
      id?: string;
      type?: string;
    };
    if (!event.id || !event.type) throw new Error("Invalid Stripe webhook payload");
    const object = event.data?.object;
    const subscription = object?.id.startsWith("sub_") ? this.toSubscription(object) : null;
    return { eventId: event.id, eventType: event.type, subscription };
  }

  private toSubscription(value: StripeSubscriptionWire): ProviderSubscription {
    const priceId = value.items?.data?.[0]?.price?.id ?? null;
    const planCode = priceId ? this.planByPriceId.get(priceId) : undefined;
    if (!planCode) throw new Error("Stripe subscription uses an untrusted price");
    return {
      cancelAtPeriodEnd: value.cancel_at_period_end,
      currentPeriodEnd: dateFromEpoch(value.current_period_end),
      currentPeriodStart: dateFromEpoch(value.current_period_start),
      customerId: value.customer,
      metadata: value.metadata ?? {},
      planCode,
      priceId,
      providerSubscriptionId: value.id,
      status: mapStripeStatus(value.status),
      trialEndsAt: dateFromEpoch(value.trial_end),
    };
  }
}

function dateFromEpoch(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1_000) : null;
}

function fakeSubscriptionFromWire(value: FakeProviderSubscriptionWire): ProviderSubscription {
  return {
    ...value,
    currentPeriodEnd: dateFromFakeValue(value.currentPeriodEnd),
    currentPeriodStart: dateFromFakeValue(value.currentPeriodStart),
    trialEndsAt: dateFromFakeValue(value.trialEndsAt),
  };
}

function dateFromFakeValue(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Fake subscription contains an invalid date");
  return date;
}

function mapStripeStatus(status: string): SubscriptionStatus {
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
