import type { AuthSessionSummary } from "@dip/contracts";

import type { AuthSession } from "../../generated/prisma/client";

export function toAuthSessionSummary(
  session: AuthSession,
  currentSessionId: string,
): AuthSessionSummary {
  return {
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    id: session.id,
    ipHash: session.ipHash,
    isCurrent: session.id === currentSessionId,
    lastUsedAt: session.lastUsedAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
    revokeReason: session.revokeReason,
    userAgent: session.userAgent,
  };
}
