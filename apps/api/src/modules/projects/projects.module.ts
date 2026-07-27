import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "./guards/project-access.guard";
import { ProjectsRepository } from "./repositories/projects.repository";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController],
  imports: [AuditModule, DatabaseModule],
  providers: [JwtAuthGuard, ProjectAccessGuard, ProjectsRepository, ProjectsService],
})
export class ProjectsModule {}
