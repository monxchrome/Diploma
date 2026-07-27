import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { ErrorCodes } from "../../../common/errors/error-codes";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import type { ProjectRequest } from "../project-request";

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectRequest>();
    const projectId = getProjectId(request.params);

    if (!request.user) {
      throw new UnauthorizedException({
        code: ErrorCodes.Unauthorized,
        message: "Access token is required",
      });
    }

    if (!projectId) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Project not found",
      });
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: request.user.id,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "Project not found",
      });
    }

    request.projectAccess = {
      projectId,
      role: membership.role,
    };

    return true;
  }
}

function getProjectId(params: Record<string, string | string[] | undefined>): string | null {
  const value = params["projectId"];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
