import { describe, expect, it, vi } from "vitest";

import {
  GlobalRole,
  ProjectMemberRole,
  UserStatus,
  type Project,
  type ProjectMember,
  type User,
} from "../../generated/prisma/client";
import type { AuditService } from "../audit/audit.service";
import { ProjectsService } from "./projects.service";
import type {
  ProjectMembershipWithProject,
  ProjectsRepository,
} from "./repositories/projects.repository";

const now = new Date("2026-01-01T00:00:00.000Z");

describe("ProjectsService", () => {
  it("creates an owned project and records audit", async () => {
    const record = vi.fn(() => Promise.resolve());
    const auditService = {
      record,
    } as unknown as AuditService;
    const repository = createRepository();
    const service = new ProjectsService(auditService, repository);

    const project = await service.createProject({
      body: {
        description: " Important ",
        name: "Plan",
      },
      requestId: "req-1",
      userId: owner.id,
    });

    expect(project).toMatchObject({
      description: "Important",
      name: "Plan",
      role: "OWNER",
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.created",
        projectId: project.id,
      }),
    );
  });

  it("lists projects with pagination metadata", async () => {
    const service = new ProjectsService(createAuditService(), createRepository());

    await expect(
      service.listProjects(owner.id, {
        limit: 20,
        page: 1,
        sortBy: "createdAt",
        sortDirection: "desc",
        status: "active",
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: project.id,
          role: "OWNER",
        },
      ],
      meta: {
        limit: 20,
        page: 1,
        total: 1,
        totalPages: 1,
      },
    });
  });

  it("allows OWNER and EDITOR updates but rejects VIEWER updates", async () => {
    const service = new ProjectsService(createAuditService(), createRepository());

    await expect(
      service.updateProject({
        body: {
          name: "Updated",
        },
        projectId: project.id,
        requestId: "req-1",
        role: ProjectMemberRole.OWNER,
        userId: owner.id,
      }),
    ).resolves.toMatchObject({
      name: "Updated",
    });
    await expect(
      service.updateProject({
        body: {
          name: "Editor update",
        },
        projectId: project.id,
        requestId: "req-1",
        role: ProjectMemberRole.EDITOR,
        userId: editor.id,
      }),
    ).resolves.toMatchObject({
      name: "Editor update",
    });
    await expect(
      service.updateProject({
        body: {
          name: "Viewer update",
        },
        projectId: project.id,
        requestId: "req-1",
        role: ProjectMemberRole.VIEWER,
        userId: viewer.id,
      }),
    ).rejects.toThrow("Insufficient project permissions");
  });

  it("restricts archive and restore to OWNER", async () => {
    const service = new ProjectsService(createAuditService(), createRepository());

    const archived = await service.archiveProject({
      projectId: project.id,
      requestId: "req-1",
      role: ProjectMemberRole.OWNER,
      userId: owner.id,
    });

    expect(archived.archivedAt).toBe(now.toISOString());
    await expect(
      service.restoreProject({
        projectId: project.id,
        requestId: "req-1",
        role: ProjectMemberRole.VIEWER,
        userId: viewer.id,
      }),
    ).rejects.toThrow("Insufficient project permissions");
  });

  it("lists members and isolates inaccessible projects", async () => {
    const service = new ProjectsService(createAuditService(), createRepository());
    const members = await service.listMembers(project.id, owner.id);

    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({
      role: "OWNER",
      user: {
        email: owner.email,
      },
    });
    await expect(
      service.getProject(project.id, "00000000-0000-4000-8000-000000000999"),
    ).rejects.toThrow("Project not found");
  });
});

function createAuditService(): AuditService {
  return {
    record: vi.fn(() => Promise.resolve()),
  } as unknown as AuditService;
}

function createRepository(): ProjectsRepository {
  return {
    archiveProject: vi.fn(() =>
      Promise.resolve({
        ...project,
        archivedAt: now,
      }),
    ),
    createOwnedProject: vi.fn(
      (data: { description: string | null; name: string; ownerId: string }) =>
        Promise.resolve({
          ...ownerMembership,
          project: {
            ...project,
            description: data.description,
            name: data.name,
          },
        }),
    ),
    findMembershipWithProject: vi.fn((projectId: string, userId: string) =>
      Promise.resolve(
        memberships.find(
          (membership) => membership.projectId === projectId && membership.userId === userId,
        ) ?? null,
      ),
    ),
    listMembers: vi.fn(() =>
      Promise.resolve([
        {
          ...ownerMembership,
          user: owner,
        },
        {
          ...viewerMembership,
          user: viewer,
        },
      ]),
    ),
    listUserProjects: vi.fn(() =>
      Promise.resolve({
        items: [ownerMembership],
        total: 1,
      }),
    ),
    restoreProject: vi.fn(() =>
      Promise.resolve({
        ...project,
        archivedAt: null,
      }),
    ),
    updateProject: vi.fn(
      (
        _projectId: string,
        data: {
          description?: string | null;
          name?: string;
        },
      ) =>
        Promise.resolve({
          ...project,
          ...data,
        }),
    ),
  } as unknown as ProjectsRepository;
}

const owner: User = createUser("00000000-0000-4000-8000-000000000001", "owner@example.com");
const editor: User = createUser("00000000-0000-4000-8000-000000000002", "editor@example.com");
const viewer: User = createUser("00000000-0000-4000-8000-000000000003", "viewer@example.com");

const project: Project = {
  archivedAt: null,
  createdAt: now,
  description: "Important",
  id: "00000000-0000-4000-8000-000000000010",
  name: "Plan",
  ownerId: owner.id,
  settings: {},
  updatedAt: now,
};

const ownerMembership = createMembership(ProjectMemberRole.OWNER, owner.id);
const editorMembership = createMembership(ProjectMemberRole.EDITOR, editor.id);
const viewerMembership = createMembership(ProjectMemberRole.VIEWER, viewer.id);
const memberships: ProjectMembershipWithProject[] = [
  ownerMembership,
  editorMembership,
  viewerMembership,
];

function createUser(id: string, email: string): User {
  return {
    createdAt: now,
    displayName: email.split("@")[0] ?? email,
    email,
    emailVerifiedAt: null,
    globalRole: GlobalRole.USER,
    id,
    passwordHash: "hash",
    status: UserStatus.ACTIVE,
    updatedAt: now,
  };
}

function createMembership(role: ProjectMemberRole, userId: string): ProjectMembershipWithProject {
  const membership: ProjectMember = {
    createdAt: now,
    projectId: project.id,
    role,
    updatedAt: now,
    userId,
  };

  return {
    ...membership,
    project,
  };
}
