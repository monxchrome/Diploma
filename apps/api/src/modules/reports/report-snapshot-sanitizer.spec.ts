import { describe, expect, it } from "vitest";

import { ReportSnapshotSanitizer } from "./report-snapshot-sanitizer";

describe("ReportSnapshotSanitizer", () => {
  it("creates stable anchors and excludes unsafe content", () => {
    const sanitizer = new ReportSnapshotSanitizer();
    const result = sanitizer.sanitize({
      analysisMode: "MULTI_AGENT",
      report: {
        citations: [
          { evidenceId: "E1", quote: "Safe support" },
          { evidenceId: "E1", quote: "Duplicate support" },
          { evidenceId: "X1", quote: "Unsupported" },
        ],
        executiveSummary: "<script>alert('xss')</script>Safe summary",
        recommendation: "Choose the bounded option.",
        sections: [{ content: "Key details", title: "Key reasons" }],
      },
    });

    expect(result.content.sections).toContainEqual(
      expect.objectContaining({ anchor: "section:key-reasons" }),
    );
    expect(result.content.citations).toEqual([
      expect.objectContaining({ evidenceId: "E1", excerpt: "Safe support" }),
    ]);
    expect(result.content.summary).toBe("Safe summary");
    expect(sanitizer.contentHash(result.content)).toBe(sanitizer.contentHash(result.content));
  });
});
