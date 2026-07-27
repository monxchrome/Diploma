import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { RateLimitGuard } from "./common/guards/rate-limit.guard";
import { LatencyInterceptor } from "./common/interceptors/latency.interceptor";
import { RequestIdMiddleware } from "./common/logging/request-id.middleware";
import configuration from "./config/configuration";
import { validateApiEnv } from "./config/env.schema";
import { QueueModule } from "./infrastructure/queue/queue.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditModule } from "./modules/audit/audit.module";
import { HealthModule } from "./modules/health/health.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SessionsModule } from "./modules/sessions/sessions.module";
import { SystemModule } from "./modules/system/system.module";
import { UsersModule } from "./modules/users/users.module";

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
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "res.headers.set-cookie",
            ],
            remove: true,
          },
          customProps: () => ({
            environment: configService.getOrThrow<string>("app.environment"),
            service: configService.getOrThrow<string>("app.serviceName"),
          }),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: "default",
            limit: configService.getOrThrow<number>("rateLimit.limit"),
            ttl: configService.getOrThrow<number>("rateLimit.ttlSeconds") * 1000,
          },
          {
            name: "authRegister",
            limit: configService.getOrThrow<number>("auth.throttles.register.limit"),
            ttl: configService.getOrThrow<number>("auth.throttles.register.ttlSeconds") * 1000,
          },
          {
            name: "authLogin",
            limit: configService.getOrThrow<number>("auth.throttles.login.limit"),
            ttl: configService.getOrThrow<number>("auth.throttles.login.ttlSeconds") * 1000,
          },
          {
            name: "authRefresh",
            limit: configService.getOrThrow<number>("auth.throttles.refresh.limit"),
            ttl: configService.getOrThrow<number>("auth.throttles.refresh.ttlSeconds") * 1000,
          },
        ],
      }),
    }),
    QueueModule,
    AuditModule,
    UsersModule,
    SessionsModule,
    AuthModule,
    ProjectsModule,
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
