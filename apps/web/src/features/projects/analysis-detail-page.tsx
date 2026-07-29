"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeft, Bot, FileCheck2, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import { fetchAnalysis, runAnalysis, type AnalysisDetail, type AnalysisRun } from "./projects-api";

type AnalysisView = "overview" | "progress" | "agents" | "report";

export function AnalysisDetailPage({
  projectId,
  analysisId,
}: Readonly<{ projectId: string; analysisId: string }>) {
  return <AnalysisViewPage analysisId={analysisId} projectId={projectId} view="overview" />;
}

export function AnalysisRunViewPage({
  projectId,
  analysisId,
  view,
}: Readonly<{ projectId: string; analysisId: string; view: Exclude<AnalysisView, "overview"> }>) {
  return <AnalysisViewPage analysisId={analysisId} projectId={projectId} view={view} />;
}

function AnalysisViewPage({
  projectId,
  analysisId,
  view,
}: Readonly<{ projectId: string; analysisId: string; view: AnalysisView }>) {
  const { apiRequest, status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analysisQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchAnalysis(apiRequest, projectId, analysisId),
    queryKey: ["analysis", projectId, analysisId],
    refetchInterval: (query) => {
      const data = query.state.data;
      const run = data?.runs[0];
      return run?.status === "QUEUED" || run?.status === "RUNNING" ? 2000 : false;
    },
  });
  const run = analysisQuery.data?.runs[0];
  const runMutation = useMutation({
    mutationFn: () => runAnalysis(apiRequest, projectId, analysisId),
    onSuccess: (createdRun) => {
      queryClient.setQueryData<AnalysisDetail>(["analysis", projectId, analysisId], (current) =>
        current ? { ...current, runs: [createdRun, ...current.runs] } : current,
      );
      router.push(`/projects/${projectId}/analyses/${analysisId}/progress`);
    },
  });

  if (analysisQuery.isLoading)
    return (
      <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading analysis...
      </p>
    );
  if (analysisQuery.isError || !analysisQuery.data)
    return (
      <p className="rounded-md border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
        Analysis not found or inaccessible
      </p>
    );

  const analysis = analysisQuery.data;
  const latestRun = run;
  const isActive = latestRun?.status === "QUEUED" || latestRun?.status === "RUNNING";
  const title =
    view === "overview"
      ? "Analysis"
      : view === "progress"
        ? "Run progress"
        : view === "agents"
          ? "Agents"
          : "Final report";

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            href={`/projects/${projectId}/analyses`}
            aria-label="Back to analyses"
            className="mt-1 text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div>
            <p className="text-sm font-medium text-teal-700">{title}</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{analysis.title}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{analysis.decisionQuestion}</p>
          </div>
        </div>
        {view === "overview" && !isActive ? (
          <Button
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate()}
            type="button"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {runMutation.isPending ? "Starting..." : "Run analysis"}
          </Button>
        ) : null}
        {view === "overview" && isActive ? (
          <Link href={`/projects/${projectId}/analyses/${analysisId}/progress`}>
            <Button type="button">
              <Activity className="h-4 w-4" aria-hidden="true" />
              View progress
            </Button>
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Analysis sections"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-2"
      >
        <AnalysisLink
          active={view === "overview"}
          href={`/projects/${projectId}/analyses/${analysisId}`}
          label="Overview"
        />
        <AnalysisLink
          active={view === "progress"}
          href={`/projects/${projectId}/analyses/${analysisId}/progress`}
          label="Run progress"
        />
        <AnalysisLink
          active={view === "agents"}
          href={`/projects/${projectId}/analyses/${analysisId}/agents`}
          label="Agents"
        />
        <AnalysisLink
          active={view === "report"}
          href={`/projects/${projectId}/analyses/${analysisId}/report`}
          label="Final report"
        />
      </nav>

      {view === "overview" ? <Overview analysis={analysis} run={latestRun} /> : null}
      {view === "progress" ? <Progress run={latestRun} /> : null}
      {view === "agents" ? <Agents run={latestRun} /> : null}
      {view === "report" ? <Report run={latestRun} /> : null}
    </div>
  );
}

function AnalysisLink({
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

function Overview({ analysis, run }: Readonly<{ analysis: AnalysisDetail; run?: AnalysisRun }>) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InfoCard title="Configuration">
        <InfoRow
          label="Mode"
          value={analysis.mode === "MULTI_AGENT" ? "Multi-agent" : "Single-agent"}
        />
        <InfoRow label="Time horizon" value={analysis.timeHorizon ?? "Not specified"} />
        <InfoRow label="Target market" value={analysis.targetMarket ?? "Not specified"} />
        <InfoRow label="Currency" value={analysis.currency ?? "Not specified"} />
        <InfoRow label="Knowledge bases" value={`${analysis.knowledgeBaseIds.length} selected`} />
        <InfoRow
          label="Documents"
          value={
            analysis.documentIds.length
              ? `${analysis.documentIds.length} selected`
              : "All documents"
          }
        />
      </InfoCard>
      <InfoCard title="Latest run">
        {run ? (
          <>
            <InfoRow label="Status" value={run.status} />
            <InfoRow label="Stage" value={run.currentStage ?? "Queued"} />
            <InfoRow label="Progress" value={`${run.progress}%`} />
          </>
        ) : (
          <p className="text-sm text-slate-600">This analysis has not been run yet.</p>
        )}
      </InfoCard>
      <InfoCard title="Objectives">
        <List value={analysis.objectives} empty="No objectives added." />
      </InfoCard>
      <InfoCard title="Constraints and assumptions">
        <List
          value={[...analysis.constraints, ...analysis.assumptions]}
          empty="No constraints or assumptions added."
        />
      </InfoCard>
    </div>
  );
}

function Progress({ run }: Readonly<{ run?: AnalysisRun }>) {
  if (!run)
    return (
      <EmptyState
        icon={<Activity className="h-5 w-5" aria-hidden="true" />}
        title="No run yet"
        body="Start the analysis from the overview to see live progress."
      />
    );
  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Run progress</h3>
          <p className="text-sm text-slate-600">
            The page refreshes while the run is queued or running.
          </p>
        </div>
        <RefreshCw className="h-5 w-5 text-teal-700" aria-hidden="true" />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-700 transition-all"
          style={{ width: `${run.progress}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span className="font-medium text-slate-950">{run.status}</span>
        <span className="text-slate-600">
          {run.currentStage ?? "Waiting to start"} · {run.progress}%
        </span>
      </div>
      {run.errorMessage ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{run.errorMessage}</p>
      ) : null}
    </section>
  );
}

function Agents({ run }: Readonly<{ run?: AnalysisRun }>) {
  if (!run)
    return (
      <EmptyState
        icon={<Bot className="h-5 w-5" aria-hidden="true" />}
        title="No agent runs yet"
        body="Run the analysis to see specialist execution details."
      />
    );
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Specialist agents</h3>
      {run.agentRuns.length === 0 ? (
        <p className="text-sm text-slate-600">Agents will appear here as the run progresses.</p>
      ) : (
        run.agentRuns.map((agent, index) => <AgentCard agent={agent} key={index} />)
      )}
    </section>
  );
}

function AgentCard({ agent }: Readonly<{ agent: unknown }>) {
  const record = asRecord(agent);
  return (
    <article className="grid gap-1 rounded-md border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium text-slate-950">
          {getString(record, "specialist") ?? getString(record, "nodeName") ?? "Specialist"}
        </h4>
        <span className="text-xs font-semibold text-slate-600">
          {getString(record, "status") ?? "PENDING"}
        </span>
      </div>
      {getString(record, "summary") ? (
        <p className="text-sm text-slate-600">{getString(record, "summary")}</p>
      ) : null}
    </article>
  );
}

function Report({ run }: Readonly<{ run?: AnalysisRun }>) {
  const report = asRecord(run?.report?.report);
  if (!run || !report)
    return (
      <EmptyState
        icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
        title="Final report is not ready"
        body="Complete a run to generate the grounded final report."
      />
    );
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const limitations = Array.isArray(report.limitations)
    ? report.limitations.filter((item): item is string => typeof item === "string")
    : [];
  const limited =
    run.status === "COMPLETED_WITH_LIMITATIONS" ||
    report.insufficientEvidence === true ||
    report.qualityGatePassed === false;
  return (
    <section className="grid gap-5 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      {limited ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-semibold">Quality gate warning</p>
          <p className="mt-1">
            This report did not pass the configured quality gate after the allowed revision. Treat
            its conclusions as limited until the missing evidence or quality issues are resolved.
          </p>
          {limitations.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {limitations.map((item) => (
                <li key={item}>{cleanReportText(item)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div>
        <h3 className="text-xl font-semibold text-slate-950">
          {cleanReportText(getString(report, "recommendation") ?? "Recommendation")}
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {cleanReportText(
            getString(report, "executiveSummary") ?? "No executive summary was returned.",
          )}
        </p>
      </div>
      {sections.map((section, index) => {
        const item = asRecord(section);
        return (
          <article className="grid gap-1 border-t border-slate-100 pt-4" key={index}>
            <h4 className="font-semibold text-slate-950">
              {cleanReportText(getString(item, "title") ?? "Section")}
            </h4>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {cleanReportText(getString(item, "content") ?? "")}
            </p>
          </article>
        );
      })}
      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span>Quality: {formatScore(report.qualityScore)}</span>
        <span>Grounding: {formatScore(report.groundingScore)}</span>
        {limited ? (
          <span className="font-semibold text-amber-700">Completed with limitations</span>
        ) : null}
      </div>
    </section>
  );
}

function InfoCard({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}
function InfoRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm first:border-t-0 first:pt-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-950">{value}</span>
    </div>
  );
}
function List({ value, empty }: Readonly<{ value: string[]; empty: string }>) {
  return value.length ? (
    <ul className="grid gap-2 text-sm text-slate-700">
      {value.map((item, index) => (
        <li className="border-l-2 border-teal-200 pl-3" key={`${item}-${index}`}>
          {item}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-slate-600">{empty}</p>
  );
}
function EmptyState({
  icon,
  title,
  body,
}: Readonly<{ icon: React.ReactNode; title: string; body: string }>) {
  return (
    <section className="grid gap-2 rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="mx-auto text-teal-700">{icon}</div>
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <p className="text-sm text-slate-600">{body}</p>
    </section>
  );
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function getString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
function cleanReportText(value: string): string {
  return value
    .replace(/\\#{1,6}\s*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\\([*_`])/g, "$1");
}
function formatScore(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}
