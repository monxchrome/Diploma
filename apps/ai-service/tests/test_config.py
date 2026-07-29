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


def test_phase_five_agent_model_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENT_PLANNER_PROVIDER", "ollama")
    monkeypatch.setenv("AGENT_PLANNER_MODEL", "planner-model")
    monkeypatch.setenv("AGENT_SPECIALIST_PROVIDER", "ollama")
    monkeypatch.setenv("AGENT_SPECIALIST_MODEL", "specialist-model")
    monkeypatch.setenv("AGENT_COORDINATOR_PROVIDER", "ollama")
    monkeypatch.setenv("AGENT_COORDINATOR_MODEL", "coordinator-model")
    monkeypatch.setenv("AGENT_CRITIC_PROVIDER", "ollama")
    monkeypatch.setenv("AGENT_CRITIC_MODEL", "critic-model")
    monkeypatch.setenv("ANALYSIS_MIN_QUALITY_SCORE", "0.75")
    monkeypatch.setenv("ANALYSIS_MIN_GROUNDING_SCORE", "0.8")
    monkeypatch.setenv("ANALYSIS_ALLOW_DEGRADED_REPORT", "false")

    settings = Settings()

    assert settings.agent_planner_model == "planner-model"
    assert settings.agent_specialist_model == "specialist-model"
    assert settings.agent_coordinator_model == "coordinator-model"
    assert settings.agent_critic_model == "critic-model"
    assert settings.analysis_min_quality_score == 0.75
    assert settings.analysis_min_grounding_score == 0.8
    assert settings.analysis_allow_degraded_report is False
