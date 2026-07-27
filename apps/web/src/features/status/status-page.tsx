"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, BrainCircuit, Clock3, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { fetchSystemStatus } from "@/lib/api-client";
import { useStatusStore } from "@/store/status-store";

import { StatusTile } from "./status-tile";

export function StatusPage() {
  const setLastRequestId = useStatusStore((state) => state.setLastRequestId);
  const lastRequestId = useStatusStore((state) => state.lastRequestId);
  const query = useQuery({
    queryFn: fetchSystemStatus,
    queryKey: ["system-status"],
  });

  useEffect(() => {
    if (query.data?.requestId) {
      setLastRequestId(query.data.requestId);
    }
  }, [query.data?.requestId, setLastRequestId]);

  const timestamp = query.data?.timestamp
    ? new Date(query.data.timestamp).toLocaleString()
    : "Pending";
  const environment = query.data?.environment ?? "Unknown";

  return (
    <main className="min-h-screen">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">AI Decision Intelligence Platform</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
              System Status
            </h1>
          </div>
          <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        {query.isLoading ? (
          <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Loading service status...
          </div>
        ) : null}

        {query.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-5">
            <p className="text-sm font-semibold text-red-900">Status check failed</p>
            <p className="mt-1 text-sm text-red-700">
              {query.error instanceof Error ? query.error.message : "Unknown error"}
            </p>
          </div>
        ) : null}

        {query.data ? (
          <div className="grid gap-4 md:grid-cols-3">
            <StatusTile icon={Activity} label="Web" status={query.data.services.web} />
            <StatusTile icon={Server} label="NestJS API" status={query.data.services.api} />
            <StatusTile
              icon={BrainCircuit}
              label="Python AI Service"
              status={query.data.services.aiService}
            />
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <StatusTile icon={Clock3} label="Timestamp" value={timestamp} />
          <StatusTile icon={ShieldCheck} label="Environment" value={environment} />
          <StatusTile icon={Server} label="Request ID" value={lastRequestId ?? "Pending"} />
        </div>
      </section>
    </main>
  );
}
