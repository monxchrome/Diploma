import type { HttpService } from "@nestjs/axios";
import type { ConfigService } from "@nestjs/config";
import type { AxiosResponse } from "axios";
import { of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { AiServiceClient } from "./ai-service.client";

describe("AiServiceClient", () => {
  it("returns validated echo responses", async () => {
    const post = vi.fn().mockReturnValue(
      of({
        data: {
          message: "system-status",
          requestId: "req-1",
          service: "ai-service",
          status: "ok",
          timestamp: new Date().toISOString(),
        },
      } satisfies Partial<AxiosResponse>),
    );
    const client = new AiServiceClient({ post } as unknown as HttpService, {} as ConfigService);

    await expect(client.echo("system-status", "req-1")).resolves.toMatchObject({
      requestId: "req-1",
      service: "ai-service",
      status: "ok",
    });
    expect(post).toHaveBeenCalledWith(
      "/v1/system/echo",
      { message: "system-status", requestId: "req-1" },
      { headers: { "x-request-id": "req-1" } },
    );
  });

  it("maps downstream failures to service unavailable", async () => {
    const post = vi.fn().mockReturnValue(throwError(() => new Error("network")));
    const client = new AiServiceClient({ post } as unknown as HttpService, {} as ConfigService);

    await expect(client.echo("system-status", "req-1")).rejects.toMatchObject({
      status: 503,
    });
  });
});
