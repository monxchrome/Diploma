import type { SafeUser } from "@dip/contracts";
import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/auth/authenticated-request";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<SafeUser> {
    return this.usersService.getMe(user.id);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProfileDto,
  ): Promise<SafeUser> {
    return this.usersService.updateProfile(user.id, body.displayName);
  }
}
