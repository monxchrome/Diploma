"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import {
  cancelAnalysis,
  fetchAnalysis,
  fetchAnalysisResearch,
  fetchAnalysisResearchConflicts,
  fetchAnalysisResearchQueries,
  fetchAnalysisResearchSources,
  runAnalysis,
  type AnalysisDetail,
  type AnalysisRun,
} from "./projects-api";

type AnalysisView =
  "overview" | "progress" | "agents" | "research" | "sources" | "conflicts" | "report";

type Citation = { evidenceId: string; quote: string; type: "external" | "project" };

export function AnalysisDetailPage({
  projectId,
  analysisId,
}: Readonly<{ projectId: string; analysisId: string }>) {
  return <AnalysisViewPage analysisId={analysisId} projectId={projectId} view="report" />;
}

export function AnalysisRunViewPage({
  projectId,
  analysisId,
  view,
}: Readonly<{ projectId: string; analysisId: string; view: Exclude<AnalysisView, "overview"> }>) {
  return <AnalysisViewPage analysisId={analysisId} projectId={projectId} view={view} />;
}

function AnalysisViewPage({
  analysisId,
  projectId,
  view,
}: Readonly<{ analysisId: string; projectId: string; view: AnalysisView }>) {
  const { apiRequest, status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const analysisQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchAnalysis(apiRequest, projectId, analysisId),
    queryKey: ["analysis", projectId, analysisId],
    refetchInterval: (query) => {
      const latest = query.state.data?.runs[0];
      return isActive(latest) ? 2000 : false;
    },
  });
  const analysis = analysisQuery.data;
  const run = analysis?.runs[0];
  const startMutation = useMutation({
    mutationFn: () => runAnalysis(apiRequest, projectId, analysisId),
    onError: () => setActionError("We could not start this analysis. You can safely try again."),
    onSuccess: (createdRun) => {
      queryClient.setQueryData<AnalysisDetail>(["analysis", projectId, analysisId], (current) =>
        current ? { ...current, runs: [createdRun, ...current.runs] } : current,
      );
      router.replace(`/projects/${projectId}/analyses/${analysisId}/progress`);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelAnalysis(apiRequest, projectId, analysisId),
    onError: () =>
      setActionError("We could not stop this analysis. It may still complete; refresh to check."),
    onSuccess: () => void analysisQuery.refetch(),
  });
  const research = useQuery({
    enabled:
      status === "authenticated" &&
      Boolean(run) &&
      ["research", "sources", "conflicts"].includes(view),
    queryFn: () => fetchAnalysisResearch(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research", projectId, analysisId, run?.id],
  });
  const sourceData = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "sources",
    queryFn: () => fetchAnalysisResearchSources(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-sources", projectId, analysisId, run?.id],
  });
  const queryData = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "research",
    queryFn: () => fetchAnalysisResearchQueries(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-queries", projectId, analysisId, run?.id],
  });
  const conflictData = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "conflicts",
    queryFn: () => fetchAnalysisResearchConflicts(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-conflicts", projectId, analysisId, run?.id],
  });

  if (analysisQuery.isLoading) return <LoadingState />;
  if (analysisQuery.isError || !analysis)
    return (
      <ErrorState
        body="This analysis is unavailable or you no longer have access to it."
        title="Analysis not found"
      />
    );

  const retryable = run?.status === "FAILED" || run?.status === "CANCELLED";
  const active = isActive(run);
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Link
            aria-label="Back to analyses"
            className="mt-1 rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            href="/home"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <StatusBadge status={run?.status} />
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {analysis.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {analysis.decisionQuestion}
            </p>
          </div>
        </div>
        {!run || retryable ? (
          <Button
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
            type="button"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {startMutation.isPending ? "Starting…" : retryable ? "Try again" : "Analyze"}
          </Button>
        ) : null}
        {active ? (
          <Button
            onClick={() => router.push(`/projects/${projectId}/analyses/${analysisId}/progress`)}
            type="button"
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            View progress
          </Button>
        ) : null}
      </header>

      {actionError ? (
        <p
          className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {view === "progress" ? (
        <ProgressView
          cancelPending={cancelMutation.isPending}
          onCancel={() => {
            if (
              window.confirm(
                "Stop this analysis? The completed work will remain available, but no new result will be created.",
              )
            )
              cancelMutation.mutate();
          }}
          onRefresh={() => void analysisQuery.refetch()}
          run={run}
        />
      ) : null}
      {view === "report" ? <ReportView analysis={analysis} run={run} /> : null}
      {view === "overview" ? <OverviewView analysis={analysis} run={run} /> : null}
      {view === "agents" ? (
        <TechnicalRunView
          body="The existing specialist execution details remain available for power users."
          run={run}
          title="Workflow details"
        />
      ) : null}
      {view === "research" ? (
        <ResearchView queries={queryData.data} research={research.data} />
      ) : null}
      {view === "sources" ? <SourceView sources={sourceData.data} /> : null}
      {view === "conflicts" ? <ConflictView conflicts={conflictData.data} /> : null}

      {view !== "progress" ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-700 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200">
            Technical details <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </summary>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/progress`}
              label="Run progress"
            />
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/agents`}
              label="Workflow"
            />
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/research`}
              label="Research"
            />
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/sources`}
              label="Sources"
            />
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/conflicts`}
              label="Conflicts"
            />
            <TechnicalLink
              href={`/projects/${projectId}/analyses/${analysisId}/report`}
              label="Report"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ReportView({ analysis, run }: Readonly<{ analysis: AnalysisDetail; run?: AnalysisRun }>) {
  const [citation, setCitation] = useState<Citation | null>(null);
  const citationOpenerRef = useRef<HTMLButtonElement | null>(null);
  const closeCitation = () => {
    setCitation(null);
    requestAnimationFrame(() => citationOpenerRef.current?.focus());
  };
  const report = asRecord(run?.report?.report);
  if (!run)
    return (
      <EmptyState
        body="When you are ready, run this analysis to receive a structured recommendation."
        title="Ready when you are"
      />
    );
  if (!report) return <ProgressView run={run} />;
  const recommendation =
    stringValue(report, "recommendation") ??
    stringValue(report, "recommendedOption") ??
    "No recommendation was returned.";
  const summary = stringValue(report, "executiveSummary");
  const rationale = stringValue(report, "recommendationRationale");
  const limitations = stringList(report.limitations);
  const risks = recordList(report.riskRegister);
  const missing = stringList(report.missingInformation);
  const nextSteps = stringList(report.implementationRoadmap);
  const sections = recordList(report.sections).filter((section) =>
    Boolean(stringValue(section, "content")?.trim()),
  );
  const limited =
    run.status === "COMPLETED_WITH_LIMITATIONS" ||
    report.insufficientEvidence === true ||
    report.decisionReady === false ||
    report.qualityGatePassed === false;
  const citations = toCitations(run);
  return (
    <div className="grid gap-6">
      {limited ? (
        <section
          className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Complete with limitations</h2>
              <p className="mt-1 text-sm leading-6">
                There isn’t enough reliable information to treat this as a confident decision.
                Review the missing information before acting.
              </p>
              {limitations.length ? <BulletList className="mt-3" items={limitations} /> : null}
            </div>
          </div>
        </section>
      ) : null}
      {analysis.evidenceMode !== "EXTERNAL_ONLY" && analysis.knowledgeBaseIds.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          No internal knowledge base selected
        </p>
      ) : null}
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-900 dark:bg-teal-950/35 sm:p-7">
        <p className="text-sm font-medium text-teal-800 dark:text-teal-200">Recommendation</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {cleanText(recommendation)}
        </h2>
        {summary ? (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
            {cleanText(summary)}
          </p>
        ) : null}
        {rationale ? (
          <p className="mt-4 max-w-3xl whitespace-pre-wrap border-t border-teal-200 pt-4 text-sm leading-7 text-slate-700 dark:border-teal-900 dark:text-slate-200">
            {cleanText(rationale)}
          </p>
        ) : null}
      </section>
      <div className="grid gap-6 md:grid-cols-2">
        {risks.length ? (
          <InsightCard title="Risks to plan for">
            <div className="grid gap-3">
              {risks.map((risk, index) => (
                <div
                  className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                  key={`${stringValue(risk, "risk")}-${index}`}
                >
                  <p className="font-medium text-slate-950 dark:text-white">
                    {stringValue(risk, "risk")}
                  </p>
                  {stringValue(risk, "mitigation") ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {stringValue(risk, "mitigation")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </InsightCard>
        ) : null}
        {missing.length ? (
          <InsightCard title="What is still missing">
            <BulletList items={missing} />
          </InsightCard>
        ) : null}
        {nextSteps.length ? (
          <InsightCard title="Suggested next steps">
            <ol className="grid gap-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
              {nextSteps.map((step, index) => (
                <li className="flex gap-3" key={`${step}-${index}`}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-900 dark:bg-teal-900 dark:text-teal-100">
                    {index + 1}
                  </span>
                  <span>{cleanText(step)}</span>
                </li>
              ))}
            </ol>
          </InsightCard>
        ) : null}
      </div>
      {sections.map((section, index) => (
        <InsightCard
          key={`${stringValue(section, "title")}-${index}`}
          title={cleanText(stringValue(section, "title") ?? "Details")}
        >
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">
            {cleanText(stringValue(section, "content") ?? "")}
          </p>
        </InsightCard>
      ))}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Sources used</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Open a source to see the supporting excerpt without leaving this report.
        </p>
        {citations.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {citations.map((item) => (
              <button
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-600 dark:text-teal-200 dark:hover:bg-teal-950"
                key={`${item.type}-${item.evidenceId}`}
                onClick={(event) => {
                  citationOpenerRef.current = event.currentTarget;
                  setCitation(item);
                }}
                type="button"
              >
                {item.evidenceId}
                <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                  {item.type === "external" ? "Web" : "Project"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            No source excerpts were returned for this report.
          </p>
        )}
      </section>
      <details className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200">
          Quality and readiness details
        </summary>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
          <p>Report quality: {formatScore(report.reportQualityScore ?? report.qualityScore)}</p>
          <p>Grounding: {formatScore(report.groundingScore)}</p>
          <p>Evidence coverage: {formatScore(report.evidenceCoverage)}</p>
          <p>Decision readiness: {friendlyReadiness(stringValue(report, "decisionReadiness"))}</p>
        </div>
      </details>
      {citation ? <CitationDialog citation={citation} onClose={closeCitation} /> : null}
    </div>
  );
}

function ProgressView({
  cancelPending,
  onCancel,
  onRefresh,
  run,
}: Readonly<{
  cancelPending?: boolean;
  onCancel?: () => void;
  onRefresh?: () => void;
  run?: AnalysisRun;
}>) {
  if (!run)
    return (
      <EmptyState
        body="Start the analysis to see its progress here."
        title="No analysis is running"
      />
    );
  const failed = run.status === "FAILED";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatusBadge status={run.status} />
          <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
            {friendlyStage(run.currentStage, run.status)}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            You can leave this page. The analysis will continue and remain visible from Home.
          </p>
        </div>
        <div className="flex gap-2">
          {onRefresh ? (
            <button
              aria-label="Refresh progress"
              className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {isActive(run) && onCancel ? (
            <Button
              className="text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-950"
              disabled={cancelPending}
              onClick={onCancel}
              type="button"
              variant="ghost"
            >
              {cancelPending ? "Stopping…" : "Stop analysis"}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-teal-700 transition-[width] dark:bg-teal-400"
          style={{ width: `${run.progress}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{run.progress}% complete</p>
      {failed || run.errorMessage ? (
        <p
          className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          role="alert"
        >
          {run.errorMessage ??
            "The analysis could not complete. Your original question is still available, and you can try again."}
        </p>
      ) : null}
    </section>
  );
}

function OverviewView({
  analysis,
  run,
}: Readonly<{ analysis: AnalysisDetail; run?: AnalysisRun }>) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <InsightCard title="What was included">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {analysis.documentIds.length
            ? `${analysis.documentIds.length} chosen project sources`
            : "All ready project sources"}
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {analysis.externalResearchEnabled
            ? "Web research was included."
            : "Web research was not included."}
        </p>
      </InsightCard>
      <InsightCard title="Current status">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {run ? friendlyStage(run.currentStage, run.status) : "Not started"}
        </p>
      </InsightCard>
    </section>
  );
}

function TechnicalRunView({
  body,
  run,
  title,
}: Readonly<{ body: string; run?: AnalysisRun; title: string }>) {
  return (
    <InsightCard title={title}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
      {run?.agentRuns.length ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {run.agentRuns.length} recorded workflow steps.
        </p>
      ) : null}
    </InsightCard>
  );
}

function ResearchView({ queries, research }: Readonly<{ queries: unknown; research: unknown }>) {
  const details = asRecord(research);
  return (
    <InsightCard title="Research details">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {details
          ? "Public-source research was handled within the configured safety limits."
          : "No web research was used for this analysis."}
      </p>
      {Array.isArray(queries) && queries.length ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {queries.length} research queries were completed.
        </p>
      ) : null}
    </InsightCard>
  );
}

function SourceView({ sources }: Readonly<{ sources: unknown }>) {
  const entries = Array.isArray(sources) ? sources : [];
  return (
    <InsightCard title="Source details">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {entries.length
          ? `${entries.length} web sources were reviewed. Rejected sources are not presented as trusted evidence.`
          : "No external sources were selected."}
      </p>
    </InsightCard>
  );
}

function ConflictView({ conflicts }: Readonly<{ conflicts: unknown }>) {
  const entries = Array.isArray(conflicts) ? conflicts : [];
  return (
    <InsightCard title="Evidence conflicts">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {entries.length
          ? `${entries.length} evidence conflicts were recorded for review.`
          : "No evidence conflicts were recorded."}
      </p>
    </InsightCard>
  );
}

function CitationDialog({
  citation,
  onClose,
}: Readonly<{ citation: Citation; onClose: () => void }>) {
  return (
    <div
      aria-label="Source preview"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-6"
      onMouseDown={onClose}
      role="dialog"
    >
      <section
        className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            event.preventDefault();
            event.currentTarget.querySelector("button")?.focus();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
              {citation.type === "external" ? "Web source" : "Project source"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
              {citation.evidenceId}
            </h2>
          </div>
          <button
            autoFocus
            aria-label="Close source preview"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:hover:bg-slate-800"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <blockquote className="mt-5 border-l-2 border-teal-500 pl-4 text-sm leading-7 text-slate-700 dark:text-slate-200">
          {citation.quote || "No preview excerpt was stored for this source."}
        </blockquote>
      </section>
    </div>
  );
}

function TechnicalLink({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <Link
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      href={href}
    >
      {label}
    </Link>
  );
}
function InsightCard({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function EmptyState({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <FileText className="mx-auto h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
      <h2 className="mt-3 font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{body}</p>
    </section>
  );
}
function LoadingState() {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      role="status"
    >
      Loading analysis…
    </div>
  );
}
function ErrorState({ body, title }: Readonly<{ body: string; title: string }>) {
  return (
    <section
      className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
      role="alert"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm">{body}</p>
    </section>
  );
}
function StatusBadge({ status }: Readonly<{ status?: string }>) {
  const complete = status === "COMPLETED" || status === "COMPLETED_WITH_LIMITATIONS";
  const label =
    status === "RUNNING"
      ? "In progress"
      : status === "QUEUED"
        ? "Getting ready"
        : status === "COMPLETED_WITH_LIMITATIONS"
          ? "Complete with limitations"
          : status === "COMPLETED"
            ? "Complete"
            : status === "FAILED"
              ? "Needs attention"
              : status === "CANCELLED"
                ? "Stopped"
                : "Not started";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {complete ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
      ) : null}
      {label}
    </span>
  );
}
function BulletList({ className, items }: Readonly<{ className?: string; items: string[] }>) {
  return (
    <ul className={`grid gap-2 text-sm leading-6 ${className ?? ""}`}>
      {items.map((item, index) => (
        <li className="flex gap-2" key={`${item}-${index}`}>
          <span aria-hidden="true">•</span>
          <span>{cleanText(item)}</span>
        </li>
      ))}
    </ul>
  );
}
function isActive(run?: AnalysisRun): boolean {
  return run?.status === "QUEUED" || run?.status === "RUNNING";
}
function friendlyStage(stage: string | null | undefined, status: string): string {
  if (status === "QUEUED") return "Preparing your analysis";
  if (status === "COMPLETED") return "Your recommendation is ready";
  if (status === "COMPLETED_WITH_LIMITATIONS") return "Your result is ready with limitations";
  if (status === "FAILED") return "This analysis needs another try";
  if (status === "CANCELLED") return "This analysis was stopped";
  const stageMap: Record<string, string> = {
    coordinator: "Bringing the findings together",
    critic: "Checking the recommendation",
    evidence_router: "Reviewing available sources",
    finalize_report: "Preparing your recommendation",
    initial_retrieval: "Reviewing project sources",
    planner: "Understanding the decision",
    specialist_agents_in_parallel: "Looking at the decision from different angles",
    validate_input: "Preparing your analysis",
  };
  return stage ? (stageMap[stage] ?? "Working on your analysis") : "Working on your analysis";
}
function friendlyReadiness(value: string | null): string {
  return value === "HIGH"
    ? "Ready to act"
    : value === "MEDIUM"
      ? "Useful, with checks still needed"
      : "More information is needed";
}
function toCitations(run: AnalysisRun): Citation[] {
  const internal = arrayOfRecords(run.report?.citations).map((item) => ({
    evidenceId: stringValue(item, "evidenceId") ?? "Project source",
    quote: stringValue(item, "quote") ?? "",
    type: "project" as const,
  }));
  const external = arrayOfRecords(run.report?.externalCitations).map((item) => ({
    evidenceId: stringValue(item, "evidenceId") ?? "Web source",
    quote: stringValue(item, "quote") ?? "",
    type: "external" as const,
  }));
  return [...internal, ...external];
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}
function recordList(value: unknown): Record<string, unknown>[] {
  return arrayOfRecords(value);
}
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}
function cleanText(value: string): string {
  return value
    .replace(/\\#{1,6}\s*/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\\([*_`])/g, "$1");
}
function formatScore(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Not available";
}
