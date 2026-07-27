import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import { REDIS_CLIENT } from "./redis.constants";

@Module({
  exports: [REDIS_CLIENT],
  providers: [
    {
      inject: [ConfigService],
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) =>
        new Redis(configService.getOrThrow<string>("redis.url"), {
          enableReadyCheck: true,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
})
export class RedisModule {}
