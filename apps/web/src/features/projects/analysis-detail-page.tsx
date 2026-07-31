"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeft, Bot, FileCheck2, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import {
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
  const research = useQuery({
    enabled:
      status === "authenticated" &&
      Boolean(run) &&
      ["research", "sources", "conflicts"].includes(view),
    queryFn: () => fetchAnalysisResearch(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research", projectId, analysisId, run?.id],
  });
  const sources = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "sources",
    queryFn: () => fetchAnalysisResearchSources(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-sources", projectId, analysisId, run?.id],
  });
  const queries = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "research",
    queryFn: () => fetchAnalysisResearchQueries(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-queries", projectId, analysisId, run?.id],
  });
  const conflicts = useQuery({
    enabled: status === "authenticated" && Boolean(run) && view === "conflicts",
    queryFn: () => fetchAnalysisResearchConflicts(apiRequest, projectId, analysisId, run?.id ?? ""),
    queryKey: ["analysis-research-conflicts", projectId, analysisId, run?.id],
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
  const canRetry = Boolean(latestRun?.errorCode);
  const title =
    view === "overview"
      ? "Analysis"
      : view === "progress"
        ? "Run progress"
        : view === "agents"
          ? "Agents"
          : view === "research"
            ? "Research"
            : view === "sources"
              ? "Sources"
              : view === "conflicts"
                ? "Conflicts"
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
        {view === "overview" && (!isActive || canRetry) ? (
          <Button
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate()}
            type="button"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {runMutation.isPending ? "Starting..." : canRetry ? "Retry analysis" : "Run analysis"}
          </Button>
        ) : null}
        {view === "overview" && isActive && !canRetry ? (
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
          active={view === "research"}
          href={`/projects/${projectId}/analyses/${analysisId}/research`}
          label="Research"
        />
        <AnalysisLink
          active={view === "sources"}
          href={`/projects/${projectId}/analyses/${analysisId}/sources`}
          label="Sources"
        />
        <AnalysisLink
          active={view === "conflicts"}
          href={`/projects/${projectId}/analyses/${analysisId}/conflicts`}
          label="Conflicts"
        />
        <AnalysisLink
          active={view === "report"}
          href={`/projects/${projectId}/analyses/${analysisId}/report`}
          label="Final report"
        />
      </nav>

      {view === "overview" ? <Overview analysis={analysis} run={latestRun} /> : null}
      {view === "progress" ? (
        <Progress run={latestRun} onRefresh={() => void analysisQuery.refetch()} />
      ) : null}
      {view === "agents" ? <Agents run={latestRun} /> : null}
      {view === "research" ? (
        <Research queries={queries.data} run={latestRun} value={research.data} />
      ) : null}
      {view === "sources" ? <Sources value={sources.data} /> : null}
      {view === "conflicts" ? <Conflicts value={conflicts.data} /> : null}
      {view === "report" ? <Report analysis={analysis} run={latestRun} /> : null}
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

function Progress({ onRefresh, run }: Readonly<{ onRefresh: () => void; run?: AnalysisRun }>) {
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
        <button
          aria-label="Refresh run progress"
          className="rounded-md p-1 text-teal-700 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          onClick={onRefresh}
          title="Refresh run progress"
          type="button"
        >
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </button>
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

function Research({
  queries,
  run,
  value,
}: Readonly<{ queries: unknown; run?: AnalysisRun; value: unknown }>) {
  const record = asRecord(value);
  if (!run)
    return (
      <EmptyState
        icon={<Activity className="h-5 w-5" />}
        title="No research run"
        body="Start an analysis to see its bounded research plan."
      />
    );
  if (!record)
    return (
      <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Research is available only for external evidence modes.
      </p>
    );
  const plan = asRecord(record.plan);
  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-950">Controlled research</h3>
        <span className="text-sm font-medium text-teal-700">
          {getString(record, "status") ?? "Queued"}
        </span>
      </div>
      <InfoRow label="Search queries" value={formatCount(record.queryCount)} />
      <InfoRow label="Selected sources" value={formatCount(record.selectedSourceCount)} />
      {getString(record, "failureMessage") ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {getString(record, "failureMessage")}
        </p>
      ) : null}
      {plan ? (
        <div className="grid gap-2 border-t border-slate-100 pt-4">
          <h4 className="font-medium text-slate-950">Research plan</h4>
          <p className="text-sm text-slate-700">
            {getString(plan, "researchObjective") ?? "No research objective available."}
          </p>
          <List
            value={stringArray(plan.searchQueries)}
            empty="No external queries were executed."
          />
        </div>
      ) : null}
      <div className="grid gap-2 border-t border-slate-100 pt-4">
        <h4 className="font-medium text-slate-950">Executed queries</h4>
        {Array.isArray(queries) && queries.length ? (
          queries.map((query, index) => {
            const item = asRecord(query);
            const results = Array.isArray(item?.results) ? item.results : [];
            return (
              <article
                className="grid gap-1 rounded border border-slate-200 p-3 text-sm"
                key={getString(item, "id") ?? index}
              >
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-slate-950">
                    {getString(item, "query") ?? "Query"}
                  </span>
                  <span className="text-slate-500">{getString(item, "status") ?? "PENDING"}</span>
                </div>
                <p className="text-xs text-slate-600">{results.length} results returned</p>
                {results.map((result, resultIndex) => {
                  const candidate = asRecord(result);
                  return (
                    <p
                      className="text-xs text-slate-600"
                      key={getString(candidate, "id") ?? resultIndex}
                    >
                      {getString(candidate, "title") ?? "Untitled source"}:{" "}
                      {candidate?.selectedForFetch === true
                        ? "selected"
                        : (getString(candidate, "rejectionReason") ?? "not selected")}
                    </p>
                  );
                })}
              </article>
            );
          })
        ) : (
          <p className="text-sm text-slate-600">No search queries were executed.</p>
        )}
      </div>
    </section>
  );
}

function Sources({ value }: Readonly<{ value: unknown }>) {
  const entries = Array.isArray(value) ? value : [];
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">External sources</h3>
      {entries.length ? (
        entries.map((entry, index) => {
          const evidence = asRecord(entry);
          const snapshot = asRecord(evidence?.researchSnapshot);
          const source = asRecord(snapshot?.researchSource);
          const metadata = asRecord(evidence?.metadata);
          const credibility = asRecord(snapshot?.credibilityAssessment);
          const warnings = stringArray(snapshot?.warnings);
          const sourceUrl = getString(metadata, "url");
          return (
            <article
              className="grid gap-2 border-t border-slate-100 pt-4"
              key={getString(evidence, "id") ?? index}
            >
              <div className="flex justify-between gap-3">
                <h4 className="font-medium text-slate-950">
                  {getString(evidence, "evidenceId") ?? "W"}
                  {source ? ` · ${getString(source, "title") ?? "External source"}` : ""}
                </h4>
                <span className="text-xs text-slate-500">
                  {getString(metadata, "sourceType") ?? "Unclassified"}
                </span>
              </div>
              <p className="text-sm text-slate-700">
                {clip(getString(evidence, "excerpt") ?? "", 600)}
              </p>
              <p className="text-xs text-slate-500">
                {getString(metadata, "publisher") ?? "Publisher unavailable"} ·{" "}
                {getString(metadata, "freshnessStatus") ?? "Freshness unavailable"}
              </p>
              <p className="text-xs text-slate-500">
                Published: {getString(metadata, "publishedAt") ?? "not confirmed"} · Retrieved:{" "}
                {getString(metadata, "retrievedAt") ?? "not recorded"} · Credibility:{" "}
                {formatScore(credibility?.credibilityScore)}
              </p>
              {warnings.length ? <List value={warnings} empty="" /> : null}
              {sourceUrl ? (
                <a
                  className="text-sm font-medium text-teal-700 underline"
                  href={sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open external source
                </a>
              ) : null}
            </article>
          );
        })
      ) : (
        <p className="text-sm text-slate-600">No external sources were selected.</p>
      )}
    </section>
  );
}

function Conflicts({ value }: Readonly<{ value: unknown }>) {
  const entries = Array.isArray(value) ? value : [];
  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Evidence conflicts</h3>
      {entries.length ? (
        entries.map((entry, index) => {
          const record = asRecord(entry);
          return (
            <article
              className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              key={getString(record, "id") ?? index}
            >
              <p className="font-semibold">{getString(record, "topic") ?? "Evidence conflict"}</p>
              <p className="mt-1">
                {getString(record, "description") ??
                  "Conflicting evidence must be disclosed in the final report."}
              </p>
            </article>
          );
        })
      ) : (
        <p className="text-sm text-slate-600">No conflicts were detected.</p>
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

function Report({
  analysis,
  run,
}: Readonly<{ analysis: AnalysisDetail; run?: AnalysisRun }>) {
  const report = asRecord(run?.report?.report);
  if (!run || !report)
    return (
      <EmptyState
        icon={<FileCheck2 className="h-5 w-5" aria-hidden="true" />}
        title="Final report is not ready"
        body="Complete a run to generate the grounded final report."
      />
    );
  const sections = Array.isArray(report.sections)
    ? report.sections.filter((section) => {
        const item = asRecord(section);
        return Boolean(getString(item, "content")?.trim());
      })
    : [];
  const limitations = Array.isArray(report.limitations)
    ? report.limitations.filter((item): item is string => typeof item === "string")
    : [];
  const limited =
    run.status === "COMPLETED_WITH_LIMITATIONS" ||
    report.insufficientEvidence === true ||
    report.decisionReady === false ||
    report.qualityGatePassed === false;
  const noInternalKnowledgeBase =
    analysis.evidenceMode !== "EXTERNAL_ONLY" && analysis.knowledgeBaseIds.length === 0;
  const internalCitations = run.report?.citations ?? [];
  const externalCitations = run.report?.externalCitations ?? [];
  return (
    <section className="grid gap-5 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      {limited ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-semibold">Quality gate warning</p>
          <p className="mt-1">
            Report quality and decision readiness are evaluated separately. Treat the decision as
            limited until the failed readiness checks or quality issues are resolved.
          </p>
          {limitations.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {limitations.map((item) => (
                <li key={item}>{cleanReportText(item)}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(report.qualityGateChecks) ? (
            <div className="mt-3">
              <p className="font-semibold">Quality checks</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {report.qualityGateChecks
                  .filter((item) => asRecord(item)?.passed === false)
                  .map((item, index) => {
                    const check = asRecord(item);
                    return (
                      <li key={index}>
                        {getString(check, "check") ?? "Check failed"}:{" "}
                        {getString(check, "detail") ?? "threshold not met"}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
          {Array.isArray(report.readinessChecks) ? (
            <div className="mt-3">
              <p className="font-semibold">Failed readiness checks</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {report.readinessChecks
                  .filter((item) => asRecord(item)?.passed === false)
                  .map((item, index) => {
                    const check = asRecord(item);
                    return (
                      <li key={index}>
                        {getString(check, "check") ?? "Readiness check failed"}: {" "}
                        {getString(check, "detail") ?? "required evidence is missing"}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {noInternalKnowledgeBase ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 p-4 text-sm text-slate-800">
          No internal knowledge base selected
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
        <span>Report quality: {formatScore(report.reportQualityScore ?? report.qualityScore)}</span>
        <span>Grounding: {formatScore(report.groundingScore)}</span>
        <span>Citation validity: {formatScore(report.citationValidityScore)}</span>
        <span>Supported claims: {formatScore(report.supportedClaimRatio)}</span>
        <span>Unsupported claims: {formatCount(report.unsupportedClaimCount)}</span>
        <span>Evidence coverage: {formatScore(report.evidenceCoverage)}</span>
        <span>Evidence sufficiency: {formatScore(report.evidenceSufficiencyScore)}</span>
        <span>
          Decision readiness: {getString(report, "decisionReadiness") ?? "LOW"} (
          {formatScore(report.decisionReadinessScore)})
        </span>
        <span>
          Confidence in sourced facts: {getString(report, "factsConfidence") ?? "LOW"}
        </span>
        <span>
          Confidence in decision: {getString(report, "decisionConfidence") ?? "LOW"}
        </span>
        {limited ? (
          <span className="font-semibold text-amber-700">Completed with limitations</span>
        ) : null}
      </div>
      <div className="grid gap-3 border-t border-slate-100 pt-4 text-sm">
        <h4 className="font-semibold text-slate-950">Evidence provenance</h4>
        <p className="text-slate-600">
          Internal project evidence: {internalCitations.length}. External web evidence:{" "}
          {externalCitations.length}.
        </p>
        {externalCitations.length ? (
          <ul className="grid gap-2 text-slate-700">
            {externalCitations.map((citation, index) => {
              const item = asRecord(citation);
              return (
                <li
                  className="rounded border border-slate-200 p-3"
                  key={getString(item, "id") ?? index}
                >
                  <span className="font-medium">
                    {getString(item, "evidenceId") ?? "W evidence"}
                  </span>
                  {getString(item, "quote") ? `: ${getString(item, "quote")}` : null}
                </li>
              );
            })}
          </ul>
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
function formatCount(value: unknown): string {
  return typeof value === "number" ? String(value) : "0";
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function clip(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum).trimEnd()}…` : value;
}
