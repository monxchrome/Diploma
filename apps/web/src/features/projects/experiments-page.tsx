"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

const ExperimentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    variants: z.array(z.unknown()).catch([]),
    cases: z.array(z.unknown()).catch([]),
    runs: z.array(z.unknown()).catch([]),
  })
  .passthrough();
const ExperimentsSchema = z.array(ExperimentSchema);
const RunsSchema = z.array(z.unknown());

type View = "list" | "new" | "detail" | "runs" | "report" | "evaluate";

export function ExperimentsPage({
  projectId,
  experimentId,
  view,
}: Readonly<{ projectId: string; experimentId?: string; view: View }>) {
  const { apiRequest, status } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const list = useQuery({
    enabled: status === "authenticated",
    queryKey: ["experiments", projectId],
    queryFn: () => apiRequest(`/api/projects/${projectId}/experiments`, ExperimentsSchema),
  });
  const experiment = useQuery({
    enabled: status === "authenticated" && Boolean(experimentId),
    queryKey: ["experiment", projectId, experimentId],
    queryFn: () =>
      apiRequest(`/api/projects/${projectId}/experiments/${experimentId ?? ""}`, ExperimentSchema),
  });
  const runs = useQuery({
    enabled:
      status === "authenticated" && Boolean(experimentId) && ["runs", "evaluate"].includes(view),
    queryKey: ["experiment-runs", projectId, experimentId],
    queryFn: () =>
      apiRequest(`/api/projects/${projectId}/experiments/${experimentId ?? ""}/runs`, RunsSchema),
  });
  const report = useQuery({
    enabled:
      status === "authenticated" && Boolean(experimentId) && ["report", "evaluate"].includes(view),
    queryKey: ["experiment-report", projectId, experimentId],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/experiments/${experimentId ?? ""}/report`,
        z.unknown(),
      ),
  });
  const run = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/projects/${projectId}/experiments/${experimentId ?? ""}/run`,
        ExperimentSchema,
        { method: "POST" },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["experiment", projectId, experimentId] });
      router.push(`/projects/${projectId}/experiments/${experimentId}/runs`);
    },
  });

  if (view === "new") return <NewExperiment projectId={projectId} />;
  if (view === "list")
    return (
      <ExperimentList projectId={projectId} loading={list.isLoading} items={list.data ?? []} />
    );
  if (experiment.isLoading || !experiment.data)
    return (
      <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading experiment...
      </p>
    );
  const item = experiment.data;
  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Link href={`/projects/${projectId}/experiments`} className="mt-1 text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm font-medium text-teal-700">Scientific evaluation</p>
            <h2 className="text-2xl font-semibold text-slate-950">{item.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {item.description ?? "Controlled, reproducible comparison."}
            </p>
          </div>
        </div>
        {view === "detail" ? (
          <Button disabled={run.isPending} onClick={() => run.mutate()} type="button">
            <Play className="h-4 w-4" />
            {run.isPending ? "Queueing..." : "Run experiment"}
          </Button>
        ) : null}
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <ExperimentLink
          active={view === "detail"}
          href={`/projects/${projectId}/experiments/${item.id}`}
          label="Overview"
        />
        <ExperimentLink
          active={view === "runs"}
          href={`/projects/${projectId}/experiments/${item.id}/runs`}
          label="Runs"
        />
        <ExperimentLink
          active={view === "report"}
          href={`/projects/${projectId}/experiments/${item.id}/report`}
          label="Report"
        />
        <ExperimentLink
          active={view === "evaluate"}
          href={`/projects/${projectId}/experiments/${item.id}/evaluate`}
          label="Evaluate"
        />
      </nav>
      {view === "detail" ? <Overview experiment={item} /> : null}
      {view === "runs" ? <Runs value={runs.data} /> : null}
      {view === "report" ? <Report value={report.data} /> : null}
      {view === "evaluate" ? (
        <Evaluate
          projectId={projectId}
          experimentId={item.id}
          report={report.data}
          value={runs.data}
        />
      ) : null}
    </div>
  );
}

function ExperimentList({
  projectId,
  loading,
  items,
}: Readonly<{ projectId: string; loading: boolean; items: z.infer<typeof ExperimentSchema>[] }>) {
  return (
    <div className="grid gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-teal-700">Scientific evaluation</p>
          <h2 className="text-2xl font-semibold text-slate-950">Experiments</h2>
        </div>
        <Link href={`/projects/${projectId}/experiments/new`}>
          <Button type="button">
            <FlaskConical className="h-4 w-4" />
            New experiment
          </Button>
        </Link>
      </header>
      {loading ? <p className="text-sm text-slate-600">Loading experiments...</p> : null}
      <section className="grid gap-3">
        {items.length ? (
          items.map((item) => (
            <Link
              className="rounded-md border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-300"
              href={`/projects/${projectId}/experiments/${item.id}`}
              key={item.id}
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold text-slate-950">{item.name}</h3>
                <span className="text-xs font-medium text-slate-600">{item.status}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{item.description ?? "No description"}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            Create a controlled experiment to compare fixed analysis configurations.
          </p>
        )}
      </section>
    </div>
  );
}

function NewExperiment({ projectId }: Readonly<{ projectId: string }>) {
  const { apiRequest } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const experiment = await apiRequest(
        `/api/projects/${projectId}/experiments`,
        ExperimentSchema,
        { method: "POST", body: { name, datasetId: "phase-6-synthetic-v1", repetitions: 1 } },
      );
      const variants = [
        ["Single agent · internal", "SINGLE_AGENT", "INTERNAL_ONLY"],
        ["Multi agent · internal", "MULTI_AGENT", "INTERNAL_ONLY"],
        ["Single agent · hybrid", "SINGLE_AGENT", "HYBRID"],
        ["Multi agent · hybrid", "MULTI_AGENT", "HYBRID"],
      ] as const;
      await Promise.all(
        variants.map(([variantName, analysisMode, evidenceMode]) =>
          apiRequest(
            `/api/projects/${projectId}/experiments/${experiment.id}/variants`,
            z.unknown(),
            {
              method: "POST",
              body: {
                name: variantName,
                analysisMode,
                evidenceMode,
                retrievalConfiguration: {},
                criticConfiguration: { enabled: true },
              },
            },
          ),
        ),
      );
      await Promise.all(
        [
          "Spain expansion — sufficient internal evidence",
          "Spain expansion — public market context gap",
        ].map((title) =>
          apiRequest(`/api/projects/${projectId}/experiments/${experiment.id}/cases`, z.unknown(), {
            method: "POST",
            body: {
              title,
              question: title,
              objectives: [],
              constraints: [],
              assumptions: [],
              expectedEvidence: ["E1"],
              scope: {},
              rubric: { version: "phase-6-v1" },
            },
          }),
        ),
      );
      return experiment;
    },
    onSuccess: (experiment) => router.push(`/projects/${projectId}/experiments/${experiment.id}`),
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to create experiment"),
  });
  return (
    <div className="grid max-w-xl gap-5">
      <Link
        className="flex items-center gap-2 text-sm text-slate-600"
        href={`/projects/${projectId}/experiments`}
      >
        <ArrowLeft className="h-4 w-4" />
        Experiments
      </Link>
      <div>
        <p className="text-sm font-medium text-teal-700">Scientific evaluation</p>
        <h2 className="text-2xl font-semibold text-slate-950">New experiment</h2>
      </div>
      <form
        className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (!name.trim()) {
            setError("A name is required.");
            return;
          }
          create.mutate();
        }}
      >
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Name
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Phase 6 baseline comparison"
          />
        </label>
        <p className="text-xs leading-5 text-slate-600">
          This creates the four fixed Phase 6 variants and two non-sensitive synthetic cases. Model
          names and prompts remain server controlled.
        </p>
        <Button disabled={create.isPending} type="submit">
          {create.isPending ? "Creating..." : "Create experiment"}
        </Button>
      </form>
    </div>
  );
}

function Overview({ experiment }: Readonly<{ experiment: z.infer<typeof ExperimentSchema> }>) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card label="Status" value={experiment.status} />
      <Card label="Variants" value={String(experiment.variants.length)} />
      <Card label="Cases" value={String(experiment.cases.length)} />
      <section className="grid gap-2 rounded-md border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
        <h3 className="font-semibold text-slate-950">Controlled scope</h3>
        <p className="text-sm text-slate-600">
          Every variant runs the same cases and repetitions. Metric rows retain their version and
          are marked as deterministic synthetic-fixture measurements when a live analysis is not
          connected.
        </p>
      </section>
    </div>
  );
}
function Runs({ value }: Readonly<{ value: unknown }>) {
  const runs = Array.isArray(value) ? value : [];
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Experiment runs</h3>
      {runs.length ? (
        runs.map((item, index) => {
          const record = asRecord(item);
          const variant = asRecord(record?.variant);
          const testCase = asRecord(record?.experimentCase);
          return (
            <article
              className="flex justify-between gap-4 border-t border-slate-100 pt-3 text-sm"
              key={getString(record, "id") ?? index}
            >
              <span>
                {getString(testCase, "title") ?? "Case"} · {getString(variant, "name") ?? "Variant"}
              </span>
              <span className="font-medium text-slate-700">
                {getString(record, "status") ?? "QUEUED"}
              </span>
            </article>
          );
        })
      ) : (
        <p className="text-sm text-slate-600">No runs have been queued.</p>
      )}
    </section>
  );
}
function Report({ value }: Readonly<{ value: unknown }>) {
  const report = asRecord(value);
  const metrics = Array.isArray(report?.metrics) ? report.metrics : [];
  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Metric comparison</h3>
      <p className="text-sm text-slate-600">
        Sample size: {formatCount(report?.sampleSize)} · Failed runs:{" "}
        {formatCount(report?.failedRuns)}
      </p>
      {metrics.map((item, index) => {
        const row = asRecord(item);
        return (
          <article
            className="grid gap-2 border-t border-slate-100 pt-3"
            key={getString(row, "variantId") ?? index}
          >
            <h4 className="font-medium text-slate-950">
              {getString(row, "variantName") ?? "Variant"}
            </h4>
            <MetricTable value={row?.metrics} />
          </article>
        );
      })}
    </section>
  );
}
function Evaluate({
  projectId,
  experimentId,
  report,
  value,
}: Readonly<{ projectId: string; experimentId: string; report: unknown; value: unknown }>) {
  const { apiRequest } = useAuth();
  const runs = Array.isArray(value) ? value : [];
  const blindComparison = asRecord(report)?.blindComparison;
  const comparisons: unknown[] = Array.isArray(blindComparison) ? blindComparison : [];
  const comparison = asRecord(comparisons[0]);
  const runA = getString(comparison, "runA");
  const runB = getString(comparison, "runB");
  const [score, setScore] = useState(3);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const evaluate = useMutation({
    mutationFn: () => {
      const runId = selectedRunId ?? runA ?? getString(asRecord(runs[0]), "id") ?? "";
      return apiRequest(
        `/api/projects/${projectId}/experiments/${experimentId}/runs/${runId}/evaluation`,
        z.unknown(),
        {
          method: "POST",
          body: {
            scores: {
              factualCorrectness: score,
              evidenceGrounding: score,
              citationUsefulness: score,
              completeness: score,
              decisionUsefulness: score,
              riskAwareness: score,
              uncertaintyDisclosure: score,
              clarity: score,
              conciseness: score,
              overallPreference: score,
            },
          },
        },
      );
    },
  });
  return (
    <section className="grid max-w-xl gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Blind human evaluation</h3>
      <p className="text-sm text-slate-600">
        Compare blinded result labels; configuration identities are not shown here. Scores use the
        versioned 1–5 rubric.
      </p>
      {runA && runB ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => setSelectedRunId(runA)}
            type="button"
            variant={selectedRunId === runA ? "primary" : "ghost"}
          >
            Variant A
          </Button>
          <Button
            onClick={() => setSelectedRunId(runB)}
            type="button"
            variant={selectedRunId === runB ? "primary" : "ghost"}
          >
            Variant B
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          Run at least two variants on the same case to create a blind comparison.
        </p>
      )}
      <label className="grid gap-1 text-sm">
        Overall score
        <input
          max="5"
          min="1"
          type="number"
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
        />
      </label>
      <Button
        disabled={(!runs.length && !runA) || evaluate.isPending}
        onClick={() => evaluate.mutate()}
        type="button"
      >
        {evaluate.isPending ? "Saving..." : "Save evaluation"}
      </Button>
    </section>
  );
}
function MetricTable({ value }: Readonly<{ value: unknown }>) {
  const metrics = Array.isArray(value) ? value : [];
  return (
    <div className="grid gap-1 text-xs text-slate-600">
      {metrics.slice(0, 8).map((item, index) => {
        const record = asRecord(item);
        return (
          <div
            className="flex justify-between gap-3"
            key={`${getString(record, "name") ?? "metric"}-${index}`}
          >
            <span>{getString(record, "name") ?? "Metric"}</span>
            <span>{formatNumber(record?.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
function ExperimentLink({
  active,
  href,
  label,
}: Readonly<{ active: boolean; href: string; label: string }>) {
  return (
    <Link
      className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"}`}
      href={href}
    >
      {label}
    </Link>
  );
}
function Card({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <section className="grid gap-1 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm text-slate-500">{label}</span>
      <strong className="text-xl text-slate-950">{value}</strong>
    </section>
  );
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function getString(value: Record<string, unknown> | null | undefined, key: string): string | null {
  const item = value?.[key];
  return typeof item === "string" ? item : null;
}
function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toFixed(3) : "—";
}
function formatCount(value: unknown): string {
  return typeof value === "number" ? String(value) : "0";
}
