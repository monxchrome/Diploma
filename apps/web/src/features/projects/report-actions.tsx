"use client";

import { Copy, FileDown, Printer, Share2 } from "lucide-react";
import { useState } from "react";
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
  if (!snapshot) return null;

  const createExport = async (format: "PDF" | "DOCX" | "MARKDOWN" | "PRINT_HTML") => {
    setPending(true);
    try {
      await apiRequest(
        `/api/report-snapshots/${snapshot.id}/exports`,
        z.object({ id: z.string().uuid() }),
        {
          body: {
            format,
            idempotencyKey: crypto.randomUUID(),
            options: {},
          },
          method: "POST",
        },
      );
      setMessage("Export is being prepared. You can continue working while it completes.");
    } catch {
      setMessage("We could not start the export. Check your plan and try again.");
    } finally {
      setPending(false);
    }
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
