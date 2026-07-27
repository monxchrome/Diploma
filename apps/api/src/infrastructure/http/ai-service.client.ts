import { AiEchoRequestSchema, AiEchoResponseSchema, type AiEchoResponse } from "@dip/contracts";
import { HttpService } from "@nestjs/axios";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { firstValueFrom } from "rxjs";

import { ErrorCodes } from "../../common/errors/error-codes";
import { REQUEST_ID_HEADER } from "../../common/logging/request-id";

@Injectable()
export class AiServiceClient {
  constructor(private readonly httpService: HttpService) {}

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

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "AI service request failed";
  }
}
