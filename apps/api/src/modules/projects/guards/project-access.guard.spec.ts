import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ProjectMemberRole } from "../../../generated/prisma/client";
import type { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ProjectAccessGuard } from "./project-access.guard";

type ProjectGuardRequest = {
  params: {
    projectId: string;
  };
  projectAccess?: {
    projectId: string;
    role: ProjectMemberRole;
  };
  user: {
    id: string;
  };
};

describe("ProjectAccessGuard", () => {
  it("returns not found for projects outside the user membership", async () => {
    const guard = createGuard(null);

    await expect(guard.canActivate(createContext())).rejects.toThrow("Project not found");
  });

  it("attaches project access for members", async () => {
    const request = createRequest();
    const guard = createGuard({
      projectId: request.params.projectId,
      role: ProjectMemberRole.OWNER,
      userId: request.user.id,
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.projectAccess).toEqual({
      projectId: request.params.projectId,
      role: "OWNER",
    });
  });
});

function createGuard(
  membership: { projectId: string; role: ProjectMemberRole; userId: string } | null,
): ProjectAccessGuard {
  const prisma = {
    projectMember: {
      findUnique: () => Promise.resolve(membership),
    },
  };

  return new ProjectAccessGuard(prisma as unknown as PrismaService);
}

function createContext(request: ProjectGuardRequest = createRequest()): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function createRequest(): ProjectGuardRequest {
  return {
    params: {
      projectId: "00000000-0000-4000-8000-000000000010",
    },
    user: {
      id: "00000000-0000-4000-8000-000000000001",
    },
  };
}
