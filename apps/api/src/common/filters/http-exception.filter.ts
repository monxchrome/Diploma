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
  | string
  | {
      allowedPlanOptions?: string[];
      code?: string;
      currentUsage?: number;
      error?: string;
      limit?: number;
      message?: string | string[];
      resetAt?: string | null;
      resource?: string;
      retryAfter?: number;
      statusCode?: number;
      upgradeRequired?: boolean;
    };

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

      const details = typeof response === "string" ? {} : quotaDetails(response);
      return {
        error: {
          code:
            typeof response === "string"
              ? status === 400
                ? ErrorCodes.ValidationError
                : exception.name
              : (response.code ?? (status === 400 ? ErrorCodes.ValidationError : exception.name)),
          message,
          path: request.path,
          requestId,
          timestamp,
          ...details,
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

function quotaDetails(response: Exclude<ErrorResponseBody, string>) {
  const {
    allowedPlanOptions,
    currentUsage,
    limit,
    resetAt,
    resource,
    retryAfter,
    upgradeRequired,
  } = response;
  return {
    ...(allowedPlanOptions ? { allowedPlanOptions } : {}),
    ...(currentUsage === undefined ? {} : { currentUsage }),
    ...(limit === undefined ? {} : { limit }),
    ...(resetAt === undefined ? {} : { resetAt }),
    ...(resource === undefined ? {} : { resource }),
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(upgradeRequired === undefined ? {} : { upgradeRequired }),
  };
}
