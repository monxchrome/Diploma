import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReportsService } from "./reports.service";

@Controller("projects/:projectId/reports")
@UseGuards(JwtAuthGuard)
export class ProjectReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get(":lineageId/versions")
  list(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("lineageId", ParseUUIDPipe) lineageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.listVersions({ lineageId, projectId, userId: user.id });
  }

  @Put("brand-profile")
  selectBrand(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() body: { brandProfileId?: unknown },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (typeof body.brandProfileId !== "string") throw new Error("brandProfileId is required");
    return this.reports.selectBrandProfile({
      brandProfileId: body.brandProfileId,
      projectId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
}

@Controller("report-snapshots")
@UseGuards(JwtAuthGuard)
export class ReportSnapshotsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get("compare")
  compare(
    @Query("leftSnapshotId", ParseUUIDPipe) leftSnapshotId: string,
    @Query("rightSnapshotId", ParseUUIDPipe) rightSnapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.compare({
      leftSnapshotId,
      requestId: getRequestId(request),
      rightSnapshotId,
      userId: user.id,
    });
  }

  @Get(":snapshotId")
  get(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.getSnapshot(snapshotId, user.id);
  }

  @Post(":snapshotId/publish")
  publish(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.publish({ requestId: getRequestId(request), snapshotId, userId: user.id });
  }

  @Post(":snapshotId/archive")
  archive(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.archive({ requestId: getRequestId(request), snapshotId, userId: user.id });
  }

  @Post(":snapshotId/exports")
  export(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createExport({
      body,
      requestId: getRequestId(request),
      snapshotId,
      userId: user.id,
    });
  }

  @Post(":snapshotId/share-links")
  share(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createShareLink({
      body,
      requestId: getRequestId(request),
      snapshotId,
      userId: user.id,
    });
  }

  @Get(":snapshotId/share-links")
  shareLinks(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.listShareLinks({ snapshotId, userId: user.id });
  }

  @Get(":snapshotId/comments")
  comments(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.listComments({ snapshotId, userId: user.id });
  }

  @Post(":snapshotId/comments")
  createComment(
    @Param("snapshotId", ParseUUIDPipe) snapshotId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createComment({
      body,
      requestId: getRequestId(request),
      snapshotId,
      userId: user.id,
    });
  }
}

@Controller("analyses")
@UseGuards(JwtAuthGuard)
export class AnalysisSnapshotsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Post(":analysisId/snapshot")
  create(
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createSnapshotForAnalysis({
      analysisId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
}

@Controller("exports")
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get() list(
    @Query("snapshotId") snapshotId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.listExports({ snapshotId, userId: user.id });
  }
  @Get(":exportJobId") get(
    @Param("exportJobId", ParseUUIDPipe) exportJobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.getExport({ exportJobId, userId: user.id });
  }
  @Get(":exportJobId/download") download(
    @Param("exportJobId", ParseUUIDPipe) exportJobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.downloadExport({
      exportJobId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
  @Post(":exportJobId/cancel") cancel(
    @Param("exportJobId", ParseUUIDPipe) exportJobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.cancelExport({
      exportJobId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
}

@Controller("share-links")
@UseGuards(JwtAuthGuard)
export class ShareLinksController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Post(":shareLinkId/revoke") revoke(
    @Param("shareLinkId", ParseUUIDPipe) shareLinkId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.revokeShareLink({
      requestId: getRequestId(request),
      shareLinkId,
      userId: user.id,
    });
  }
  @Post(":shareLinkId/rotate") rotate(
    @Param("shareLinkId", ParseUUIDPipe) shareLinkId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.rotateShareLink({
      requestId: getRequestId(request),
      shareLinkId,
      userId: user.id,
    });
  }
}

@Controller("comments")
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Patch(":commentId") update(
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.updateComment({
      body,
      commentId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
  @Delete(":commentId") delete(
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.deleteComment({
      commentId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
}

@Controller("comment-threads")
@UseGuards(JwtAuthGuard)
export class CommentThreadsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Post(":threadId/resolve") resolve(
    @Param("threadId", ParseUUIDPipe) threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.resolveThread({
      requestId: getRequestId(request),
      threadId,
      userId: user.id,
    });
  }
  @Post(":threadId/reopen") reopen(
    @Param("threadId", ParseUUIDPipe) threadId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.resolveThread({
      reopen: true,
      requestId: getRequestId(request),
      threadId,
      userId: user.id,
    });
  }
}

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.listNotifications(user.id);
  }
  @Post("read-all") readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.markAllNotificationsRead(user.id);
  }
  @Post(":notificationId/read") read(
    @Param("notificationId", ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.markNotificationRead({ notificationId, userId: user.id });
  }
}

@Controller("brand-profiles")
@UseGuards(JwtAuthGuard)
export class BrandProfilesController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.listBrandProfiles(user.id);
  }
  @Post() create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createBrandProfile({
      body,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
  @Patch(":brandProfileId") update(
    @Param("brandProfileId", ParseUUIDPipe) brandProfileId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.updateBrandProfile({
      body,
      brandProfileId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
  @Delete(":brandProfileId") delete(
    @Param("brandProfileId", ParseUUIDPipe) brandProfileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.deleteBrandProfile({
      brandProfileId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }
}

@Controller("public/shared")
export class PublicReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get(":token") get(@Param("token") token: string) {
    return this.reports.publicSharedReport(token);
  }
}

@Controller("shared")
@UseGuards(JwtAuthGuard)
export class AuthenticatedSharedReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get(":token") get(@Param("token") token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.publicSharedReport(token, user.id);
  }
}

@Controller("public/shared")
@UseGuards(JwtAuthGuard)
export class PublicSharedCommentsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Post(":token/comments")
  create(
    @Param("token") token: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reports.createSharedComment({
      body,
      requestId: getRequestId(request),
      token,
      userId: user.id,
    });
  }
}
