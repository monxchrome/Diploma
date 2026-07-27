"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";
import { fetchSessions, revokeSession } from "@/features/projects/projects-api";

export function SessionsPage() {
  const { apiRequest, logoutAll, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryFn: () => fetchSessions(apiRequest),
    queryKey: ["sessions"],
    enabled: authStatus === "authenticated",
  });
  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => revokeSession(apiRequest, sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <AppShell>
      <div className="grid gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Settings</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Sessions</h2>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("Log out from all sessions?")) {
                void logoutAll();
              }
            }}
          >
            <ShieldX className="h-4 w-4" aria-hidden="true" />
            Logout all
          </Button>
        </div>

        {sessionsQuery.isLoading ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Loading sessions...
          </div>
        ) : null}
        {sessionsQuery.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
            Unable to load sessions
          </div>
        ) : null}
        <div className="grid gap-3">
          {sessionsQuery.data?.map((session) => (
            <div
              key={session.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-teal-700" aria-hidden="true" />
                    <p className="truncate font-medium text-slate-950">
                      {session.userAgent ?? "Unknown device"}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Last used {new Date(session.lastUsedAt).toLocaleString()}
                  </p>
                  {session.revokedAt ? (
                    <p className="mt-1 text-sm font-medium text-red-700">
                      Revoked: {session.revokeReason ?? "revoked"}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {session.isCurrent ? (
                    <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">
                      Current
                    </span>
                  ) : null}
                  {!session.revokedAt ? (
                    <Button
                      disabled={revokeMutation.isPending}
                      onClick={() => {
                        if (confirm("Revoke this session?")) {
                          revokeMutation.mutate(session.id);
                        }
                      }}
                      variant="ghost"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
