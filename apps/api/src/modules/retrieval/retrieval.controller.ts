import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentProjectAccess } from "../projects/current-project-access.decorator";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import type { ProjectAccess } from "../projects/project-request";
import { FeedbackDto, RetrievalRequestDto } from "./dto/retrieval-request.dto";
import { RetrievalService } from "./retrieval.service";

@Controller("projects/:projectId/retrieval")
@UseGuards(JwtAuthGuard, ProjectAccessGuard)
export class RetrievalController {
  constructor(@Inject(RetrievalService) private readonly service: RetrievalService) {}

  @Post("search")
  search(
    @Body() body: RetrievalRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() _access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ) {
    return this.service.search({
      body,
      projectId,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }

  @Post("ask")
  ask(
    @Body() body: RetrievalRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() _access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ) {
    return this.service.ask({ body, projectId, requestId: getRequestId(request), userId: user.id });
  }

  @Post("responses/:ragResponseId/feedback")
  feedback(
    @Body() body: FeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() _access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("ragResponseId", ParseUUIDPipe) ragResponseId: string,
  ) {
    return this.service.feedback({ ...body, projectId, ragResponseId, userId: user.id });
  }
}
