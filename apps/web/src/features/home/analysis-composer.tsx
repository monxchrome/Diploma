"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileUp, Plus, Send, SlidersHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  completeUpload,
  createAnalysis,
  createKnowledgeBase,
  createProject,
  createUploadIntent,
  fetchBillingUsage,
  fetchDocuments,
  fetchKnowledgeBases,
  fetchProjects,
  runAnalysis,
} from "@/features/projects/projects-api";

type FriendlyMode = "AUTO" | "FOCUSED" | "MULTI_PERSPECTIVE";

type ComposerDraft = {
  documentIds: string[];
  mode: FriendlyMode;
  projectId: string | null;
  question: string;
  useAllSources: boolean;
  useWebResearch: boolean;
};

const draftKey = "dip:analysis-composer-draft";
const lastProjectKey = "dip:last-project-id";
const emptyDraft: ComposerDraft = {
  documentIds: [],
  mode: "AUTO",
  projectId: null,
  question: "",
  useAllSources: true,
  useWebResearch: false,
};

function readInitialDraft(): ComposerDraft {
  if (typeof window === "undefined") return emptyDraft;
  const stored = window.localStorage.getItem(draftKey);
  if (!stored) return emptyDraft;
  try {
    return { ...emptyDraft, ...(JSON.parse(stored) as Partial<ComposerDraft>) };
  } catch {
    window.localStorage.removeItem(draftKey);
    return emptyDraft;
  }
}

export function AnalysisComposer({
  initialProjectId,
  questionSeed,
}: Readonly<{ initialProjectId?: string; questionSeed?: string }>) {
  const { apiRequest, status } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<ComposerDraft>(readInitialDraft);
  const [lastProjectId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(lastProjectKey),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showProjectCreation, setShowProjectCreation] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchProjects(apiRequest, { status: "active" }),
    queryKey: ["projects", "active"],
  });
  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data]);
  const projectId = useMemo(() => {
    const selectedProject =
      (initialProjectId && projects.find((project) => project.id === initialProjectId)) ||
      (draft.projectId && projects.find((project) => project.id === draft.projectId)) ||
      (lastProjectId && projects.find((project) => project.id === lastProjectId)) ||
      (projects.length === 1 ? projects[0] : undefined);
    return selectedProject?.id ?? null;
  }, [draft.projectId, initialProjectId, lastProjectId, projects]);
  const knowledgeBasesQuery = useQuery({
    enabled: status === "authenticated" && Boolean(projectId),
    queryFn: () => fetchKnowledgeBases(apiRequest, projectId ?? ""),
    queryKey: ["knowledge-bases", projectId],
  });
  const bases = knowledgeBasesQuery.data ?? [];
  const documentsQuery = useQuery({
    enabled: status === "authenticated" && Boolean(projectId) && bases.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        bases.map((base) => fetchDocuments(apiRequest, projectId ?? "", base.id)),
      );
      return lists.flat();
    },
    queryKey: ["knowledge-base-documents", projectId, bases.map((base) => base.id).join(":")],
  });
  const usageQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchBillingUsage(apiRequest),
    queryKey: ["billing-usage"],
  });
  const readyDocuments = useMemo(
    () => (documentsQuery.data ?? []).filter((document) => document.status === "COMPLETED"),
    [documentsQuery.data],
  );
  const selectedDocuments = draft.useAllSources
    ? readyDocuments
    : readyDocuments.filter((document) => draft.documentIds.includes(document.id));
  const webResearchAvailable = usageQuery.data?.limits.externalResearchAvailable === true;

  const createProjectMutation = useMutation({
    mutationFn: () => createProject(apiRequest, { name: newProjectName.trim() }),
    onSuccess: (project) => {
      setDraft((current) => ({ ...current, projectId: project.id }));
      setNewProjectName("");
      setShowProjectCreation(false);
      setError(null);
      window.localStorage.setItem(lastProjectKey, project.id);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () =>
      setError("We could not create that project. Your question is still here—please try again."),
  });

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (questionSeed) {
      window.setTimeout(() => setDraft((current) => ({ ...current, question: questionSeed })), 0);
      inputRef.current?.focus();
    }
  }, [questionSeed]);

  function updateDraft(update: Partial<ComposerDraft>): void {
    setDraft((current) => ({ ...current, ...update }));
  }

  async function ensureKnowledgeBase(selectedProjectId: string): Promise<string[]> {
    if (bases.length > 0) return bases.map((base) => base.id);
    const base = await createKnowledgeBase(apiRequest, selectedProjectId, "Project sources");
    await queryClient.invalidateQueries({ queryKey: ["knowledge-bases", selectedProjectId] });
    return [base.id];
  }

  async function uploadFiles(files: FileList | File[]): Promise<void> {
    if (!projectId) {
      setShowProjectCreation(true);
      setError("Create a project first, then add sources without losing your question.");
      return;
    }
    const file = Array.from(files)[0];
    if (!file) return;
    setError(null);
    setUploadName(file.name);
    setUploadProgress(0);
    try {
      const knowledgeBaseIds = await ensureKnowledgeBase(projectId);
      const knowledgeBaseId = knowledgeBaseIds[0];
      if (!knowledgeBaseId) throw new Error("A source collection is required for upload");
      const intent = await createUploadIntent(apiRequest, projectId, knowledgeBaseId, file);
      await uploadFile(intent.uploadUrl, intent.requiredHeaders, file, setUploadProgress);
      await completeUpload(apiRequest, projectId, knowledgeBaseId, intent.document.id);
      setUploadProgress(100);
      await queryClient.invalidateQueries({ queryKey: ["knowledge-base-documents", projectId] });
    } catch {
      setUploadProgress(null);
      setError(
        "That source could not be uploaded. Your question and selections were kept—please try again.",
      );
    }
  }

  async function submit(): Promise<void> {
    const question = draft.question.trim();
    if (!question) {
      inputRef.current?.focus();
      setError("Add the decision you want help with before analysing.");
      return;
    }
    if (!projectId) {
      setShowProjectCreation(true);
      setError("Choose or create a project to keep this decision organised.");
      return;
    }
    setError(null);
    try {
      const knowledgeBaseIds = await ensureKnowledgeBase(projectId);
      const mode = draft.mode === "FOCUSED" ? "SINGLE_AGENT" : "MULTI_AGENT";
      const analysis = await createAnalysis(apiRequest, projectId, {
        constraints: [],
        decisionQuestion: question,
        documentIds: draft.useAllSources ? [] : selectedDocuments.map((document) => document.id),
        evidenceMode: draft.useWebResearch ? "HYBRID" : "INTERNAL_ONLY",
        externalResearchEnabled: draft.useWebResearch,
        knowledgeBaseIds,
        mode,
        objectives: [],
        requestedSpecialists: [],
        title: question.slice(0, 160),
        assumptions: [],
      });
      await runAnalysis(apiRequest, projectId, analysis.id);
      window.localStorage.removeItem(draftKey);
      window.localStorage.setItem(lastProjectKey, projectId);
      setDraft(emptyDraft);
      router.push(`/projects/${projectId}/analyses/${analysis.id}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.toLowerCase() : "";
      setError(
        message.includes("quota") || message.includes("limit")
          ? "You have reached your current plan limit. Your draft is saved; review Billing to upgrade or try again after the limit resets."
          : "We could not start the analysis. Your draft is saved, so you can safely try again.",
      );
    }
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    void uploadFiles(event.dataTransfer.files);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files) void uploadFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <section
      aria-label="Start a new analysis"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"
      id="composer"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
          What decision are you working on?
          <textarea
            ref={inputRef}
            aria-describedby="composer-help"
            className="min-h-32 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-6 text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-50 dark:focus:ring-teal-950"
            maxLength={4000}
            onChange={(event) => updateDraft({ question: event.target.value })}
            onKeyDown={onQuestionKeyDown}
            onPaste={(event) => {
              const files = event.clipboardData.files;
              if (files.length > 0) void uploadFiles(files);
            }}
            placeholder="Describe the decision you need help with…"
            value={draft.question}
          />
        </label>
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400" id="composer-help">
          Press Enter to analyse, or Shift+Enter for a new line. Your draft is saved on this device.
        </p>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Add sources
              <input
                accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm"
                className="sr-only"
                onChange={onFileChange}
                type="file"
              />
            </label>
            <ProjectSelector
              onCreate={() => setShowProjectCreation((open) => !open)}
              onSelect={(nextProjectId) => updateDraft({ projectId: nextProjectId })}
              projects={projects}
              selectedProjectId={projectId}
            />
            {projectId ? (
              <details className="relative">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                  {selectedDocuments.length} project source
                  {selectedDocuments.length === 1 ? "" : "s"}
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </summary>
                <SourceSelector
                  documents={readyDocuments}
                  onChange={(documentIds) => updateDraft({ documentIds, useAllSources: false })}
                  onUseAll={() => updateDraft({ documentIds: [], useAllSources: true })}
                  selectedIds={selectedDocuments.map((document) => document.id)}
                  useAllSources={draft.useAllSources}
                />
              </details>
            ) : null}
          </div>
          <Button
            aria-label="Analyze decision"
            aria-describedby={!draft.question.trim() ? "analyze-help" : undefined}
            className="w-full rounded-lg sm:w-auto"
            disabled={!draft.question.trim()}
            onClick={() => void submit()}
            type="button"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Analyze
          </Button>
        </div>
        {!draft.question.trim() ? (
          <p className="text-xs text-slate-500 dark:text-slate-400" id="analyze-help">
            Add a decision question to enable Analyze.
          </p>
        ) : null}

        {showProjectCreation ? (
          <form
            className="grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900 dark:bg-teal-950/40 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (newProjectName.trim()) createProjectMutation.mutate();
            }}
          >
            <label className="grid gap-1 text-sm font-medium text-slate-800 dark:text-slate-100">
              Name this project
              <input
                autoFocus
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                maxLength={160}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="e.g. 2027 market expansion"
                value={newProjectName}
              />
            </label>
            <Button
              disabled={!newProjectName.trim() || createProjectMutation.isPending}
              type="submit"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {createProjectMutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </form>
        ) : null}

        {uploadProgress !== null ? (
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            role="status"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{uploadName ?? "Source"}</span>
              <span>{uploadProgress === 100 ? "Uploaded" : `${uploadProgress}%`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-teal-700 transition-[width] dark:bg-teal-400"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
        {error ? (
          <p
            className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <details
          className="border-t border-slate-100 pt-4 dark:border-slate-800"
          open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-700 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-slate-200">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Advanced
          </summary>
          <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70 md:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Approach
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["AUTO", "Auto"],
                    ["FOCUSED", "Focused"],
                    ["MULTI_PERSPECTIVE", "Multi-perspective"],
                  ] as const
                ).map(([value, label]) => (
                  <label className="cursor-pointer" key={value}>
                    <input
                      className="peer sr-only"
                      checked={draft.mode === value}
                      name="analysis-mode"
                      onChange={() => updateDraft({ mode: value })}
                      type="radio"
                    />
                    <span className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:text-teal-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:peer-checked:border-teal-400 dark:peer-checked:bg-teal-950 dark:peer-checked:text-teal-100">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auto uses the existing multi-perspective workflow. Focused uses the existing focused
                workflow.
              </p>
            </fieldset>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <input
                checked={draft.useWebResearch}
                className="mt-0.5 h-4 w-4 accent-teal-700"
                disabled={!webResearchAvailable}
                onChange={(event) => updateDraft({ useWebResearch: event.target.checked })}
                type="checkbox"
              />
              <span>
                <span className="block font-medium">Include web research</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  {webResearchAvailable
                    ? "Adds carefully checked public sources when useful."
                    : "Available with an eligible plan. It will not be enabled automatically."}
                </span>
              </span>
            </label>
          </div>
        </details>
        {draft.question ? (
          <button
            className="w-fit text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:hover:text-white"
            onClick={() => {
              setDraft(emptyDraft);
              window.localStorage.removeItem(draftKey);
            }}
            type="button"
          >
            <Trash2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Clear draft
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ProjectSelector({
  onCreate,
  onSelect,
  projects,
  selectedProjectId,
}: Readonly<{
  onCreate: () => void;
  onSelect: (projectId: string | null) => void;
  projects: { id: string; name: string; role: string }[];
  selectedProjectId: string | null;
}>) {
  if (projects.length === 0) {
    return (
      <button
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-teal-600 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-teal-700 dark:text-teal-300"
        onClick={onCreate}
        type="button"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create project
      </button>
    );
  }
  return (
    <label className="relative min-w-0 max-w-full">
      <span className="sr-only">Project</span>
      <select
        className="h-10 w-[min(18rem,calc(100vw-8rem))] max-w-full min-w-0 truncate rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        onChange={(event) => onSelect(event.target.value || null)}
        value={selectedProjectId ?? ""}
      >
        <option value="">Choose project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} · {project.role.toLowerCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function SourceSelector({
  documents,
  onChange,
  onUseAll,
  selectedIds,
  useAllSources,
}: Readonly<{
  documents: { id: string; originalFilename: string }[];
  onChange: (ids: string[]) => void;
  onUseAll: () => void;
  selectedIds: string[];
  useAllSources: boolean;
}>) {
  return (
    <div className="absolute z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Sources for this analysis
      </p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          checked={useAllSources}
          className="h-4 w-4 accent-teal-700"
          onChange={onUseAll}
          type="checkbox"
        />
        Use all ready project sources
      </label>
      {documents.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          No ready sources yet. You can still begin and add sources later.
        </p>
      ) : (
        <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto border-t border-slate-100 pt-3 dark:border-slate-800">
          {documents.map((document) => (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
              key={document.id}
            >
              <input
                checked={useAllSources || selectedIds.includes(document.id)}
                className="h-4 w-4 accent-teal-700"
                disabled={useAllSources}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selectedIds, document.id]
                      : selectedIds.filter((id) => id !== document.id),
                  )
                }
                type="checkbox"
              />{" "}
              <span className="truncate">{document.originalFilename}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function uploadFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  setProgress: (value: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Upload failed"));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Upload rejected"));
    request.send(file);
  });
}
