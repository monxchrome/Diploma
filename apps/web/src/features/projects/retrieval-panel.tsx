"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { askProject, fetchKnowledgeBases, searchProject, sendAnswerFeedback } from "./projects-api";

export function RetrievalPanel({ projectId }: Readonly<{ projectId: string }>) {
  const { apiRequest } = useAuth();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"DENSE" | "SPARSE" | "HYBRID">("HYBRID");
  const [selected, setSelected] = useState<string[]>([]);
  const bases = useQuery({
    queryFn: () => fetchKnowledgeBases(apiRequest, projectId),
    queryKey: ["knowledge-bases", projectId],
  });
  const search = useMutation({
    mutationFn: () =>
      searchProject(apiRequest, projectId, { knowledgeBaseIds: selected, mode, query }),
  });
  const ask = useMutation({
    mutationFn: () =>
      askProject(apiRequest, projectId, { knowledgeBaseIds: selected, mode, query }),
  });
  const feedback = useMutation({
    mutationFn: (rating: number) =>
      sendAnswerFeedback(apiRequest, projectId, ask.data!.ragResponseId, rating),
  });
  const submit = (kind: "search" | "ask") => {
    if (!query.trim()) return;
    if (kind === "search") search.mutate();
    else ask.mutate();
  };

  return (
    <section className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">Search and grounded Q&A</h3>
        <p className="text-sm text-slate-600">
          Search runs without an LLM. Ask uses the same evidence and validates its citations.
        </p>
      </div>
      <textarea
        aria-label="Question or search query"
        className="min-h-24 rounded-md border border-slate-300 p-3 text-sm"
        onChange={(event) => setQuery(event.target.value)}
        value={query}
      />
      <div className="flex flex-wrap gap-2">
        {(["DENSE", "SPARSE", "HYBRID"] as const).map((item) => (
          <Button
            key={item}
            onClick={() => setMode(item)}
            type="button"
            variant={mode === item ? "primary" : "ghost"}
          >
            {item}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {bases.data?.map((base) => (
          <label key={base.id}>
            <input
              checked={selected.includes(base.id)}
              onChange={() =>
                setSelected((value) =>
                  value.includes(base.id)
                    ? value.filter((id) => id !== base.id)
                    : [...value, base.id],
                )
              }
              type="checkbox"
            />{" "}
            {base.name}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={search.isPending || ask.isPending}
          onClick={() => submit("search")}
          type="button"
        >
          Search
        </Button>
        <Button
          disabled={search.isPending || ask.isPending}
          onClick={() => submit("ask")}
          type="button"
        >
          Ask
        </Button>
      </div>
      {search.error || ask.error ? (
        <p className="text-sm text-red-700">
          {search.error instanceof Error
            ? search.error.message
            : ask.error instanceof Error
              ? ask.error.message
              : "Retrieval failed"}
        </p>
      ) : null}
      {search.data ? <Evidence evidence={search.data.evidence} /> : null}
      {ask.data ? (
        <div className="grid gap-3">
          <GroundedAnswer answer={ask.data.answer} />
          {ask.data.insufficientEvidence ? (
            <div className="text-sm font-medium text-amber-700">
              <p>Insufficient evidence in the selected knowledge bases.</p>
              {ask.data.missingInformation.length > 0 ? (
                <p>Missing: {ask.data.missingInformation.join(", ")}.</p>
              ) : null}
            </div>
          ) : null}
          <Evidence evidence={ask.data.evidence} />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <Button
                disabled={feedback.isPending}
                key={rating}
                onClick={() => feedback.mutate(rating)}
                type="button"
                variant="ghost"
              >
                {rating}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Evidence({
  evidence,
}: Readonly<{
  evidence: Array<{
    documentId: string;
    evidenceId: string;
    headingPath: string[];
    snippet: string;
  }>;
}>) {
  return (
    <div className="grid gap-2">
      {evidence.map((item) => (
        <article
          className="rounded border border-slate-100 p-3 text-sm"
          id={`evidence-${item.evidenceId}`}
          key={item.evidenceId}
        >
          <p className="font-medium">
            {item.evidenceId} · {item.documentId}
          </p>
          {item.headingPath.length ? (
            <p className="text-slate-500">{item.headingPath.join(" / ")}</p>
          ) : null}
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{item.snippet}</p>
        </article>
      ))}
    </div>
  );
}

function GroundedAnswer({ answer }: Readonly<{ answer: string }>) {
  const parts = answer.split(/(\[E\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-800">
      {parts.map((part, index) =>
        /^\[E\d+\]$/.test(part) ? (
          <a
            className="font-medium text-teal-700 underline"
            href={`#evidence-${part.slice(1, -1)}`}
            key={`${part}-${index}`}
          >
            {part}
          </a>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}
