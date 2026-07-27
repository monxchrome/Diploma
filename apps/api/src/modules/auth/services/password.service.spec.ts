import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService(
    new ConfigService({
      auth: {
        passwordMinLength: 8,
      },
    }),
  );

  it("rejects weak passwords", () => {
    expect(() => service.validatePasswordPolicy("password")).toThrow(
      "Password must meet the configured length",
    );
  });

  it("hashes passwords with Argon2id and verifies them", async () => {
    const hash = await service.hashPassword("Password123!");

    expect(hash).toContain("$argon2id$");
    await expect(service.verifyPassword("Password123!", hash)).resolves.toBe(true);
    await expect(service.verifyPassword("Password123?", hash)).resolves.toBe(false);
  });
});
