import type { GlobalRole, UserStatus } from "../../generated/prisma/client";
import type { Request } from "express";

export type AuthenticatedUser = {
  createdAt: Date;
  displayName: string;
  email: string;
  emailVerifiedAt: Date | null;
  globalRole: GlobalRole;
  id: string;
  status: UserStatus;
  updatedAt: Date;
};

export type AuthenticatedSession = {
  familyId: string;
  id: string;
  userId: string;
};

export type AuthenticatedRequest = Request & {
  session?: AuthenticatedSession;
  user?: AuthenticatedUser;
};
