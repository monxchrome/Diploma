import type { AiEchoResponse, SystemStatusResponse } from "@dip/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AiServiceClient } from "../../infrastructure/http/ai-service.client";

@Injectable()
export class SystemService {
  constructor(
    @Inject(AiServiceClient) private readonly aiServiceClient: AiServiceClient,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async getStatus(requestId: string): Promise<SystemStatusResponse> {
    const aiResponse = await this.getAiCheck(requestId);

    return {
      environment: this.configService.getOrThrow<string>("app.environment"),
      requestId,
      services: {
        aiService: aiResponse.status,
        api: "ok",
      },
      timestamp: new Date().toISOString(),
    };
  }

  getAiCheck(requestId: string): Promise<AiEchoResponse> {
    return this.aiServiceClient.echo("system-status", requestId);
  }
}
