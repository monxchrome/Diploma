import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { SessionsRepository } from "./repositories/sessions.repository";
import { SessionsService } from "./sessions.service";

@Module({
  exports: [SessionsRepository, SessionsService],
  imports: [AuditModule, DatabaseModule],
  providers: [SessionsRepository, SessionsService],
})
export class SessionsModule {}
