import { Module } from "@nestjs/common";

import { HttpClientModule } from "../../infrastructure/http/http-client.module";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  controllers: [SystemController],
  imports: [HttpClientModule],
  providers: [SystemService],
})
export class SystemModule {}
