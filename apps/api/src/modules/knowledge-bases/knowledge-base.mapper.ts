import type { Document, IngestionJob, KnowledgeBase } from "../../generated/prisma/client";

export function knowledgeBaseDto(value: KnowledgeBase) {
  return {
    ...value,
    archivedAt: value.archivedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
export function documentDto(value: Document) {
  return {
    ...value,
    sizeBytes: value.sizeBytes.toString(),
    currentVersionId: value.currentVersionId ?? null,
    mimeType: value.mimeType ?? null,
    archivedAt: value.archivedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
export function ingestionJobDto(value: IngestionJob) {
  return {
    id: value.id,
    documentVersionId: value.documentVersionId,
    status: value.status,
    attempt: value.attempt,
    progress: value.progress,
    currentStage: value.currentStage ?? null,
    errorCode: value.errorCode ?? null,
    errorMessage: value.errorMessage ?? null,
    queuedAt: value.queuedAt.toISOString(),
    startedAt: value.startedAt?.toISOString() ?? null,
    completedAt: value.completedAt?.toISOString() ?? null,
  };
}
