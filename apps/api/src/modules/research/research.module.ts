import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessGuard } from "../projects/guards/project-access.guard";
import { ResearchController } from "./research.controller";
import { ResearchService } from "./research.service";

@Module({
  controllers: [ResearchController],
  imports: [
    BullModule.registerQueue({ name: "external-research" }),
    DatabaseModule,
    HttpClientModule,
  ],
  providers: [ResearchService, JwtAuthGuard, ProjectAccessGuard],
  exports: [ResearchService],
})
export class ResearchModule {}
