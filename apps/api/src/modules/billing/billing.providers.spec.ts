import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DeterministicFakeBillingProvider, StripeBillingProvider } from "./billing.providers";

describe("DeterministicFakeBillingProvider", () => {
  it("accepts a valid signed webhook and supports cancellation/resume idempotently", async () => {
    const provider = new DeterministicFakeBillingProvider("test-secret");
    const payload = Buffer.from(
      JSON.stringify({
        eventId: "evt_fake_1",
        eventType: "customer.subscription.updated",
        subscription: {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2030-01-01T00:00:00.000Z",
          currentPeriodStart: "2029-12-01T00:00:00.000Z",
          customerId: "fake_customer_user",
          metadata: {
            dip_plan_code: "PRO",
            dip_plan_version: "phase-8-v1",
            dip_user_id: "00000000-0000-4000-8000-000000000001",
          },
          planCode: "PRO",
          planVersion: "phase-8-v1",
          priceId: "fake_price_pro",
          providerSubscriptionId: "fake_subscription_1",
          status: "ACTIVE",
          trialEndsAt: null,
        },
      }),
    );
    const signature = `v1=${createHmac("sha256", "test-secret").update(payload).digest("hex")}`;
    const event = provider.parseWebhookEvent(payload, signature);
    expect(event.subscription?.planCode).toBe("PRO");

    await provider.cancelSubscriptionAtPeriodEnd("fake_subscription_1");
    expect((await provider.getSubscription("fake_subscription_1"))?.cancelAtPeriodEnd).toBe(true);
    await provider.resumeSubscription("fake_subscription_1");
    expect((await provider.getSubscription("fake_subscription_1"))?.cancelAtPeriodEnd).toBe(false);
  });

  it("rejects a forged webhook signature", () => {
    const provider = new DeterministicFakeBillingProvider("test-secret");
    expect(provider.verifyWebhook(Buffer.from("{}"), "v1=forged")).toBe(false);
  });

  it("keeps checkout redirect separate from controlled completion", async () => {
    const provider = new DeterministicFakeBillingProvider("test-secret");
    const checkout = await provider.createCheckoutSession({
      cancelUrl: "http://localhost:3000/settings/billing",
      email: "user@example.test",
      idempotencyKey: "checkout-1",
      metadata: {},
      planCode: "PRO",
      planVersion: "phase-8-v1",
      successUrl: "http://localhost:3000/settings/billing",
      trustedPriceId: "fake_price_pro",
      userId: "00000000-0000-4000-8000-000000000001",
    });

    expect((await provider.getSubscription("fake_subscription_checkout-1")) ?? null).toBeNull();
    const event = provider.completeCheckout({
      planCode: "PRO",
      planVersion: "phase-8-v1",
      sessionId: checkout.sessionId,
      userId: "00000000-0000-4000-8000-000000000001",
    });

    expect(event.subscription?.status).toBe("ACTIVE");
    expect(event.subscription?.metadata.dip_plan_version).toBe("phase-8-v1");
  });

  it("returns the same checkout session for a repeated idempotency key", async () => {
    const provider = new DeterministicFakeBillingProvider("test-secret");
    const request = {
      cancelUrl: "http://localhost:3000/settings/billing",
      email: "user@example.test",
      idempotencyKey: "retry-safe-checkout",
      metadata: {},
      planCode: "TEAM" as const,
      planVersion: "phase-8-v1",
      successUrl: "http://localhost:3000/settings/billing",
      trustedPriceId: "fake_price_team",
      userId: "00000000-0000-4000-8000-000000000001",
    };

    const [first, second] = await Promise.all([
      provider.createCheckoutSession(request),
      provider.createCheckoutSession(request),
    ]);

    expect(first.sessionId).toBe(second.sessionId);
  });
});

describe("StripeBillingProvider", () => {
  it("rejects invalid signatures without a Stripe key or network request", () => {
    const provider = new StripeBillingProvider("sk_test_unused", "whsec_unused", new Map());
    expect(provider.verifyWebhook(Buffer.from("{}"), "t=1,v1=forged")).toBe(false);
  });
});
