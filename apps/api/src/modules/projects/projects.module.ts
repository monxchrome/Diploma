import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "./guards/project-access.guard";
import { ProjectsRepository } from "./repositories/projects.repository";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController],
  imports: [AuditModule, BillingModule, DatabaseModule],
  providers: [JwtAuthGuard, ProjectAccessGuard, ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
