import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { tap, type Observable } from "rxjs";

import { getRequestId } from "../logging/request-id";

@Injectable()
export class LatencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LatencyInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          latencyMs: Math.round(performance.now() - startedAt),
          method: request.method,
          path: request.path,
          requestId: getRequestId(request),
          statusCode: response.statusCode,
        });
      }),
    );
  }
}
