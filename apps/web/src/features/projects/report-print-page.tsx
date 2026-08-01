"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

const SnapshotSchema = z.object({
  content: z.object({
    citations: z.array(z.object({ evidenceId: z.string(), excerpt: z.string() })),
    limitations: z.array(z.string()),
    recommendation: z.string(),
    risks: z.array(z.string()),
    sections: z.array(z.object({ anchor: z.string(), content: z.string(), title: z.string() })),
    summary: z.string(),
  }),
  contentHash: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  title: z.string(),
  versionNumber: z.number().int(),
});

export function ReportPrintPage({ snapshotId }: Readonly<{ snapshotId: string }>) {
  const { apiRequest, status } = useAuth();
  const query = useQuery({
    enabled: status === "authenticated",
    queryFn: () => apiRequest(`/api/report-snapshots/${snapshotId}`, SnapshotSchema),
    queryKey: ["report-print", snapshotId],
  });
  if (query.isLoading) return <p className="p-8">Loading report version…</p>;
  if (query.isError || !query.data)
    return <p className="p-8">This report version is unavailable.</p>;
  const report = query.data;
  return (
    <main className="mx-auto max-w-3xl p-6 text-slate-950 print:max-w-none print:p-0">
      <div className="mb-8 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print report
        </Button>
      </div>
      <header className="border-b border-slate-300 pb-6">
        <p className="text-sm text-slate-600">
          Report version {report.versionNumber} · {report.status.toLowerCase()}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{report.title}</h1>
      </header>
      <section className="mt-8 break-inside-avoid">
        <h2 className="text-xl font-semibold">Recommendation</h2>
        <p className="mt-3 whitespace-pre-wrap leading-7">{report.content.recommendation}</p>
      </section>
      {report.content.summary ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Executive summary</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7">{report.content.summary}</p>
        </section>
      ) : null}
      {report.content.sections.map((section) => (
        <section className="mt-8 break-inside-avoid" id={section.anchor} key={section.anchor}>
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7">{section.content}</p>
        </section>
      ))}
      {report.content.risks.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Risks</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {report.content.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.content.limitations.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Limitations</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {report.content.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.content.citations.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Sources</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {report.content.citations.map((citation) => (
              <li key={citation.evidenceId}>
                <strong>{citation.evidenceId}</strong> — {citation.excerpt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="mt-12 border-t border-slate-300 pt-4 text-xs text-slate-600">
        Content hash: {report.contentHash}
      </footer>
    </main>
  );
}
