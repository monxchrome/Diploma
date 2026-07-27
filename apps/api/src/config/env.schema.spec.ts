import { describe, expect, it } from "vitest";

import { loadCorsOrigins, validateApiEnv } from "./env.schema";

describe("API environment validation", () => {
  it("applies safe local defaults", () => {
    const env = validateApiEnv({});

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.AI_SERVICE_URL).toBe("http://localhost:8000");
  });

  it("rejects malformed URLs", () => {
    expect(() => validateApiEnv({ AI_SERVICE_URL: "localhost:8000" })).toThrow();
  });

  it("normalizes CORS origins", () => {
    expect(
      loadCorsOrigins(validateApiEnv({ CORS_ORIGINS: "http://a.test, http://b.test" })),
    ).toEqual(["http://a.test", "http://b.test"]);
  });

  it("rejects insecure production cookie defaults", () => {
    expect(() =>
      validateApiEnv({
        AUTH_COOKIE_SECURE: "false",
        JWT_ACCESS_SECRET: "replace-with-local-development-access-secret-32",
        NODE_ENV: "production",
        REFRESH_TOKEN_PEPPER: "replace-with-local-development-refresh-pepper-32",
      }),
    ).toThrow();
  });
});
