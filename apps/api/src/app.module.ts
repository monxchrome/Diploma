import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";

import { RateLimitGuard } from "./common/guards/rate-limit.guard";
import { LatencyInterceptor } from "./common/interceptors/latency.interceptor";
import { RequestIdMiddleware } from "./common/logging/request-id.middleware";
import configuration from "./config/configuration";
import { validateApiEnv } from "./config/env.schema";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { HealthModule } from "./modules/health/health.module";
import { SystemModule } from "./modules/system/system.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [configuration],
      validate: validateApiEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.getOrThrow<string>("app.logLevel"),
          messageKey: "message",
          customProps: () => ({
            environment: configService.getOrThrow<string>("app.environment"),
            service: configService.getOrThrow<string>("app.serviceName"),
          }),
        },
      }),
    }),
    QueueModule,
    HealthModule,
    SystemModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LatencyInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
