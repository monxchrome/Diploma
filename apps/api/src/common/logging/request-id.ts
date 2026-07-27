import { randomUUID } from "node:crypto";

import type { Request } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

export type RequestWithId = Request & {
  requestId?: string;
};

export function normalizeRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || candidate.length > 128) {
    return randomUUID();
  }

  return candidate;
}

export function getRequestId(request: Request): string {
  const requestWithId = request as RequestWithId;
  return requestWithId.requestId ?? normalizeRequestId(request.headers[REQUEST_ID_HEADER]);
}
