import { z } from "zod";

export const ServiceStatusSchema = z.enum(["ok", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const HealthResponseSchema = z.object({
  environment: z.string(),
  service: z.string(),
  status: ServiceStatusSchema,
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AiEchoRequestSchema = z.object({
  message: z.string().min(1).max(1024),
  requestId: z.string().min(1).max(128),
});
export type AiEchoRequest = z.infer<typeof AiEchoRequestSchema>;

export const AiEchoResponseSchema = z.object({
  message: z.string(),
  requestId: z.string(),
  service: z.literal("ai-service"),
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});
export type AiEchoResponse = z.infer<typeof AiEchoResponseSchema>;

export const SystemStatusResponseSchema = z.object({
  environment: z.string(),
  requestId: z.string(),
  services: z.object({
    api: ServiceStatusSchema,
    aiService: ServiceStatusSchema,
  }),
  timestamp: z.string().datetime(),
});
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    path: z.string().optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const KnowledgeBaseStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const DocumentStatusSchema = z.enum([
  "PENDING_UPLOAD",
  "UPLOADED",
  "QUEUED",
  "VALIDATING",
  "PARSING",
  "CHUNKING",
  "EMBEDDING",
  "INDEXING",
  "COMPLETED",
  "FAILED",
  "ARCHIVED",
]);
export const IngestionJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type KnowledgeBaseStatus = z.infer<typeof KnowledgeBaseStatusSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

export const KnowledgeBaseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: KnowledgeBaseStatusSchema,
  createdById: z.string().uuid(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
  originalFilename: z.string(),
  displayName: z.string(),
  status: DocumentStatusSchema,
  mimeType: z.string().nullable(),
  declaredMimeType: z.string(),
  sizeBytes: z.string(),
  currentVersionId: z.string().uuid().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const IngestionJobSchema = z.object({
  id: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  status: IngestionJobStatusSchema,
  attempt: z.number().int(),
  progress: z.number().int(),
  currentStage: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type IngestionJob = z.infer<typeof IngestionJobSchema>;

export const UploadIntentResponseSchema = z.object({
  document: DocumentSchema,
  documentVersionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  uploadMethod: z.literal("PUT"),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
});
export type UploadIntentResponse = z.infer<typeof UploadIntentResponseSchema>;

export const AiIngestionRequestSchema = z.object({
  documentVersionId: z.string().uuid(),
  ingestionJobId: z.string().uuid(),
  storageKey: z.string().min(1).max(1024),
  declaredMimeType: z.string().min(1).max(255),
  requestId: z.string().min(1).max(128),
});
export const AiIngestionResponseSchema = z.object({
  checksumSha256: z.string().length(64),
  detectedMimeType: z.string(),
  parserName: z.string(),
  parserVersion: z.string(),
  characterCount: z.number().int().nonnegative(),
  tokenCount: z.number().int().nonnegative(),
  embeddingModel: z.string(),
  embeddingDimension: z.number().int().positive(),
  chunks: z.array(
    z.object({
      content: z.string().min(1),
      tokenCount: z.number().int().nonnegative(),
      chunkIndex: z.number().int().nonnegative(),
      contentHash: z.string().length(64),
      vectorPointId: z.string().uuid(),
      headingPath: z.array(z.string()),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type AiIngestionResponse = z.infer<typeof AiIngestionResponseSchema>;

export const GlobalRoleSchema = z.enum(["USER", "ADMIN"]);
export type GlobalRole = z.infer<typeof GlobalRoleSchema>;

export const UserStatusSchema = z.enum(["ACTIVE", "DISABLED"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const ProjectMemberRoleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);
export type ProjectMemberRole = z.infer<typeof ProjectMemberRoleSchema>;

export const SafeUserSchema = z.object({
  createdAt: z.string().datetime(),
  displayName: z.string(),
  email: z.string().email(),
  emailVerifiedAt: z.string().datetime().nullable(),
  globalRole: GlobalRoleSchema,
  id: z.string().uuid(),
  status: UserStatusSchema,
  updatedAt: z.string().datetime(),
});
export type SafeUser = z.infer<typeof SafeUserSchema>;

export const AuthTokensResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: SafeUserSchema,
});
export type AuthTokensResponse = z.infer<typeof AuthTokensResponseSchema>;

export const AuthSessionSummarySchema = z.object({
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  id: z.string().uuid(),
  ipHash: z.string().nullable(),
  isCurrent: z.boolean(),
  lastUsedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  revokeReason: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type AuthSessionSummary = z.infer<typeof AuthSessionSummarySchema>;

export const RegisterRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const ProjectSchema = z.object({
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  description: z.string().nullable(),
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  role: ProjectMemberRoleSchema,
  settings: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.pick({
  archivedAt: true,
  createdAt: true,
  description: true,
  id: true,
  name: true,
  ownerId: true,
  role: true,
  updatedAt: true,
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const CreateProjectRequestSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  name: z.string().trim().min(1).max(160),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(1).max(160).optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ProjectMemberSchema = z.object({
  createdAt: z.string().datetime(),
  projectId: z.string().uuid(),
  role: ProjectMemberRoleSchema,
  updatedAt: z.string().datetime(),
  user: SafeUserSchema,
  userId: z.string().uuid(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const PaginationMetaSchema = z.object({
  limit: z.number().int().positive(),
  page: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const PaginatedResponseSchema = <Item extends z.ZodType>(itemSchema: Item) =>
  z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  });
export type PaginatedResponse<Item> = {
  data: Item[];
  meta: PaginationMeta;
};

export const AnalysisEventNameSchema = z.enum([
  "analysis.requested",
  "analysis.started",
  "analysis.completed",
  "analysis.failed",
]);
export type AnalysisEventName = z.infer<typeof AnalysisEventNameSchema>;
