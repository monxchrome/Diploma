import { ApiErrorSchema, SystemStatusResponseSchema } from "@dip/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { getWebConfig } from "@/lib/config";
import { createRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = getWebConfig();
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? createRequestId();

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/system/status`, {
      cache: "no-store",
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(payload);
      return NextResponse.json(parsed.success ? parsed.data : createApiError(requestId), {
        headers: { "X-Request-ID": requestId },
        status: response.status,
      });
    }

    const status = SystemStatusResponseSchema.parse(payload);

    return NextResponse.json(
      {
        ...status,
        services: {
          ...status.services,
          web: "ok",
        },
      },
      {
        headers: {
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(createApiError(requestId, error), {
      headers: { "X-Request-ID": requestId },
      status: 502,
    });
  }
}

function createApiError(requestId: string, error?: unknown) {
  return {
    error: {
      code: "UPSTREAM_API_ERROR",
      message: error instanceof Error ? error.message : "Unable to fetch API status",
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}
