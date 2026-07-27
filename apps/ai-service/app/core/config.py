from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, field_validator
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
    ollama_url: str = Field(default="http://localhost:11434")
    port: int = Field(default=8000, ge=1, le=65535)
    qdrant_url: str = Field(default="http://localhost:6333")
    service_name: str = Field(default="ai-service", min_length=1)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("ai_service_url", "langfuse_host", "ollama_url", "qdrant_url")
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
