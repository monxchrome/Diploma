import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { ProjectAccess, ProjectRequest } from "./project-request";

export const CurrentProjectAccess = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ProjectAccess => {
    const request = context.switchToHttp().getRequest<ProjectRequest>();

    if (!request.projectAccess) {
      throw new Error("CurrentProjectAccess decorator used without ProjectAccessGuard");
    }

    return request.projectAccess;
  },
);
