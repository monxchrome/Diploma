import { Inject, Injectable } from "@nestjs/common";

import {
  Prisma,
  ProjectMemberRole,
  type Project,
  type ProjectMember,
} from "../../../generated/prisma/client";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import type { ListProjectsQueryDto } from "../dto/list-projects-query.dto";

export type ProjectMembershipWithProject = ProjectMember & {
  project: Project;
};

@Injectable()
export class ProjectsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createOwnedProject(data: {
    description: string | null;
    name: string;
    ownerId: string;
  }): Promise<ProjectMembershipWithProject> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          description: data.description,
          members: {
            create: {
              role: ProjectMemberRole.OWNER,
              userId: data.ownerId,
            },
          },
          name: data.name,
          ownerId: data.ownerId,
          settings: {},
        },
      });

      const membership = await transaction.projectMember.findUniqueOrThrow({
        include: {
          project: true,
        },
        where: {
          projectId_userId: {
            projectId: project.id,
            userId: data.ownerId,
          },
        },
      });

      return membership;
    });
  }

  async findMembershipWithProject(
    projectId: string,
    userId: string,
  ): Promise<ProjectMembershipWithProject | null> {
    return this.prisma.projectMember.findUnique({
      include: {
        project: true,
      },
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  async listUserProjects(
    userId: string,
    query: ListProjectsQueryDto,
  ): Promise<{ items: ProjectMembershipWithProject[]; total: number }> {
    const where = createProjectMemberWhere(userId, query.status);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.projectMember.findMany({
        include: {
          project: true,
        },
        orderBy: createProjectOrderBy(query.sortBy, query.sortDirection),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        where,
      }),
      this.prisma.projectMember.count({
        where,
      }),
    ]);

    return {
      items,
      total,
    };
  }

  async updateProject(
    projectId: string,
    data: {
      description?: string | null;
      name?: string;
    },
  ): Promise<Project> {
    return this.prisma.project.update({
      data,
      where: {
        id: projectId,
      },
    });
  }

  async archiveProject(projectId: string): Promise<Project> {
    return this.prisma.project.update({
      data: {
        archivedAt: new Date(),
      },
      where: {
        id: projectId,
      },
    });
  }

  async restoreProject(projectId: string): Promise<Project> {
    return this.prisma.project.update({
      data: {
        archivedAt: null,
      },
      where: {
        id: projectId,
      },
    });
  }

  async listMembers(projectId: string) {
    return this.prisma.projectMember.findMany({
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      where: {
        projectId,
      },
    });
  }
}

function createProjectMemberWhere(
  userId: string,
  status: ListProjectsQueryDto["status"],
): Prisma.ProjectMemberWhereInput {
  const archivedFilter =
    status === "all"
      ? {}
      : {
          project: {
            archivedAt: status === "archived" ? { not: null } : null,
          },
        };

  return {
    ...archivedFilter,
    userId,
  };
}

function createProjectOrderBy(
  sortBy: ListProjectsQueryDto["sortBy"],
  sortDirection: ListProjectsQueryDto["sortDirection"],
): Prisma.ProjectMemberOrderByWithRelationInput {
  switch (sortBy) {
    case "name":
      return {
        project: {
          name: sortDirection,
        },
      };
    case "updatedAt":
      return {
        project: {
          updatedAt: sortDirection,
        },
      };
    case "createdAt":
      return {
        project: {
          createdAt: sortDirection,
        },
      };
  }
}
