import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { RetrievalController } from "./retrieval.controller";
import { RetrievalService } from "./retrieval.service";

@Module({
  controllers: [RetrievalController],
  imports: [AuditModule, DatabaseModule, HttpClientModule],
  providers: [JwtAuthGuard, ProjectAccessGuard, RetrievalService],
})
export class RetrievalModule {}
