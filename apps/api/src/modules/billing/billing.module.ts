import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillingController, BillingWebhookController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EntitlementsService } from "./entitlements.service";
import { QuotaService } from "./quota.service";
import { UsageService } from "./usage.service";

@Module({
  controllers: [BillingController, BillingWebhookController],
  imports: [AuditModule, DatabaseModule],
  providers: [BillingService, EntitlementsService, JwtAuthGuard, QuotaService, UsageService],
  exports: [BillingService, EntitlementsService, QuotaService, UsageService],
})
export class BillingModule {}
