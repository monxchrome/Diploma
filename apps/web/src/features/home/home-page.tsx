"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/features/shell/app-shell";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchAnalyses, fetchProjects } from "@/features/projects/projects-api";

import { AnalysisComposer } from "./analysis-composer";

const examples = [
  "Should we enter this market now or wait?",
  "What is the best next step for this product launch?",
  "Compare the main options and recommend a path forward.",
];

export function HomePage({ initialProjectId }: Readonly<{ initialProjectId?: string }>) {
  const { apiRequest, status, user } = useAuth();
  const [questionSeed, setQuestionSeed] = useState("");
  const projectsQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchProjects(apiRequest, { status: "active" }),
    queryKey: ["projects", "active"],
  });
  const projects = projectsQuery.data?.data ?? [];
  const analysesQuery = useQuery({
    enabled: status === "authenticated" && projects.length > 0,
    queryFn: async () => {
      const groups = await Promise.all(
        projects.map(async (project) => ({
          project,
          analyses: await fetchAnalyses(apiRequest, project.id),
        })),
      );
      return groups.flatMap(({ project, analyses }) =>
        analyses.map((analysis) => ({ analysis, project })),
      );
    },
    queryKey: ["home-analyses", projects.map((project) => project.id).join(":")],
  });
  const recent = (analysesQuery.data ?? []).sort((a, b) =>
    b.analysis.updatedAt.localeCompare(a.analysis.updatedAt),
  );
  const running = recent.filter(({ analysis }) =>
    ["QUEUED", "RUNNING"].includes(analysis.runs[0]?.status ?? ""),
  );

  return (
    <AppShell>
      <div className="mx-auto grid max-w-4xl gap-10 pb-12">
        <header className="pt-2">
          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Decision workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            What would you like to decide, {user?.displayName.split(" ")[0] ?? "there"}?
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Start with your question. Add project sources only when they will help.
          </p>
        </header>

        <AnalysisComposer initialProjectId={initialProjectId} questionSeed={questionSeed} />

        <section aria-label="Example questions" className="-mt-5 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 transition hover:border-teal-300 hover:text-teal-800 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-teal-200"
              key={example}
              onClick={() => setQuestionSeed(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </section>

        {running.length > 0 ? (
          <AnalysisSection
            eyebrow="In progress"
            items={running}
            title="Your analyses are underway"
          />
        ) : null}
        <AnalysisSection
          eyebrow="Recent"
          empty="Your completed analyses will appear here."
          items={recent.filter((item) => !running.includes(item)).slice(0, 6)}
          loading={analysesQuery.isLoading || projectsQuery.isLoading}
          title="Continue where you left off"
        />
      </div>
    </AppShell>
  );
}

function AnalysisSection({
  empty,
  eyebrow,
  items,
  loading,
  title,
}: Readonly<{
  empty?: string;
  eyebrow: string;
  items: {
    analysis: {
      id: string;
      decisionQuestion: string;
      runs: { status: string }[];
      updatedAt: string;
    };
    project: { id: string; name: string };
  }[];
  loading?: boolean;
  title: string;
}>) {
  return (
    <section className="grid gap-4">
      <div>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-300">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      {loading ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          role="status"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading analyses…
        </div>
      ) : null}
      {!loading && items.length === 0 && empty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {empty}
        </div>
      ) : null}
      <div className="grid gap-3">
        {items.map(({ analysis, project }) => {
          const status = analysis.runs[0]?.status;
          return (
            <Link
              className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-sm focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-700 dark:bg-slate-900"
              href={`/projects/${project.id}/analyses/${analysis.id}`}
              key={analysis.id}
            >
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {project.name}
                    </span>
                    <StatusPill status={status} />
                  </div>
                  <p className="mt-2 line-clamp-2 font-medium text-slate-950 dark:text-white">
                    {analysis.decisionQuestion}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {new Date(analysis.updatedAt).toLocaleString()}
                  </p>
                </div>
                <ArrowUpRight
                  className="h-5 w-5 text-slate-400 transition group-hover:text-teal-700 dark:group-hover:text-teal-300"
                  aria-hidden="true"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }: Readonly<{ status?: string }>) {
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
              : status
                ? "Draft"
                : "Not started";
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  );
}
