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

    model_config = ConfigDict(populate_by_name=True)


class IngestionChunk(BaseModel):
    content: str = Field(min_length=1)
    token_count: int = Field(alias="tokenCount", ge=0)
    chunk_index: int = Field(alias="chunkIndex", ge=0)
    content_hash: str = Field(alias="contentHash", min_length=64, max_length=64)
    vector_point_id: str = Field(alias="vectorPointId")
    heading_path: list[str] = Field(alias="headingPath")
    metadata: dict[str, object]

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
