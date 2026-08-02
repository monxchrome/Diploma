from typing import cast

from fastapi.testclient import TestClient
from httpx import Response

from app.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())

    response = cast(Response, client.get("/health"))
    payload = response.json()

    assert response.status_code == 200
    assert isinstance(payload, dict)
    assert payload["service"] == "ai-service"
    assert payload["status"] == "ok"


def test_version_endpoint_returns_safe_metadata() -> None:
    client = TestClient(create_app())

    response = cast(Response, client.get("/health/version"))
    payload = response.json()

    assert response.status_code == 200
    assert payload["version"] == "1.0.0"
    assert payload["apiSchemaVersion"] == "v1"
    assert "secret" not in " ".join(payload).casefold()
