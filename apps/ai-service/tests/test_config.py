import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_validate_urls() -> None:
    settings = Settings.model_validate({"ai_service_url": "http://localhost:8000"})

    assert settings.ai_service_url == "http://localhost:8000"


def test_settings_reject_invalid_url() -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate({"ai_service_url": "localhost:8000"})


def test_rag_environment_aliases_and_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RETRIEVAL_SCORE_THRESHOLD", "0.2")
    monkeypatch.setenv("RERANKER_ENABLED", "true")
    monkeypatch.setenv("RERANKER_MODEL", "reranker-test")
    monkeypatch.setenv("RAG_ENABLED", "true")
    monkeypatch.setenv("RAG_PROVIDER", "ollama")
    monkeypatch.setenv("RAG_MODEL", "fallback-model")
    monkeypatch.setenv("OLLAMA_RAG_MODEL", "preferred-model")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434")
    settings = Settings()
    assert settings.retrieval_score_threshold == 0.2
    assert settings.reranker_enabled
    assert settings.reranker_model == "reranker-test"
    assert settings.rag_generation_enabled
    assert settings.rag_provider == "ollama"
    assert settings.rag_model == "preferred-model"
    assert settings.ollama_url == "http://ollama:11434"
