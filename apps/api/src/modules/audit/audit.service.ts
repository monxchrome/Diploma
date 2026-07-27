import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/database/prisma.service";

export type AuditMetadata = Record<string, boolean | number | string | null>;

export type AuditEvent = {
  action: string;
  actorUserId?: string | null;
  entityId?: string | null;
  entityType: string;
  metadata?: AuditMetadata;
  projectId?: string | null;
  requestId: string;
};

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        actorUserId: event.actorUserId ?? null,
        entityId: event.entityId ?? null,
        entityType: event.entityType,
        metadata: event.metadata ?? {},
        projectId: event.projectId ?? null,
        requestId: event.requestId,
      },
    });
  }
}
