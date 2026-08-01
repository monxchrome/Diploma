import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { StorageModule } from "../../infrastructure/storage/storage.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  AnalysisSnapshotsController,
  BrandProfilesController,
  CommentsController,
  CommentThreadsController,
  ExportsController,
  NotificationsController,
  ProjectReportsController,
  AuthenticatedSharedReportsController,
  PublicReportsController,
  PublicSharedCommentsController,
  ReportSnapshotsController,
  ShareLinksController,
} from "./reports.controller";
import { ReportsProcessor } from "./reports.processor";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [
    ProjectReportsController,
    ReportSnapshotsController,
    AnalysisSnapshotsController,
    ExportsController,
    ShareLinksController,
    CommentsController,
    CommentThreadsController,
    NotificationsController,
    BrandProfilesController,
    PublicReportsController,
    AuthenticatedSharedReportsController,
    PublicSharedCommentsController,
  ],
  exports: [ReportsService],
  imports: [
    AuditModule,
    BillingModule,
    BullModule.registerQueue({ name: "report-export" }),
    DatabaseModule,
    StorageModule,
  ],
  providers: [ReportsProcessor, ReportsService, JwtAuthGuard],
})
export class ReportsModule {}
