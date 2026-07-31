"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";

import {
  completeUpload,
  createKnowledgeBase,
  createUploadIntent,
  fetchKnowledgeBases,
  fetchDocuments,
  deleteDocument,
} from "./projects-api";

export function KnowledgeBasesPanel({
  canEdit,
  projectId,
}: Readonly<{ canEdit: boolean; projectId: string }>) {
  const { apiRequest, status } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knowledgeBases = useQuery({
    enabled: status === "authenticated",
    queryFn: () => fetchKnowledgeBases(apiRequest, projectId),
    queryKey: ["knowledge-bases", projectId],
  });
  const documents = useQuery({
    enabled: status === "authenticated" && Boolean(knowledgeBases.data?.length),
    queryFn: async () => {
      const bases = knowledgeBases.data ?? [];
      const lists = await Promise.all(
        bases.map((base) => fetchDocuments(apiRequest, projectId, base.id)),
      );
      return lists.flat();
    },
    queryKey: ["knowledge-base-documents", projectId, knowledgeBases.data?.map((base) => base.id)],
  });
  const create = useMutation({
    mutationFn: () => createKnowledgeBase(apiRequest, projectId, name),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["knowledge-bases", projectId] });
    },
  });
  const remove = useMutation({
    mutationFn: (input: { knowledgeBaseId: string; documentId: string }) =>
      deleteDocument(apiRequest, projectId, input.knowledgeBaseId, input.documentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["knowledge-base-documents", projectId] }),
  });

  async function upload(knowledgeBaseId: string, file: File): Promise<void> {
    setError(null);
    setProgress(0);
    try {
      const intent = await createUploadIntent(apiRequest, projectId, knowledgeBaseId, file);
      await putFile(intent.uploadUrl, intent.requiredHeaders, file, setProgress);
      await completeUpload(apiRequest, projectId, knowledgeBaseId, intent.document.id);
      setProgress(100);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Knowledge bases</h3>
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            className="rounded-md border border-slate-300 px-3 text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Knowledge base name"
          />
          <Button disabled={create.isPending} type="submit">
            Create
          </Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {progress !== null ? (
        <p className="text-sm text-slate-600" role="status">
          Upload progress: {progress}%
          {progress === 100 ? " · Upload complete; indexing status is shown below." : ""}
        </p>
      ) : null}
      {knowledgeBases.data?.map((knowledgeBase) => (
        <div
          key={knowledgeBase.id}
          className="flex items-center justify-between border-t border-slate-100 pt-3"
        >
          <div>
            <p className="font-medium">{knowledgeBase.name}</p>
            <p className="text-xs text-slate-600">{knowledgeBase.status}</p>
          </div>
          {canEdit ? (
            <label className="cursor-pointer text-sm text-teal-700">
              <input
                className="sr-only"
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown,.html,.htm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(knowledgeBase.id, file);
                  event.currentTarget.value = "";
                }}
              />
              Upload document
            </label>
          ) : null}
        </div>
      ))}
      {documents.isLoading ? <p className="text-sm text-slate-600">Loading documents...</p> : null}
      {documents.isError ? (
        <p className="text-sm text-red-700">Unable to load document status.</p>
      ) : null}
      {documents.data?.length ? (
        <div className="grid gap-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-800">Documents</p>
          {documents.data.map((document) => (
            <div key={document.id} className="flex items-center justify-between text-sm">
              <span className="truncate text-slate-700">{document.originalFilename}</span>
              <div className="ml-3 flex items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{document.status}</span>
                {canEdit && document.status !== "ARCHIVED" ? (
                  <button className="text-xs font-medium text-red-700" type="button" onClick={() => {
                    if (confirm(`Delete ${document.originalFilename}?`)) remove.mutate({ documentId: document.id, knowledgeBaseId: document.knowledgeBaseId });
                  }}>Delete</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  setProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Direct upload failed"));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Direct upload was rejected"));
    request.send(file);
  });
}
