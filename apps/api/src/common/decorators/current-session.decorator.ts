import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest, AuthenticatedSession } from "../auth/authenticated-request";

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.session) {
      throw new Error("CurrentSession decorator used without JwtAuthGuard");
    }

    return request.session;
  },
);
