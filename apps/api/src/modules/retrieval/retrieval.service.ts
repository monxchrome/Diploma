import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  AskResponseSchema,
  CitationSchema,
  RetrievalEvidenceSchema,
  SearchResponseSchema,
  type AskResponse,
  type SearchResponse,
} from "@dip/contracts";
import { z } from "zod";

import { ErrorCodes } from "../../common/errors/error-codes";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AiServiceClient } from "../../infrastructure/http/ai-service.client";
import type { RetrievalFiltersDto, RetrievalRequestDto } from "./dto/retrieval-request.dto";

@Injectable()
export class RetrievalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AiServiceClient) private readonly ai: AiServiceClient,
  ) {}

  async search(input: {
    body: RetrievalRequestDto;
    projectId: string;
    requestId: string;
    userId: string;
  }): Promise<SearchResponse> {
    await this.requireActiveProject(input.projectId);
    const result = await this.execute(input, false);
    return SearchResponseSchema.parse(result);
  }

  async ask(input: {
    body: RetrievalRequestDto;
    projectId: string;
    requestId: string;
    userId: string;
  }): Promise<AskResponse> {
    await this.requireActiveProject(input.projectId);
    const result = AskResponseSchema.parse(await this.execute(input, true));
    await this.prisma.ragResponse.create({
      data: {
        id: result.ragResponseId,
        answer: result.answer,
        insufficientEvidence: result.insufficientEvidence,
        retrievalRunId: result.retrievalRunId,
        citations: {
          create: result.citations.map((citation) => {
            const evidence = result.evidence.find(
              (item) => item.evidenceId === citation.evidenceId,
            );
            if (!evidence) throw new Error("Citation evidence was not validated");
            if (
              citation.documentId !== evidence.documentId ||
              !evidence.snippet.includes(citation.quote)
            ) {
              throw new Error("Citation source was not validated");
            }
            return {
              chunkId: evidence.chunkId,
              documentId: citation.documentId,
              evidenceId: citation.evidenceId,
              quote: citation.quote,
            };
          }),
        },
      },
    });
    return result;
  }

  async feedback(input: {
    comment?: string;
    projectId: string;
    ragResponseId: string;
    rating: number;
    userId: string;
  }) {
    const response = await this.prisma.ragResponse.findFirst({
      where: { id: input.ragResponseId, retrievalRun: { projectId: input.projectId } },
      select: { id: true },
    });
    if (!response)
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Answer not found" });
    return this.prisma.answerFeedback.upsert({
      where: { ragResponseId_userId: { ragResponseId: response.id, userId: input.userId } },
      create: { ...input, ragResponseId: response.id },
      update: { comment: input.comment, rating: input.rating },
      select: { comment: true, rating: true },
    });
  }

  private async execute(
    input: { body: RetrievalRequestDto; projectId: string; requestId: string; userId: string },
    generateAnswer: boolean,
  ): Promise<SearchResponse | AskResponse> {
    const body = input.body;
    const filters = normalizeFilters(body.filters);
    const mode = body.mode ?? "HYBRID";
    const topK = body.topK ?? 10;
    const result = await this.ai.retrieve({
      filters,
      generateAnswer,
      mode,
      projectId: input.projectId,
      query: body.query,
      requestId: input.requestId,
      topK,
    });
    const parsed = AiRetrievalResultSchema.safeParse(result);
    const raw = parsed.success ? parsed.data : null;
    if (!raw) throw new Error("AI retrieval response did not match the shared contract");
    const run = await this.prisma.retrievalRun.create({
      data: {
        filters,
        mode,
        normalizedQuery: raw.normalizedQuery,
        projectId: input.projectId,
        query: body.query,
        resultCount: raw.evidence.length,
        timingsMs: raw.timingsMs,
        userId: input.userId,
      },
      select: { id: true },
    });
    if (!generateAnswer) {
      return SearchResponseSchema.parse({
        evidence: raw.evidence,
        normalizedQuery: raw.normalizedQuery,
        retrievalRunId: run.id,
        timingsMs: raw.timingsMs,
      });
    }
    return AskResponseSchema.parse({
      answer: raw.answer ?? "Insufficient evidence in the selected knowledge bases.",
      citations: raw.citations,
      evidence: raw.evidence,
      insufficientEvidence: raw.insufficientEvidence,
      missingInformation: raw.missingInformation,
      normalizedQuery: raw.normalizedQuery,
      ragResponseId: crypto.randomUUID(),
      retrievalRunId: run.id,
      timingsMs: raw.timingsMs,
    });
  }

  private async requireActiveProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, archivedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException({ code: ErrorCodes.NotFound, message: "Project not found" });
    }
  }
}

const AiRetrievalResultSchema = z.object({
  answer: z.string().nullable().optional(),
  citations: z.array(CitationSchema).default([]),
  evidence: z.array(RetrievalEvidenceSchema),
  insufficientEvidence: z.boolean().default(false),
  missingInformation: z.array(z.string()).default([]),
  normalizedQuery: z.string(),
  timingsMs: z.record(z.string(), z.number()),
});

function normalizeFilters(filters: RetrievalFiltersDto | undefined) {
  return {
    ...(filters?.createdAfter ? { createdAfter: filters.createdAfter } : {}),
    ...(filters?.createdBefore ? { createdBefore: filters.createdBefore } : {}),
    ...(filters?.documentIds ? { documentIds: filters.documentIds } : {}),
    ...(filters?.knowledgeBaseIds ? { knowledgeBaseIds: filters.knowledgeBaseIds } : {}),
    ...(filters?.pageEnd ? { pageEnd: filters.pageEnd } : {}),
    ...(filters?.pageStart ? { pageStart: filters.pageStart } : {}),
  };
}
