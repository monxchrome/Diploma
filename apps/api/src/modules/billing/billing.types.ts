import { z } from "zod";

import type { PlanCode, SubscriptionStatus } from "../../generated/prisma/client";

export const ENTITLEMENT_KEYS = [
  "maximumOwnedProjects",
  "maximumMembersPerProject",
  "maximumKnowledgeBasesPerProject",
  "maximumDocumentsPerKnowledgeBase",
  "maximumTotalDocuments",
  "maximumStorageBytes",
  "maximumUploadBytesPerFile",
  "monthlyAnalysisRuns",
  "monthlySingleAgentRuns",
  "monthlyMultiAgentRuns",
  "monthlyExternalResearchQueries",
  "monthlyFetchedExternalPages",
  "monthlyExternalBytes",
  "monthlyExperimentRuns",
  "monthlyBenchmarkRuns",
  "maximumExperimentVariants",
  "maximumExperimentCases",
  "maximumExperimentRepetitions",
  "maximumConcurrentAnalysisRuns",
  "maximumConcurrentResearchRuns",
  "maximumConcurrentExperimentRuns",
  "externalResearchAvailable",
  "experimentsAvailable",
  "experimentJsonExportAvailable",
  "experimentCsvExportAvailable",
  "maximumSavedAnalysisTemplates",
  "maximumRetentionDays",
  "priorityQueue",
  "supportLevel",
  "reportPdfExportAvailable",
  "reportDocxExportAvailable",
  "reportMarkdownExportAvailable",
  "publicSharingAvailable",
  "authenticatedSharingAvailable",
  "collaborationCommentsAvailable",
  "customBrandingAvailable",
  "maximumActiveShareLinks",
  "maximumExportArtifactsPerPeriod",
  "maximumBrandProfiles",
  "shareLinkMaximumExpiryDays",
  "shareLinkNoExpiryAvailable",
  "externalCommentingAvailable",
  "versionComparisonAvailable",
  "benchmarkExecutionAvailable",
  "externalProviderBenchmarkAvailable",
  "localModelBenchmarkAvailable",
  "heterogeneousBenchmarkAvailable",
  "humanEvaluationAvailable",
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

const LimitSchema = z.number().int().nonnegative();

export const EntitlementsSchema = z.object({
  maximumOwnedProjects: LimitSchema,
  maximumMembersPerProject: LimitSchema,
  maximumKnowledgeBasesPerProject: LimitSchema,
  maximumDocumentsPerKnowledgeBase: LimitSchema,
  maximumTotalDocuments: LimitSchema,
  maximumStorageBytes: LimitSchema,
  maximumUploadBytesPerFile: LimitSchema,
  monthlyAnalysisRuns: LimitSchema,
  monthlySingleAgentRuns: LimitSchema,
  monthlyMultiAgentRuns: LimitSchema,
  monthlyExternalResearchQueries: LimitSchema,
  monthlyFetchedExternalPages: LimitSchema,
  monthlyExternalBytes: LimitSchema,
  monthlyExperimentRuns: LimitSchema,
  monthlyBenchmarkRuns: LimitSchema,
  maximumExperimentVariants: LimitSchema,
  maximumExperimentCases: LimitSchema,
  maximumExperimentRepetitions: LimitSchema,
  maximumConcurrentAnalysisRuns: LimitSchema,
  maximumConcurrentResearchRuns: LimitSchema,
  maximumConcurrentExperimentRuns: LimitSchema,
  externalResearchAvailable: z.boolean(),
  experimentsAvailable: z.boolean(),
  experimentJsonExportAvailable: z.boolean(),
  experimentCsvExportAvailable: z.boolean(),
  maximumSavedAnalysisTemplates: LimitSchema,
  maximumRetentionDays: LimitSchema.nullable(),
  priorityQueue: z.boolean(),
  supportLevel: z.enum(["community", "standard", "priority"]),
  reportPdfExportAvailable: z.boolean().default(false),
  reportDocxExportAvailable: z.boolean().default(false),
  reportMarkdownExportAvailable: z.boolean().default(false),
  publicSharingAvailable: z.boolean().default(false),
  authenticatedSharingAvailable: z.boolean().default(false),
  collaborationCommentsAvailable: z.boolean().default(false),
  customBrandingAvailable: z.boolean().default(false),
  maximumActiveShareLinks: LimitSchema.default(0),
  maximumExportArtifactsPerPeriod: LimitSchema.default(0),
  maximumBrandProfiles: LimitSchema.default(0),
  shareLinkMaximumExpiryDays: LimitSchema.default(0),
  shareLinkNoExpiryAvailable: z.boolean().default(false),
  externalCommentingAvailable: z.boolean().default(false),
  versionComparisonAvailable: z.boolean().default(false),
  benchmarkExecutionAvailable: z.boolean().default(false),
  externalProviderBenchmarkAvailable: z.boolean().default(false),
  localModelBenchmarkAvailable: z.boolean().default(false),
  heterogeneousBenchmarkAvailable: z.boolean().default(false),
  humanEvaluationAvailable: z.boolean().default(false),
});

export type Entitlements = z.infer<typeof EntitlementsSchema>;

export type PlanCatalogEntry = {
  billingInterval: "MONTH";
  code: PlanCode;
  description: string;
  displayName: string;
  displayOrder: number;
  displayPrice: string;
  entitlements: Entitlements;
  features: string[];
  providerPriceKey: "STRIPE_PRO_MONTHLY_PRICE_ID" | "STRIPE_TEAM_MONTHLY_PRICE_ID" | null;
};

export const PLAN_CATALOG: Record<PlanCode, PlanCatalogEntry> = {
  FREE: {
    billingInterval: "MONTH",
    code: "FREE",
    description: "A bounded plan for secure evaluation and individual work.",
    displayName: "Free",
    displayOrder: 0,
    displayPrice: "$0 / month",
    entitlements: {
      maximumOwnedProjects: 2,
      maximumMembersPerProject: 2,
      maximumKnowledgeBasesPerProject: 2,
      maximumDocumentsPerKnowledgeBase: 10,
      maximumTotalDocuments: 20,
      maximumStorageBytes: 250_000_000,
      maximumUploadBytesPerFile: 10_000_000,
      monthlyAnalysisRuns: 10,
      monthlySingleAgentRuns: 10,
      monthlyMultiAgentRuns: 3,
      monthlyExternalResearchQueries: 0,
      monthlyFetchedExternalPages: 0,
      monthlyExternalBytes: 0,
      monthlyExperimentRuns: 0,
      monthlyBenchmarkRuns: 0,
      maximumExperimentVariants: 0,
      maximumExperimentCases: 0,
      maximumExperimentRepetitions: 0,
      maximumConcurrentAnalysisRuns: 1,
      maximumConcurrentResearchRuns: 0,
      maximumConcurrentExperimentRuns: 0,
      externalResearchAvailable: false,
      experimentsAvailable: false,
      experimentJsonExportAvailable: false,
      experimentCsvExportAvailable: false,
      maximumSavedAnalysisTemplates: 0,
      maximumRetentionDays: 30,
      priorityQueue: false,
      supportLevel: "community",
      reportPdfExportAvailable: true,
      reportDocxExportAvailable: false,
      reportMarkdownExportAvailable: true,
      publicSharingAvailable: false,
      authenticatedSharingAvailable: false,
      collaborationCommentsAvailable: false,
      customBrandingAvailable: false,
      maximumActiveShareLinks: 0,
      maximumExportArtifactsPerPeriod: 10,
      maximumBrandProfiles: 0,
      shareLinkMaximumExpiryDays: 0,
      shareLinkNoExpiryAvailable: false,
      externalCommentingAvailable: false,
      versionComparisonAvailable: false,
      benchmarkExecutionAvailable: false,
      externalProviderBenchmarkAvailable: false,
      localModelBenchmarkAvailable: false,
      heterogeneousBenchmarkAvailable: false,
      humanEvaluationAvailable: false,
    },
    features: ["Grounded internal analysis", "Private knowledge bases"],
    providerPriceKey: null,
  },
  PRO: {
    billingInterval: "MONTH",
    code: "PRO",
    description: "Expanded analysis, controlled research, and experiments for individuals.",
    displayName: "Pro",
    displayOrder: 1,
    displayPrice: "Configured at checkout",
    entitlements: {
      maximumOwnedProjects: 20,
      maximumMembersPerProject: 10,
      maximumKnowledgeBasesPerProject: 20,
      maximumDocumentsPerKnowledgeBase: 500,
      maximumTotalDocuments: 2_000,
      maximumStorageBytes: 25_000_000_000,
      maximumUploadBytesPerFile: 100_000_000,
      monthlyAnalysisRuns: 250,
      monthlySingleAgentRuns: 250,
      monthlyMultiAgentRuns: 100,
      monthlyExternalResearchQueries: 500,
      monthlyFetchedExternalPages: 1_000,
      monthlyExternalBytes: 2_000_000_000,
      monthlyExperimentRuns: 50,
      monthlyBenchmarkRuns: 25,
      maximumExperimentVariants: 4,
      maximumExperimentCases: 25,
      maximumExperimentRepetitions: 3,
      maximumConcurrentAnalysisRuns: 3,
      maximumConcurrentResearchRuns: 2,
      maximumConcurrentExperimentRuns: 2,
      externalResearchAvailable: true,
      experimentsAvailable: true,
      experimentJsonExportAvailable: true,
      experimentCsvExportAvailable: true,
      maximumSavedAnalysisTemplates: 25,
      maximumRetentionDays: null,
      priorityQueue: false,
      supportLevel: "standard",
      reportPdfExportAvailable: true,
      reportDocxExportAvailable: true,
      reportMarkdownExportAvailable: true,
      publicSharingAvailable: true,
      authenticatedSharingAvailable: true,
      collaborationCommentsAvailable: true,
      customBrandingAvailable: true,
      maximumActiveShareLinks: 20,
      maximumExportArtifactsPerPeriod: 250,
      maximumBrandProfiles: 5,
      shareLinkMaximumExpiryDays: 30,
      shareLinkNoExpiryAvailable: false,
      externalCommentingAvailable: true,
      versionComparisonAvailable: true,
      benchmarkExecutionAvailable: true,
      externalProviderBenchmarkAvailable: true,
      localModelBenchmarkAvailable: true,
      heterogeneousBenchmarkAvailable: true,
      humanEvaluationAvailable: true,
    },
    features: ["Multi-agent analysis", "Controlled external research", "Experiments"],
    providerPriceKey: "STRIPE_PRO_MONTHLY_PRICE_ID",
  },
  TEAM: {
    billingInterval: "MONTH",
    code: "TEAM",
    description: "Higher shared limits and priority execution for collaborating teams.",
    displayName: "Team",
    displayOrder: 2,
    displayPrice: "Configured at checkout",
    entitlements: {
      maximumOwnedProjects: 100,
      maximumMembersPerProject: 50,
      maximumKnowledgeBasesPerProject: 100,
      maximumDocumentsPerKnowledgeBase: 5_000,
      maximumTotalDocuments: 20_000,
      maximumStorageBytes: 250_000_000_000,
      maximumUploadBytesPerFile: 250_000_000,
      monthlyAnalysisRuns: 2_000,
      monthlySingleAgentRuns: 2_000,
      monthlyMultiAgentRuns: 1_000,
      monthlyExternalResearchQueries: 5_000,
      monthlyFetchedExternalPages: 10_000,
      monthlyExternalBytes: 20_000_000_000,
      monthlyExperimentRuns: 500,
      monthlyBenchmarkRuns: 250,
      maximumExperimentVariants: 8,
      maximumExperimentCases: 50,
      maximumExperimentRepetitions: 5,
      maximumConcurrentAnalysisRuns: 10,
      maximumConcurrentResearchRuns: 5,
      maximumConcurrentExperimentRuns: 5,
      externalResearchAvailable: true,
      experimentsAvailable: true,
      experimentJsonExportAvailable: true,
      experimentCsvExportAvailable: true,
      maximumSavedAnalysisTemplates: 100,
      maximumRetentionDays: null,
      priorityQueue: true,
      supportLevel: "priority",
      reportPdfExportAvailable: true,
      reportDocxExportAvailable: true,
      reportMarkdownExportAvailable: true,
      publicSharingAvailable: true,
      authenticatedSharingAvailable: true,
      collaborationCommentsAvailable: true,
      customBrandingAvailable: true,
      maximumActiveShareLinks: 250,
      maximumExportArtifactsPerPeriod: 2_000,
      maximumBrandProfiles: 25,
      shareLinkMaximumExpiryDays: 365,
      shareLinkNoExpiryAvailable: true,
      externalCommentingAvailable: true,
      versionComparisonAvailable: true,
      benchmarkExecutionAvailable: true,
      externalProviderBenchmarkAvailable: true,
      localModelBenchmarkAvailable: true,
      heterogeneousBenchmarkAvailable: true,
      humanEvaluationAvailable: true,
    },
    features: ["Priority queues", "Expanded collaboration limits", "Advanced evaluation capacity"],
    providerPriceKey: "STRIPE_TEAM_MONTHLY_PRICE_ID",
  },
};

export type BillingCheckoutRequest = {
  cancelUrl: string;
  email: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  planCode: Exclude<PlanCode, "FREE">;
  planVersion: string;
  providerCustomerId?: string;
  successUrl: string;
  trustedPriceId: string;
  userId: string;
};

export type BillingCheckoutResult = {
  checkoutUrl: string;
  expiresAt: Date | null;
  provider: "fake" | "stripe";
  sessionId: string;
};

export type BillingPortalRequest = { providerCustomerId: string; returnUrl: string };

export type BillingPortalResult = { expiresAt: Date | null; portalUrl: string };

export type ProviderSubscription = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  customerId: string | null;
  metadata: Record<string, string>;
  planCode: Exclude<PlanCode, "FREE">;
  planVersion: string | null;
  priceId: string | null;
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
};

export type NormalizedBillingEvent = {
  cancelAtPeriodEnd: boolean | null;
  checkoutSessionId: string | null;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  customerId: string | null;
  eventType: string;
  metadata: Record<string, string>;
  payloadHash: string;
  priceId: string | null;
  provider: "fake" | "stripe";
  providerCreatedAt: Date | null;
  providerEventId: string;
  status: SubscriptionStatus | null;
  subscription: ProviderSubscription | null;
  subscriptionId: string | null;
  trialEndsAt: Date | null;
};

export interface BillingProvider {
  readonly providerName: "fake" | "stripe";
  readonly providerVersion: string;
  cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<ProviderSubscription>;
  createCheckoutSession(input: BillingCheckoutRequest): Promise<BillingCheckoutResult>;
  createCustomerPortalSession(input: BillingPortalRequest): Promise<BillingPortalResult>;
  createOrGetCustomer(input: {
    email: string;
    idempotencyKey: string;
    userId: string;
  }): Promise<string>;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null>;
  healthCheck(): Promise<{ ready: boolean }>;
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): NormalizedBillingEvent;
  resumeSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
}
