import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import { ErrorCodes } from "../errors/error-codes";

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.getOrThrow<boolean>("csrf.enabled")) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const allowedOrigins = this.config.getOrThrow<string[]>("cors.origins");
    if (origin && allowedOrigins.includes(origin)) return true;
    throw new ForbiddenException({
      code: ErrorCodes.AccessDenied,
      message: "A trusted origin is required for cookie-authenticated requests",
    });
  }
}
