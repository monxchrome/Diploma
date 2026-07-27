import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requestWithAuth } from "./auth-provider";

describe("requestWithAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes once after a 401 and retries the original request", async () => {
    const calls: RequestInit[] = [];
    let token: string | null = "old-token";
    const fetchMock = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementationOnce((_url, init) => {
        calls.push(init ?? {});
        return Promise.resolve(new Response(JSON.stringify({}), { status: 401 }));
      })
      .mockImplementationOnce((_url, init) => {
        calls.push(init ?? {});
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          }),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestWithAuth({
      accessToken: () => token,
      apiBaseUrl: "http://localhost:3001",
      options: {},
      path: "/api/projects",
      refreshSession: () => {
        token = "new-token";
        return Promise.resolve(true);
      },
      schema: z.object({
        ok: z.literal(true),
      }),
      setAccessToken: (value) => {
        token = value;
      },
      setUser: () => undefined,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAuthorization(calls[0])).toBe("Bearer old-token");
    expect(getAuthorization(calls[1])).toBe("Bearer new-token");
  });
});

function getAuthorization(init: RequestInit | undefined): string | null {
  const headers = init?.headers;

  if (headers instanceof Headers) {
    return headers.get("Authorization");
  }

  return null;
}
