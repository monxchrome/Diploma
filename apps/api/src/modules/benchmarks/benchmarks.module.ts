import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { StorageModule } from "../../infrastructure/storage/storage.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BenchmarksController } from "./benchmarks.controller";
import { BenchmarksProcessor } from "./benchmarks.processor";
import { BenchmarksService } from "./benchmarks.service";
import { BenchmarkStatisticsService } from "./benchmark-statistics.service";

@Module({
  controllers: [BenchmarksController],
  imports: [
    AuditModule,
    BillingModule,
    BullModule.registerQueue({ name: "benchmarks" }),
    DatabaseModule,
    HttpClientModule,
    StorageModule,
  ],
  providers: [BenchmarkStatisticsService, BenchmarksProcessor, BenchmarksService, JwtAuthGuard],
})
export class BenchmarksModule {}
