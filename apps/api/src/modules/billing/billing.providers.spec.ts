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
          metadata: { dip_user_id: "00000000-0000-4000-8000-000000000001" },
          planCode: "PRO",
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
});

describe("StripeBillingProvider", () => {
  it("rejects invalid signatures without a Stripe key or network request", () => {
    const provider = new StripeBillingProvider("sk_test_unused", "whsec_unused", new Map());
    expect(provider.verifyWebhook(Buffer.from("{}"), "t=1,v1=forged")).toBe(false);
  });
});
