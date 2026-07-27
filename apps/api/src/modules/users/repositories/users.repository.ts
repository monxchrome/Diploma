import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import type { User } from "../../../generated/prisma/client";

@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: { displayName: string; email: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async findById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
  }

  async updateProfile(userId: string, displayName: string): Promise<User> {
    return this.prisma.user.update({
      data: {
        displayName,
      },
      where: {
        id: userId,
      },
    });
  }
}
