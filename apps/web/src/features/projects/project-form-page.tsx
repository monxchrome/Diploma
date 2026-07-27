"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";

import { createProject } from "./projects-api";

const projectFormSchema = z.object({
  description: z.string().max(2000).optional(),
  name: z.string().trim().min(1, "Project name is required").max(160),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

export function NewProjectPage() {
  const { apiRequest } = useAuth();
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);
  const form = useForm<ProjectFormValues>({
    defaultValues: {
      description: "",
      name: "",
    },
    resolver: zodResolver(projectFormSchema),
  });

  async function onSubmit(values: ProjectFormValues): Promise<void> {
    setApiError(null);

    try {
      const project = await createProject(apiRequest, values);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Unable to create project");
    }
  }

  return (
    <AppShell>
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-teal-700">Projects</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">New project</h2>
        <form
          className="mt-6 grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          noValidate
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          {apiError ? <p className="text-sm font-medium text-red-700">{apiError}</p> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Name
            <input {...form.register("name")} className={inputClasses} type="text" />
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
            />
          </label>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {form.formState.isSubmitting ? "Creating..." : "Create project"}
          </Button>
        </form>
      </section>
    </AppShell>
  );
}

const inputClasses =
  "rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
