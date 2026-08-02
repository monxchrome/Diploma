"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

const RunSchema = z
  .object({
    budgetProtocol: z.string(),
    id: z.string().uuid(),
    protocol: z.string(),
    randomizationSeed: z.number(),
    repetitions: z.number(),
    status: z.string(),
  })
  .passthrough();
const ResultsSchema = z
  .object({
    completedOnly: z.array(
      z.object({
        completedRuns: z.number(),
        failedRuns: z.number(),
        failureRate: z.number(),
        metrics: z.array(z.object({ name: z.string(), sampleSize: z.number(), value: z.number() })),
        variantId: z.string().uuid(),
      }),
    ),
    completedRuns: z.number(),
    failedRuns: z.number(),
  })
  .passthrough();

export function BenchmarkRunPage({ runId }: Readonly<{ runId: string }>) {
  const { apiRequest, status } = useAuth();
  const run = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest(`/api/benchmark-runs/${runId}`, RunSchema),
    queryKey: ["benchmark-run", runId],
  });
  const results = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest(`/api/benchmark-runs/${runId}/results`, ResultsSchema),
    queryKey: ["benchmark-run-results", runId],
  });
  const statistics = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest(`/api/benchmark-runs/${runId}/statistics`, z.array(z.unknown())),
    queryKey: ["benchmark-run-statistics", runId],
  });

  return (
    <AppShell>
      <div className="mx-auto grid max-w-5xl gap-6">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
          href="/experiments/benchmarks"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to benchmarks
        </Link>
        <header>
          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Benchmark run</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {run.data?.status ?? (run.isError ? "Run unavailable" : "Loading run")}
          </h1>
          {run.isError ? (
            <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">
              This run is unavailable for the current account. Return to Benchmark runs and open a
              run listed there.
            </p>
          ) : null}
          {run.data ? (
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              {run.data.protocol} · {run.data.budgetProtocol} · seed {run.data.randomizationSeed} ·{" "}
              {run.data.repetitions} repetition{run.data.repetitions === 1 ? "" : "s"}
            </p>
          ) : null}
        </header>
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950 dark:text-white">Results</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {results.data?.completedRuns ?? 0} completed; {results.data?.failedRuns ?? 0} failed.
            Metrics remain descriptive unless paired statistical evidence is sufficient.
          </p>
          {results.data?.completedOnly.map((variant) => (
            <div
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              key={variant.variantId}
            >
              <p className="text-sm font-medium text-slate-950 dark:text-white">
                Variant {variant.variantId.slice(0, 8)}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {variant.completedRuns} complete · {(variant.failureRate * 100).toFixed(1)}%
                failures
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {variant.metrics.map((metric) => (
                  <span
                    className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    key={metric.name}
                  >
                    {metric.name}: {metric.value.toFixed(2)} (n={metric.sampleSize})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950 dark:text-white">
              Statistical and reproducibility record
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {statistics.data?.length ?? 0} stored paired comparisons. The reproducibility manifest
            is available only to authorized project members.
          </p>
          <a
            className="w-fit text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-300"
            href={`/api/benchmark-runs/${runId}/reproducibility/manifest`}
          >
            View manifest
          </a>
        </section>
      </div>
    </AppShell>
  );
}
