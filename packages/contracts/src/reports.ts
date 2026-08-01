import { z } from "zod";

const Uuid = z.string().uuid();
const SafeText = z.string().trim().min(1).max(12_000);
const SafeUrl = z.url().refine((value) => /^https?:\/\//i.test(value), "Expected HTTP(S) URL");

export const ReportSnapshotStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const ExportFormatSchema = z.enum(["PDF", "DOCX", "MARKDOWN", "PRINT_HTML"]);
export const ExportJobStatusSchema = z.enum([
  "QUEUED",
  "GENERATING",
  "VALIDATING",
  "UPLOADING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);
export const ShareAccessModeSchema = z.enum([
  "PUBLIC_READ_ONLY",
  "AUTHENTICATED_READ_ONLY",
  "PROJECT_MEMBERS_ONLY",
  "AUTHENTICATED_COMMENT",
]);
export const CommentTargetTypeSchema = z.enum([
  "REPORT_GENERAL",
  "REPORT_SECTION",
  "CITATION",
  "EVIDENCE_SUMMARY",
]);
export const CommentThreadStatusSchema = z.enum(["OPEN", "RESOLVED", "DELETED"]);
export const CollaborationNotificationTypeSchema = z.enum([
  "MENTIONED_IN_COMMENT",
  "REPLIED_TO_COMMENT",
  "THREAD_RESOLVED",
  "THREAD_REOPENED",
  "EXPORT_COMPLETED",
  "EXPORT_FAILED",
  "SHARE_LINK_CREATED",
  "SHARE_LINK_REVOKED",
]);

export const SnapshotSectionSchema = z.object({
  anchor: z.string().regex(/^section:[a-z0-9-]{1,100}$/),
  content: SafeText,
  title: z.string().trim().min(1).max(200),
});
export const SnapshotCitationSchema = z.object({
  evidenceId: z.string().regex(/^[EW]\d+$/),
  excerpt: z.string().trim().min(1).max(4_000),
  sourceType: z.enum(["internal", "external"]),
  title: z.string().trim().min(1).max(300).optional(),
  url: SafeUrl.optional(),
});
export const ReportSnapshotContentSchema = z.object({
  analysisMode: z.enum(["SINGLE_AGENT", "MULTI_AGENT"]),
  assumptions: z.array(z.string().max(1_000)).max(30),
  citations: z.array(SnapshotCitationSchema).max(200),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  decisionReadiness: z.enum(["LOW", "MEDIUM", "HIGH"]),
  evidenceSupport: z.enum(["SUFFICIENT", "LIMITED", "INSUFFICIENT"]),
  limitations: z.array(z.string().max(2_000)).max(30),
  missingInformation: z.array(z.string().max(1_000)).max(30),
  nextSteps: z.array(z.string().max(2_000)).max(30),
  recommendation: z.string().trim().min(1).max(4_000),
  recommendationType: z.string().trim().max(200).nullable(),
  risks: z.array(z.string().max(2_000)).max(30),
  sections: z.array(SnapshotSectionSchema).max(30),
  summary: z.string().max(12_000),
  warnings: z.array(z.string().max(2_000)).max(30),
});
export type ReportSnapshotContent = z.infer<typeof ReportSnapshotContentSchema>;

export const ExportOptionsSchema = z
  .object({
    includeBranding: z.boolean().default(true),
    includeComments: z.boolean().default(false),
    includeCoverPage: z.boolean().default(true),
    includeExecutiveSummary: z.boolean().default(true),
    includeFullAnalysis: z.boolean().default(true),
    includeSources: z.boolean().default(true),
    includeTableOfContents: z.boolean().default(false),
    includeTechnicalAppendix: z.boolean().default(false),
    locale: z.string().trim().min(2).max(35).default("en-US"),
    orientation: z.literal("portrait").default("portrait"),
    pageSize: z.enum(["A4", "LETTER"]).default("A4"),
    showConfidentialWatermark: z.boolean().default(false),
    showContentHash: z.boolean().default(false),
    showGeneratedAt: z.boolean().default(true),
    showSnapshotVersion: z.boolean().default(true),
  })
  .strict();
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;
const DefaultExportOptions: ExportOptions = {
  includeBranding: true,
  includeComments: false,
  includeCoverPage: true,
  includeExecutiveSummary: true,
  includeFullAnalysis: true,
  includeSources: true,
  includeTableOfContents: false,
  includeTechnicalAppendix: false,
  locale: "en-US",
  orientation: "portrait",
  pageSize: "A4",
  showConfidentialWatermark: false,
  showContentHash: false,
  showGeneratedAt: true,
  showSnapshotVersion: true,
};

export const CreateExportRequestSchema = z
  .object({
    format: ExportFormatSchema,
    idempotencyKey: z.string().trim().min(16).max(200),
    options: ExportOptionsSchema.default(DefaultExportOptions),
  })
  .strict();
export const CreateShareLinkRequestSchema = z
  .object({
    accessMode: ShareAccessModeSchema,
    allowComments: z.boolean().default(false),
    allowDownload: z.boolean().default(false),
    allowedExportFormats: z.array(ExportFormatSchema).max(3).default([]),
    expiresAt: z.string().datetime().nullable().optional(),
    maximumViews: z.number().int().positive().max(1_000_000).nullable().optional(),
    showBranding: z.boolean().default(true),
    showSources: z.boolean().default(true),
    showTechnicalAppendix: z.boolean().default(false),
  })
  .strict();
export const UpdateShareLinkRequestSchema = CreateShareLinkRequestSchema.partial().strict();

export const CreateCommentRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(4_000),
    mentions: z.array(Uuid).max(10).default([]),
    targetAnchor: z.string().trim().min(1).max(160).default("report:general"),
    targetType: CommentTargetTypeSchema.default("REPORT_GENERAL"),
  })
  .strict();
export const UpdateCommentRequestSchema = z
  .object({ body: z.string().trim().min(1).max(4_000) })
  .strict();
export const CreateBrandProfileRequestSchema = z
  .object({
    accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    confidentialityLabel: z.string().trim().max(120).optional().nullable(),
    contactEmail: z.string().email().max(320).optional().nullable(),
    disclaimer: z.string().trim().max(2_000).optional().nullable(),
    displayName: z.string().trim().min(1).max(160),
    footerText: z.string().trim().max(1_000).optional().nullable(),
    legalName: z.string().trim().max(200).optional().nullable(),
    secondaryColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable(),
    showPlatformAttribution: z.boolean().default(true),
    websiteUrl: SafeUrl.optional().nullable(),
  })
  .strict();
export const UpdateBrandProfileRequestSchema = CreateBrandProfileRequestSchema.partial().strict();

export const ReportSnapshotSummarySchema = z.object({
  contentHash: z.string().length(64),
  createdAt: z.string().datetime(),
  id: Uuid,
  projectId: Uuid,
  reportLineageId: Uuid,
  status: ReportSnapshotStatusSchema,
  title: z.string(),
  versionNumber: z.number().int().positive(),
});
export const ShareLinkSummarySchema = z.object({
  accessMode: ShareAccessModeSchema,
  createdAt: z.string().datetime(),
  currentViewCount: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  id: Uuid,
  revokedAt: z.string().datetime().nullable(),
  tokenPrefix: z.string(),
});
export const PublicSharedReportSchema = z.object({
  content: ReportSnapshotContentSchema,
  publishedAt: z.string().datetime(),
  share: z.object({
    allowComments: z.boolean(),
    allowDownload: z.boolean(),
    showSources: z.boolean(),
  }),
  title: z.string(),
  versionNumber: z.number().int().positive(),
});

export type ReportSnapshotStatus = z.infer<typeof ReportSnapshotStatusSchema>;
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportJobStatus = z.infer<typeof ExportJobStatusSchema>;
export type ShareAccessMode = z.infer<typeof ShareAccessModeSchema>;
export type CommentTargetType = z.infer<typeof CommentTargetTypeSchema>;
