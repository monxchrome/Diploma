"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, FolderKanban, Plus, Server, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";
import { fetchApiStatus, fetchProjects } from "@/features/projects/projects-api";

export function DashboardPage() {
  const { apiRequest, status, user } = useAuth();
  const projectsQuery = useQuery({
    queryFn: () => fetchProjects(apiRequest, { status: "active" }),
    queryKey: ["projects", "dashboard"],
    enabled: status === "authenticated",
  });
  const statusQuery = useQuery({
    queryFn: () => fetchApiStatus(apiRequest),
    queryKey: ["api-status"],
    enabled: status === "authenticated",
  });
  const projects = projectsQuery.data?.data ?? [];

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Dashboard</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">
              Hello, {user?.displayName ?? "there"}
            </h2>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800"
            href="/projects/new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New project
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Metric
            icon={FolderKanban}
            label="Active projects"
            value={String(projectsQuery.data?.meta.total ?? 0)}
          />
          <Metric
            icon={Activity}
            label="API"
            value={statusQuery.data?.services.api ?? (statusQuery.isError ? "down" : "checking")}
          />
          <Metric
            icon={Server}
            label="Environment"
            value={statusQuery.data?.environment ?? "unknown"}
          />
        </div>

        <section className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Recent projects</h3>
          {projectsQuery.isLoading ? (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Loading projects...
            </div>
          ) : null}
          {projectsQuery.isError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
              Unable to load projects
            </div>
          ) : null}
          {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
              No active projects yet.
            </div>
          ) : null}
          {projects.slice(0, 5).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-teal-300"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {project.description ?? "No description"}
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {project.role}
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-800">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
