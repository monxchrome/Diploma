"use client";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { AppShell } from "@/features/shell/app-shell";
import { fetchBillingUsage } from "@/features/projects/projects-api";

const metrics = [
  ["maximumStorageBytes", "Storage"],
  ["monthlyAnalysisRuns", "Analysis runs"],
  ["monthlyExperimentRuns", "Experiment runs"],
  ["monthlyExternalResearchQueries", "Research queries"],
  ["monthlyFetchedExternalPages", "Fetched pages"],
  ["monthlyExternalBytes", "Fetched bytes"],
] as const;

export function UsagePage() {
  const { apiRequest, status } = useAuth();
  const usage = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => fetchBillingUsage(apiRequest),
    enabled: status === "authenticated",
  });
  return (
    <AppShell>
      <section className="grid gap-6">
        <div>
          <p className="text-sm font-medium text-teal-700">Settings</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950">Usage and limits</h2>
          {usage.data ? (
            <p className="mt-2 text-sm text-slate-600">
              {usage.data.planCode} plan / resets{" "}
              {new Date(usage.data.resetAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map(([metric, label]) => {
            const used =
              usage.data?.metrics
                .filter((item) => item.metric === metric)
                .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
            const limit = usage.data?.limits[metric];
            const numericLimit = limit ?? 0;
            const percent = numericLimit
              ? Math.min((used / numericLimit) * 100, 100)
              : used
                ? 100
                : 0;
            return (
              <article
                key={metric}
                className="rounded-md border border-slate-200 bg-white p-5 shadow-sm"
              >
                <h3 className="font-medium text-slate-950">{label}</h3>
                <p className="mt-3 text-2xl font-semibold text-slate-950">
                  {used.toLocaleString()}{" "}
                  <span className="text-sm font-medium text-slate-500">
                    / {numericLimit.toLocaleString()}
                  </span>
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={percent >= 90 ? "h-full bg-amber-500" : "h-full bg-teal-600"}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {percent >= 90 ? (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    Approaching the hard limit.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
