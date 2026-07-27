import { Inject, Injectable } from "@nestjs/common";

import type { AuthSession } from "../../../generated/prisma/client";
import { PrismaService } from "../../../infrastructure/database/prisma.service";

@Injectable()
export class SessionsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findUserSessions(userId: string): Promise<AuthSession[]> {
    return this.prisma.authSession.findMany({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        userId,
      },
    });
  }

  async findById(sessionId: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findUnique({
      where: {
        id: sessionId,
      },
    });
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    reason: string,
    now = new Date(),
  ): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      data: {
        revokedAt: now,
        revokeReason: reason,
      },
      where: {
        id: sessionId,
        revokedAt: null,
        userId,
      },
    });

    return result.count;
  }

  async revokeAllUserSessions(userId: string, reason: string, now = new Date()): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      data: {
        revokedAt: now,
        revokeReason: reason,
      },
      where: {
        revokedAt: null,
        userId,
      },
    });

    return result.count;
  }

  async revokeFamily(familyId: string, reason: string, now = new Date()): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      data: {
        revokedAt: now,
        revokeReason: reason,
      },
      where: {
        familyId,
        revokedAt: null,
      },
    });

    return result.count;
  }
}
