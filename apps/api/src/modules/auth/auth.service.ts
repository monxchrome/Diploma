import type { AuthTokensResponse } from "@dip/contracts";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { getRequestId } from "../../common/logging/request-id";
import { ErrorCodes } from "../../common/errors/error-codes";
import { UserStatus, type AuthSession, type User } from "../../generated/prisma/client";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SessionsRepository } from "../sessions/repositories/sessions.repository";
import { normalizeDisplayName, normalizeEmail, toSafeUser } from "../users/user.mapper";
import { UsersRepository } from "../users/repositories/users.repository";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { AccessTokenService } from "./services/access-token.service";
import { PasswordService } from "./services/password.service";
import { RefreshTokenService } from "./services/refresh-token.service";

export type AuthResult = AuthTokensResponse & {
  refreshExpiresAt: Date;
  refreshToken: string;
};

type SessionRequestMetadata = {
  ipHash: string | null;
  requestId: string;
  userAgent: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(AccessTokenService) private readonly accessTokenService: AccessTokenService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RefreshTokenService) private readonly refreshTokenService: RefreshTokenService,
    @Inject(SessionsRepository) private readonly sessionsRepository: SessionsRepository,
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
  ) {}

  async register(body: RegisterDto, request: Request): Promise<AuthResult> {
    const metadata = this.getSessionMetadata(request);
    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName);

    this.passwordService.validatePasswordPolicy(body.password);

    const existingUser = await this.usersRepository.findByEmail(email);

    if (existingUser) {
      throw this.duplicateRegistration();
    }

    const passwordHash = await this.passwordService.hashPassword(body.password);
    const refresh = this.refreshTokenService.create();

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            displayName,
            email,
            passwordHash,
          },
        });

        await transaction.authSession.create({
          data: {
            expiresAt: refresh.expiresAt,
            familyId: refresh.familyId,
            id: refresh.sessionId,
            ipHash: metadata.ipHash,
            lastUsedAt: new Date(),
            refreshTokenHash: refresh.hash,
            userAgent: metadata.userAgent,
            userId: createdUser.id,
          },
        });

        await transaction.auditLog.create({
          data: {
            action: "auth.registered",
            actorUserId: createdUser.id,
            entityId: createdUser.id,
            entityType: "User",
            metadata: {},
            requestId: metadata.requestId,
          },
        });

        return createdUser;
      });

      return this.toAuthResult(user, refresh.sessionId, refresh.token, refresh.expiresAt);
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        throw this.duplicateRegistration();
      }

      throw error;
    }
  }

  async login(body: LoginDto, request: Request): Promise<AuthResult> {
    const metadata = this.getSessionMetadata(request);
    const email = normalizeEmail(body.email);
    const user = await this.usersRepository.findByEmail(email);

    if (!user) {
      await this.recordLoginFailure(null, metadata.requestId);
      throw invalidCredentials();
    }

    const passwordValid = await this.passwordService.verifyPassword(
      body.password,
      user.passwordHash,
    );

    if (!passwordValid || user.status !== UserStatus.ACTIVE) {
      await this.recordLoginFailure(user.id, metadata.requestId);
      throw invalidCredentials();
    }

    const refresh = this.refreshTokenService.create();

    await this.prisma.authSession.create({
      data: {
        expiresAt: refresh.expiresAt,
        familyId: refresh.familyId,
        id: refresh.sessionId,
        ipHash: metadata.ipHash,
        lastUsedAt: new Date(),
        refreshTokenHash: refresh.hash,
        userAgent: metadata.userAgent,
        userId: user.id,
      },
    });
    await this.auditService.record({
      action: "auth.login",
      actorUserId: user.id,
      entityId: refresh.sessionId,
      entityType: "AuthSession",
      requestId: metadata.requestId,
    });

    return this.toAuthResult(user, refresh.sessionId, refresh.token, refresh.expiresAt);
  }

  async refresh(request: Request): Promise<AuthResult> {
    const metadata = this.getSessionMetadata(request);
    const cookieToken = this.refreshTokenService.getCookie(request);

    if (!cookieToken) {
      throw invalidRefreshSession();
    }

    const parsedToken = this.refreshTokenService.parse(cookieToken);

    if (!parsedToken) {
      throw invalidRefreshSession();
    }

    const tokenHash = this.refreshTokenService.hashToken(parsedToken.token);
    const session = await this.prisma.authSession.findUnique({
      include: {
        user: true,
      },
      where: {
        id: parsedToken.sessionId,
      },
    });

    if (!session) {
      throw invalidRefreshSession();
    }

    if (!this.refreshTokenService.matches(tokenHash, session.refreshTokenHash)) {
      await this.revokeReusedFamily(session, metadata.requestId);
      throw invalidRefreshSession();
    }

    const now = new Date();

    if (session.revokedAt) {
      throw invalidRefreshSession();
    }

    if (session.expiresAt <= now) {
      await this.revokeSession(session.id, "EXPIRED_REFRESH_TOKEN");
      throw invalidRefreshSession();
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      await this.sessionsRepository.revokeFamily(session.familyId, "USER_DISABLED");
      throw invalidRefreshSession();
    }

    const refresh = this.refreshTokenService.create(session.id, session.familyId, now);
    const rotation = await this.prisma.authSession.updateMany({
      data: {
        expiresAt: refresh.expiresAt,
        lastUsedAt: now,
        refreshTokenHash: refresh.hash,
      },
      where: {
        expiresAt: {
          gt: now,
        },
        id: session.id,
        refreshTokenHash: tokenHash,
        revokedAt: null,
      },
    });

    if (rotation.count !== 1) {
      const latestSession = await this.sessionsRepository.findById(session.id);

      if (latestSession) {
        await this.sessionsRepository.revokeFamily(latestSession.familyId, "REUSED_REFRESH_TOKEN");
      }

      throw invalidRefreshSession();
    }

    await this.auditService.record({
      action: "auth.refresh",
      actorUserId: session.userId,
      entityId: session.id,
      entityType: "AuthSession",
      requestId: metadata.requestId,
    });

    return this.toAuthResult(session.user, session.id, refresh.token, refresh.expiresAt);
  }

  async logout(request: Request): Promise<void> {
    const requestId = getRequestId(request);
    const cookieToken = this.refreshTokenService.getCookie(request);

    if (!cookieToken) {
      return;
    }

    const parsedToken = this.refreshTokenService.parse(cookieToken);

    if (!parsedToken) {
      return;
    }

    const session = await this.sessionsRepository.findById(parsedToken.sessionId);

    if (!session) {
      return;
    }

    await this.revokeSession(session.id, "USER_LOGOUT");
    await this.auditService.record({
      action: "auth.logout",
      actorUserId: session.userId,
      entityId: session.id,
      entityType: "AuthSession",
      requestId,
    });
  }

  private getSessionMetadata(request: Request): SessionRequestMetadata {
    return {
      ipHash: this.refreshTokenService.hashIp(request.ip ?? request.socket.remoteAddress),
      requestId: getRequestId(request),
      userAgent: request.headers["user-agent"] ?? null,
    };
  }

  private async recordLoginFailure(actorUserId: string | null, requestId: string): Promise<void> {
    await this.auditService.record({
      action: "auth.login_failed",
      actorUserId,
      entityType: "AuthSession",
      requestId,
    });
  }

  private async revokeReusedFamily(session: AuthSession, requestId: string): Promise<void> {
    if (!session.revokedAt && session.expiresAt > new Date()) {
      await this.sessionsRepository.revokeFamily(session.familyId, "REUSED_REFRESH_TOKEN");
      await this.auditService.record({
        action: "auth.refresh_reuse_detected",
        actorUserId: session.userId,
        entityId: session.id,
        entityType: "AuthSession",
        requestId,
      });
    }
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      data: {
        revokedAt: new Date(),
        revokeReason: reason,
      },
      where: {
        id: sessionId,
        revokedAt: null,
      },
    });
  }

  private toAuthResult(
    user: User,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): AuthResult {
    return {
      accessToken: this.accessTokenService.sign(user, sessionId),
      refreshExpiresAt,
      refreshToken,
      user: toSafeUser(user),
    };
  }

  private duplicateRegistration(): ConflictException {
    return new ConflictException({
      code: ErrorCodes.DuplicateResource,
      message: "Unable to register with the provided credentials",
    });
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCodes.InvalidCredentials,
    message: "Invalid email or password",
  });
}

function invalidRefreshSession(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCodes.SessionInvalid,
    message: "Refresh session is invalid",
  });
}

function isPrismaUniqueError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
