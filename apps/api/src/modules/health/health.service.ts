import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.constants";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getReadiness(): Promise<"ok" | "degraded"> {
    const checks = await Promise.allSettled([this.checkPrisma(), this.checkRedis()]);
    return checks.every((check) => check.status === "fulfilled") ? "ok" : "degraded";
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
}
