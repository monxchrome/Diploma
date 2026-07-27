import type { ApiError } from "@dip/contracts";
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { ErrorCodes } from "../errors/error-codes";
import { getRequestId } from "../logging/request-id";

type ErrorResponseBody =
  string | { error?: string; message?: string | string[]; statusCode?: number };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = getRequestId(request);
    const body = this.createBody(exception, status, request, requestId);

    if (status >= 500) {
      this.logger.error({
        err: exception instanceof Error ? exception.message : "Unknown error",
        path: request.path,
        requestId,
        status,
      });
    }

    response.status(status).json(body);
  }

  private createBody(
    exception: unknown,
    status: number,
    request: Request,
    requestId: string,
  ): ApiError {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const response = exception.getResponse() as ErrorResponseBody;
      const message =
        typeof response === "string"
          ? response
          : Array.isArray(response.message)
            ? response.message.join("; ")
            : (response.message ?? response.error ?? exception.message);

      return {
        error: {
          code: status === 400 ? ErrorCodes.ValidationError : exception.name,
          message,
          path: request.path,
          requestId,
          timestamp,
        },
      };
    }

    return {
      error: {
        code: ErrorCodes.InternalServerError,
        message: "Internal server error",
        path: request.path,
        requestId,
        timestamp,
      },
    };
  }
}
