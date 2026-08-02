import { describe, expect, it } from "vitest";

import { BenchmarkStatisticsService } from "./benchmark-statistics.service";

describe("BenchmarkStatisticsService", () => {
  it("keeps bootstrap intervals deterministic for a saved seed", () => {
    const service = new BenchmarkStatisticsService();
    const observations = [1, 2, 3, 4, 5];

    expect(service.describe(observations, 11042)).toEqual(service.describe(observations, 11042));
  });

  it("uses paired observations and surfaces a small-sample limitation", () => {
    const service = new BenchmarkStatisticsService();
    const left = [1, 2].map((value, index) => ({
      caseId: `case-${index}`,
      repetitionIndex: 1,
      value,
      variantId: "left",
    }));
    const right = [2, 4].map((value, index) => ({
      caseId: `case-${index}`,
      repetitionIndex: 1,
      value,
      variantId: "right",
    }));

    const result = service.comparePaired(left, right, 7);

    expect(result.sampleSize).toBe(2);
    expect(result.pValue).toBeNull();
    expect(result.warnings.join(" ")).toContain("Too few paired observations");
  });
});
