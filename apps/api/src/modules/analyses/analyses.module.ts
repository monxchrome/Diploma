import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { AuditModule } from "../audit/audit.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { AnalysesController } from "./analyses.controller";
import { AnalysesProcessor } from "./analyses.processor";
import { AnalysesService } from "./analyses.service";

@Module({
  controllers: [AnalysesController],
  imports: [AuditModule, BullModule.registerQueue({ name: "analysis" }), DatabaseModule, HttpClientModule],
  providers: [AnalysesProcessor, AnalysesService, JwtAuthGuard, ProjectAccessGuard],
})
export class AnalysesModule {}
