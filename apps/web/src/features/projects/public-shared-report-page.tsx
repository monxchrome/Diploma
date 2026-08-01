"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { getWebConfig } from "@/lib/config";

const PublicReportSchema = z.object({
  content: z.object({
    citations: z.array(z.object({ evidenceId: z.string(), excerpt: z.string() })),
    limitations: z.array(z.string()),
    recommendation: z.string(),
    risks: z.array(z.string()),
    sections: z.array(z.object({ anchor: z.string(), content: z.string(), title: z.string() })),
    summary: z.string(),
  }),
  publishedAt: z.string().datetime().nullable(),
  share: z.object({
    allowComments: z.boolean(),
    allowDownload: z.boolean(),
    showSources: z.boolean(),
  }),
  title: z.string(),
  versionNumber: z.number().int(),
});

export function PublicSharedReportPage({ token }: Readonly<{ token: string }>) {
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");
  const [report, setReport] = useState<z.infer<typeof PublicReportSchema> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${getWebConfig().apiBaseUrl}/api/public/shared/${encodeURIComponent(token)}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok ? PublicReportSchema.safeParse(await response.json()) : null,
      )
      .then((parsed) => {
        if (!parsed?.success) {
          setState("missing");
          return;
        }
        setReport(parsed.data);
        setState("ready");
      })
      .catch(() => setState("missing"));
    return () => controller.abort();
  }, [token]);
  if (state === "loading")
    return <main className="mx-auto max-w-3xl p-8">Loading shared report…</main>;
  if (state === "missing" || !report)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">This shared report is unavailable</h1>
        <p className="mt-3 text-slate-600">The link may be expired, revoked, or invalid.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <header className="border-b border-slate-200 pb-7 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Published report · Version {report.versionNumber}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{report.title}</h1>
        {report.publishedAt ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Published {new Date(report.publishedAt).toLocaleDateString()}
          </p>
        ) : null}
      </header>
      <section className="mt-8 rounded-xl border border-teal-200 bg-teal-50 p-5 dark:border-teal-900 dark:bg-teal-950/30">
        <h2 className="font-semibold">Recommendation</h2>
        <p className="mt-3 whitespace-pre-wrap leading-7">{report.content.recommendation}</p>
      </section>
      {report.content.summary ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Executive summary</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7">{report.content.summary}</p>
        </section>
      ) : null}
      {report.content.sections.map((section) => (
        <section className="mt-8" id={section.anchor} key={section.anchor}>
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
      {report.share.showSources && report.content.citations.length ? (
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
    </main>
  );
}
