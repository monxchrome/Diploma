import json

import httpx
import pytest

from app.core.config import Settings
from app.infrastructure.model_providers import (
    ModelMessage,
    ModelProviderRequest,
    OpenAIModelProvider,
    TrustedModelProfile,
)
from app.schemas.benchmark import BenchmarkDecisionOutput
from app.services.benchmark import validate_output_citations


def openai_profile() -> TrustedModelProfile:
    return TrustedModelProfile(
        id="profile-openai",
        provider="OPENAI",
        exactModelId="gpt-test-pinned-2026-01-01",
        family="OPENAI",
        runtime="CLOUD",
    )


@pytest.mark.asyncio
async def test_openai_adapter_uses_pinned_profile_and_validates_structured_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer test-key"
        payload = json.loads(request.content)
        assert payload["model"] == "gpt-test-pinned-2026-01-01"
        assert payload["response_format"]["type"] == "json_schema"
        return httpx.Response(
            200,
            headers={"x-request-id": "provider-request"},
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {
                                    "recommendation": "Run a reversible pilot.",
                                    "rationale": "The frozen evidence supports a bounded trial.",
                                    "risks": ["Demand uncertainty"],
                                    "alternatives": ["Defer"],
                                    "missingInformation": ["Competitor response"],
                                    "citations": ["E1"],
                                    "confidence": "MEDIUM",
                                }
                            )
                        },
                    }
                ],
                "usage": {"completion_tokens": 12, "prompt_tokens": 34},
            },
        )

    settings = Settings.model_validate({"OPENAI_API_KEY": "test-key"})
    provider = OpenAIModelProvider(settings, httpx.MockTransport(handler))
    request = ModelProviderRequest(
        modelProfile=openai_profile(),
        messages=[ModelMessage(role="user", content="Use only frozen evidence.")],
        temperature=0,
        topP=1,
        maxOutputTokens=256,
        timeout=10,
        requestId="benchmark-test",
    )

    result, output = await provider.generate_structured(request, BenchmarkDecisionOutput)

    assert result.exact_model_id == openai_profile().exact_model_id
    assert result.input_tokens == 34
    assert result.output_tokens == 12
    assert output.citations == ["E1"]
    assert result.raw_response_hash


def test_invalid_citations_are_removed_without_claiming_semantic_grounding() -> None:
    output = BenchmarkDecisionOutput(
        recommendation="Pilot",
        rationale="Bounded approach",
        citations=["E1", "invented"],
        confidence="LOW",
    )

    validated, invalid = validate_output_citations(output, {"E1"})

    assert validated.citations == ["E1"]
    assert invalid == ["invented"]
