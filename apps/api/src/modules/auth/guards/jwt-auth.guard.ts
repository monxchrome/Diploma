import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from "../../../common/auth/authenticated-request";
import { ErrorCodes } from "../../../common/errors/error-codes";
import { UserStatus, type User } from "../../../generated/prisma/client";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { verifyAccessToken } from "../services/access-token.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getBearerToken(request);

    if (!token) {
      throw unauthorized("Access token is required");
    }

    const payload = verifyAccessToken(
      token,
      this.configService.getOrThrow<string>("auth.accessSecret"),
    );
    const session = await this.prisma.authSession.findUnique({
      include: {
        user: true,
      },
      where: {
        id: payload.sid,
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw unauthorized("Invalid access token");
    }

    request.user = toAuthenticatedUser(session.user);
    request.session = {
      familyId: session.familyId,
      id: session.id,
      userId: session.userId,
    };

    return true;
  }
}

function getBearerToken(request: AuthenticatedRequest): string | null {
  const header = request.headers.authorization;

  if (!header) {
    return null;
  }

  const [scheme, token, extra] = header.split(" ");

  if (scheme !== "Bearer" || !token || extra) {
    return null;
  }

  return token;
}

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    createdAt: user.createdAt,
    displayName: user.displayName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    globalRole: user.globalRole,
    id: user.id,
    status: user.status,
    updatedAt: user.updatedAt,
  };
}

function unauthorized(message: string): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCodes.Unauthorized,
    message,
  });
}
