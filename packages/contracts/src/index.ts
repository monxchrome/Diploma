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
  indexContext: z.object({
    createdAt: z.string().datetime(),
    documentId: z.string().uuid(),
    documentStatus: z.literal("COMPLETED"),
    documentVersion: z.number().int().positive(),
    documentVersionId: z.string().uuid(),
    knowledgeBaseId: z.string().uuid(),
    projectId: z.string().uuid(),
  }),
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
      pageEnd: z.number().int().nullable(),
      pageStart: z.number().int().nullable(),
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

export const RetrievalModeSchema = z.enum(["DENSE", "SPARSE", "HYBRID"]);
export type RetrievalMode = z.infer<typeof RetrievalModeSchema>;

export const RetrievalFiltersSchema = z.object({
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).max(50).optional(),
  pageEnd: z.number().int().positive().optional(),
  pageStart: z.number().int().positive().optional(),
});
export type RetrievalFilters = z.infer<typeof RetrievalFiltersSchema>;

export const SearchRequestSchema = z.object({
  filters: RetrievalFiltersSchema.default({}),
  mode: RetrievalModeSchema.default("HYBRID"),
  query: z.string().min(1).max(4000),
  topK: z.number().int().min(1).max(50).default(10),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const RetrievalEvidenceSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  evidenceId: z.string().min(1),
  headingPath: z.array(z.string()),
  knowledgeBaseId: z.string().uuid(),
  pageEnd: z.number().int().nullable(),
  pageStart: z.number().int().nullable(),
  score: z.number(),
  snippet: z.string(),
});
export type RetrievalEvidence = z.infer<typeof RetrievalEvidenceSchema>;

export const SearchResponseSchema = z.object({
  evidence: z.array(RetrievalEvidenceSchema),
  normalizedQuery: z.string(),
  retrievalRunId: z.string().uuid(),
  timingsMs: z.record(z.string(), z.number().nonnegative()),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const CitationSchema = z.object({
  documentId: z.string().uuid(),
  evidenceId: z.string().min(1),
  quote: z.string().min(1),
});
export type Citation = z.infer<typeof CitationSchema>;

export const AskRequestSchema = SearchRequestSchema.extend({
  stream: z.boolean().default(false),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskResponseSchema = SearchResponseSchema.extend({
  answer: z.string(),
  citations: z.array(CitationSchema),
  insufficientEvidence: z.boolean(),
  missingInformation: z.array(z.string()),
  ragResponseId: z.string().uuid(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const AnswerFeedbackRequestSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
  rating: z.number().int().min(1).max(5),
});
export type AnswerFeedbackRequest = z.infer<typeof AnswerFeedbackRequestSchema>;

export const AnalysisModeSchema = z.enum(["SINGLE_AGENT", "MULTI_AGENT"]);
export const SpecialistTypeSchema = z.enum([
  "MARKET",
  "FINANCIAL",
  "LEGAL_REGULATORY",
  "RISK",
  "STRATEGY",
]);
export const AnalysisStatusSchema = z.enum([
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "COMPLETED_WITH_LIMITATIONS",
  "FAILED",
  "CANCELLED",
  "ARCHIVED",
]);
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;
export type SpecialistType = z.infer<typeof SpecialistTypeSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

const BoundedTextListSchema = z.array(z.string().trim().min(1).max(1_000)).max(20).default([]);

export const CreateAnalysisRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  decisionQuestion: z.string().trim().min(1).max(4_000),
  objectives: BoundedTextListSchema,
  constraints: BoundedTextListSchema,
  assumptions: BoundedTextListSchema,
  timeHorizon: z.string().trim().max(200).optional(),
  targetMarket: z.string().trim().max(200).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1).max(50),
  documentIds: z.array(z.string().uuid()).max(100).default([]),
  mode: AnalysisModeSchema.default("MULTI_AGENT"),
  requestedSpecialists: z.array(SpecialistTypeSchema).max(5).default([]),
  additionalContext: z.string().trim().max(4_000).optional(),
});
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>;

export const AnalysisPlanSchema = z.object({
  decisionType: z.string().min(1).max(100),
  restatedQuestion: z.string().min(1).max(4_000),
  subQuestions: z.array(z.string().min(1).max(1_000)).max(10),
  selectedSpecialists: z.array(SpecialistTypeSchema).max(5),
  specialistTasks: z.record(SpecialistTypeSchema, z.string().min(1).max(2_000)),
  evidenceNeeds: z.array(z.string().min(1).max(1_000)).max(10),
  requiredReportSections: z.array(z.string().min(1).max(200)).max(15),
  knownConstraints: z.array(z.string().min(1).max(1_000)).max(20),
  expectedDecisionCriteria: z.array(z.string().min(1).max(1_000)).max(10),
  insufficientEvidenceRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationaleSummary: z.string().min(1).max(1_000),
});
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

export const SpecialistResultSchema = z.object({
  specialist: SpecialistTypeSchema,
  status: z.enum(["COMPLETED", "DEGRADED", "FAILED", "SKIPPED"]),
  summary: z.string().max(8_000),
  findings: z.array(z.string().max(2_000)).max(20),
  assumptions: z.array(z.string().max(1_000)).max(20),
  uncertainties: z.array(z.string().max(1_000)).max(20),
  missingInformation: z.array(z.string().max(1_000)).max(20),
  citations: z.array(CitationSchema).max(100),
  riskRegister: z
    .array(
      z.object({
        risk: z.string().max(2_000),
        category: z.string().max(200),
        likelihood: z.enum(["LOW", "MEDIUM", "HIGH"]),
        impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
        mitigation: z.string().max(2_000),
        mitigationBasis: z.enum(["EVIDENCE_BACKED", "ANALYTICAL_RECOMMENDATION"]),
        residualRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
        uncertainty: z.string().min(1).max(2_000),
        citations: z.array(CitationSchema).max(20),
      }),
    )
    .max(30)
    .default([]),
  alternatives: z.array(z.string().max(2_000)).max(20).default([]),
});
export type SpecialistResult = z.infer<typeof SpecialistResultSchema>;

export const RiskItemSchema = z.object({
  risk: z.string().max(2_000),
  category: z.string().max(200),
  likelihood: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
  mitigation: z.string().max(2_000),
  mitigationBasis: z.enum(["EVIDENCE_BACKED", "ANALYTICAL_RECOMMENDATION"]),
  residualRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  uncertainty: z.string().min(1).max(2_000),
  citations: z.array(CitationSchema).max(20),
});
export type RiskItem = z.infer<typeof RiskItemSchema>;

export const AnalysisReportSchema = z.object({
  executiveSummary: z.string().max(12_000),
  recommendedOption: z.string().max(4_000),
  recommendation: z.string().max(4_000),
  recommendationRationale: z.string().max(8_000),
  marketAssessment: z.string().max(8_000),
  financialAssessment: z.string().max(8_000),
  legalAssessment: z.string().max(8_000),
  sections: z
    .array(z.object({ title: z.string().max(200), content: z.string().max(12_000) }))
    .max(20),
  alternatives: z.array(z.string().max(2_000)).max(20),
  riskRegister: z.array(RiskItemSchema).max(30),
  implementationRoadmap: z.array(z.string().max(2_000)).max(20),
  decisionCriteria: z.array(z.string().max(2_000)).max(20),
  assumptions: z.array(z.string().max(1_000)).max(30),
  uncertainties: z.array(z.string().max(1_000)).max(30),
  missingInformation: z.array(z.string().max(1_000)).max(30),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  citations: z.array(CitationSchema).max(200),
  insufficientEvidence: z.boolean(),
  limitations: z.array(z.string().max(2_000)).max(20).default([]),
  qualityGatePassed: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  groundingScore: z.number().min(0).max(1),
});
export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

export const AnalysisSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  decisionQuestion: z.string(),
  mode: AnalysisModeSchema,
  status: AnalysisStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;
