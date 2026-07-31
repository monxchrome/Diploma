"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import { createAnalysis, fetchKnowledgeBases } from "./projects-api";

const specialists = [
  ["MARKET", "Market"],
  ["FINANCIAL", "Financial"],
  ["LEGAL_REGULATORY", "Legal / regulatory"],
  ["RISK", "Risk"],
  ["STRATEGY", "Strategy"],
] as const;

const inputClasses =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors focus:border-teal-700 focus:ring-2 focus:ring-teal-100";

export function AnalysisFormPage({ projectId }: Readonly<{ projectId: string }>) {
  const { apiRequest, status } = useAuth();
  const router = useRouter();
  const bases = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchKnowledgeBases(apiRequest, projectId),
    queryKey: ["knowledge-bases", projectId],
  });
  const [title, setTitle] = useState("");
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [mode, setMode] = useState<"SINGLE_AGENT" | "MULTI_AGENT">("MULTI_AGENT");
  const [evidenceMode, setEvidenceMode] = useState<"INTERNAL_ONLY" | "EXTERNAL_ONLY" | "HYBRID">(
    "INTERNAL_ONLY",
  );
  const [researchCountry, setResearchCountry] = useState("");
  const [researchLanguages, setResearchLanguages] = useState("");
  const [publishedAfter, setPublishedAfter] = useState("");
  const [publishedBefore, setPublishedBefore] = useState("");
  const [preferredDomains, setPreferredDomains] = useState("");
  const [excludedDomains, setExcludedDomains] = useState("");
  const [objectives, setObjectives] = useState("");
  const [constraints, setConstraints] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [timeHorizon, setTimeHorizon] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [currency, setCurrency] = useState("");
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState("");
  const [requestedSpecialists, setRequestedSpecialists] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectedDocumentIds = useMemo(
    () =>
      documentIds
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    [documentIds],
  );
  const create = useMutation({
    mutationFn: () =>
      createAnalysis(apiRequest, projectId, {
        title: title.trim(),
        decisionQuestion: decisionQuestion.trim(),
        mode,
        objectives: toLines(objectives),
        constraints: toLines(constraints),
        assumptions: toLines(assumptions),
        timeHorizon: timeHorizon.trim() || undefined,
        targetMarket: targetMarket.trim() || undefined,
        currency: currency.trim().toUpperCase() || undefined,
        knowledgeBaseIds,
        documentIds: selectedDocumentIds,
        requestedSpecialists,
        evidenceMode,
        externalResearchEnabled: evidenceMode !== "INTERNAL_ONLY",
        researchCountry: researchCountry.trim().toUpperCase() || undefined,
        researchLanguages: toCommaList(researchLanguages),
        publishedAfter: publishedAfter
          ? new Date(`${publishedAfter}T00:00:00.000Z`).toISOString()
          : undefined,
        publishedBefore: publishedBefore
          ? new Date(`${publishedBefore}T00:00:00.000Z`).toISOString()
          : undefined,
        preferredDomains: toCommaList(preferredDomains),
        excludedDomains: toCommaList(excludedDomains),
      }),
    onSuccess: (analysis) => router.push(`/projects/${projectId}/analyses/${analysis.id}`),
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : "Unable to create analysis"),
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    if (!title.trim() || !decisionQuestion.trim()) {
      setError("Title and decision question are required.");
      return;
    }
    if (evidenceMode !== "EXTERNAL_ONLY" && knowledgeBaseIds.length === 0) {
      setError("Select at least one knowledge base.");
      return;
    }
    create.mutate();
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/projects/${projectId}/analyses`}
          aria-label="Back to analyses"
          className="text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div>
          <p className="text-sm font-medium text-teal-700">Phase 6</p>
          <h2 className="text-2xl font-semibold text-slate-950">New analysis</h2>
        </div>
      </div>
      <form
        className="grid gap-5 rounded-md border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={submit}
      >
        {error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>
        ) : null}
        <Field
          label="Title"
          required
          value={title}
          onChange={setTitle}
          placeholder="e.g. Enter the Polish market in 2027"
        />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Decision question <span className="text-red-600">*</span>
          <textarea
            className={`${inputClasses} min-h-28`}
            value={decisionQuestion}
            onChange={(event) => setDecisionQuestion(event.target.value)}
            placeholder="What decision should this analysis support?"
          />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-slate-700">Analysis mode</legend>
          <div className="flex flex-wrap gap-2">
            {(["SINGLE_AGENT", "MULTI_AGENT"] as const).map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${mode === value ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-300"}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {value === "MULTI_AGENT" ? "Multi-agent" : "Single-agent"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border border-teal-100 bg-teal-50/40 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Evidence scope</legend>
          <div className="flex flex-wrap gap-2">
            {(["INTERNAL_ONLY", "EXTERNAL_ONLY", "HYBRID"] as const).map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${evidenceMode === value ? "border-teal-700 bg-white text-teal-800" : "border-slate-300 bg-white"}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  checked={evidenceMode === value}
                  onChange={() => setEvidenceMode(value)}
                />
                {value.replaceAll("_", " ")}
              </label>
            ))}
          </div>
          {evidenceMode !== "INTERNAL_ONLY" ? (
            <p className="text-xs leading-5 text-slate-600">
              External research is explicitly enabled for this run and remains subject to project
              policy, query, page, byte, and context limits.
            </p>
          ) : (
            <p className="text-xs leading-5 text-slate-600">
              Internal-only analysis preserves Phase 5 behaviour and performs no web search.
            </p>
          )}
          {evidenceMode !== "INTERNAL_ONLY" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Research country"
                value={researchCountry}
                onChange={setResearchCountry}
                placeholder="ES"
                maxLength={2}
              />
              <Field
                label="Languages"
                value={researchLanguages}
                onChange={setResearchLanguages}
                placeholder="en, es"
              />
              <Field
                label="Preferred domains"
                value={preferredDomains}
                onChange={setPreferredDomains}
                placeholder="example.gov, regulator.eu"
              />
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Published after
                <input
                  className={inputClasses}
                  type="date"
                  value={publishedAfter}
                  onChange={(event) => setPublishedAfter(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Published before
                <input
                  className={inputClasses}
                  type="date"
                  value={publishedBefore}
                  onChange={(event) => setPublishedBefore(event.target.value)}
                />
              </label>
              <Field
                label="Excluded domains"
                value={excludedDomains}
                onChange={setExcludedDomains}
                placeholder="untrusted.example"
              />
            </div>
          ) : null}
        </fieldset>
        <div className="grid gap-4 md:grid-cols-3">
          <ListField
            label="Objectives"
            value={objectives}
            onChange={setObjectives}
            placeholder="One objective per line"
          />
          <ListField
            label="Constraints"
            value={constraints}
            onChange={setConstraints}
            placeholder="One constraint per line"
          />
          <ListField
            label="Assumptions"
            value={assumptions}
            onChange={setAssumptions}
            placeholder="One assumption per line"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="Time horizon"
            value={timeHorizon}
            onChange={setTimeHorizon}
            placeholder="e.g. 2027–2030"
          />
          <Field
            label="Target market"
            value={targetMarket}
            onChange={setTargetMarket}
            placeholder="e.g. Poland"
          />
          <Field
            label="Currency"
            value={currency}
            onChange={setCurrency}
            placeholder="EUR"
            maxLength={3}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-slate-700">
            Knowledge bases{" "}
            {evidenceMode !== "EXTERNAL_ONLY" ? (
              <span className="text-red-600">*</span>
            ) : (
              <span className="text-slate-400">(optional)</span>
            )}
          </legend>
          {bases.isLoading ? (
            <p className="text-sm text-slate-600">Loading knowledge bases...</p>
          ) : null}
          {bases.data?.length === 0 ? (
            <p className="text-sm text-amber-700">
              Create a knowledge base before starting an analysis.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {bases.data?.map((base) => (
              <label
                key={base.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${knowledgeBaseIds.includes(base.id) ? "border-teal-700 bg-teal-50" : "border-slate-200"}`}
              >
                <input
                  type="checkbox"
                  checked={knowledgeBaseIds.includes(base.id)}
                  onChange={() =>
                    setKnowledgeBaseIds((value) =>
                      value.includes(base.id)
                        ? value.filter((id) => id !== base.id)
                        : [...value, base.id],
                    )
                  }
                />
                <span>{base.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Document selection
          <textarea
            className={`${inputClasses} min-h-20 font-mono text-xs`}
            value={documentIds}
            onChange={(event) => setDocumentIds(event.target.value)}
            placeholder="Optional document UUIDs, separated by commas or new lines"
          />
          <span className="flex items-center gap-1 text-xs font-normal text-slate-500">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Leave empty to use all documents in the selected knowledge bases.
          </span>
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-slate-700">Allowlisted specialists</legend>
          <div className="flex flex-wrap gap-2">
            {specialists.map(([value, label]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${requestedSpecialists.includes(value) ? "border-teal-700 bg-teal-50" : "border-slate-200"}`}
              >
                <input
                  className="sr-only"
                  type="checkbox"
                  checked={requestedSpecialists.includes(value)}
                  onChange={() =>
                    setRequestedSpecialists((current) =>
                      current.includes(value)
                        ? current.filter((item) => item !== value)
                        : [...current, value],
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Button disabled={create.isPending || bases.isLoading} type="submit">
            {create.isPending ? "Creating..." : "Create analysis"}
          </Button>
          <Link href={`/projects/${projectId}/analyses`}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}>) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label} {required ? <span className="text-red-600">*</span> : null}
      <input
        className={inputClasses}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ListField({
  label,
  value,
  onChange,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}>) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <textarea
        className={`${inputClasses} min-h-24`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
