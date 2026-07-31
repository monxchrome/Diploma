import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { ExperimentsController } from "./experiments.controller";
import { ExperimentsProcessor } from "./experiments.processor";
import { ExperimentsService } from "./experiments.service";

@Module({
  controllers: [ExperimentsController],
  imports: [AuditModule, BullModule.registerQueue({ name: "experiments" }), DatabaseModule],
  providers: [ExperimentsProcessor, ExperimentsService, JwtAuthGuard, ProjectAccessGuard],
})
export class ExperimentsModule {}
