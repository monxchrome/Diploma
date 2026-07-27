"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";
import { fetchProfile, updateProfile } from "@/features/projects/projects-api";

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(120),
});

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const { apiRequest, setUser, status: authStatus } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryFn: () => fetchProfile(apiRequest),
    queryKey: ["profile"],
    enabled: authStatus === "authenticated",
  });
  const form = useForm<ProfileValues>({
    defaultValues: {
      displayName: "",
    },
    resolver: zodResolver(profileSchema),
  });
  const mutation = useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(apiRequest, values.displayName),
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to update profile");
    },
    onSuccess: (user) => {
      setUser(user);
      setMessage("Profile updated");
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      form.reset({
        displayName: profileQuery.data.displayName,
      });
    }
  }, [form, profileQuery.data]);

  async function onSubmit(values: ProfileValues): Promise<void> {
    setMessage(null);

    try {
      await mutation.mutateAsync(values);
    } catch {
      return;
    }
  }

  return (
    <AppShell>
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-teal-700">Settings</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Profile</h2>
        <form
          className="mt-6 grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          noValidate
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          {message ? <p className="text-sm font-medium text-slate-700">{message}</p> : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Display name
            <input {...form.register("displayName")} className={inputClasses} type="text" />
            {form.formState.errors.displayName ? (
              <span className="text-sm font-medium text-red-700">
                {form.formState.errors.displayName.message}
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Email
            <input
              className={`${inputClasses} bg-slate-100 text-slate-500`}
              disabled
              readOnly
              type="email"
              value={profileQuery.data?.email ?? ""}
            />
          </label>
          <Button type="submit" disabled={mutation.isPending}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </section>
    </AppShell>
  );
}

const inputClasses =
  "h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
