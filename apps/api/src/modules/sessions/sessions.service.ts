import type { AuthSessionSummary } from "@dip/contracts";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { ErrorCodes } from "../../common/errors/error-codes";
import { AuditService } from "../audit/audit.service";
import { toAuthSessionSummary } from "./session.mapper";
import { SessionsRepository } from "./repositories/sessions.repository";

@Injectable()
export class SessionsService {
  constructor(
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SessionsRepository) private readonly sessionsRepository: SessionsRepository,
  ) {}

  async listUserSessions(userId: string, currentSessionId: string): Promise<AuthSessionSummary[]> {
    const sessions = await this.sessionsRepository.findUserSessions(userId);
    return sessions.map((session) => toAuthSessionSummary(session, currentSessionId));
  }

  async revokeUserSession(data: {
    actorUserId: string;
    requestId: string;
    sessionId: string;
  }): Promise<void> {
    const count = await this.sessionsRepository.revokeUserSession(
      data.actorUserId,
      data.sessionId,
      "USER_REVOKED",
    );

    if (count === 0) {
      const session = await this.sessionsRepository.findById(data.sessionId);

      if (!session || session.userId !== data.actorUserId) {
        throw new NotFoundException({
          code: ErrorCodes.NotFound,
          message: "Session not found",
        });
      }
    }

    await this.auditService.record({
      action: "auth.session.revoked",
      actorUserId: data.actorUserId,
      entityId: data.sessionId,
      entityType: "AuthSession",
      requestId: data.requestId,
    });
  }

  async revokeAllUserSessions(userId: string, requestId: string): Promise<void> {
    const count = await this.sessionsRepository.revokeAllUserSessions(userId, "USER_REVOKED_ALL");

    await this.auditService.record({
      action: "auth.sessions.revoked_all",
      actorUserId: userId,
      entityType: "AuthSession",
      metadata: {
        count,
      },
      requestId,
    });
  }
}
