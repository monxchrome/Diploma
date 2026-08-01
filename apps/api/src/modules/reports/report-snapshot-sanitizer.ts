import { createHash } from "node:crypto";

import { ReportSnapshotContentSchema, type ReportSnapshotContent } from "@dip/contracts";
import type { SnapshotCitationSchema } from "@dip/contracts";
import type { z } from "zod";

type Citation = z.infer<typeof SnapshotCitationSchema>;

export class ReportSnapshotSanitizer {
  sanitize(input: {
    analysisMode: "SINGLE_AGENT" | "MULTI_AGENT";
    report: Record<string, unknown>;
  }): { content: ReportSnapshotContent; warnings: string[] } {
    const warnings: string[] = [];
    const text = (value: unknown, fallback = ""): string =>
      this.cleanText(typeof value === "string" ? value : fallback, warnings);
    const strings = (value: unknown, maximum: number): string[] =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .map((item) => this.cleanText(item, warnings))
            .filter(Boolean)
            .slice(0, maximum)
        : [];
    const sections = [
      {
        anchor: "section:recommendation",
        title: "Recommendation",
        content: text(input.report.recommendation ?? input.report.recommendedOption),
      },
      {
        anchor: "section:executive-summary",
        title: "Executive summary",
        content: text(input.report.executiveSummary),
      },
      {
        anchor: "section:rationale",
        title: "Rationale",
        content: text(input.report.recommendationRationale),
      },
      ...this.dynamicSections(input.report.sections, warnings),
    ].filter((section) => section.content.length > 0);
    const citations = this.citations(input.report.citations, warnings);
    const content = ReportSnapshotContentSchema.parse({
      analysisMode: input.analysisMode,
      assumptions: strings(input.report.assumptions, 30),
      citations,
      confidence: confidence(input.report.confidence),
      decisionReadiness: confidence(input.report.decisionReadiness),
      evidenceSupport:
        input.report.insufficientEvidence === true
          ? "INSUFFICIENT"
          : input.report.decisionReady === false
            ? "LIMITED"
            : "SUFFICIENT",
      limitations: strings(input.report.limitations, 30),
      missingInformation: strings(input.report.missingInformation, 30),
      nextSteps: strings(input.report.implementationRoadmap, 30),
      recommendation: text(
        input.report.recommendation ?? input.report.recommendedOption,
        "No recommendation was returned.",
      ),
      recommendationType: text(input.report.recommendedOption) || null,
      risks: this.risks(input.report.riskRegister, warnings),
      sections,
      summary: text(input.report.executiveSummary),
      warnings: strings(input.report.limitations, 30),
    });
    return { content, warnings: [...new Set(warnings)].slice(0, 30) };
  }

  contentHash(content: ReportSnapshotContent): string {
    return createHash("sha256").update(canonicalJson(content)).digest("hex");
  }

  private dynamicSections(value: unknown, warnings: string[]) {
    if (!Array.isArray(value)) return [];
    const used = new Set([
      "section:recommendation",
      "section:executive-summary",
      "section:rationale",
    ]);
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .slice(0, 20)
      .flatMap((section) => {
        const title = this.cleanText(
          typeof section.title === "string" ? section.title : "Details",
          warnings,
        ).slice(0, 200);
        const content = this.cleanText(
          typeof section.content === "string" ? section.content : "",
          warnings,
        );
        if (!content) return [];
        let anchor = `section:${slug(title)}`;
        let suffix = 2;
        while (used.has(anchor)) anchor = `section:${slug(title)}-${suffix++}`;
        used.add(anchor);
        return [{ anchor, content, title: title || "Details" }];
      });
  }

  private citations(value: unknown, warnings: string[]): Citation[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const citations: Citation[] = [];
    for (const rawCitation of value) {
      if (!rawCitation || typeof rawCitation !== "object") continue;
      const record = rawCitation as Record<string, unknown>;
      const evidenceId = typeof record.evidenceId === "string" ? record.evidenceId.trim() : "";
      const excerpt = this.cleanText(
        typeof record.quote === "string" ? record.quote : "",
        warnings,
      );
      if (!/^[EW]\d+$/.test(evidenceId) || !excerpt || seen.has(evidenceId)) {
        warnings.push("Invalid or duplicate citation was removed.");
        continue;
      }
      seen.add(evidenceId);
      citations.push({
        evidenceId,
        excerpt,
        sourceType: evidenceId.startsWith("W") ? "external" : "internal",
        title: `${evidenceId} evidence`,
      });
    }
    return citations.slice(0, 200);
  }

  private risks(value: unknown, warnings: string[]): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((risk) => this.cleanText(typeof risk.risk === "string" ? risk.risk : "", warnings))
      .filter(Boolean)
      .slice(0, 30);
  }

  private cleanText(value: string, warnings: string[]): string {
    const original = value;
    let cleaned = value
      .replace(
        /<(?:script|iframe|object|embed|style)\b[^>]*>[\s\S]*?<\/(?:script|iframe|object|embed|style)>/gi,
        "",
      )
      .replace(/<\/?(?:script|iframe|object|embed|style)[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\b(?:javascript|data|vbscript):[^\s)]+/gi, "")
      .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, "")
      .replaceAll(String.fromCharCode(0), "")
      .replace(/\s+$/gm, "")
      .trim()
      .slice(0, 12_000);
    if (/ignore (?:all |previous )?instructions|system prompt|chain of thought/i.test(cleaned)) {
      warnings.push("Unsafe prompt-injection content was removed.");
      cleaned = "";
    }
    if (cleaned !== original.trim())
      warnings.push("Unsafe markup or unsupported metadata was removed.");
    return cleaned;
  }
}

function confidence(value: unknown): "LOW" | "MEDIUM" | "HIGH" {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : "LOW";
}

function slug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (normalized || "details").slice(0, 90);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
