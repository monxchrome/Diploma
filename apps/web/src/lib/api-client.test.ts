import { describe, expect, it, vi } from "vitest";

import { fetchSystemStatus } from "./api-client";

describe("fetchSystemStatus", () => {
  it("validates status responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            environment: "test",
            requestId: "req-1",
            services: {
              aiService: "ok",
              api: "ok",
              web: "ok",
            },
            timestamp: new Date().toISOString(),
          }),
        ok: true,
      }),
    );

    await expect(fetchSystemStatus()).resolves.toMatchObject({
      environment: "test",
      services: {
        aiService: "ok",
        api: "ok",
        web: "ok",
      },
    });
  });

  it("surfaces API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            error: {
              code: "UPSTREAM_API_ERROR",
              message: "API unavailable",
              requestId: "req-1",
              timestamp: new Date().toISOString(),
            },
          }),
        ok: false,
      }),
    );

    await expect(fetchSystemStatus()).rejects.toThrow("API unavailable");
  });
});
