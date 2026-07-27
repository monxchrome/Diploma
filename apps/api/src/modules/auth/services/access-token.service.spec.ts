import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { GlobalRole, UserStatus, type User } from "../../../generated/prisma/client";
import { AccessTokenService } from "./access-token.service";

describe("AccessTokenService", () => {
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

  it("signs and verifies short-lived access tokens", () => {
    const service = new AccessTokenService(
      new ConfigService({
        auth: {
          accessSecret: "test-access-secret-that-is-long-enough",
          accessTtl: "15m",
        },
      }),
    );

    const token = service.sign(user, "00000000-0000-4000-8000-000000000010");

    expect(service.verify(token)).toMatchObject({
      email: user.email,
      sid: "00000000-0000-4000-8000-000000000010",
      sub: user.id,
    });
  });

  it("rejects invalid access tokens", () => {
    const service = new AccessTokenService(
      new ConfigService({
        auth: {
          accessSecret: "test-access-secret-that-is-long-enough",
          accessTtl: "15m",
        },
      }),
    );

    expect(() => service.verify("invalid.token.value")).toThrow("Invalid access token");
  });
});
