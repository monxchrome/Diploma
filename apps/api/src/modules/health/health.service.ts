import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.constants";
import { BillingService } from "../billing/billing.service";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BillingService) private readonly billing: BillingService,
  ) {}

  async getReadiness(): Promise<"ok" | "degraded"> {
    const checks = await Promise.allSettled([
      this.checkPrisma(),
      this.checkRedis(),
      this.checkAiService(),
      this.checkMinio(),
      this.checkQdrant(),
    ]);
    return checks.every((check) => check.status === "fulfilled") ? "ok" : "degraded";
  }

  async getDependencyStatus(): Promise<"ok" | "degraded"> {
    return this.getReadiness();
  }

  async getBillingStatus(): Promise<"ok" | "degraded"> {
    return (await this.billing.health()).ready ? "ok" : "degraded";
  }

  private async checkPrisma(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkRedis(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }

    await this.redis.ping();
  }

  private async checkAiService(): Promise<void> {
    const response = await fetch(`${this.config.getOrThrow<string>("aiService.url")}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error("AI service health check failed");
  }

  private async checkMinio(): Promise<void> {
    const response = await fetch(this.config.getOrThrow<string>("storage.endpoint"), {
      signal: AbortSignal.timeout(3_000),
    });
    if (response.status >= 500) throw new Error("Object storage health check failed");
  }

  private async checkQdrant(): Promise<void> {
    const response = await fetch(
      `${this.config.getOrThrow<string>("services.qdrantUrl")}/healthz`,
      {
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!response.ok) throw new Error("Qdrant health check failed");
  }
}
