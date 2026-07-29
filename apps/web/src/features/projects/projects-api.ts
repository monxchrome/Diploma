import {
  AuthSessionSummarySchema,
  KnowledgeBaseSchema,
  PaginatedResponseSchema,
  ProjectMemberSchema,
  ProjectSchema,
  ProjectSummarySchema,
  SafeUserSchema,
  SystemStatusResponseSchema,
  AskResponseSchema,
  SearchResponseSchema,
  type AskResponse,
  type SearchResponse,
  UploadIntentResponseSchema,
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
export const KnowledgeBasesSchema = z.array(KnowledgeBaseSchema);
const jsonTextList = z.array(z.string()).catch([]);
const jsonIdList = z.array(z.string().uuid()).catch([]);

export const AnalysisRunSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
    progress: z.number().int().min(0).max(100),
    currentStage: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    agentRuns: z.array(z.unknown()).catch([]),
    report: z
      .object({
        report: z.unknown(),
        citations: z.array(z.unknown()).catch([]),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export const AnalysisDetailSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    decisionQuestion: z.string(),
    objectives: jsonTextList,
    constraints: jsonTextList,
    assumptions: jsonTextList,
    timeHorizon: z.string().nullable(),
    targetMarket: z.string().nullable(),
    currency: z.string().nullable(),
    knowledgeBaseIds: jsonIdList,
    documentIds: jsonIdList,
    mode: z.enum(["SINGLE_AGENT", "MULTI_AGENT"]),
    requestedSpecialists: z.array(z.string()).catch([]),
    additionalContext: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    runs: z.array(AnalysisRunSchema).catch([]),
  })
  .passthrough();

export type AnalysisDetail = z.infer<typeof AnalysisDetailSchema>;
export type AnalysisRun = z.infer<typeof AnalysisRunSchema>;

export function fetchKnowledgeBases(apiRequest: ApiRequest, projectId: string) {
  return apiRequest(`/api/projects/${projectId}/knowledge-bases`, KnowledgeBasesSchema);
}

export function fetchAnalyses(
  apiRequest: ApiRequest,
  projectId: string,
): Promise<AnalysisDetail[]> {
  return apiRequest(`/api/projects/${projectId}/analyses`, z.array(AnalysisDetailSchema));
}

export function fetchAnalysis(
  apiRequest: ApiRequest,
  projectId: string,
  analysisId: string,
): Promise<AnalysisDetail> {
  return apiRequest(
    `/api/projects/${projectId}/analyses/${analysisId}`,
    AnalysisDetailSchema,
  );
}

export function createAnalysis(
  apiRequest: ApiRequest,
  projectId: string,
  body: {
    title: string;
    decisionQuestion: string;
    mode: "SINGLE_AGENT" | "MULTI_AGENT";
    objectives: string[];
    constraints: string[];
    assumptions: string[];
    timeHorizon?: string;
    targetMarket?: string;
    currency?: string;
    knowledgeBaseIds: string[];
    documentIds: string[];
    requestedSpecialists: string[];
  },
): Promise<AnalysisDetail> {
  return apiRequest(`/api/projects/${projectId}/analyses`, AnalysisDetailSchema, {
    body,
    method: "POST",
  });
}

export function runAnalysis(
  apiRequest: ApiRequest,
  projectId: string,
  analysisId: string,
): Promise<AnalysisRun> {
  return apiRequest(
    `/api/projects/${projectId}/analyses/${analysisId}/run`,
    AnalysisRunSchema,
    { method: "POST" },
  );
}

export function cancelAnalysis(
  apiRequest: ApiRequest,
  projectId: string,
  analysisId: string,
) {
  return apiRequest(
    `/api/projects/${projectId}/analyses/${analysisId}/cancel`,
    z.object({ id: z.string().uuid(), cancellationRequested: z.boolean() }),
    { method: "POST" },
  );
}

export function searchProject(
  apiRequest: ApiRequest,
  projectId: string,
  input: { knowledgeBaseIds?: string[]; mode: "DENSE" | "SPARSE" | "HYBRID"; query: string },
): Promise<SearchResponse> {
  return apiRequest(`/api/projects/${projectId}/retrieval/search`, SearchResponseSchema, {
    body: {
      filters: { knowledgeBaseIds: input.knowledgeBaseIds ?? [] },
      mode: input.mode,
      query: input.query,
    },
    method: "POST",
  });
}

export function askProject(
  apiRequest: ApiRequest,
  projectId: string,
  input: { knowledgeBaseIds?: string[]; mode: "DENSE" | "SPARSE" | "HYBRID"; query: string },
): Promise<AskResponse> {
  return apiRequest(`/api/projects/${projectId}/retrieval/ask`, AskResponseSchema, {
    body: {
      filters: { knowledgeBaseIds: input.knowledgeBaseIds ?? [] },
      mode: input.mode,
      query: input.query,
    },
    method: "POST",
  });
}

export function sendAnswerFeedback(
  apiRequest: ApiRequest,
  projectId: string,
  ragResponseId: string,
  rating: number,
) {
  return apiRequest(
    `/api/projects/${projectId}/retrieval/responses/${ragResponseId}/feedback`,
    z.unknown(),
    {
      body: { rating },
      method: "POST",
    },
  );
}

export function createKnowledgeBase(apiRequest: ApiRequest, projectId: string, name: string) {
  return apiRequest(`/api/projects/${projectId}/knowledge-bases`, KnowledgeBaseSchema, {
    body: { name },
    method: "POST",
  });
}

export function createUploadIntent(
  apiRequest: ApiRequest,
  projectId: string,
  knowledgeBaseId: string,
  file: File,
) {
  return apiRequest(
    `/api/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents/upload-intent`,
    UploadIntentResponseSchema,
    {
      body: { filename: file.name, declaredMimeType: file.type, sizeBytes: file.size },
      method: "POST",
    },
  );
}

export function completeUpload(
  apiRequest: ApiRequest,
  projectId: string,
  knowledgeBaseId: string,
  documentId: string,
) {
  return apiRequest(
    `/api/projects/${projectId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/complete-upload`,
    z.unknown(),
    { method: "POST" },
  );
}

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
