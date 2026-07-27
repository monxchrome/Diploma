import { describe, expect, it } from "vitest";

import {
  AiEchoRequestSchema,
  PaginatedResponseSchema,
  ProjectSummarySchema,
  RegisterRequestSchema,
  SafeUserSchema,
  SystemStatusResponseSchema,
} from "./index";

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

  it("validates safe users without password hashes", () => {
    const parsed = SafeUserSchema.parse({
      createdAt: new Date().toISOString(),
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      emailVerifiedAt: null,
      globalRole: "USER",
      id: "00000000-0000-4000-8000-000000000001",
      status: "ACTIVE",
      updatedAt: new Date().toISOString(),
    });

    expect("passwordHash" in parsed).toBe(false);
  });

  it("validates phase 2 request and paginated project contracts", () => {
    expect(
      RegisterRequestSchema.parse({
        displayName: "Grace Hopper",
        email: "grace@example.com",
        password: "Password123!",
      }),
    ).toMatchObject({
      email: "grace@example.com",
    });

    const schema = PaginatedResponseSchema(ProjectSummarySchema);
    expect(
      schema.parse({
        data: [],
        meta: {
          limit: 20,
          page: 1,
          total: 0,
          totalPages: 0,
        },
      }),
    ).toMatchObject({
      meta: {
        total: 0,
      },
    });
  });
});
