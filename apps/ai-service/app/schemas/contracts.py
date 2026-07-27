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
