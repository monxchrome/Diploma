import {
  AuthSessionSummarySchema,
  PaginatedResponseSchema,
  ProjectMemberSchema,
  ProjectSchema,
  ProjectSummarySchema,
  SafeUserSchema,
  SystemStatusResponseSchema,
  type AuthSessionSummary,
  type PaginatedResponse,
  type Project,
  type ProjectMember,
  type ProjectSummary,
  type SafeUser,
} from "@dip/contracts";
import { z } from "zod";

import type { useAuth } from "@/features/auth/auth-provider";

type ApiRequest = ReturnType<typeof useAuth>["apiRequest"];

export const ProjectsPageSchema = PaginatedResponseSchema(ProjectSummarySchema);
export const ProjectMembersSchema = z.array(ProjectMemberSchema);
export const AuthSessionsSchema = z.array(AuthSessionSummarySchema);

export async function fetchProjects(
  apiRequest: ApiRequest,
  params: {
    page?: number;
    status?: "active" | "all" | "archived";
  } = {},
): Promise<PaginatedResponse<ProjectSummary>> {
  const search = new URLSearchParams({
    limit: "20",
    page: String(params.page ?? 1),
    status: params.status ?? "active",
  });

  return apiRequest(`/api/projects?${search.toString()}`, ProjectsPageSchema);
}

export function fetchProject(apiRequest: ApiRequest, projectId: string): Promise<Project> {
  return apiRequest(`/api/projects/${projectId}`, ProjectSchema);
}

export function createProject(
  apiRequest: ApiRequest,
  body: { description?: string; name: string },
): Promise<Project> {
  return apiRequest("/api/projects", ProjectSchema, {
    body,
    method: "POST",
  });
}

export function updateProject(
  apiRequest: ApiRequest,
  projectId: string,
  body: { description?: string | null; name?: string },
): Promise<Project> {
  return apiRequest(`/api/projects/${projectId}`, ProjectSchema, {
    body,
    method: "PATCH",
  });
}

export function archiveProject(apiRequest: ApiRequest, projectId: string): Promise<Project> {
  return apiRequest(`/api/projects/${projectId}`, ProjectSchema, {
    method: "DELETE",
  });
}

export function restoreProject(apiRequest: ApiRequest, projectId: string): Promise<Project> {
  return apiRequest(`/api/projects/${projectId}/restore`, ProjectSchema, {
    method: "POST",
  });
}

export function fetchProjectMembers(
  apiRequest: ApiRequest,
  projectId: string,
): Promise<ProjectMember[]> {
  return apiRequest(`/api/projects/${projectId}/members`, ProjectMembersSchema);
}

export function fetchProfile(apiRequest: ApiRequest): Promise<SafeUser> {
  return apiRequest("/api/users/me", SafeUserSchema);
}

export function updateProfile(apiRequest: ApiRequest, displayName: string): Promise<SafeUser> {
  return apiRequest("/api/users/me", SafeUserSchema, {
    body: {
      displayName,
    },
    method: "PATCH",
  });
}

export function fetchSessions(apiRequest: ApiRequest): Promise<AuthSessionSummary[]> {
  return apiRequest("/api/auth/sessions", AuthSessionsSchema);
}

export function revokeSession(apiRequest: ApiRequest, sessionId: string): Promise<void> {
  return apiRequest(`/api/auth/sessions/${sessionId}`, z.void(), {
    method: "DELETE",
  });
}

export function fetchApiStatus(apiRequest: ApiRequest) {
  return apiRequest("/api/system/status", SystemStatusResponseSchema, {
    auth: false,
  });
}
