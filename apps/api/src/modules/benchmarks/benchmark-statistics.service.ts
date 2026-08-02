import { Injectable } from "@nestjs/common";

export type MetricObservation = {
  caseId: string;
  repetitionIndex: number;
  value: number;
  variantId: string;
};

export type StatisticalResult = {
  adjustedPValue: number | null;
  assumptions: Record<string, boolean | number | string>;
  confidenceInterval: { high: number; low: number };
  descriptiveStatistics: Record<string, number>;
  effectSize: number | null;
  pValue: number | null;
  sampleSize: number;
  testName: string;
  warnings: string[];
};

@Injectable()
export class BenchmarkStatisticsService {
  describe(
    values: number[],
    seed: number,
  ): {
    confidenceInterval: { high: number; low: number };
    maximum: number | null;
    mean: number | null;
    median: number | null;
    minimum: number | null;
    sampleSize: number;
    standardDeviation: number | null;
  } {
    if (!values.length) {
      return {
        confidenceInterval: { high: 0, low: 0 },
        maximum: null,
        mean: null,
        median: null,
        minimum: null,
        sampleSize: 0,
        standardDeviation: null,
      };
    }
    const ordered = [...values].sort((left, right) => left - right);
    const mean = average(values);
    const deviation = standardDeviation(values, mean);
    return {
      confidenceInterval: bootstrapMeanInterval(values, seed),
      maximum: ordered.at(-1) ?? null,
      mean,
      median: median(ordered),
      minimum: ordered[0] ?? null,
      sampleSize: values.length,
      standardDeviation: deviation,
    };
  }

  comparePaired(
    left: MetricObservation[],
    right: MetricObservation[],
    seed: number,
  ): StatisticalResult {
    const rightValues = new Map(right.map((item) => [observationKey(item), item.value]));
    const differences = left.flatMap((item) => {
      const rightValue = rightValues.get(observationKey(item));
      return rightValue === undefined ? [] : [rightValue - item.value];
    });
    const description = this.describe(differences, seed);
    const warnings: string[] = [];
    if (differences.length < 5) warnings.push("Small paired sample; confidence interval is wide.");
    if (differences.length < 3) {
      warnings.push("Too few paired observations for inferential significance testing.");
    }
    const deviation = description.standardDeviation;
    const effectSize =
      description.mean !== null && deviation !== null && deviation > 0
        ? description.mean / deviation
        : null;
    const pValue =
      differences.length >= 3 && effectSize !== null
        ? pairedNormalApproximation(differences)
        : null;
    return {
      adjustedPValue: null,
      assumptions: {
        pairedByCaseAndRepetition: true,
        testSelectionReason:
          differences.length >= 3
            ? "Paired mean-difference approximation; inspect small-sample warning."
            : "No inferential test because fewer than three paired observations are available.",
      },
      confidenceInterval: description.confidenceInterval,
      descriptiveStatistics: {
        meanDifference: description.mean ?? 0,
        medianDifference: description.median ?? 0,
        standardDeviation: description.standardDeviation ?? 0,
      },
      effectSize,
      pValue,
      sampleSize: differences.length,
      testName: pValue === null ? "NOT_COMPUTED" : "PAIRED_T_NORMAL_APPROXIMATION",
      warnings,
    };
  }

  holm(results: StatisticalResult[]): StatisticalResult[] {
    const indexed = results
      .map((result, index) => ({ index, pValue: result.pValue, result }))
      .filter(
        (item): item is { index: number; pValue: number; result: StatisticalResult } =>
          typeof item.pValue === "number",
      )
      .sort((left, right) => left.pValue - right.pValue);
    const adjusted = new Map<number, number>();
    let previous = 0;
    for (const [rank, item] of indexed.entries()) {
      const value = Math.min(1, Math.max(previous, item.pValue * (indexed.length - rank)));
      adjusted.set(item.index, value);
      previous = value;
    }
    return results.map((result, index) => ({
      ...result,
      adjustedPValue: adjusted.get(index) ?? null,
    }));
  }
}

function observationKey(value: Pick<MetricObservation, "caseId" | "repetitionIndex">): string {
  return `${value.caseId}:${value.repetitionIndex}`;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const middle = Math.floor(values.length / 2);
  if (values.length % 2) return values[middle] ?? 0;
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
}

function bootstrapMeanInterval(values: number[], seed: number): { high: number; low: number } {
  if (values.length < 2) {
    const value = values[0] ?? 0;
    return { high: value, low: value };
  }
  const random = seededRandom(seed);
  const estimates = Array.from({ length: 1_000 }, () =>
    average(
      Array.from(
        { length: values.length },
        () => values[Math.floor(random() * values.length)] ?? 0,
      ),
    ),
  ).sort((left, right) => left - right);
  return {
    high: estimates[Math.floor(estimates.length * 0.975)] ?? 0,
    low: estimates[Math.floor(estimates.length * 0.025)] ?? 0,
  };
}

function pairedNormalApproximation(differences: number[]): number {
  const mean = average(differences);
  const deviation = standardDeviation(differences, mean);
  if (deviation === 0) return mean === 0 ? 1 : 0;
  const z = Math.abs(mean / (deviation / Math.sqrt(differences.length)));
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(z))));
}

function normalCdf(value: number): number {
  const t = 1 / (1 + 0.2316419 * value);
  const density = 0.3989423 * Math.exp((-value * value) / 2);
  const polynomial =
    ((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) * t + 0.31938153) * t;
  return 1 - density * polynomial;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
