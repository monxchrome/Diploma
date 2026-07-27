import type { SafeUser } from "@dip/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { ErrorCodes } from "../../common/errors/error-codes";
import { UsersRepository } from "./repositories/users.repository";
import { normalizeDisplayName, toSafeUser } from "./user.mapper";

@Injectable()
export class UsersService {
  constructor(@Inject(UsersRepository) private readonly usersRepository: UsersRepository) {}

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NotFound,
        message: "User not found",
      });
    }

    return toSafeUser(user);
  }

  async updateProfile(userId: string, displayName: string): Promise<SafeUser> {
    const user = await this.usersRepository.updateProfile(
      userId,
      normalizeDisplayName(displayName),
    );
    return toSafeUser(user);
  }
}
