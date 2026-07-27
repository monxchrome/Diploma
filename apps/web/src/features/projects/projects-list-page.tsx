"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FolderPlus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

import { archiveProject, fetchProjects, restoreProject } from "./projects-api";

type ProjectFilter = "active" | "all" | "archived";

export function ProjectsListPage() {
  const { apiRequest, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ProjectFilter>("active");
  const projectsQuery = useQuery({
    queryFn: () => fetchProjects(apiRequest, { status }),
    queryKey: ["projects", status],
    enabled: authStatus === "authenticated",
  });
  const archiveMutation = useMutation({
    mutationFn: (projectId: string) => archiveProject(apiRequest, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (projectId: string) => restoreProject(apiRequest, projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const projects = projectsQuery.data?.data ?? [];

  return (
    <AppShell>
      <div className="grid gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Projects</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Project management</h2>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-800"
            href="/projects/new"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            New project
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["active", "archived", "all"] as const).map((option) => (
            <button
              key={option}
              className={
                status === option
                  ? "rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white"
                  : "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              }
              onClick={() => setStatus(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>

        {projectsQuery.isLoading ? <ProjectSkeleton /> : null}
        {projectsQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
            Unable to load projects
          </div>
        ) : null}
        {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
            No projects match this view.
          </div>
        ) : null}

        <div className="grid gap-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <Link className="min-w-0" href={`/projects/${project.id}`}>
                  <p className="truncate font-medium text-slate-950">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-slate-600">
                    {project.description ?? "No description"}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {project.role}
                  </span>
                  {project.archivedAt ? (
                    <Button
                      disabled={restoreMutation.isPending}
                      onClick={() => {
                        if (confirm("Restore this project?")) {
                          restoreMutation.mutate(project.id);
                        }
                      }}
                      variant="ghost"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Restore
                    </Button>
                  ) : (
                    <Button
                      disabled={archiveMutation.isPending}
                      onClick={() => {
                        if (confirm("Archive this project?")) {
                          archiveMutation.mutate(project.id);
                        }
                      }}
                      variant="ghost"
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ProjectSkeleton() {
  return (
    <div aria-label="Loading projects" className="grid gap-3" role="status">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
