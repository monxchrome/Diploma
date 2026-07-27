import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalRole, UserStatus, type AuthSession, type User } from "../../generated/prisma/client";
import type { PrismaService } from "../../infrastructure/database/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { SessionsRepository } from "../sessions/repositories/sessions.repository";
import type { UsersRepository } from "../users/repositories/users.repository";
import { AuthService } from "./auth.service";
import { AccessTokenService } from "./services/access-token.service";
import type { PasswordService } from "./services/password.service";
import { RefreshTokenService } from "./services/refresh-token.service";

type CreateUserArgs = {
  data: {
    displayName: string;
    email: string;
    passwordHash: string;
  };
};

type CreateSessionArgs = {
  data: Omit<AuthSession, "createdAt" | "revokedAt" | "revokeReason"> & {
    revokedAt?: Date | null;
    revokeReason?: string | null;
  };
};

type FindSessionArgs = {
  include?: {
    user?: boolean;
  };
  where: {
    id: string;
  };
};

type UpdateManySessionArgs = {
  data: Partial<
    Pick<
      AuthSession,
      "expiresAt" | "lastUsedAt" | "refreshTokenHash" | "revokedAt" | "revokeReason"
    >
  >;
  where: {
    expiresAt?: {
      gt: Date;
    };
    familyId?: string;
    id?: string;
    refreshTokenHash?: string;
    revokedAt?: null;
    userId?: string;
  };
};

class FakePrisma {
  audits: unknown[] = [];
  sessions: AuthSession[] = [];
  users: User[] = [];

  readonly user = {
    create: (args: CreateUserArgs): Promise<User> => {
      if (this.users.some((user) => user.email === args.data.email)) {
        throw new UniqueConstraintError();
      }

      const now = new Date();
      const user: User = {
        createdAt: now,
        displayName: args.data.displayName,
        email: args.data.email,
        emailVerifiedAt: null,
        globalRole: GlobalRole.USER,
        id: `00000000-0000-4000-8000-${String(this.users.length + 1).padStart(12, "0")}`,
        passwordHash: args.data.passwordHash,
        status: UserStatus.ACTIVE,
        updatedAt: now,
      };
      this.users.push(user);
      return Promise.resolve(user);
    },
  };

  readonly authSession = {
    create: (args: CreateSessionArgs): Promise<AuthSession> => {
      const session: AuthSession = {
        createdAt: new Date(),
        expiresAt: args.data.expiresAt,
        familyId: args.data.familyId,
        id: args.data.id,
        ipHash: args.data.ipHash,
        lastUsedAt: args.data.lastUsedAt,
        refreshTokenHash: args.data.refreshTokenHash,
        revokedAt: args.data.revokedAt ?? null,
        revokeReason: args.data.revokeReason ?? null,
        userAgent: args.data.userAgent,
        userId: args.data.userId,
      };
      this.sessions.push(session);
      return Promise.resolve(session);
    },
    findUnique: (
      args: FindSessionArgs,
    ): Promise<(AuthSession & { user: User }) | AuthSession | null> => {
      const session = this.sessions.find((item) => item.id === args.where.id) ?? null;

      if (!session || !args.include?.user) {
        return Promise.resolve(session);
      }

      const user = this.users.find((item) => item.id === session.userId);

      if (!user) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        ...session,
        user,
      });
    },
    updateMany: (args: UpdateManySessionArgs): Promise<{ count: number }> => {
      let count = 0;

      this.sessions = this.sessions.map((session) => {
        if (!matchesSessionWhere(session, args.where)) {
          return session;
        }

        count += 1;
        return {
          ...session,
          ...args.data,
        };
      });

      return Promise.resolve({ count });
    },
  };

  readonly auditLog = {
    create: (args: unknown): Promise<void> => {
      this.audits.push(args);
      return Promise.resolve();
    },
  };

  $transaction<Result>(
    callback: (
      transaction: Pick<FakePrisma, "auditLog" | "authSession" | "user">,
    ) => Promise<Result>,
  ): Promise<Result> {
    return callback(this);
  }
}

describe("AuthService", () => {
  let fakePrisma: FakePrisma;
  let service: AuthService;
  let refreshTokenService: RefreshTokenService;

  beforeEach(() => {
    fakePrisma = new FakePrisma();
    const configService = new ConfigService({
      auth: {
        accessSecret: "test-access-secret-that-is-long-enough",
        accessTtl: "15m",
        cookie: {
          name: "dip_refresh",
        },
        refreshPepper: "test-refresh-pepper-that-is-long-enough",
        refreshTtl: "30d",
      },
    });
    const auditService = {
      record: vi.fn(() => Promise.resolve()),
    } satisfies Partial<AuditService>;
    const passwordService = {
      hashPassword: vi.fn((password: string) => Promise.resolve(`hash:${password}`)),
      validatePasswordPolicy: vi.fn((password: string) => {
        if (password === "weak") {
          throw new BadRequestException("weak password");
        }
      }),
      verifyPassword: vi.fn((password: string, hash: string) =>
        Promise.resolve(hash === `hash:${password}`),
      ),
    } satisfies Partial<PasswordService>;
    const sessionsRepository = {
      findById: vi.fn((sessionId: string) =>
        Promise.resolve(fakePrisma.sessions.find((session) => session.id === sessionId) ?? null),
      ),
      revokeFamily: vi.fn(async (familyId: string, reason: string) => {
        const result = await fakePrisma.authSession.updateMany({
          data: {
            revokedAt: new Date(),
            revokeReason: reason,
          },
          where: {
            familyId,
            revokedAt: null,
          },
        });
        return result.count;
      }),
    } satisfies Partial<SessionsRepository>;
    const usersRepository = {
      findByEmail: vi.fn((email: string) =>
        Promise.resolve(fakePrisma.users.find((user) => user.email === email) ?? null),
      ),
    } satisfies Partial<UsersRepository>;
    refreshTokenService = new RefreshTokenService(configService);
    service = new AuthService(
      new AccessTokenService(configService),
      auditService as unknown as AuditService,
      passwordService as unknown as PasswordService,
      fakePrisma as unknown as PrismaService,
      refreshTokenService,
      sessionsRepository as unknown as SessionsRepository,
      usersRepository as unknown as UsersRepository,
    );
  });

  it("registers a user, creates the first session, and returns a safe DTO", async () => {
    const result = await service.register(
      {
        displayName: " Ada ",
        email: "ADA@EXAMPLE.COM",
        password: "Password123!",
      },
      createRequest(),
    );

    expect(result.user).toMatchObject({
      displayName: "Ada",
      email: "ada@example.com",
    });
    expect("passwordHash" in result.user).toBe(false);
    expect(result.refreshToken).toContain(fakePrisma.sessions[0]?.id);
    expect(fakePrisma.sessions).toHaveLength(1);
  });

  it("rejects duplicate registration and weak passwords", async () => {
    await service.register(
      {
        displayName: "Ada",
        email: "ada@example.com",
        password: "Password123!",
      },
      createRequest(),
    );

    await expect(
      service.register(
        {
          displayName: "Ada",
          email: "ADA@example.com",
          password: "Password123!",
        },
        createRequest(),
      ),
    ).rejects.toThrow("Unable to register");
    await expect(
      service.register(
        {
          displayName: "Weak",
          email: "weak@example.com",
          password: "weak",
        },
        createRequest(),
      ),
    ).rejects.toThrow("weak password");
  });

  it("logs in users and rejects invalid or disabled users", async () => {
    await service.register(
      {
        displayName: "Ada",
        email: "ada@example.com",
        password: "Password123!",
      },
      createRequest(),
    );

    await expect(
      service.login({ email: "ada@example.com", password: "Password123!" }, createRequest()),
    ).resolves.toMatchObject({
      user: {
        email: "ada@example.com",
      },
    });
    await expect(
      service.login({ email: "ada@example.com", password: "wrong" }, createRequest()),
    ).rejects.toThrow("Invalid email or password");

    const user = fakePrisma.users[0];

    if (!user) {
      throw new Error("Expected seeded user");
    }

    user.status = UserStatus.DISABLED;
    await expect(
      service.login({ email: "ada@example.com", password: "Password123!" }, createRequest()),
    ).rejects.toThrow("Invalid email or password");
  });

  it("rotates refresh tokens and revokes the family on old token reuse", async () => {
    const login = await seedLogin();
    const session = findSessionForToken(login.refreshToken);
    const originalHash = session.refreshTokenHash;
    const refresh = await service.refresh(createRequest(login.refreshToken));
    const rotatedSession = findSessionForToken(login.refreshToken);

    expect(rotatedSession.refreshTokenHash).not.toBe(originalHash);
    expect(refresh.refreshToken).not.toBe(login.refreshToken);

    await expect(service.refresh(createRequest(login.refreshToken))).rejects.toThrow(
      "Refresh session is invalid",
    );
    const revokedSession = findSessionForToken(login.refreshToken);

    expect(revokedSession).toMatchObject({
      revokeReason: "REUSED_REFRESH_TOKEN",
    });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);
  });

  it("rejects expired and revoked refresh sessions", async () => {
    const login = await seedLogin();
    const session = findSessionForToken(login.refreshToken);

    session.expiresAt = new Date(Date.now() - 1000);
    await expect(service.refresh(createRequest(login.refreshToken))).rejects.toThrow(
      "Refresh session is invalid",
    );
    expect(findSessionForToken(login.refreshToken).revokeReason).toBe("EXPIRED_REFRESH_TOKEN");

    const secondLogin = await seedLogin();
    const secondSession = findSessionForToken(secondLogin.refreshToken);

    secondSession.revokedAt = new Date();
    await expect(service.refresh(createRequest(secondLogin.refreshToken))).rejects.toThrow(
      "Refresh session is invalid",
    );
  });

  it("logs out idempotently and revokes the current cookie session", async () => {
    const login = await seedLogin();

    await service.logout(createRequest(login.refreshToken));
    await service.logout(createRequest());
    const revokedSession = findSessionForToken(login.refreshToken);

    expect(revokedSession).toMatchObject({
      revokeReason: "USER_LOGOUT",
    });
    expect(revokedSession.revokedAt).toBeInstanceOf(Date);
  });

  async function seedLogin() {
    await service.register(
      {
        displayName: "Ada",
        email: `ada-${fakePrisma.users.length}@example.com`,
        password: "Password123!",
      },
      createRequest(),
    );

    return service.login(
      {
        email: `ada-${fakePrisma.users.length - 1}@example.com`,
        password: "Password123!",
      },
      createRequest(),
    );
  }

  function createRequest(refreshToken?: string): Request {
    return {
      headers: {
        cookie: refreshToken ? `dip_refresh=${encodeURIComponent(refreshToken)}` : undefined,
        "user-agent": "vitest",
        "x-request-id": "test-request",
      },
      ip: "127.0.0.1",
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as Request;
  }

  function findSessionForToken(refreshToken: string): AuthSession {
    const parsed = refreshTokenService.parse(refreshToken);
    const session = parsed
      ? fakePrisma.sessions.find((item) => item.id === parsed.sessionId)
      : undefined;

    if (!session) {
      throw new Error("Expected session for refresh token");
    }

    return session;
  }
});

class UniqueConstraintError extends Error {
  code = "P2002";
}

function matchesSessionWhere(session: AuthSession, where: UpdateManySessionArgs["where"]): boolean {
  if (where.id && session.id !== where.id) {
    return false;
  }

  if (where.userId && session.userId !== where.userId) {
    return false;
  }

  if (where.familyId && session.familyId !== where.familyId) {
    return false;
  }

  if (where.refreshTokenHash && session.refreshTokenHash !== where.refreshTokenHash) {
    return false;
  }

  if (where.revokedAt === null && session.revokedAt !== null) {
    return false;
  }

  if (where.expiresAt && session.expiresAt <= where.expiresAt.gt) {
    return false;
  }

  return true;
}
