import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { validationPipeOptions } from "./common/validation/validation-options";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  logger.log({
    appVersion: configService.getOrThrow<string>("app.version"),
    deploymentVersion: configService.getOrThrow<string>("app.version"),
    environment: configService.getOrThrow<string>("app.environment"),
    event: "external_research_policy",
    externalResearchEnabled: configService.getOrThrow<boolean>("research.enabled"),
    provider: configService.getOrThrow<string>("research.provider"),
    policyVersion: configService.getOrThrow<string>("research.policyVersion"),
    projectPolicyState: "not_configured",
  });

  app.useLogger(logger);
  app.enableShutdownHooks();
  const httpServer = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: number): void;
  };
  httpServer.set("trust proxy", configService.getOrThrow<number>("app.trustedProxyCount"));
  app.setGlobalPrefix("api");
  httpServer.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:", "https:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: configService.getOrThrow<string>("app.environment") === "production",
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  app.use(
    json({
      limit: configService.getOrThrow<string>("app.bodyLimit"),
      verify: (request, _response, buffer) => {
        (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: configService.getOrThrow<string>("app.bodyLimit") }));
  app.enableCors({
    credentials: true,
    origin: configService.getOrThrow<string[]>("cors.origins"),
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  if (configService.getOrThrow<boolean>("app.workerOnly")) {
    logger.log({
      event: "worker_started",
      environment: configService.getOrThrow<string>("app.environment"),
    });
    await app.init();
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Decision Intelligence API")
    .setDescription("Decision Intelligence Platform API")
    .setVersion(configService.getOrThrow<string>("app.version"))
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(configService.getOrThrow<number>("app.port"), "0.0.0.0");
}

void bootstrap();
