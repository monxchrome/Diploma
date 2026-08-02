import { z } from "zod";

export * from "./reports.js";

export const ServiceStatusSchema = z.enum(["ok", "degraded", "down"]);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const HealthResponseSchema = z.object({
  environment: z.string(),
  service: z.string(),
  status: ServiceStatusSchema,
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReleaseVersionResponseSchema = z.object({
  apiSchemaVersion: z.string(),
  buildTimestamp: z.string(),
  commitSha: z.string(),
  databaseSchemaVersion: z.string(),
  dirty: z.boolean(),
  environment: z.string(),
  featureSetVersion: z.string(),
  version: z.string(),
});
export type ReleaseVersionResponse = z.infer<typeof ReleaseVersionResponseSchema>;

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
    allowedPlanOptions: z.array(z.string()).optional(),
    currentUsage: z.number().optional(),
    message: z.string(),
    limit: z.number().optional(),
    resetAt: z.string().datetime().nullable().optional(),
    resource: z.string().optional(),
    retryAfter: z.number().optional(),
    details: z.unknown().optional(),
    path: z.string().optional(),
    requestId: z.string(),
    timestamp: z.string().datetime(),
    upgradeRequired: z.boolean().optional(),
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
export const EvidenceModeSchema = z.enum(["INTERNAL_ONLY", "EXTERNAL_ONLY", "HYBRID"]);
export const ResearchRunStatusSchema = z.enum([
  "QUEUED",
  "PLANNING",
  "SEARCHING",
  "FETCHING",
  "EXTRACTING",
  "COMPLETED",
  "COMPLETED_WITH_LIMITATIONS",
  "FAILED",
  "CANCELLED",
]);
export const ExperimentStatusSchema = z.enum([
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "COMPLETED_WITH_LIMITATIONS",
  "FAILED",
  "CANCELLED",
]);
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
export type EvidenceMode = z.infer<typeof EvidenceModeSchema>;
export type ResearchRunStatus = z.infer<typeof ResearchRunStatusSchema>;
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;
export type SpecialistType = z.infer<typeof SpecialistTypeSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

const BoundedTextListSchema = z.array(z.string().trim().min(1).max(1_000)).max(20).default([]);
const CountryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/)
  .optional();
const DomainListSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  )
  .max(30)
  .default([]);
const DateFilterSchema = z.string().datetime().optional();

export const CreateAnalysisRequestSchema = z
  .object({
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
    knowledgeBaseIds: z.array(z.string().uuid()).max(50).default([]),
    documentIds: z.array(z.string().uuid()).max(100).default([]),
    mode: AnalysisModeSchema.default("MULTI_AGENT"),
    requestedSpecialists: z.array(SpecialistTypeSchema).max(5).default([]),
    additionalContext: z.string().trim().max(4_000).optional(),
    evidenceMode: EvidenceModeSchema.default("INTERNAL_ONLY"),
    externalResearchEnabled: z.boolean().default(false),
    researchCountry: CountryCodeSchema,
    researchLanguages: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
      )
      .max(10)
      .default([]),
    publishedAfter: DateFilterSchema,
    publishedBefore: DateFilterSchema,
    preferredDomains: DomainListSchema,
    excludedDomains: DomainListSchema,
    sourceTypes: z
      .array(
        z.enum([
          "GOVERNMENT",
          "REGULATOR",
          "OFFICIAL_DOCUMENTATION",
          "PRIMARY_RESEARCH",
          "ORGANIZATION_REPORT",
          "PROFESSIONAL_PUBLICATION",
          "NEWS",
          "OTHER",
        ]),
      )
      .max(8)
      .default([]),
    maximumExternalSources: z.number().int().min(1).max(20).optional(),
  })
  .superRefine((value, context) => {
    if (value.evidenceMode !== "EXTERNAL_ONLY" && value.knowledgeBaseIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Knowledge bases are required unless evidenceMode is EXTERNAL_ONLY",
        path: ["knowledgeBaseIds"],
      });
    }
    if (value.evidenceMode === "INTERNAL_ONLY" && value.externalResearchEnabled) {
      context.addIssue({
        code: "custom",
        message: "externalResearchEnabled requires EXTERNAL_ONLY or HYBRID evidence",
        path: ["externalResearchEnabled"],
      });
    }
    if (value.evidenceMode !== "INTERNAL_ONLY" && !value.externalResearchEnabled) {
      context.addIssue({
        code: "custom",
        message: "External evidence modes require explicit externalResearchEnabled",
        path: ["externalResearchEnabled"],
      });
    }
    if (
      value.publishedAfter &&
      value.publishedBefore &&
      value.publishedAfter > value.publishedBefore
    ) {
      context.addIssue({
        code: "custom",
        message: "publishedAfter must not be after publishedBefore",
        path: ["publishedAfter"],
      });
    }
  });
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>;

export const ResearchPolicySchema = z.object({
  enabled: z.boolean(),
  policyVersion: z.string().min(1),
  provider: z.string().min(1),
  maximumQueries: z.number().int().positive(),
  maximumResultsPerQuery: z.number().int().positive(),
  maximumFetchedPages: z.number().int().positive(),
  maximumPageBytes: z.number().int().positive(),
  maximumTotalBytes: z.number().int().positive(),
  maximumContextTokens: z.number().int().positive(),
  totalTimeoutSeconds: z.number().positive(),
  allowedSchemes: z.array(z.enum(["http", "https"])),
  allowedContentTypes: z.array(z.string()),
  blockPrivateNetworks: z.boolean(),
  domainAllowlist: z.array(z.string()),
  domainDenylist: z.array(z.string()),
  failureMode: z.enum(["LIMITATION", "FAIL_CLOSED"]),
});
export type ResearchPolicy = z.infer<typeof ResearchPolicySchema>;

export const ResearchPlanSchema = z.object({
  researchRequired: z.boolean(),
  researchObjective: z.string().max(1_000),
  evidenceGaps: z.array(z.string().max(1_000)).max(10),
  searchQueries: z.array(z.string().min(1).max(300)).max(5),
  expectedSourceTypes: z.array(z.string()).max(8),
  preferredDomains: z.array(z.string()).max(30),
  freshnessRequirement: z.string().max(200),
  country: z.string().nullable(),
  languages: z.array(z.string()).max(10),
  stopConditions: z.array(z.string().max(300)).max(10),
  rationaleSummary: z.string().max(1_000),
});
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

export const ExternalEvidenceSchema = z.object({
  evidenceId: z.string().regex(/^W[1-9]\d*$/),
  researchSourceId: z.string().uuid(),
  researchSnapshotId: z.string().uuid(),
  title: z.string(),
  publisher: z.string().nullable(),
  url: z.string().url(),
  sourceType: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  retrievedAt: z.string().datetime(),
  extractedText: z.string().max(20_000),
  selectedExcerpt: z.string().min(1).max(4_000),
  relevanceScore: z.number().min(0).max(1).nullable(),
  credibilityAssessment: z.record(z.string(), z.unknown()),
  freshnessStatus: z.string(),
  queryIds: z.array(z.string().uuid()),
  contentHash: z.string().length(64),
  warnings: z.array(z.string()),
});
export type ExternalEvidence = z.infer<typeof ExternalEvidenceSchema>;

export const ResearchExecutionResponseSchema = z.object({
  status: ResearchRunStatusSchema,
  plan: ResearchPlanSchema,
  queries: z.array(
    z.object({
      id: z.string().uuid(),
      queryIndex: z.number().int().nonnegative(),
      query: z.string(),
      purpose: z.string(),
      country: z.string().nullable(),
      languages: z.array(z.string()),
      publishedAfter: z.string().datetime().nullable(),
      publishedBefore: z.string().datetime().nullable(),
      status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
      resultCount: z.number().int().nonnegative(),
      durationMs: z.number().int().nullable(),
      errorCode: z.string().nullable(),
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          displayedUrl: z.string(),
          snippet: z.string(),
          providerRank: z.number().int().positive(),
          publishedAt: z.string().datetime().nullable(),
          sourceType: z.string().nullable(),
          language: z.string().nullable(),
          providerMetadata: z.record(z.string(), z.unknown()),
        }),
      ),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string().uuid(),
      normalizedUrl: z.string().url(),
      domain: z.string(),
      canonicalUrl: z.string().url().nullable(),
      title: z.string(),
      publisher: z.string().nullable(),
      author: z.string().nullable(),
      sourceType: z.string().nullable(),
      language: z.string().nullable(),
      pipelineStatus: z.enum([
        "SEARCH_RESULT_SELECTED_FOR_FETCH",
        "FETCHED",
        "EXTRACTED",
        "SECURITY_REJECTED",
        "ACCEPTED_AS_EVIDENCE",
      ]),
      promptInjectionDetected: z.boolean(),
      acceptedAsEvidence: z.boolean(),
      rejectionReason: z.string().nullable(),
      embeddedCitationIdsIgnored: z.boolean(),
      followedEmbeddedUrls: z.number().int().nonnegative(),
      exposedSecrets: z.boolean(),
    }),
  ),
  snapshots: z.array(
    z.object({
      id: z.string().uuid(),
      researchSourceId: z.string().uuid(),
      contentHash: z.string().length(64),
      fetchStatus: z.enum(["FETCHED", "REJECTED", "FAILED"]),
      httpStatus: z.number().int().nullable(),
      contentType: z.string().nullable(),
      publishedAt: z.string().datetime().nullable(),
      retrievedAt: z.string().datetime(),
      extractedTitle: z.string().nullable(),
      extractedText: z.string().max(20_000),
      extractedMetadata: z.record(z.string(), z.unknown()),
      credibilityAssessment: z.record(z.string(), z.unknown()),
      extractionVersion: z.string(),
      fetchDurationMs: z.number().int().nullable(),
      extractedCharacterCount: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
    }),
  ),
  externalEvidence: z.array(ExternalEvidenceSchema),
  totalFetchedBytes: z.number().int().nonnegative(),
  totalExtractedCharacters: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  searchDurationMs: z.number().int().nonnegative(),
  fetchDurationMs: z.number().int().nonnegative(),
  extractionDurationMs: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
});
export type ResearchExecutionResponse = z.infer<typeof ResearchExecutionResponseSchema>;

export const ResearchSourceSchema = z.object({
  id: z.string().uuid(),
  normalizedUrl: z.string().url(),
  domain: z.string(),
  title: z.string(),
  publisher: z.string().nullable(),
  sourceType: z.string().nullable(),
  snapshots: z
    .array(
      z.object({
        id: z.string().uuid(),
        extractedTitle: z.string().nullable(),
        extractedText: z.string().max(20_000),
        retrievedAt: z.string().datetime(),
        credibilityAssessment: z.record(z.string(), z.unknown()),
        warnings: z.array(z.string()).catch([]),
        fetchStatus: z.string(),
      }),
    )
    .catch([]),
});

export const CalculatorRequestSchema = z.object({
  operation: z.enum([
    "add",
    "subtract",
    "multiply",
    "divide",
    "percentage",
    "weighted_average",
    "break_even",
  ]),
  inputs: z
    .array(
      z.object({
        value: z.number().finite(),
        unit: z.string().trim().max(32),
        source: z.string().trim().max(200),
      }),
    )
    .min(1)
    .max(10),
  rounding: z.number().int().min(0).max(8).default(2),
});
export type CalculatorRequest = z.infer<typeof CalculatorRequestSchema>;

export const HumanEvaluationScoresSchema = z.object({
  factualCorrectness: z.number().int().min(1).max(5),
  evidenceGrounding: z.number().int().min(1).max(5),
  citationUsefulness: z.number().int().min(1).max(5),
  completeness: z.number().int().min(1).max(5),
  decisionUsefulness: z.number().int().min(1).max(5),
  riskAwareness: z.number().int().min(1).max(5),
  uncertaintyDisclosure: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  conciseness: z.number().int().min(1).max(5),
  overallPreference: z.number().int().min(1).max(5),
});

export const ExperimentVariantRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  analysisMode: AnalysisModeSchema,
  evidenceMode: z.enum(["INTERNAL_ONLY", "HYBRID"]),
  retrievalConfiguration: z.object({ rerankerEnabled: z.boolean().optional() }).default({}),
  criticConfiguration: z.object({ enabled: z.boolean().optional() }).default({}),
});
export const ExperimentCaseRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(4_000),
  objectives: BoundedTextListSchema,
  constraints: BoundedTextListSchema,
  assumptions: BoundedTextListSchema,
  scope: z.record(z.string(), z.unknown()).default({}),
  expectedEvidence: z.array(z.string()).max(50).default([]),
  rubric: z.record(z.string(), z.unknown()).default({}),
});
export const CreateExperimentRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  datasetId: z.string().trim().min(1).max(120).default("phase-6-synthetic-v1"),
  repetitions: z.number().int().min(1).max(5).default(1),
});
export type CreateExperimentRequest = z.infer<typeof CreateExperimentRequestSchema>;

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

export const ExternalContextItemSchema = z.object({
  claim: z.string().min(1).max(4_000),
  citations: z.array(CitationSchema).max(20).default([]),
});
export type ExternalContextItem = z.infer<typeof ExternalContextItemSchema>;

export const EvidenceConflictItemSchema = z.object({
  topic: z.string().min(1).max(2_000),
  internalPosition: z.string().min(1).max(4_000),
  externalPosition: z.string().min(1).max(4_000),
  provenance: z.array(z.string().max(2_000)).max(20).default([]),
  credibilityWarnings: z.array(z.string().max(2_000)).max(20).default([]),
  freshnessWarnings: z.array(z.string().max(2_000)).max(20).default([]),
  unresolved: z.boolean(),
  effectOnConfidence: z.string().min(1).max(2_000),
  citations: z.array(CitationSchema).max(20).default([]),
});
export type EvidenceConflictItem = z.infer<typeof EvidenceConflictItemSchema>;

export const QualityGateCheckSchema = z.object({
  check: z.string().min(1).max(200),
  passed: z.boolean(),
  actual: z.number().min(0).max(1).nullable().optional(),
  threshold: z.number().min(0).max(1).nullable().optional(),
  detail: z.string().min(1).max(2_000),
});
export type QualityGateCheck = z.infer<typeof QualityGateCheckSchema>;

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
  reportQualityScore: z.number().min(0).max(1).default(0),
  groundingScore: z.number().min(0).max(1),
  citationValidityScore: z.number().min(0).max(1).default(0),
  supportedClaimRatio: z.number().min(0).max(1).default(0),
  unsupportedClaimCount: z.number().int().nonnegative().default(0),
  unsupportedClaimDetails: z.array(z.string().max(2_000)).max(100).default([]),
  evidenceCoverage: z.number().min(0).max(1).default(0),
  evidenceSufficiencyScore: z.number().min(0).max(1).default(0),
  decisionReadinessScore: z.number().min(0).max(1).default(0),
  decisionReadiness: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  decisionReady: z.boolean().default(false),
  readinessChecks: z.array(QualityGateCheckSchema).max(20).default([]),
  factsConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  decisionConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  externalContext: z.array(ExternalContextItemSchema).max(20).default([]),
  evidenceConflicts: z.array(EvidenceConflictItemSchema).max(20).default([]),
  qualityGateChecks: z.array(QualityGateCheckSchema).max(20).default([]),
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

export const BillingPlanCodeSchema = z.enum(["FREE", "PRO", "TEAM"]);
export type BillingPlanCode = z.infer<typeof BillingPlanCodeSchema>;

const BillingLimitSchema = z.number().int().nonnegative();

export const PlanEntitlementsSchema = z.object({
  maximumOwnedProjects: BillingLimitSchema,
  maximumMembersPerProject: BillingLimitSchema,
  maximumKnowledgeBasesPerProject: BillingLimitSchema,
  maximumDocumentsPerKnowledgeBase: BillingLimitSchema,
  maximumTotalDocuments: BillingLimitSchema,
  maximumStorageBytes: BillingLimitSchema,
  maximumUploadBytesPerFile: BillingLimitSchema,
  monthlyAnalysisRuns: BillingLimitSchema,
  monthlySingleAgentRuns: BillingLimitSchema,
  monthlyMultiAgentRuns: BillingLimitSchema,
  monthlyExternalResearchQueries: BillingLimitSchema,
  monthlyFetchedExternalPages: BillingLimitSchema,
  monthlyExternalBytes: BillingLimitSchema,
  monthlyExperimentRuns: BillingLimitSchema,
  monthlyBenchmarkRuns: BillingLimitSchema.default(0),
  maximumExperimentVariants: BillingLimitSchema,
  maximumExperimentCases: BillingLimitSchema,
  maximumExperimentRepetitions: BillingLimitSchema,
  maximumConcurrentAnalysisRuns: BillingLimitSchema,
  maximumConcurrentResearchRuns: BillingLimitSchema,
  maximumConcurrentExperimentRuns: BillingLimitSchema,
  externalResearchAvailable: z.boolean(),
  experimentsAvailable: z.boolean(),
  experimentJsonExportAvailable: z.boolean(),
  experimentCsvExportAvailable: z.boolean(),
  maximumSavedAnalysisTemplates: BillingLimitSchema,
  maximumRetentionDays: BillingLimitSchema.nullable(),
  priorityQueue: z.boolean(),
  supportLevel: z.enum(["community", "standard", "priority"]),
  reportPdfExportAvailable: z.boolean().default(false),
  reportDocxExportAvailable: z.boolean().default(false),
  reportMarkdownExportAvailable: z.boolean().default(false),
  publicSharingAvailable: z.boolean().default(false),
  authenticatedSharingAvailable: z.boolean().default(false),
  collaborationCommentsAvailable: z.boolean().default(false),
  customBrandingAvailable: z.boolean().default(false),
  maximumActiveShareLinks: BillingLimitSchema.default(0),
  maximumExportArtifactsPerPeriod: BillingLimitSchema.default(0),
  maximumBrandProfiles: BillingLimitSchema.default(0),
  shareLinkMaximumExpiryDays: BillingLimitSchema.default(0),
  shareLinkNoExpiryAvailable: z.boolean().default(false),
  externalCommentingAvailable: z.boolean().default(false),
  versionComparisonAvailable: z.boolean().default(false),
  benchmarkExecutionAvailable: z.boolean().default(false),
  externalProviderBenchmarkAvailable: z.boolean().default(false),
  localModelBenchmarkAvailable: z.boolean().default(false),
  heterogeneousBenchmarkAvailable: z.boolean().default(false),
  humanEvaluationAvailable: z.boolean().default(false),
});
export type PlanEntitlements = z.infer<typeof PlanEntitlementsSchema>;

export const PublicBillingPlanSchema = z.object({
  billingInterval: z.literal("MONTH"),
  checkoutAvailable: z.boolean(),
  code: BillingPlanCodeSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: z.string(),
  displayName: z.string(),
  displayPrice: z.string(),
  entitlements: PlanEntitlementsSchema,
  features: z.array(z.string()),
  version: z.string(),
});
export type PublicBillingPlan = z.infer<typeof PublicBillingPlanSchema>;

export const BillingSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.string().datetime().nullable(),
  currentPeriodStart: z.string().datetime().nullable(),
  planCode: BillingPlanCodeSchema,
  planVersion: z.string(),
  status: z.enum([
    "NONE",
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "UNPAID",
    "PAUSED",
    "CANCELLED",
    "INCOMPLETE",
    "EXPIRED",
  ]),
  trialEndsAt: z.string().datetime().nullable(),
});
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>;

export const BillingUsageSchema = z.object({
  billingPeriod: z.string(),
  limits: PlanEntitlementsSchema,
  metrics: z.array(
    z.object({ metric: z.string(), projectId: z.string().uuid().nullable(), quantity: z.number() }),
  ),
  planCode: BillingPlanCodeSchema,
  resetAt: z.string().datetime(),
});
export type BillingUsage = z.infer<typeof BillingUsageSchema>;

// Phase 11 — benchmark contracts are deliberately provider-neutral.  Secrets,
// provider base URLs, hidden prompts, and raw provider payloads never cross this
// browser/API boundary.
export const ModelProviderCodeSchema = z.enum(["OPENAI", "ANTHROPIC", "OLLAMA"]);
export type ModelProviderCode = z.infer<typeof ModelProviderCodeSchema>;

export const ModelRuntimeSchema = z.enum(["CLOUD", "LOCAL_OLLAMA"]);
export type ModelRuntime = z.infer<typeof ModelRuntimeSchema>;

export const BenchmarkArchitectureSchema = z.enum([
  "SINGLE_AGENT",
  "HOMOGENEOUS_MULTI_AGENT",
  "HETEROGENEOUS_MULTI_AGENT",
  "ABLATION",
]);
export type BenchmarkArchitecture = z.infer<typeof BenchmarkArchitectureSchema>;

export const BenchmarkProtocolSchema = z.enum(["CONTROLLED_EVIDENCE", "END_TO_END"]);
export type BenchmarkProtocol = z.infer<typeof BenchmarkProtocolSchema>;

export const BenchmarkBudgetProtocolSchema = z.enum([
  "EQUAL_TOTAL_TOKEN_BUDGET",
  "PRODUCTION_DEFAULT_BUDGET",
]);
export type BenchmarkBudgetProtocol = z.infer<typeof BenchmarkBudgetProtocolSchema>;

export const BenchmarkAgentRoleSchema = z.enum([
  "SINGLE_AGENT",
  "PLANNER",
  "MARKET_SPECIALIST",
  "FINANCE_SPECIALIST",
  "LEGAL_SPECIALIST",
  "RISK_SPECIALIST",
  "STRATEGY_SPECIALIST",
  "COORDINATOR",
  "CRITIC",
]);
export type BenchmarkAgentRole = z.infer<typeof BenchmarkAgentRoleSchema>;

export const BenchmarkRunStatusSchema = z.enum([
  "DRAFT",
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "EVALUATING",
  "AGGREGATING",
  "COMPLETED",
  "COMPLETED_WITH_LIMITATIONS",
  "FAILED",
  "CANCELLED",
]);
export type BenchmarkRunStatus = z.infer<typeof BenchmarkRunStatusSchema>;

export const ModelCapabilitySchema = z.object({
  supportsSeed: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsSystemPrompt: z.boolean(),
  supportsToolCalling: z.boolean(),
});
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelProfileSchema = z.object({
  active: z.boolean(),
  benchmarkEligible: z.boolean(),
  capabilities: ModelCapabilitySchema,
  code: z.string().min(1).max(100),
  contextWindowTokens: z.number().int().positive().nullable(),
  displayName: z.string().min(1).max(200),
  exactModelId: z.string().min(1).max(300),
  family: z.string().min(1).max(100),
  id: z.string().uuid(),
  localHardwareProfileId: z.string().uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  maximumOutputTokens: z.number().int().positive().nullable(),
  provider: ModelProviderCodeSchema,
  runtime: ModelRuntimeSchema,
  version: z.string().min(1).max(100),
});
export type ModelProfileDto = z.infer<typeof ModelProfileSchema>;

export const AgentModelAssignmentSchema = z.object({
  enabled: z.boolean(),
  maxOutputTokens: z.number().int().positive(),
  modelProfileId: z.string().uuid(),
  order: z.number().int().nonnegative(),
  promptVersionId: z.string().uuid(),
  role: BenchmarkAgentRoleSchema,
  seed: z.number().int().nullable(),
  temperature: z.number().min(0).max(2),
  timeoutSeconds: z.number().positive().max(600),
  topP: z.number().min(0).max(1),
});
export type AgentModelAssignmentDto = z.infer<typeof AgentModelAssignmentSchema>;

export const BenchmarkVariantSchema = z.object({
  architecture: BenchmarkArchitectureSchema,
  assignments: z.array(AgentModelAssignmentSchema).max(9),
  code: z.string().min(1).max(40),
  description: z.string().max(2_000),
  enabled: z.boolean(),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});
export type BenchmarkVariantDto = z.infer<typeof BenchmarkVariantSchema>;

export const BenchmarkCaseSchema = z.object({
  assumptions: z.array(z.string().max(2_000)).max(30),
  code: z.string().min(1).max(80),
  constraints: z.array(z.string().max(2_000)).max(30),
  difficulty: z.string().min(1).max(40),
  domain: z.string().min(1).max(100),
  expectedAlternatives: z.array(z.string().max(2_000)).max(30),
  expectedDecisionType: z.string().min(1).max(100),
  knownUnknowns: z.array(z.string().max(2_000)).max(30),
  objectives: z.array(z.string().max(2_000)).max(30),
  question: z.string().min(1).max(8_000),
  scenario: z.string().min(1).max(12_000),
  sensitivity: z.enum(["SYNTHETIC", "LOW", "MEDIUM", "HIGH"]),
  tags: z.array(z.string().max(100)).max(30),
  title: z.string().min(1).max(200),
});
export type BenchmarkCaseDto = z.infer<typeof BenchmarkCaseSchema>;

export const BenchmarkEstimateSchema = z.object({
  estimatedCalls: z.number().int().nonnegative(),
  estimatedCostMinorUnitsHigh: z.number().int().nonnegative().nullable(),
  estimatedCostMinorUnitsLow: z.number().int().nonnegative().nullable(),
  estimatedDurationSecondsHigh: z.number().int().nonnegative(),
  estimatedDurationSecondsLow: z.number().int().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  totalCaseRuns: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export type BenchmarkEstimateDto = z.infer<typeof BenchmarkEstimateSchema>;

export const CreateBenchmarkRunRequestSchema = z.object({
  budgetProtocol: BenchmarkBudgetProtocolSchema,
  evaluationPolicy: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().uuid(),
  protocol: BenchmarkProtocolSchema,
  randomizationSeed: z.number().int(),
  repetitions: z.number().int().min(1).max(25),
  selectedVariantIds: z.array(z.string().uuid()).min(1).max(10),
  suiteVersionId: z.string().uuid(),
});
export type CreateBenchmarkRunRequest = z.infer<typeof CreateBenchmarkRunRequestSchema>;

export const BenchmarkRunSchema = z.object({
  budgetProtocol: BenchmarkBudgetProtocolSchema,
  completedAt: z.string().datetime().nullable(),
  id: z.string().uuid(),
  protocol: BenchmarkProtocolSchema,
  randomizationSeed: z.number().int(),
  repetitions: z.number().int().positive(),
  status: BenchmarkRunStatusSchema,
  suiteId: z.string().uuid(),
});
export type BenchmarkRunDto = z.infer<typeof BenchmarkRunSchema>;

export const StatisticalComparisonSchema = z.object({
  adjustedPValue: z.number().nullable(),
  confidenceInterval: z.record(z.string(), z.number()),
  effectSize: z.number().nullable(),
  leftVariantId: z.string().uuid(),
  metric: z.string(),
  pValue: z.number().nullable(),
  rightVariantId: z.string().uuid(),
  sampleSize: z.number().int().nonnegative(),
  testName: z.string(),
  warnings: z.array(z.string()),
});
export type StatisticalComparisonDto = z.infer<typeof StatisticalComparisonSchema>;
