import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentProjectAccess } from "../projects/current-project-access.decorator";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import type { ProjectAccess } from "../projects/project-request";
import { parseCreateAnalysis } from "./dto/create-analysis.dto";
import { AnalysesService } from "./analyses.service";

@Controller("projects/:projectId/analyses")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class AnalysesController {
  constructor(@Inject(AnalysesService) private readonly analyses: AnalysesService) {}

  @Post()
  create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ) {
    return this.analyses.create({
      body: parseCreateAnalysis(body),
      projectId,
      userId: user.id,
      role: access.role,
      requestId: getRequestId(request),
    });
  }

  @Get()
  list(@Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.analyses.list(projectId);
  }

  @Get(":analysisId")
  get(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
  ) {
    return this.analyses.get(projectId, analysisId);
  }

  @Post(":analysisId/run")
  run(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Req() request: Request,
  ) {
    return this.analyses.run({
      projectId,
      analysisId,
      userId: user.id,
      role: access.role,
      requestId: getRequestId(request),
    });
  }

  @Post(":analysisId/cancel")
  cancel(
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("analysisId", ParseUUIDPipe) analysisId: string,
    @Req() request: Request,
  ) {
    return this.analyses.cancel({
      projectId,
      analysisId,
      role: access.role,
      requestId: getRequestId(request),
    });
  }
}
