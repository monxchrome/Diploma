"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, FlaskConical, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

const TemplateSchema = z.object({
  architecture: z.string(),
  code: z.string(),
  description: z.string(),
  roles: z.array(z.object({ profileCode: z.string(), role: z.string() })),
  title: z.string(),
});
const RunSchema = z.object({
  createdAt: z.string(),
  id: z.string().uuid(),
  protocol: z.string(),
  repetitions: z.number(),
  status: z.string(),
  suite: z.object({ code: z.string(), title: z.string(), version: z.string() }),
});

export function BenchmarkConsolePage() {
  const { apiRequest, status } = useAuth();
  const templates = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest("/api/benchmark-variant-templates", z.array(TemplateSchema)),
    queryKey: ["benchmark-variant-templates"],
  });
  const runs = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest("/api/benchmark-runs", z.array(RunSchema)),
    queryKey: ["benchmark-runs"],
  });

  return (
    <AppShell>
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Research workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Scientific benchmarks
            </h1>
            <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-300">
              Compare pinned model profiles and fixed agent architectures with frozen evidence,
              randomized execution order, and recorded limitations.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-teal-950"
            href="/projects"
          >
            Choose project to configure a suite
          </Link>
        </header>

        <section className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>
              Model profiles, provider keys, prompt source, and raw provider payloads are
              server-owned. Benchmark creation is subject to project access and plan entitlements.
            </p>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
              Built-in model matrix
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.data?.map((template) => (
              <article
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                key={template.code}
              >
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                  {template.code}
                </p>
                <h3 className="mt-1 font-semibold text-slate-950 dark:text-white">
                  {template.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {template.description}
                </p>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {template.architecture} · {template.roles.length} role assignment
                  {template.roles.length === 1 ? "" : "s"}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-700 dark:text-teal-300" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Benchmark runs</h2>
          </div>
          {runs.isError ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              Benchmark runs are visible only to authorized project members.
            </p>
          ) : null}
          {runs.data?.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              No benchmark runs are available yet.
            </p>
          ) : null}
          {runs.data?.map((run) => (
            <Link
              className="grid gap-1 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-teal-950"
              href={`/experiments/benchmarks/${run.id}`}
              key={run.id}
            >
              <span className="text-sm font-semibold text-slate-950 dark:text-white">
                {run.suite.title}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {run.status} · {run.protocol} · {run.repetitions} repetition
                {run.repetitions === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
