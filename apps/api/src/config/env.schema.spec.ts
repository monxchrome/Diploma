import { describe, expect, it } from "vitest";

import { loadCorsOrigins, validateApiEnv } from "./env.schema";

describe("API environment validation", () => {
  it("applies safe local defaults", () => {
    const env = validateApiEnv({});

    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe("development");
    expect(env.AI_SERVICE_URL).toBe("http://localhost:8000");
    expect(env.ANALYSIS_JOB_TIMEOUT_MS).toBe(660_000);
    expect(env.ANALYSIS_MIN_QUALITY_SCORE).toBe(0.7);
    expect(env.ANALYSIS_MIN_GROUNDING_SCORE).toBe(0.7);
    expect(env.ANALYSIS_ALLOW_DEGRADED_REPORT).toBe(true);
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

  it("rejects the deterministic fake billing provider in production by default", () => {
    expect(() =>
      validateApiEnv({
        AUTH_COOKIE_SECURE: "true",
        BILLING_FAKE_WEBHOOK_SECRET: "fake-webhook-secret-for-test-only",
        BILLING_PROVIDER: "fake",
        JWT_ACCESS_SECRET: "a-production-access-secret-with-adequate-length",
        NODE_ENV: "production",
        REFRESH_TOKEN_PEPPER: "a-production-refresh-pepper-with-adequate-length",
      }),
    ).toThrow();
  });
});
