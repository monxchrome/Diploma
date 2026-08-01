"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import { fetchAnalyses } from "./projects-api";

export function AnalysesPage({ projectId }: Readonly<{ projectId: string }>) {
  const { apiRequest, status } = useAuth();
  const analyses = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchAnalyses(apiRequest, projectId),
    queryKey: ["analyses", projectId],
  });

  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-slate-950">Analyses</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Your decision questions and their recommendations, in one place.
          </p>
        </div>
        <Link href={`/home?project=${projectId}#composer`}>
          <Button type="button">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Analyze a decision
          </Button>
        </Link>
      </div>

      {analyses.isLoading ? <p className="text-sm text-slate-600">Loading analyses...</p> : null}
      {analyses.isError ? (
        <p className="text-sm font-medium text-red-700">Unable to load analyses</p>
      ) : null}
      {!analyses.isLoading && !analyses.isError && analyses.data?.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="font-medium text-slate-950">No analyses yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Start with a decision question. Ready project sources will be included by default.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3">
        {analyses.data?.map((analysis) => {
          const latestRun = analysis.runs[0];
          return (
            <Link
              className="grid gap-2 rounded-md border border-slate-200 p-4 transition-colors hover:border-teal-400 hover:bg-teal-50/40"
              href={`/projects/${projectId}/analyses/${analysis.id}`}
              key={analysis.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <h3 className="font-semibold text-slate-950">{analysis.title}</h3>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {friendlyAnalysisStatus(latestRun?.status)}
                </span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-600">{analysis.decisionQuestion}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{analysis.mode === "MULTI_AGENT" ? "Multi-perspective" : "Focused"}</span>
                <span>·</span>
                <span>{new Date(analysis.updatedAt).toLocaleString()}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function friendlyAnalysisStatus(status?: string): string {
  if (status === "RUNNING") return "In progress";
  if (status === "QUEUED") return "Getting ready";
  if (status === "COMPLETED") return "Complete";
  if (status === "COMPLETED_WITH_LIMITATIONS") return "Complete with limitations";
  if (status === "FAILED") return "Needs attention";
  if (status === "CANCELLED") return "Stopped";
  return "Not started";
}
