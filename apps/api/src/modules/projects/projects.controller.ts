import type { PaginatedResponse, Project, ProjectMember, ProjectSummary } from "@dip/contracts";
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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";

import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { getRequestId } from "../../common/logging/request-id";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentProjectAccess } from "./current-project-access.decorator";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ListProjectsQueryDto } from "./dto/list-projects-query.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { ProjectAccessGuard } from "./guards/project-access.guard";
import type { ProjectAccess } from "./project-request";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@SkipThrottle({ authLogin: true, authRefresh: true, authRegister: true })
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Post()
  createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProjectDto,
    @Req() request: Request,
  ): Promise<Project> {
    return this.projectsService.createProject({
      body,
      requestId: getRequestId(request),
      userId: user.id,
    });
  }

  @Get()
  listProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<PaginatedResponse<ProjectSummary>> {
    const defaults = new ListProjectsQueryDto();
    const rawQuery = query as unknown as Record<string, unknown>;

    return this.projectsService.listProjects(
      user.id,
      Object.assign(defaults, query, {
        limit: Number(rawQuery.limit ?? defaults.limit),
        page: Number(rawQuery.page ?? defaults.page),
      }),
    );
  }

  @Get(":projectId")
  @UseGuards(ProjectAccessGuard)
  getProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<Project> {
    return this.projectsService.getProject(projectId, user.id);
  }

  @Patch(":projectId")
  @UseGuards(ProjectAccessGuard)
  updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() body: UpdateProjectDto,
    @Req() request: Request,
  ): Promise<Project> {
    return this.projectsService.updateProject({
      body,
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }

  @Delete(":projectId")
  @UseGuards(ProjectAccessGuard)
  archiveProject(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ): Promise<Project> {
    return this.projectsService.archiveProject({
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }

  @Post(":projectId/restore")
  @UseGuards(ProjectAccessGuard)
  restoreProject(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentProjectAccess() access: ProjectAccess,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Req() request: Request,
  ): Promise<Project> {
    return this.projectsService.restoreProject({
      projectId,
      requestId: getRequestId(request),
      role: access.role,
      userId: user.id,
    });
  }

  @Get(":projectId/members")
  @UseGuards(ProjectAccessGuard)
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ): Promise<ProjectMember[]> {
    return this.projectsService.listMembers(projectId, user.id);
  }
}
