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
  });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.enableShutdownHooks();
  app.setGlobalPrefix("api");
  app.use(helmet());
  app.use(json({ limit: configService.getOrThrow<string>("app.bodyLimit") }));
  app.use(urlencoded({ extended: true, limit: configService.getOrThrow<string>("app.bodyLimit") }));
  app.enableCors({
    credentials: true,
    origin: configService.getOrThrow<string[]>("cors.origins"),
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Decision Intelligence API")
    .setDescription("Decision Intelligence Platform API")
    .setVersion("0.1.0")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(configService.getOrThrow<number>("app.port"));
}

void bootstrap();
