import { Module } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersRepository } from "./repositories/users.repository";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  exports: [UsersRepository, UsersService],
  imports: [DatabaseModule],
  providers: [JwtAuthGuard, UsersRepository, UsersService],
})
export class UsersModule {}
