import { ProjectMemberRole } from "../../generated/prisma/client";

export function canViewProject(role: ProjectMemberRole): boolean {
  return Object.values(ProjectMemberRole).includes(role);
}

export function canUpdateProject(role: ProjectMemberRole): boolean {
  return role === ProjectMemberRole.OWNER || role === ProjectMemberRole.EDITOR;
}

export function canArchiveProject(role: ProjectMemberRole): boolean {
  return role === ProjectMemberRole.OWNER;
}
