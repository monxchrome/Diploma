import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { StorageModule } from "../../infrastructure/storage/storage.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { IngestionProcessor } from "./ingestion.processor";
import { KnowledgeBasesController } from "./knowledge-bases.controller";
import { KnowledgeBasesService } from "./knowledge-bases.service";

@Module({
  controllers: [KnowledgeBasesController],
  imports: [
    AuditModule,
    BillingModule,
    BullModule.registerQueue({ name: "ingestion" }),
    DatabaseModule,
    HttpClientModule,
    StorageModule,
  ],
  providers: [IngestionProcessor, JwtAuthGuard, KnowledgeBasesService, ProjectAccessGuard],
})
export class KnowledgeBasesModule {}
