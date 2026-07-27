import type { SafeUser } from "@dip/contracts";

import type { User } from "../../generated/prisma/client";

export function toSafeUser(user: User): SafeUser {
  return {
    createdAt: user.createdAt.toISOString(),
    displayName: user.displayName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    globalRole: user.globalRole,
    id: user.id,
    status: user.status,
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, " ");
}
