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
});
