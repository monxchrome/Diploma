"use client";

import { useQuery } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

import { fetchBillingUsage, fetchProjects } from "./projects-api";

export function ExperimentsHubPage() {
  const { apiRequest, status } = useAuth();
  const projects = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchProjects(apiRequest, { status: "active" }),
    queryKey: ["projects", "active"],
  });
  const usage = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchBillingUsage(apiRequest),
    queryKey: ["billing-usage"],
  });
  const available = usage.data?.limits.experimentsAvailable === true;

  return (
    <AppShell>
      <div className="mx-auto grid max-w-3xl gap-6">
        <header>
          <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Experiments</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
            Compare approaches with care
          </h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            Experiments stay within a project, so their sources and results remain isolated.
          </p>
        </header>
        {available ? (
          <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-950 dark:text-white">Choose a project</h2>
            {projects.data?.data.map((project) => (
              <Link
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-teal-950"
                href={`/projects/${project.id}/experiments`}
                key={project.id}
              >
                {project.name}
              </Link>
            ))}
          </section>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <LockKeyhole className="h-5 w-5 text-slate-500" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-slate-950 dark:text-white">
              Experiments are not included in this plan
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Upgrade only if you need structured comparisons. Your existing projects and analyses
              remain available.
            </p>
            <Link
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700"
              href="/settings/billing"
            >
              View plans
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
