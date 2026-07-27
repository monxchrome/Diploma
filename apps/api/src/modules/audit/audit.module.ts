import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditService } from "./audit.service";

@Module({
  exports: [AuditService],
  imports: [DatabaseModule],
  providers: [AuditService],
})
export class AuditModule {}
