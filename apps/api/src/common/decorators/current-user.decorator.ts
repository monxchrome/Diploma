import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/authenticated-request";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error("CurrentUser decorator used without JwtAuthGuard");
    }

    return request.user;
  },
);
