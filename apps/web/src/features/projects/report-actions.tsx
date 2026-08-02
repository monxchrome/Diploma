"use client";

import { Copy, FileDown, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { useAuth } from "@/features/auth/auth-provider";

const SnapshotSchema = z.object({
  content: z.object({
    citations: z.array(z.object({ evidenceId: z.string(), excerpt: z.string() })),
    limitations: z.array(z.string()),
    recommendation: z.string(),
    risks: z.array(z.string()),
    sections: z.array(z.object({ content: z.string(), title: z.string() })),
    summary: z.string(),
  }),
  id: z.string().uuid(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  title: z.string(),
  versionNumber: z.number().int(),
});

type ApiRequest = ReturnType<typeof useAuth>["apiRequest"];
const ExportJobSchema = z.object({
  artifact: z
    .object({ byteSize: z.number(), contentType: z.string(), fileName: z.string() })
    .nullable(),
  completedAt: z.string().nullable(),
  failureCode: z.string().nullable(),
  format: z.enum(["PDF", "DOCX", "MARKDOWN", "PRINT_HTML"]),
  id: z.string().uuid(),
  progress: z.string(),
  status: z.enum(["QUEUED", "GENERATING", "UPLOADING", "COMPLETED", "FAILED", "CANCELLED"]),
});
const ExportDownloadSchema = z.object({
  expiresAt: z.string(),
  fileName: z.string(),
  url: z.string().url(),
});

export function ReportActions({
  apiRequest,
  snapshot,
}: Readonly<{
  apiRequest: ApiRequest;
  snapshot?: {
    id: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    versionNumber: number;
  } | null;
}>) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportJob, setExportJob] = useState<z.infer<typeof ExportJobSchema> | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<{ fileName: string; url: string } | null>(null);
  useEffect(() => {
    if (!exportJobId) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await apiRequest(`/api/exports/${exportJobId}`, ExportJobSchema);
        if (!active) return;
        setExportJob(result);
        if (
          result.status === "COMPLETED" ||
          result.status === "FAILED" ||
          result.status === "CANCELLED"
        )
          return;
        window.setTimeout(() => void poll(), 1200);
      } catch {
        if (active) setMessage("Не удалось проверить прогресс экспорта.");
      }
    };
    void poll();
    return () => {
      active = false;
    };
  }, [apiRequest, exportJobId]);

  if (!snapshot) return null;

  const createExport = async (format: "PDF" | "DOCX" | "MARKDOWN" | "PRINT_HTML") => {
    setPending(true);
    try {
      const job = await apiRequest(
        `/api/report-snapshots/${snapshot.id}/exports`,
        ExportJobSchema,
        {
          body: {
            format,
            idempotencyKey: crypto.randomUUID(),
            options: {},
          },
          method: "POST",
        },
      );
      setExportJobId(job.id);
      setExportJob(job);
      setDownloadUrl(null);
      setMessage(null);
    } catch {
      setMessage("We could not start the export. Check your plan and try again.");
    } finally {
      setPending(false);
    }
  };

  const download = async () => {
    if (!exportJobId) return;
    const result = await apiRequest(`/api/exports/${exportJobId}/download`, ExportDownloadSchema);
    setDownloadUrl({ fileName: result.fileName, url: result.url });
  };

  const share = async () => {
    setPending(true);
    try {
      if (snapshot.status === "DRAFT") {
        await apiRequest(`/api/report-snapshots/${snapshot.id}/publish`, SnapshotSchema, {
          method: "POST",
        });
      }
      const result = await apiRequest(
        `/api/report-snapshots/${snapshot.id}/share-links`,
        z.object({ url: z.string().url() }),
        {
          body: { accessMode: "PUBLIC_READ_ONLY", allowDownload: false },
          method: "POST",
        },
      );
      await copy(result.url);
      setMessage("Secure share link copied. It expires according to your workspace policy.");
    } catch {
      setMessage("We could not create a share link. Check report permissions and try again.");
    } finally {
      setPending(false);
    }
  };

  const copyMarkdown = async () => {
    try {
      const report = await apiRequest(`/api/report-snapshots/${snapshot.id}`, SnapshotSchema);
      const markdown = [
        `# ${report.title}`,
        "",
        `Version ${report.versionNumber}`,
        "",
        "## Recommendation",
        "",
        report.content.recommendation,
        "",
        "## Executive summary",
        "",
        report.content.summary,
        "",
        ...report.content.sections.flatMap((section) => [
          `## ${section.title}`,
          "",
          section.content,
          "",
        ]),
        "## Sources",
        "",
        ...report.content.citations.map(
          (citation) => `- [${citation.evidenceId}] ${citation.excerpt}`,
        ),
      ].join("\n");
      await copy(markdown);
      setMessage("Markdown copied from the immutable report version.");
    } catch {
      setMessage("We could not copy this report version.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Report actions">
      <Button disabled={pending} onClick={() => void createExport("PDF")}>
        <FileDown className="h-4 w-4" aria-hidden="true" /> Export
      </Button>
      {exportJob ? (
        <div className="basis-full text-sm text-slate-600 dark:text-slate-300" role="status">
          Export: {exportJob.progress}
          {exportJob.status === "COMPLETED" ? (
            <Button className="ml-2 h-8" onClick={() => void download()} variant="ghost">
              Download {exportJob.artifact?.fileName ?? "PDF"}
            </Button>
          ) : null}
          {exportJob.status === "FAILED" ? ` (${exportJob.failureCode ?? "unknown error"})` : null}
        </div>
      ) : null}
      {downloadUrl ? (
        <a
          className="basis-full text-sm text-blue-700 underline"
          href={downloadUrl.url}
          rel="noreferrer"
        >
          Download ready: {downloadUrl.fileName}
        </a>
      ) : null}
      <Button disabled={pending} onClick={() => void share()}>
        <Share2 className="h-4 w-4" aria-hidden="true" /> Share
      </Button>
      <Button onClick={() => void copyMarkdown()} variant="ghost">
        <Copy className="h-4 w-4" aria-hidden="true" /> Copy Markdown
      </Button>
      <a
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-slate-200"
        href={`/reports/${snapshot.id}/print`}
        rel="noreferrer"
        target="_blank"
      >
        <Printer className="h-4 w-4" aria-hidden="true" /> Print
      </a>
      {message ? (
        <p className="basis-full text-sm text-slate-600 dark:text-slate-300" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

async function copy(value: string): Promise<void> {
  if ("clipboard" in navigator) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const succeeded = document.execCommand("copy");
  textarea.remove();
  if (!succeeded) throw new Error("Clipboard is unavailable");
}
