import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { BillingModule } from "../billing/billing.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { VersionController } from "./version.controller";

@Module({
  controllers: [HealthController, VersionController],
  imports: [BillingModule, DatabaseModule, RedisModule],
  providers: [HealthService],
})
export class HealthModule {}
