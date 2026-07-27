import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AuditModule } from "../audit/audit.module";
import { SessionsModule } from "../sessions/sessions.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AccessTokenService } from "./services/access-token.service";
import { PasswordService } from "./services/password.service";
import { RefreshTokenService } from "./services/refresh-token.service";

@Module({
  controllers: [AuthController],
  exports: [AccessTokenService, JwtAuthGuard, RefreshTokenService],
  imports: [AuditModule, DatabaseModule, SessionsModule, UsersModule],
  providers: [AccessTokenService, AuthService, JwtAuthGuard, PasswordService, RefreshTokenService],
})
export class AuthModule {}
