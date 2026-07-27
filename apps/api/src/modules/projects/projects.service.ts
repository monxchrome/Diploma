import type { PaginatedResponse, Project, ProjectMember, ProjectSummary } from "@dip/contracts";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { ErrorCodes } from "../../common/errors/error-codes";
import type { ProjectMemberRole } from "../../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ListProjectsQueryDto } from "./dto/list-projects-query.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import {
  createPaginationMeta,
  toProject,
  toProjectMember,
  toProjectSummary,
} from "./project.mapper";
import { canArchiveProject, canUpdateProject, canViewProject } from "./project-permissions";
import { ProjectsRepository } from "./repositories/projects.repository";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ProjectsRepository) private readonly projectsRepository: ProjectsRepository,
  ) {}

  async createProject(data: {
    body: CreateProjectDto;
    requestId: string;
    userId: string;
  }): Promise<Project> {
    const membership = await this.projectsRepository.createOwnedProject({
      description: normalizeOptionalText(data.body.description),
      name: data.body.name.trim(),
      ownerId: data.userId,
    });

    await this.auditService.record({
      action: "project.created",
      actorUserId: data.userId,
      entityId: membership.projectId,
      entityType: "Project",
      projectId: membership.projectId,
      requestId: data.requestId,
    });

    return toProject({
      project: membership.project,
      role: membership.role,
    });
  }

  async listProjects(
    userId: string,
    query: ListProjectsQueryDto,
  ): Promise<PaginatedResponse<ProjectSummary>> {
    const result = await this.projectsRepository.listUserProjects(userId, query);

    return {
      data: result.items.map((item) =>
        toProjectSummary({
          project: item.project,
          role: item.role,
        }),
      ),
      meta: createPaginationMeta(query.page, query.limit, result.total),
    };
  }

  async getProject(projectId: string, userId: string): Promise<Project> {
    const membership = await this.requireMembership(projectId, userId);

    if (!canViewProject(membership.role)) {
      throw forbidden();
    }

    return toProject({
      project: membership.project,
      role: membership.role,
    });
  }

  async updateProject(data: {
    body: UpdateProjectDto;
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }): Promise<Project> {
    if (!canUpdateProject(data.role)) {
      throw forbidden();
    }

    const updateData: { description?: string | null; name?: string } = {};

    if (typeof data.body.name === "string") {
      updateData.name = data.body.name.trim();
    }

    if ("description" in data.body) {
      updateData.description =
        typeof data.body.description === "string"
          ? normalizeOptionalText(data.body.description)
          : null;
    }

    const project = await this.projectsRepository.updateProject(data.projectId, updateData);

    await this.auditService.record({
      action: "project.updated",
      actorUserId: data.userId,
      entityId: data.projectId,
      entityType: "Project",
      projectId: data.projectId,
      requestId: data.requestId,
    });

    return toProject({
      project,
      role: data.role,
    });
  }

  async archiveProject(data: {
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }): Promise<Project> {
    if (!canArchiveProject(data.role)) {
      throw forbidden();
    }

    const project = await this.projectsRepository.archiveProject(data.projectId);

    await this.auditService.record({
      action: "project.archived",
      actorUserId: data.userId,
      entityId: data.projectId,
      entityType: "Project",
      projectId: data.projectId,
      requestId: data.requestId,
    });

    return toProject({
      project,
      role: data.role,
    });
  }

  async restoreProject(data: {
    projectId: string;
    requestId: string;
    role: ProjectMemberRole;
    userId: string;
  }): Promise<Project> {
    if (!canArchiveProject(data.role)) {
      throw forbidden();
    }

    const project = await this.projectsRepository.restoreProject(data.projectId);

    await this.auditService.record({
      action: "project.restored",
      actorUserId: data.userId,
      entityId: data.projectId,
      entityType: "Project",
      projectId: data.projectId,
      requestId: data.requestId,
    });

    return toProject({
      project,
      role: data.role,
    });
  }

  async listMembers(projectId: string, userId: string): Promise<ProjectMember[]> {
    const membership = await this.requireMembership(projectId, userId);

    if (!canViewProject(membership.role)) {
      throw forbidden();
    }

    const members = await this.projectsRepository.listMembers(projectId);
    return members.map(toProjectMember);
  }

  private async requireMembership(projectId: string, userId: string) {
    const membership = await this.projectsRepository.findMembershipWithProject(projectId, userId);

    if (!membership) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Project not found",
      });
    }

    return membership;
  }
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function forbidden(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCodes.AccessDenied,
    message: "Insufficient project permissions",
  });
}
