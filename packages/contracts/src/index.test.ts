import { describe, expect, it } from "vitest";

import { AiEchoRequestSchema, SystemStatusResponseSchema } from "./index";

describe("contracts", () => {
  it("validates an AI echo request", () => {
    expect(
      AiEchoRequestSchema.parse({
        message: "ping",
        requestId: "req-1",
      }),
    ).toEqual({
      message: "ping",
      requestId: "req-1",
    });
  });

  it("rejects invalid service status values", () => {
    expect(() =>
      SystemStatusResponseSchema.parse({
        environment: "test",
        requestId: "req-1",
        services: {
          api: "ok",
          aiService: "unknown",
        },
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});
