import type { HealthResponse } from "@dip/contracts";
import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
  ) {}

  @Get()
  getHealth(): HealthResponse {
    return this.baseHealth("ok");
  }

  @Get("live")
  getLive(): HealthResponse {
    return this.baseHealth("ok");
  }

  @Get("ready")
  async getReady(): Promise<HealthResponse> {
    const status = await this.healthService.getReadiness();
    return this.baseHealth(status);
  }

  private baseHealth(status: HealthResponse["status"]): HealthResponse {
    return {
      environment: this.configService.getOrThrow<string>("app.environment"),
      service: this.configService.getOrThrow<string>("app.serviceName"),
      status,
      timestamp: new Date().toISOString(),
    };
  }
}
