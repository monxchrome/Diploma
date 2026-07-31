import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { z } from "zod";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillingService } from "./billing.service";
import { UsageService } from "./usage.service";

const CheckoutSchema = z.object({ planCode: z.enum(["PRO", "TEAM"]) });

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(UsageService) private readonly usageService: UsageService,
  ) {}

  @Get("plans")
  plans() {
    return this.billing.plans();
  }

  @Get("subscription")
  subscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.subscription(user.id);
  }

  @Get("entitlements")
  entitlements(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.entitlementSnapshot(user.id);
  }

  @Get("usage")
  async usage(@CurrentUser() user: AuthenticatedUser) {
    const period = this.usageService.billingPeriod();
    const [aggregates, entitlement] = await Promise.all([
      this.usageService.aggregates(user.id, period),
      this.billing.entitlementSnapshot(user.id),
    ]);
    const resetDate = new Date(`${period}-01T00:00:00.000Z`);
    resetDate.setUTCMonth(resetDate.getUTCMonth() + 1);
    return {
      billingPeriod: period,
      limits: entitlement.entitlements,
      metrics: aggregates.map((aggregate) => ({
        metric: aggregate.metric,
        projectId: aggregate.projectId,
        quantity: Number(aggregate.quantity),
      })),
      planCode: entitlement.planCode,
      resetAt: resetDate.toISOString(),
    };
  }

  @Post("checkout")
  checkout(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.billing.checkout({
      planCode: CheckoutSchema.parse(body).planCode,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }

  @Post("portal")
  portal(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.billing.portal({ requestId: getRequestId(request), userId: user.id });
  }

  @Post("cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.billing.cancel({ requestId: getRequestId(request), userId: user.id });
  }

  @Post("resume")
  resume(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.billing.resume({ requestId: getRequestId(request), userId: user.id });
  }
}

@Controller("webhooks")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true, default: true })
export class BillingWebhookController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Post("stripe")
  stripe(@Req() request: Request & { rawBody?: Buffer }) {
    const signature =
      request.headers["stripe-signature"] ?? request.headers["x-dip-fake-signature"];
    return this.billing.handleWebhook({
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})),
      requestId: getRequestId(request),
      signature: Array.isArray(signature) ? signature[0] : signature,
    });
  }
}
