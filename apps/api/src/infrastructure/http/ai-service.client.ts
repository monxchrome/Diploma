import {
  AiEchoRequestSchema,
  AiEchoResponseSchema,
  AiIngestionRequestSchema,
  AiIngestionResponseSchema,
  SearchRequestSchema,
  type AiEchoResponse,
  type AiIngestionResponse,
} from "@dip/contracts";
import { HttpService } from "@nestjs/axios";
import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { isAxiosError } from "axios";
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
    indexContext: {
      createdAt: string;
      documentId: string;
      documentStatus: "COMPLETED";
      documentVersion: number;
      documentVersionId: string;
      knowledgeBaseId: string;
      projectId: string;
    };
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

  async retrieve(payload: {
    filters: unknown;
    generateAnswer: boolean;
    mode: "DENSE" | "SPARSE" | "HYBRID";
    projectId: string;
    query: string;
    requestId: string;
    topK: number;
  }): Promise<unknown> {
    const request = SearchRequestSchema.parse({
      filters: payload.filters,
      mode: payload.mode,
      query: payload.query,
      topK: payload.topK,
    });
    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>(
          "/v1/internal/retrieval",
          { ...request, generateAnswer: payload.generateAnswer, projectId: payload.projectId },
          {
            headers: {
              [REQUEST_ID_HEADER]: payload.requestId,
              "x-internal-service-secret": this.config.getOrThrow<string>(
                "aiService.ingestionSecret",
              ),
            },
            timeout: this.config.getOrThrow<number>("aiService.ingestionTimeoutMs"),
          },
        ),
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async analyze(payload: unknown, requestId: string): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>("/v1/internal/analyses", payload, {
          headers: {
            [REQUEST_ID_HEADER]: requestId,
            "x-internal-service-secret": this.config.getOrThrow<string>(
              "aiService.ingestionSecret",
            ),
          },
          timeout: this.config.getOrThrow<number>("analysis.jobTimeoutMs"),
        }),
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async executeResearch(payload: unknown, requestId: string): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<unknown>("/v1/internal/research/execute", payload, {
          headers: {
            [REQUEST_ID_HEADER]: requestId,
            "x-internal-service-secret": this.config.getOrThrow<string>(
              "aiService.ingestionSecret",
            ),
          },
          timeout: this.config.getOrThrow<number>("research.jobTimeoutMs"),
        }),
      );
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async cancelResearch(researchRunId: string, requestId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          "/v1/internal/research/cancel",
          { researchRunId },
          {
            headers: {
              [REQUEST_ID_HEADER]: requestId,
              "x-internal-service-secret": this.config.getOrThrow<string>(
                "aiService.ingestionSecret",
              ),
            },
            timeout: this.config.getOrThrow<number>("research.jobTimeoutMs"),
          },
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async deactivateDocumentVersion(documentVersionId: string, requestId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          "/v1/internal/document-versions/deactivate",
          { documentVersionId },
          {
            headers: {
              [REQUEST_ID_HEADER]: requestId,
              "x-internal-service-secret": this.config.getOrThrow<string>(
                "aiService.ingestionSecret",
              ),
            },
          },
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  async archiveKnowledgeBase(
    knowledgeBaseId: string,
    documentVersionIds: string[],
    archived: boolean,
    requestId: string,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          "/v1/internal/knowledge-bases/archive",
          { archived, documentVersionIds, knowledgeBaseId },
          {
            headers: {
              [REQUEST_ID_HEADER]: requestId,
              "x-internal-service-secret": this.config.getOrThrow<string>(
                "aiService.ingestionSecret",
              ),
            },
          },
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.ExternalServiceError,
        message: this.formatError(error),
      });
    }
  }

  private formatError(error: unknown): string {
    if (isAxiosError<unknown>(error)) {
      const data: unknown = error.response?.data;
      const detail = this.isRecord(data) ? data["detail"] : undefined;
      if (
        this.isRecord(detail) &&
        typeof detail["code"] === "string" &&
        typeof detail["message"] === "string"
      ) {
        return `${detail["code"]}: ${detail["message"]}`;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "AI service request failed";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
