import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { normalizeRequestId, REQUEST_ID_HEADER, type RequestWithId } from "./request-id";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = normalizeRequestId(request.headers[REQUEST_ID_HEADER]);
    (request as RequestWithId).requestId = requestId;
    response.setHeader("X-Request-ID", requestId);
    next();
  }
}
