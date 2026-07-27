from typing import Any

from app.core.config import Settings


def initialize_langfuse(settings: Settings) -> Any | None:
    if not settings.langfuse_enabled:
        return None

    from langfuse import Langfuse

    return Langfuse(
        host=str(settings.langfuse_host),
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key.get_secret_value(),
    )
