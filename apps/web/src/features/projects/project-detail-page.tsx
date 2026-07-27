"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

import {
  archiveProject,
  fetchProject,
  fetchProjectMembers,
  restoreProject,
  updateProject,
} from "./projects-api";
import { KnowledgeBasesPanel } from "./knowledge-bases-panel";

const editProjectSchema = z.object({
  description: z.string().max(2000).optional(),
  name: z.string().trim().min(1, "Project name is required").max(160),
});

type EditProjectValues = z.infer<typeof editProjectSchema>;

export function ProjectDetailPage({ projectId }: Readonly<{ projectId: string }>) {
  const { apiRequest, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const projectQuery = useQuery({
    queryFn: () => fetchProject(apiRequest, projectId),
    queryKey: ["project", projectId],
    enabled: authStatus === "authenticated",
  });
  const membersQuery = useQuery({
    queryFn: () => fetchProjectMembers(apiRequest, projectId),
    queryKey: ["project-members", projectId],
    enabled: authStatus === "authenticated",
  });
  const form = useForm<EditProjectValues>({
    defaultValues: {
      description: "",
      name: "",
    },
    resolver: zodResolver(editProjectSchema),
  });
  const saveMutation = useMutation({
    mutationFn: (values: EditProjectValues) =>
      updateProject(apiRequest, projectId, {
        description: values.description ?? null,
        name: values.name,
      }),
    onSuccess: (project) => {
      setApiError(null);
      queryClient.setQueryData(["project", projectId], project);
    },
    onError: (error) => {
      setApiError(error instanceof Error ? error.message : "Unable to update project");
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveProject(apiRequest, projectId),
    onSuccess: (project) => {
      queryClient.setQueryData(["project", projectId], project);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const restoreMutation = useMutation({
    mutationFn: () => restoreProject(apiRequest, projectId),
    onSuccess: (project) => {
      queryClient.setQueryData(["project", projectId], project);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const project = projectQuery.data;
  const canEdit = project?.role === "OWNER" || project?.role === "EDITOR";
  const canArchive = project?.role === "OWNER";

  useEffect(() => {
    if (project) {
      form.reset({
        description: project.description ?? "",
        name: project.name,
      });
    }
  }, [form, project]);

  async function onSubmit(values: EditProjectValues): Promise<void> {
    try {
      await saveMutation.mutateAsync(values);
    } catch {
      return;
    }
  }

  return (
    <AppShell>
      <div className="grid gap-5">
        {projectQuery.isLoading ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Loading project...
          </div>
        ) : null}
        {projectQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
            Project not found or inaccessible
          </div>
        ) : null}
        {project ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-teal-700">{project.role}</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950">{project.name}</h2>
              </div>
              {canArchive ? (
                project.archivedAt ? (
                  <Button
                    disabled={restoreMutation.isPending}
                    onClick={() => {
                      if (confirm("Restore this project?")) {
                        restoreMutation.mutate();
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
                        archiveMutation.mutate();
                      }
                    }}
                    variant="ghost"
                  >
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    Archive
                  </Button>
                )
              ) : null}
            </div>

            <form
              className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
              noValidate
              onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
            >
              {apiError ? <p className="text-sm font-medium text-red-700">{apiError}</p> : null}
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Name
                <input
                  {...form.register("name")}
                  className={inputClasses}
                  disabled={!canEdit}
                  type="text"
                />
                {form.formState.errors.name ? (
                  <span className="text-sm font-medium text-red-700">
                    {form.formState.errors.name.message}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Description
                <textarea
                  {...form.register("description")}
                  className={`${inputClasses} min-h-28 py-2`}
                  disabled={!canEdit}
                />
              </label>
              {canEdit ? (
                <Button type="submit" disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saveMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
              ) : null}
            </form>

            <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-slate-950">Members</h3>
              </div>
              {membersQuery.isLoading ? (
                <p className="text-sm text-slate-600">Loading members...</p>
              ) : null}
              {membersQuery.data?.map((member) => (
                <div
                  key={member.userId}
                  className="flex flex-col gap-1 border-t border-slate-100 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-950">{member.user.displayName}</p>
                    <p className="text-sm text-slate-600">{member.user.email}</p>
                  </div>
                  <span className="w-fit rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    {member.role}
                  </span>
                </div>
              ))}
            </section>
            <KnowledgeBasesPanel canEdit={canEdit} projectId={projectId} />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

const inputClasses =
  "rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-500 focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
