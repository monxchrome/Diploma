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
  const create = useMutation({
    mutationFn: () => createKnowledgeBase(apiRequest, projectId, name),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["knowledge-bases", projectId] });
    },
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
        <p className="text-sm text-slate-600">Upload progress: {progress}%</p>
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
