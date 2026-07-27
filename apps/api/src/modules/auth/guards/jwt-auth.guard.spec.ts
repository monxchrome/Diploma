import { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  GlobalRole,
  UserStatus,
  type AuthSession,
  type User,
} from "../../../generated/prisma/client";
import type { PrismaService } from "../../../infrastructure/database/prisma.service";
import { AccessTokenService } from "../services/access-token.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  it("rejects requests without access tokens", async () => {
    const guard = createGuard();

    await expect(guard.canActivate(createContext({ headers: {} }))).rejects.toThrow(
      "Access token is required",
    );
  });

  it("rejects invalid access tokens", async () => {
    const guard = createGuard();

    await expect(
      guard.canActivate(
        createContext({
          headers: {
            authorization: "Bearer invalid",
          },
        }),
      ),
    ).rejects.toThrow("Invalid access token");
  });

  it("accepts valid tokens for active sessions", async () => {
    const configService = createConfig();
    const token = new AccessTokenService(configService).sign(
      user,
      "00000000-0000-4000-8000-000000000010",
    );
    const request = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    const guard = createGuard({
      session,
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      session: {
        id: session.id,
      },
      user: {
        id: user.id,
      },
    });
  });
});

function createGuard(data: { session?: AuthSession & { user: User } } = {}): JwtAuthGuard {
  const prisma = {
    authSession: {
      findUnique: () => Promise.resolve(data.session ?? null),
    },
  };

  return new JwtAuthGuard(createConfig(), prisma as unknown as PrismaService);
}

function createConfig(): ConfigService {
  return new ConfigService({
    auth: {
      accessSecret: "test-access-secret-that-is-long-enough",
      accessTtl: "15m",
    },
  });
}

function createContext(request: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const user: User = {
  createdAt: new Date(),
  displayName: "Ada",
  email: "ada@example.com",
  emailVerifiedAt: null,
  globalRole: GlobalRole.USER,
  id: "00000000-0000-4000-8000-000000000001",
  passwordHash: "hash",
  status: UserStatus.ACTIVE,
  updatedAt: new Date(),
};

const session: AuthSession & { user: User } = {
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  familyId: "00000000-0000-4000-8000-000000000020",
  id: "00000000-0000-4000-8000-000000000010",
  ipHash: null,
  lastUsedAt: new Date(),
  refreshTokenHash: "hash",
  revokedAt: null,
  revokeReason: null,
  user,
  userAgent: null,
  userId: user.id,
};
