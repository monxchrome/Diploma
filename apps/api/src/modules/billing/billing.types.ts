import type { PlanCode, SubscriptionStatus } from "../../generated/prisma/client";

export const ENTITLEMENT_KEYS = [
  "maximumProjects",
  "maximumMembersPerProject",
  "maximumKnowledgeBasesPerProject",
  "maximumDocumentsPerKnowledgeBase",
  "maximumStorageBytes",
  "maximumUploadBytesPerFile",
  "monthlyAnalysisRuns",
  "monthlyExternalResearchQueries",
  "monthlyFetchedExternalPages",
  "monthlyExperimentRuns",
  "maximumExperimentVariants",
  "maximumExperimentRepetitions",
  "maximumConcurrentAnalysisRuns",
  "maximumConcurrentResearchRuns",
  "maximumConcurrentExperimentRuns",
  "jsonCsvExportAvailable",
  "externalResearchAvailable",
  "experimentAvailable",
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type Entitlements = Record<EntitlementKey, boolean | number>;

export type SubscriptionSnapshot = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  planCode: PlanCode;
  planVersion: string;
  status: SubscriptionStatus;
};

export type ProviderCheckout = { checkoutUrl: string; sessionId: string };
export type ProviderPortal = { portalUrl: string };

export type ProviderSubscription = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  customerId: string | null;
  metadata: Record<string, string>;
  planCode: Exclude<PlanCode, "FREE">;
  priceId: string | null;
  providerSubscriptionId: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
};

export type ProviderWebhookEvent = {
  eventId: string;
  eventType: string;
  subscription: ProviderSubscription | null;
};

export interface BillingProvider {
  readonly providerName: "fake" | "stripe";
  readonly providerVersion: string;
  cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<ProviderSubscription>;
  createCheckoutSession(input: {
    customerId: string | null;
    idempotencyKey: string;
    metadata: Record<string, string>;
    planCode: Exclude<PlanCode, "FREE">;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderCheckout>;
  createCustomer(input: { idempotencyKey: string; userId: string }): Promise<string>;
  createCustomerPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<ProviderPortal>;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null>;
  healthCheck(): Promise<{ ready: boolean }>;
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): ProviderWebhookEvent;
  resumeSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
}

export const PLAN_ENTITLEMENTS: Record<PlanCode, Entitlements> = {
  FREE: {
    maximumProjects: 2,
    maximumMembersPerProject: 3,
    maximumKnowledgeBasesPerProject: 2,
    maximumDocumentsPerKnowledgeBase: 25,
    maximumStorageBytes: 500_000_000,
    maximumUploadBytesPerFile: 25_000_000,
    monthlyAnalysisRuns: 10,
    monthlyExternalResearchQueries: 0,
    monthlyFetchedExternalPages: 0,
    monthlyExperimentRuns: 0,
    maximumExperimentVariants: 1,
    maximumExperimentRepetitions: 1,
    maximumConcurrentAnalysisRuns: 1,
    maximumConcurrentResearchRuns: 0,
    maximumConcurrentExperimentRuns: 0,
    jsonCsvExportAvailable: true,
    externalResearchAvailable: false,
    experimentAvailable: false,
  },
  PRO: {
    maximumProjects: 20,
    maximumMembersPerProject: 10,
    maximumKnowledgeBasesPerProject: 20,
    maximumDocumentsPerKnowledgeBase: 500,
    maximumStorageBytes: 25_000_000_000,
    maximumUploadBytesPerFile: 100_000_000,
    monthlyAnalysisRuns: 250,
    monthlyExternalResearchQueries: 500,
    monthlyFetchedExternalPages: 1_000,
    monthlyExperimentRuns: 50,
    maximumExperimentVariants: 4,
    maximumExperimentRepetitions: 3,
    maximumConcurrentAnalysisRuns: 3,
    maximumConcurrentResearchRuns: 2,
    maximumConcurrentExperimentRuns: 2,
    jsonCsvExportAvailable: true,
    externalResearchAvailable: true,
    experimentAvailable: true,
  },
  TEAM: {
    maximumProjects: 100,
    maximumMembersPerProject: 50,
    maximumKnowledgeBasesPerProject: 100,
    maximumDocumentsPerKnowledgeBase: 5_000,
    maximumStorageBytes: 250_000_000_000,
    maximumUploadBytesPerFile: 250_000_000,
    monthlyAnalysisRuns: 2_000,
    monthlyExternalResearchQueries: 5_000,
    monthlyFetchedExternalPages: 10_000,
    monthlyExperimentRuns: 500,
    maximumExperimentVariants: 8,
    maximumExperimentRepetitions: 5,
    maximumConcurrentAnalysisRuns: 10,
    maximumConcurrentResearchRuns: 5,
    maximumConcurrentExperimentRuns: 5,
    jsonCsvExportAvailable: true,
    externalResearchAvailable: true,
    experimentAvailable: true,
  },
};
