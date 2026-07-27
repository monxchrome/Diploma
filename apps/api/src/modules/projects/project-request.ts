import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import type { ProjectMemberRole } from "../../generated/prisma/client";

export type ProjectAccess = {
  projectId: string;
  role: ProjectMemberRole;
};

export type ProjectRequest = AuthenticatedRequest & {
  projectAccess?: ProjectAccess;
};
