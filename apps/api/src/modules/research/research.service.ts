import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ResearchExecutionResponseSchema,
  ResearchPolicySchema,
  type ResearchExecutionResponse,
  type ResearchPolicy,
  type RetrievalEvidence,
} from "@dip/contracts";

import { EvidenceMode, Prisma, ResearchRunStatus } from "../../generated/prisma/client";
import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AiServiceClient } from "../../infrastructure/http/ai-service.client";

type AnalysisResearchInput = {
  analysis: {
    decisionQuestion: string;
    evidenceMode: EvidenceMode;
    excludedDomains: Prisma.JsonValue;
    maximumExternalSources: number | null;
    preferredDomains: Prisma.JsonValue;
    publishedAfter: Date | null;
    publishedBefore: Date | null;
    researchCountry: string | null;
    researchLanguages: Prisma.JsonValue;
    assumptions: Prisma.JsonValue;
    sourceTypes: Prisma.JsonValue;
  };
  analysisRunId: string;
  internalEvidence: RetrievalEvidence[];
  projectId: string;
  requestId: string;
};

@Injectable()
export class ResearchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  policy(): ResearchPolicy {
    return ResearchPolicySchema.parse({
      enabled: this.config.getOrThrow<boolean>("research.enabled"),
      policyVersion: this.config.getOrThrow<string>("research.policyVersion"),
      provider: this.config.getOrThrow<string>("research.provider"),
      maximumQueries: this.config.getOrThrow<number>("research.maximumQueries"),
      maximumResultsPerQuery: this.config.getOrThrow<number>("research.maximumResultsPerQuery"),
      maximumFetchedPages: this.config.getOrThrow<number>("research.maximumFetchedPages"),
      maximumPageBytes: this.config.getOrThrow<number>("research.maximumPageBytes"),
      maximumTotalBytes: this.config.getOrThrow<number>("research.maximumTotalBytes"),
      maximumContextTokens: this.config.getOrThrow<number>("research.maximumContextTokens"),
      totalTimeoutSeconds: this.config.getOrThrow<number>("research.totalTimeoutSeconds"),
      allowedSchemes: this.config.getOrThrow<string[]>("research.allowedSchemes"),
      allowedContentTypes: this.config.getOrThrow<string[]>("research.allowedContentTypes"),
      blockPrivateNetworks: this.config.getOrThrow<boolean>("research.blockPrivateNetworks"),
      domainAllowlist: this.config.getOrThrow<string[]>("research.domainAllowlist"),
      domainDenylist: this.config.getOrThrow<string[]>("research.domainDenylist"),
      failureMode: "LIMITATION",
    });
  }

  async executeForAnalysis(input: AnalysisResearchInput): Promise<RetrievalEvidence[]> {
    if (input.analysis.evidenceMode === EvidenceMode.INTERNAL_ONLY) return [];
    const policy = this.policy();
    const researchRun = await this.prisma.researchRun.upsert({
      where: { analysisRunId: input.analysisRunId },
      create: {
        analysisRunId: input.analysisRunId,
        projectId: input.projectId,
        evidenceMode: input.analysis.evidenceMode,
        provider: policy.provider,
        policyVersion: policy.policyVersion,
        requestId: input.requestId,
      },
      update: {},
    });
    if (
      researchRun.status === ResearchRunStatus.COMPLETED ||
      researchRun.status === ResearchRunStatus.COMPLETED_WITH_LIMITATIONS
    ) {
      return this.selectedEvidence(researchRun.id);
    }
    if (!policy.enabled) {
      await this.prisma.researchRun.update({
        where: { id: researchRun.id },
        data: {
          status: ResearchRunStatus.COMPLETED_WITH_LIMITATIONS,
          failureCode: "EXTERNAL_RESEARCH_DISABLED",
          failureMessage: "External research is disabled by the server-controlled policy",
          completedAt: new Date(),
        },
      });
      return [];
    }
    await this.prisma.researchRun.update({
      where: { id: researchRun.id },
      data: { status: ResearchRunStatus.PLANNING, startedAt: new Date() },
    });
    try {
      const response = ResearchExecutionResponseSchema.parse(
        await this.ai.executeResearch(
          {
            researchRunId: researchRun.id,
            analysisRunId: input.analysisRunId,
            projectId: input.projectId,
            requestId: input.requestId,
            evidenceMode: input.analysis.evidenceMode,
            decisionQuestion: input.analysis.decisionQuestion,
            evidenceGaps: this.evidenceGaps(input.analysis.evidenceMode, input.internalEvidence),
            researchCountry: input.analysis.researchCountry,
            researchLanguages: stringList(input.analysis.researchLanguages),
            publishedAfter: input.analysis.publishedAfter?.toISOString() ?? null,
            publishedBefore: input.analysis.publishedBefore?.toISOString() ?? null,
            preferredDomains: stringList(input.analysis.preferredDomains),
            excludedDomains: stringList(input.analysis.excludedDomains),
            sourceTypes: stringList(input.analysis.sourceTypes),
            maximumExternalSources: input.analysis.maximumExternalSources,
            policy,
          },
          input.requestId,
        ),
      );
      await this.persist(response, researchRun.id, input.internalEvidence);
      return this.selectedEvidence(researchRun.id);
    } catch (error) {
      await this.prisma.researchRun.update({
        where: { id: researchRun.id },
        data: {
          status: ResearchRunStatus.FAILED,
          failureCode: "RESEARCH_EXECUTION_FAILED",
          failureMessage: "Controlled external research failed safely",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async cancelForAnalysisRun(analysisRunId: string, requestId: string): Promise<void> {
    const run = await this.prisma.researchRun.findUnique({ where: { analysisRunId } });
    if (!run) return;
    await this.prisma.researchRun.update({
      where: { id: run.id },
      data: {
        cancellationRequested: true,
        status: ResearchRunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
    await this.ai.cancelResearch(run.id, requestId);
  }

  async getRun(projectId: string, analysisId: string, runId: string) {
    const result = await this.prisma.researchRun.findFirst({
      where: { projectId, analysisRunId: runId, analysisRun: { analysisId } },
      include: {
        externalEvidence: { include: { researchSnapshot: { include: { researchSource: true } } } },
      },
    });
    if (!result) throw this.notFound();
    return result;
  }

  async getQueries(projectId: string, analysisId: string, runId: string) {
    await this.getRun(projectId, analysisId, runId);
    return this.prisma.researchQuery.findMany({
      where: { researchRun: { projectId, analysisRunId: runId, analysisRun: { analysisId } } },
      include: { results: { orderBy: { providerRank: "asc" } } },
      orderBy: { queryIndex: "asc" },
    });
  }

  async getSources(projectId: string, analysisId: string, runId: string) {
    await this.getRun(projectId, analysisId, runId);
    return this.prisma.externalEvidence.findMany({
      where: { researchRun: { projectId, analysisRunId: runId, analysisRun: { analysisId } } },
      include: { researchSnapshot: { include: { researchSource: true } } },
      orderBy: { evidenceId: "asc" },
    });
  }

  async getConflicts(projectId: string, analysisId: string, runId: string) {
    const run = await this.getRun(projectId, analysisId, runId);
    return this.prisma.evidenceConflict.findMany({ where: { analysisRunId: run.analysisRunId } });
  }

  async getSource(projectId: string, sourceId: string) {
    const source = await this.prisma.researchSource.findFirst({
      where: {
        id: sourceId,
        snapshots: { some: { externalEvidence: { some: { researchRun: { projectId } } } } },
      },
      include: { snapshots: { orderBy: { retrievedAt: "desc" }, take: 20 } },
    });
    if (!source) throw this.notFound();
    return source;
  }

  async getSnapshot(projectId: string, sourceId: string, snapshotId: string) {
    const snapshot = await this.prisma.researchSnapshot.findFirst({
      where: {
        id: snapshotId,
        researchSourceId: sourceId,
        externalEvidence: { some: { researchRun: { projectId } } },
      },
    });
    if (!snapshot) throw this.notFound();
    return snapshot;
  }

  private async persist(
    response: ResearchExecutionResponse,
    researchRunId: string,
    internalEvidence: RetrievalEvidence[],
  ): Promise<void> {
    const selectedUrls = new Set(response.externalEvidence.map((item) => normalizeUrl(item.url)));
    const sourceIds = new Map<string, string>();
    for (const source of response.sources) {
      const saved = await this.prisma.researchSource.upsert({
        where: { normalizedUrl: source.normalizedUrl },
        create: {
          id: source.id,
          normalizedUrl: source.normalizedUrl,
          domain: source.domain,
          canonicalUrl: source.canonicalUrl,
          title: source.title,
          publisher: source.publisher,
          author: source.author,
          sourceType: source.sourceType,
          language: source.language,
        },
        update: {
          canonicalUrl: source.canonicalUrl,
          title: source.title,
          publisher: source.publisher,
          author: source.author,
          sourceType: source.sourceType,
          language: source.language,
          lastSeenAt: new Date(),
        },
      });
      sourceIds.set(source.id, saved.id);
    }
    const snapshotIds = new Map<string, string>();
    for (const snapshot of response.snapshots) {
      const researchSourceId = sourceIds.get(snapshot.researchSourceId);
      if (!researchSourceId) continue;
      const saved = await this.prisma.researchSnapshot.upsert({
        where: {
          researchSourceId_contentHash: { researchSourceId, contentHash: snapshot.contentHash },
        },
        create: {
          id: snapshot.id,
          researchSourceId,
          contentHash: snapshot.contentHash,
          fetchStatus: snapshot.fetchStatus,
          httpStatus: snapshot.httpStatus,
          contentType: snapshot.contentType,
          publishedAt: dateOrNull(snapshot.publishedAt),
          retrievedAt: new Date(snapshot.retrievedAt),
          extractedTitle: snapshot.extractedTitle,
          extractedText: snapshot.extractedText,
          extractedMetadata: jsonValue(snapshot.extractedMetadata),
          credibilityAssessment: jsonValue(snapshot.credibilityAssessment),
          extractionVersion: snapshot.extractionVersion,
          fetchDurationMs: snapshot.fetchDurationMs,
          extractedCharacterCount: snapshot.extractedCharacterCount,
          warnings: jsonValue(snapshot.warnings),
          errorCode: snapshot.errorCode,
          errorMessage: snapshot.errorMessage,
        },
        update: {},
      });
      snapshotIds.set(snapshot.id, saved.id);
    }
    for (const query of response.queries) {
      const saved = await this.prisma.researchQuery.upsert({
        where: { researchRunId_queryIndex: { researchRunId, queryIndex: query.queryIndex } },
        create: {
          id: query.id,
          researchRunId,
          queryIndex: query.queryIndex,
          query: query.query,
          purpose: query.purpose,
          country: query.country,
          languages: jsonValue(query.languages),
          publishedAfter: dateOrNull(query.publishedAfter),
          publishedBefore: dateOrNull(query.publishedBefore),
          status: query.status,
          resultCount: query.resultCount,
          durationMs: query.durationMs,
          errorCode: query.errorCode,
          results: {
            create: query.results.map((result) => ({
              providerRank: result.providerRank,
              title: result.title,
              url: result.url,
              normalizedUrl: normalizeUrl(result.url),
              domain: new URL(result.url).hostname,
              snippet: result.snippet,
              publishedAt: dateOrNull(result.publishedAt),
              sourceType: result.sourceType,
              selectedForFetch: selectedUrls.has(normalizeUrl(result.url)),
              rejectionReason: selectedUrls.has(normalizeUrl(result.url))
                ? null
                : "NOT_SELECTED_BY_BOUNDED_POLICY",
            })),
          },
        },
        update: {
          status: query.status,
          resultCount: query.resultCount,
          durationMs: query.durationMs,
          errorCode: query.errorCode,
        },
      });
      await this.prisma.researchSearchResult.deleteMany({ where: { researchQueryId: saved.id } });
      if (query.results.length)
        await this.prisma.researchSearchResult.createMany({
          data: query.results.map((result) => ({
            researchQueryId: saved.id,
            providerRank: result.providerRank,
            title: result.title,
            url: result.url,
            normalizedUrl: normalizeUrl(result.url),
            domain: new URL(result.url).hostname,
            snippet: result.snippet,
            publishedAt: dateOrNull(result.publishedAt),
            sourceType: result.sourceType,
            selectedForFetch: selectedUrls.has(normalizeUrl(result.url)),
            rejectionReason: selectedUrls.has(normalizeUrl(result.url))
              ? null
              : "NOT_SELECTED_BY_BOUNDED_POLICY",
          })),
        });
    }
    await this.prisma.externalEvidence.deleteMany({ where: { researchRunId } });
    for (const item of response.externalEvidence) {
      const researchSnapshotId = snapshotIds.get(item.researchSnapshotId);
      if (!researchSnapshotId) continue;
      await this.prisma.externalEvidence.create({
        data: {
          researchRunId,
          researchSnapshotId,
          evidenceId: item.evidenceId,
          excerpt: item.selectedExcerpt,
          relevanceScore: item.relevanceScore,
          metadata: jsonValue({
            title: item.title,
            publisher: item.publisher,
            url: item.url,
            sourceType: item.sourceType,
            publishedAt: item.publishedAt,
            retrievedAt: item.retrievedAt,
            queryIds: item.queryIds,
            freshnessStatus: item.freshnessStatus,
            warnings: item.warnings,
          }),
        },
      });
    }
    const status =
      response.status === "COMPLETED"
        ? ResearchRunStatus.COMPLETED
        : response.status === "CANCELLED"
          ? ResearchRunStatus.CANCELLED
          : response.status === "FAILED"
            ? ResearchRunStatus.FAILED
            : ResearchRunStatus.COMPLETED_WITH_LIMITATIONS;
    await this.prisma.researchRun.update({
      where: { id: researchRunId },
      data: {
        status,
        plan: jsonValue(response.plan),
        queryCount: response.queries.length,
        resultCount: response.queries.reduce((total, query) => total + query.resultCount, 0),
        fetchedPageCount: response.snapshots.filter(
          (snapshot) => snapshot.fetchStatus === "FETCHED",
        ).length,
        selectedSourceCount: response.externalEvidence.length,
        selectedForFetchCount: response.sources.length,
        extractedCount: response.snapshots.filter(
          (snapshot) => snapshot.extractedCharacterCount > 0,
        ).length,
        acceptedEvidenceCount: response.externalEvidence.length,
        securityRejectedCount: response.sources.filter(
          (source) => source.pipelineStatus === "SECURITY_REJECTED",
        ).length,
        policyRejectedCount: response.sources.filter(
          (source) =>
            source.rejectionReason && source.rejectionReason !== "PROMPT_INJECTION_DETECTED",
        ).length,
        totalFetchedBytes: response.totalFetchedBytes,
        totalExtractedCharacters: response.totalExtractedCharacters,
        totalDurationMs: response.totalDurationMs,
        searchDurationMs: response.searchDurationMs,
        fetchDurationMs: response.fetchDurationMs,
        extractionDurationMs: response.extractionDurationMs,
        failureCode: response.failureCode,
        failureMessage: response.failureMessage,
        completedAt: new Date(),
      },
    });
    const conflicts = response.externalEvidence.filter((item) =>
      item.extractedText.toLowerCase().includes("conflict"),
    );
    const currentRun = await this.prisma.researchRun.findUniqueOrThrow({
      where: { id: researchRunId },
      include: { analysisRun: { include: { analysis: true } } },
    });
    await this.prisma.evidenceConflict.deleteMany({
      where: { analysisRunId: currentRun.analysisRunId },
    });
    const assumptions = stringList(currentRun.analysisRun.analysis.assumptions)
      .join(" ")
      .toLowerCase();
    const demandAlreadyValidated =
      assumptions.includes("already validated") || assumptions.includes("demand is validated");
    if (internalEvidence.length && conflicts.length && demandAlreadyValidated) {
      await this.prisma.evidenceConflict.create({
        data: {
          analysisRunId: currentRun.analysisRunId,
          topic: "External evidence conflicts with an internal assumption",
          internalEvidenceIds: internalEvidence.slice(0, 3).map((item) => item.evidenceId),
          externalEvidenceIds: conflicts.map((item) => item.evidenceId),
          description:
            "The report must disclose this internal/external evidence conflict and its uncertainty.",
        },
      });
    }
  }

  private async selectedEvidence(researchRunId: string): Promise<RetrievalEvidence[]> {
    const evidence = await this.prisma.externalEvidence.findMany({
      where: { researchRunId, selected: true },
      include: { researchSnapshot: { include: { researchSource: true } } },
      orderBy: { evidenceId: "asc" },
    });
    return evidence.map((item) => ({
      evidenceId: item.evidenceId,
      chunkId: item.researchSnapshotId,
      documentId: item.researchSnapshot.researchSourceId,
      documentVersionId: item.researchSnapshotId,
      knowledgeBaseId: researchRunId,
      snippet: item.excerpt,
      score: item.relevanceScore ?? 0,
      pageStart: null,
      pageEnd: null,
      headingPath: [item.researchSnapshot.researchSource.title],
    }));
  }

  private evidenceGaps(mode: EvidenceMode, evidence: RetrievalEvidence[]): string[] {
    if (mode === EvidenceMode.EXTERNAL_ONLY)
      return ["Public context required for the decision question"];
    if (evidence.length < 2)
      return ["Internal evidence is insufficient; obtain public context for the decision question"];
    return ["Validate current public context for the decision question"];
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCodes.NotFound,
      message: "Research resource not found",
    });
  }
}

function stringList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
