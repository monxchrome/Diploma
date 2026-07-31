from decimal import Decimal

import pytest

from app.schemas.research import ResearchExecutionRequest
from app.services.calculator import CalculationInput, CalculationRequest, calculate
from app.services.research import (
    DeterministicFakeWebSearchProvider,
    FixtureWebFetcher,
    ResearchExecutor,
    SafeWebFetcher,
    UnsafeUrlError,
    build_research_plan,
)


def _policy() -> dict[str, object]:
    return {
        "enabled": True,
        "policyVersion": "test-v1",
        "provider": "fake",
        "maximumQueries": 3,
        "maximumResultsPerQuery": 3,
        "maximumFetchedPages": 3,
        "maximumPageBytes": 100_000,
        "maximumTotalBytes": 300_000,
        "maximumContextTokens": 4_000,
        "totalTimeoutSeconds": 60,
        "allowedSchemes": ["http", "https"],
        "allowedContentTypes": ["text/html", "text/plain", "application/xhtml+xml"],
        "blockPrivateNetworks": True,
        "domainAllowlist": [],
        "domainDenylist": [],
        "failureMode": "LIMITATION",
    }


def _request(mode: str = "HYBRID") -> ResearchExecutionRequest:
    return ResearchExecutionRequest.model_validate(
        {
            "researchRunId": "d0d2ec7f-cd4f-44bf-9b20-798de5558742",
            "analysisRunId": "decfc7bc-eaa6-4ae5-a0f5-5e63da761312",
            "projectId": "9f7b6b3d-9dc0-40b1-989e-28c2cb9fd198",
            "requestId": "research-test",
            "evidenceMode": mode,
            "decisionQuestion": "Should the company expand to Spain?",
            "evidenceGaps": ["Current public market context"],
            "researchLanguages": ["en"],
            "policy": _policy(),
        }
    )


def test_safe_fetcher_blocks_private_networks_and_credentials() -> None:
    fetcher = SafeWebFetcher(
        allowed_schemes={"http", "https"},
        allowed_content_types={"text/html"},
        maximum_page_bytes=10_000,
        maximum_redirects=1,
        timeout_seconds=1,
        block_private_networks=True,
    )
    for value in (
        "file:///etc/passwd",
        "http://localhost/",
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "https://user:password@example.com/",
    ):
        with pytest.raises(UnsafeUrlError):
            fetcher.validate_url(value)


def test_internal_only_research_plan_contains_no_search_queries() -> None:
    plan = build_research_plan(_request("INTERNAL_ONLY"))
    assert not plan.research_required
    assert plan.search_queries == []


async def test_prompt_injection_source_is_rejected_before_receiving_trusted_evidence() -> None:
    request = _request()
    fetcher = SafeWebFetcher(
        allowed_schemes={"http", "https"},
        allowed_content_types={"text/html", "text/plain", "application/xhtml+xml"},
        maximum_page_bytes=100_000,
        maximum_redirects=3,
        timeout_seconds=1,
        block_private_networks=True,
    )
    response = await ResearchExecutor(
        DeterministicFakeWebSearchProvider(), FixtureWebFetcher(fetcher)
    ).execute(request)
    assert response.status in {"COMPLETED", "COMPLETED_WITH_LIMITATIONS"}
    assert [item.evidence_id for item in response.external_evidence] == ["W1", "W2"]
    assert len(response.sources) == 3
    assert len(response.snapshots) == 3
    assert sum(item.accepted_as_evidence for item in response.sources) == 2
    assert sum(item.pipeline_status == "SECURITY_REJECTED" for item in response.sources) == 1
    rejected = next(item for item in response.sources if item.prompt_injection_detected)
    assert rejected.pipeline_status == "SECURITY_REJECTED"
    assert rejected.accepted_as_evidence is False
    assert rejected.rejection_reason == "PROMPT_INJECTION_DETECTED"
    assert rejected.embedded_citation_ids_ignored is True
    assert rejected.followed_embedded_urls == 0
    assert rejected.exposed_secrets is False
    assert all(item.evidence_id != "E999" for item in response.external_evidence)


def test_calculator_uses_fixed_operations_and_rejects_division_by_zero() -> None:
    result = calculate(
        CalculationRequest(
            operation="weighted_average",
            inputs=[
                CalculationInput(value=Decimal("10"), unit="EUR", source="E1"),
                CalculationInput(value=Decimal("2"), unit="weight", source="E1"),
                CalculationInput(value=Decimal("20"), unit="EUR", source="E2"),
                CalculationInput(value=Decimal("1"), unit="weight", source="E2"),
            ],
        )
    )
    assert result.formula == "sum(value * weight) / sum(weight)"
    with pytest.raises(ValueError, match="division by zero"):
        calculate(
            CalculationRequest(
                operation="divide",
                inputs=[
                    CalculationInput(value=Decimal("1"), unit="EUR", source="E1"),
                    CalculationInput(value=Decimal("0"), unit="EUR", source="E2"),
                ],
            )
        )
