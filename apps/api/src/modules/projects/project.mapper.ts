import type {
  PaginationMeta,
  Project,
  ProjectMember,
  ProjectMemberRole,
  ProjectSummary,
} from "@dip/contracts";

import type {
  Prisma,
  Project as ProjectModel,
  ProjectMember as ProjectMemberModel,
  User,
} from "../../generated/prisma/client";
import { toSafeUser } from "../users/user.mapper";

export type ProjectWithRole = {
  project: ProjectModel;
  role: ProjectMemberRole;
};

export type ProjectMemberWithUser = ProjectMemberModel & {
  user: User;
};

export function toProject(projectWithRole: ProjectWithRole): Project {
  const project = projectWithRole.project;

  return {
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    description: project.description,
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    role: projectWithRole.role,
    settings: toSettingsRecord(project.settings),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function toProjectSummary(projectWithRole: ProjectWithRole): ProjectSummary {
  const project = toProject(projectWithRole);

  return {
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    description: project.description,
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    role: project.role,
    updatedAt: project.updatedAt,
  };
}

export function toProjectMember(member: ProjectMemberWithUser): ProjectMember {
  return {
    createdAt: member.createdAt.toISOString(),
    projectId: member.projectId,
    role: member.role,
    updatedAt: member.updatedAt.toISOString(),
    user: toSafeUser(member.user),
    userId: member.userId,
  };
}

export function createPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    limit,
    page,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function toSettingsRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}
