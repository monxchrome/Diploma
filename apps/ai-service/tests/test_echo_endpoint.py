from typing import cast

from fastapi.testclient import TestClient
from httpx import Response

from app.main import create_app


def test_echo_endpoint_uses_request_id() -> None:
    client = TestClient(create_app())

    response = cast(
        Response,
        client.post(
            "/v1/system/echo",
            headers={"X-Request-ID": "req-1"},
            json={"message": "ping", "requestId": "req-1"},
        ),
    )
    payload = response.json()

    assert response.status_code == 200
    assert isinstance(payload, dict)
    assert payload["requestId"] == "req-1"
    assert payload["service"] == "ai-service"
    assert payload["status"] == "ok"
