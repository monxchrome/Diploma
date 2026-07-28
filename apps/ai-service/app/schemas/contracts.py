from datetime import UTC, datetime
from typing import Literal, NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field

ServiceStatus = Literal["ok", "degraded", "down"]
AnalysisEventName = Literal[
    "analysis.requested",
    "analysis.started",
    "analysis.completed",
    "analysis.failed",
]


class HealthResponse(BaseModel):
    environment: str
    service: str
    status: ServiceStatus
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AiEchoRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1024)
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)

    model_config = ConfigDict(populate_by_name=True)


class AiEchoResponse(BaseModel):
    message: str
    request_id: str = Field(alias="requestId")
    service: Literal["ai-service"] = "ai-service"
    status: Literal["ok"] = "ok"
    timestamp: datetime | str

    model_config = ConfigDict(populate_by_name=True)


class SystemStatusServices(BaseModel):
    api: ServiceStatus
    ai_service: ServiceStatus = Field(alias="aiService")

    model_config = ConfigDict(populate_by_name=True)


class SystemStatusResponse(BaseModel):
    environment: str
    request_id: str = Field(alias="requestId")
    services: SystemStatusServices
    timestamp: datetime

    model_config = ConfigDict(populate_by_name=True)


class ApiError(TypedDict):
    code: str
    message: str
    requestId: str
    timestamp: datetime
    details: NotRequired[object | None]
    path: NotRequired[str]


class ApiErrorResponse(BaseModel):
    error: ApiError


class AiIngestionRequest(BaseModel):
    document_version_id: str = Field(alias="documentVersionId", min_length=1, max_length=128)
    ingestion_job_id: str = Field(alias="ingestionJobId", min_length=1, max_length=128)
    storage_key: str = Field(alias="storageKey", min_length=1, max_length=1024)
    declared_mime_type: str = Field(alias="declaredMimeType", min_length=1, max_length=255)
    request_id: str = Field(alias="requestId", min_length=1, max_length=128)
    index_context: "IndexContext" = Field(alias="indexContext")

    model_config = ConfigDict(populate_by_name=True)


class IngestionChunk(BaseModel):
    content: str = Field(min_length=1)
    token_count: int = Field(alias="tokenCount", ge=0)
    chunk_index: int = Field(alias="chunkIndex", ge=0)
    content_hash: str = Field(alias="contentHash", min_length=64, max_length=64)
    vector_point_id: str = Field(alias="vectorPointId")
    heading_path: list[str] = Field(alias="headingPath")
    metadata: dict[str, object]
    page_start: int | None = Field(default=None, alias="pageStart")
    page_end: int | None = Field(default=None, alias="pageEnd")

    model_config = ConfigDict(populate_by_name=True)


class AiIngestionResponse(BaseModel):
    checksum_sha256: str = Field(alias="checksumSha256", min_length=64, max_length=64)
    detected_mime_type: str = Field(alias="detectedMimeType")
    parser_name: str = Field(alias="parserName")
    parser_version: str = Field(alias="parserVersion")
    character_count: int = Field(alias="characterCount", ge=0)
    token_count: int = Field(alias="tokenCount", ge=0)
    embedding_model: str = Field(alias="embeddingModel")
    embedding_dimension: int = Field(alias="embeddingDimension", gt=0)
    chunks: list[IngestionChunk]

    model_config = ConfigDict(populate_by_name=True)


class IndexContext(BaseModel):
    project_id: str = Field(alias="projectId")
    knowledge_base_id: str = Field(alias="knowledgeBaseId")
    document_id: str = Field(alias="documentId")
    document_version_id: str = Field(alias="documentVersionId")
    document_version: int = Field(alias="documentVersion", ge=1)
    document_status: Literal["COMPLETED"] = Field(alias="documentStatus")
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)


class RetrievalFilters(BaseModel):
    knowledge_base_ids: list[str] = Field(default_factory=list, alias="knowledgeBaseIds")
    document_ids: list[str] = Field(default_factory=list, alias="documentIds")
    page_start: int | None = Field(default=None, alias="pageStart", ge=1)
    page_end: int | None = Field(default=None, alias="pageEnd", ge=1)
    created_after: datetime | None = Field(default=None, alias="createdAfter")
    created_before: datetime | None = Field(default=None, alias="createdBefore")

    model_config = ConfigDict(populate_by_name=True)


class AiRetrievalRequest(BaseModel):
    project_id: str = Field(alias="projectId")
    query: str = Field(min_length=1, max_length=4000)
    mode: Literal["DENSE", "SPARSE", "HYBRID"] = "HYBRID"
    top_k: int = Field(default=10, alias="topK", ge=1, le=50)
    filters: RetrievalFilters = Field(default_factory=RetrievalFilters)
    generate_answer: bool = Field(default=False, alias="generateAnswer")

    model_config = ConfigDict(populate_by_name=True)


class RetrievalEvidence(BaseModel):
    evidence_id: str = Field(alias="evidenceId")
    chunk_id: str = Field(alias="chunkId")
    document_id: str = Field(alias="documentId")
    document_version_id: str = Field(alias="documentVersionId")
    knowledge_base_id: str = Field(alias="knowledgeBaseId")
    snippet: str
    score: float
    page_start: int | None = Field(alias="pageStart")
    page_end: int | None = Field(alias="pageEnd")
    heading_path: list[str] = Field(alias="headingPath")

    model_config = ConfigDict(populate_by_name=True)


class AiCitation(BaseModel):
    evidence_id: str = Field(alias="evidenceId")
    document_id: str = Field(alias="documentId")
    quote: str

    model_config = ConfigDict(populate_by_name=True)


class AiRetrievalResponse(BaseModel):
    normalized_query: str = Field(alias="normalizedQuery")
    evidence: list[RetrievalEvidence]
    timings_ms: dict[str, float] = Field(alias="timingsMs")
    answer: str | None = None
    citations: list[AiCitation] = Field(default_factory=list)
    insufficient_evidence: bool = Field(default=False, alias="insufficientEvidence")
    missing_information: list[str] = Field(default_factory=list, alias="missingInformation")

    model_config = ConfigDict(populate_by_name=True)


class ReindexChunk(BaseModel):
    chunk_id: str = Field(alias="chunkId")
    chunk_index: int = Field(alias="chunkIndex", ge=0)
    content: str = Field(min_length=1)
    content_hash: str = Field(alias="contentHash")
    heading_path: list[str] = Field(default_factory=list, alias="headingPath")
    page_start: int | None = Field(default=None, alias="pageStart")
    page_end: int | None = Field(default=None, alias="pageEnd")

    model_config = ConfigDict(populate_by_name=True)

    @property
    def vector_point_id(self) -> str:
        return self.chunk_id


class AiReindexRequest(BaseModel):
    index_context: IndexContext = Field(alias="indexContext")
    chunks: list[ReindexChunk] = Field(min_length=1, max_length=500)

    model_config = ConfigDict(populate_by_name=True)


class DeactivateDocumentVersionRequest(BaseModel):
    document_version_id: str = Field(alias="documentVersionId")

    model_config = ConfigDict(populate_by_name=True)


class ArchiveKnowledgeBaseRequest(BaseModel):
    knowledge_base_id: str = Field(alias="knowledgeBaseId")
    document_version_ids: list[str] = Field(alias="documentVersionIds", max_length=500)
    archived: bool

    model_config = ConfigDict(populate_by_name=True)
