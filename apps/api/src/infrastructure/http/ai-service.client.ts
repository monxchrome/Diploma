import {
  AiEchoRequestSchema,
  AiEchoResponseSchema,
  AiIngestionRequestSchema,
  AiIngestionResponseSchema,
  type AiEchoResponse,
  type AiIngestionResponse,
} from "@dip/contracts";
import { HttpService } from "@nestjs/axios";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

import { ErrorCodes } from "../../common/errors/error-codes";
import { REQUEST_ID_HEADER } from "../../common/logging/request-id";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiServiceClient {
  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async echo(message: string, requestId: string): Promise<AiEchoResponse> {
    const payload = AiEchoRequestSchema.parse({ message, requestId });

    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>("/v1/system/echo", payload, {
          headers: {
            [REQUEST_ID_HEADER]: requestId,
          },
        }),
      );

      return AiEchoResponseSchema.parse(response.data);
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async ingest(payload: {
    declaredMimeType: string;
    documentVersionId: string;
    ingestionJobId: string;
    requestId: string;
    storageKey: string;
  }): Promise<AiIngestionResponse> {
    const request = AiIngestionRequestSchema.parse(payload);
    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>("/v1/internal/ingestions", request, {
          headers: {
            [REQUEST_ID_HEADER]: request.requestId,
            "x-internal-service-secret": this.config.getOrThrow<string>(
              "aiService.ingestionSecret",
            ),
          },
          timeout: this.config.getOrThrow<number>("aiService.ingestionTimeoutMs"),
        }),
      );
      return AiIngestionResponseSchema.parse(response.data);
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "AI service request failed";
  }
}
