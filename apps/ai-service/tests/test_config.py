import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_validate_urls() -> None:
    settings = Settings.model_validate({"ai_service_url": "http://localhost:8000"})

    assert settings.ai_service_url == "http://localhost:8000"


def test_settings_reject_invalid_url() -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate({"ai_service_url": "localhost:8000"})
