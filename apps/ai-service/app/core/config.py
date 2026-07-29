from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "test", "staging", "production"]
LogLevel = Literal["critical", "error", "warning", "info", "debug"]


class Settings(BaseSettings):
    ai_service_url: str = Field(default="http://localhost:8000")
    body_limit_bytes: int = Field(default=1_048_576, ge=1024, le=10_485_760)
    cors_origins: str = Field(default="http://localhost:3000,http://localhost:3001")
    environment: EnvironmentName = Field(default="development", alias="NODE_ENV")
    langfuse_enabled: bool = Field(default=False)
    langfuse_host: str = Field(default="http://localhost:3002")
    langfuse_public_key: str = Field(default="replace-with-dev-public-key")
    langfuse_secret_key: SecretStr = Field(default=SecretStr("replace-with-dev-secret-key"))
    log_level: LogLevel = Field(default="info")
    minio_endpoint: str = Field(default="http://localhost:9000")
    minio_access_key: str = Field(default="dip_minio")
    minio_bucket: str = Field(default="dip-documents")
    minio_secret_key: SecretStr = Field(default=SecretStr("dip_minio_password"))
    document_max_upload_bytes: int = Field(default=25_000_000, ge=1)
    ingestion_internal_secret: SecretStr = Field(
        default=SecretStr("replace-with-local-development-ingestion-secret-32")
    )
    ollama_url: str = Field(
        default="http://localhost:11434",
        validation_alias=AliasChoices("OLLAMA_BASE_URL", "OLLAMA_URL"),
    )
    port: int = Field(default=8000, ge=1, le=65535)
    qdrant_url: str = Field(default="http://localhost:6333")
    retrieval_candidate_limit: int = Field(default=40, ge=1, le=200)
    retrieval_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    retrieval_score_threshold: float = Field(default=0.015, ge=0, le=1)
    rerank_score_threshold: float = Field(
        default=0.04, ge=0, le=1, validation_alias="RERANK_SCORE_THRESHOLD"
    )
    min_relevant_evidence_count: int = Field(
        default=1, ge=1, le=10, validation_alias="MIN_RELEVANT_EVIDENCE_COUNT"
    )
    reranker_enabled: bool = Field(default=True, validation_alias="RERANKER_ENABLED")
    reranker_model: str = Field(default="lexical-v1", validation_alias="RERANKER_MODEL")
    dense_weight: float = Field(default=1.0, gt=0, le=10)
    sparse_weight: float = Field(default=1.0, gt=0, le=10)
    rag_generation_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("RAG_ENABLED", "RAG_GENERATION_ENABLED"),
    )
    rag_provider: str = Field(default="ollama", validation_alias="RAG_PROVIDER")
    rag_model: str = Field(
        default="llama3.2:3b",
        validation_alias=AliasChoices("OLLAMA_RAG_MODEL", "RAG_MODEL"),
    )
    agent_planner_provider: str = Field(default="ollama", validation_alias="AGENT_PLANNER_PROVIDER")
    agent_planner_model: str = Field(default="llama3.2:3b", validation_alias="AGENT_PLANNER_MODEL")
    agent_planner_max_tokens: int = Field(
        default=1000, ge=128, le=16000, validation_alias="AGENT_PLANNER_MAX_TOKENS"
    )
    agent_specialist_provider: str = Field(
        default="ollama", validation_alias="AGENT_SPECIALIST_PROVIDER"
    )
    agent_specialist_model: str = Field(
        default="llama3.2:3b", validation_alias="AGENT_SPECIALIST_MODEL"
    )
    agent_specialist_max_tokens: int = Field(
        default=1600, ge=128, le=16000, validation_alias="AGENT_SPECIALIST_MAX_TOKENS"
    )
    agent_coordinator_provider: str = Field(
        default="ollama", validation_alias="AGENT_COORDINATOR_PROVIDER"
    )
    agent_coordinator_model: str = Field(
        default="llama3.2:3b", validation_alias="AGENT_COORDINATOR_MODEL"
    )
    agent_coordinator_max_tokens: int = Field(
        default=4000, ge=128, le=16000, validation_alias="AGENT_COORDINATOR_MAX_TOKENS"
    )
    agent_critic_provider: str = Field(default="ollama", validation_alias="AGENT_CRITIC_PROVIDER")
    agent_critic_model: str = Field(default="llama3.2:3b", validation_alias="AGENT_CRITIC_MODEL")
    agent_critic_max_tokens: int = Field(
        default=1000, ge=128, le=16000, validation_alias="AGENT_CRITIC_MAX_TOKENS"
    )
    agent_model_timeout_seconds: float = Field(
        default=120.0, gt=0, le=600, validation_alias="AGENT_MODEL_TIMEOUT_SECONDS"
    )
    analysis_min_quality_score: float = Field(
        default=0.7, ge=0, le=1, validation_alias="ANALYSIS_MIN_QUALITY_SCORE"
    )
    analysis_min_grounding_score: float = Field(
        default=0.7, ge=0, le=1, validation_alias="ANALYSIS_MIN_GROUNDING_SCORE"
    )
    analysis_allow_degraded_report: bool = Field(
        default=True, validation_alias="ANALYSIS_ALLOW_DEGRADED_REPORT"
    )
    service_name: str = Field(default="ai-service", min_length=1)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator(
        "ai_service_url", "langfuse_host", "minio_endpoint", "ollama_url", "qdrant_url"
    )
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Expected an absolute HTTP(S) URL")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
