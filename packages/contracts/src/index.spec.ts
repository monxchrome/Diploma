import { describe, expect, it } from "vitest";

import { CreateAnalysisRequestSchema } from "./index";

const baseAnalysis = {
  title: "Spain expansion decision",
  decisionQuestion: "Should the company expand to Spain?",
  objectives: ["Compare the available evidence"],
  constraints: [],
  assumptions: [],
};

describe("CreateAnalysisRequestSchema external research policy", () => {
  it("keeps internal-only analysis scoped to a knowledge base", () => {
    const result = CreateAnalysisRequestSchema.safeParse(baseAnalysis);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["knowledgeBaseIds"]);
    }
  });

  it("requires explicit user consent for external-only analysis", () => {
    const result = CreateAnalysisRequestSchema.safeParse({
      ...baseAnalysis,
      evidenceMode: "EXTERNAL_ONLY",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["externalResearchEnabled"]);
    }
  });

  it("allows explicitly enabled external-only analysis without a knowledge base", () => {
    const result = CreateAnalysisRequestSchema.safeParse({
      ...baseAnalysis,
      evidenceMode: "EXTERNAL_ONLY",
      externalResearchEnabled: true,
      researchCountry: "ES",
      researchLanguages: ["en", "es"],
      preferredDomains: ["ine.es"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid research date interval", () => {
    const result = CreateAnalysisRequestSchema.safeParse({
      ...baseAnalysis,
      evidenceMode: "EXTERNAL_ONLY",
      externalResearchEnabled: true,
      publishedAfter: "2026-06-01T00:00:00.000Z",
      publishedBefore: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["publishedAfter"]);
    }
  });
});
