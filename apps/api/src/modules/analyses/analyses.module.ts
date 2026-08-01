import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { ResearchModule } from "../research/research.module";
import { ReportsModule } from "../reports/reports.module";
import { AnalysesController } from "./analyses.controller";
import { AnalysesProcessor } from "./analyses.processor";
import { AnalysesService } from "./analyses.service";

@Module({
  controllers: [AnalysesController],
  imports: [
    AuditModule,
    BillingModule,
    BullModule.registerQueue({ name: "analysis" }),
    DatabaseModule,
    HttpClientModule,
    ResearchModule,
    ReportsModule,
  ],
  providers: [AnalysesProcessor, AnalysesService, JwtAuthGuard, ProjectAccessGuard],
})
export class AnalysesModule {}
