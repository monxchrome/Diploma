import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AiServiceClient } from "./ai-service.client";

@Module({
  exports: [AiServiceClient],
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        baseURL: configService.getOrThrow<string>("aiService.url"),
        timeout: 5000,
      }),
    }),
  ],
  providers: [AiServiceClient],
})
export class HttpClientModule {}
