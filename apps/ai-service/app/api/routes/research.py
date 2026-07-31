from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.research import (
    ResearchExecutionRequest,
    ResearchExecutionResponse,
    ResearchPlan,
    ResearchPolicy,
)
from app.services.research import (
    DeterministicFakeWebSearchProvider,
    FixtureWebFetcher,
    ResearchError,
    ResearchExecutor,
    SafeWebFetcher,
    build_research_plan,
    create_provider,
)

router = APIRouter(prefix="/v1/internal/research", tags=["internal"])
_cancelled_runs: set[str] = set()
_run_status: dict[str, str] = {}


def _require_internal_secret(secret: str | None) -> None:
    if secret != get_settings().ingestion_internal_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal authentication failed"
        )


def _server_policy(settings: Settings, requested: ResearchPolicy) -> ResearchPolicy:
    schemes: list[Literal["http", "https"]] = []
    for item in settings.research_allowed_schemes.split(","):
        if item.strip() == "http":
            schemes.append("http")
        if item.strip() == "https":
            schemes.append("https")
    content_types = [
        item.strip().casefold()
        for item in settings.research_allowed_content_types.split(",")
        if item.strip()
    ]
    return ResearchPolicy(
        enabled=settings.external_research_enabled and requested.enabled,
        policyVersion=settings.research_policy_version,
        provider=settings.research_provider,
        maximumQueries=min(requested.maximum_queries, settings.research_max_queries),
        maximumResultsPerQuery=min(
            requested.maximum_results_per_query, settings.research_results_per_query
        ),
        maximumFetchedPages=min(
            requested.maximum_fetched_pages, settings.research_max_fetched_pages
        ),
        maximumPageBytes=min(requested.maximum_page_bytes, settings.research_max_page_bytes),
        maximumTotalBytes=min(requested.maximum_total_bytes, settings.research_max_total_bytes),
        maximumContextTokens=min(
            requested.maximum_context_tokens, settings.research_max_context_tokens
        ),
        totalTimeoutSeconds=min(
            requested.total_timeout_seconds, settings.research_total_timeout_seconds
        ),
        allowedSchemes=schemes,
        allowedContentTypes=content_types,
        blockPrivateNetworks=settings.research_block_private_networks,
        domainAllowlist=[
            item.strip().casefold()
            for item in settings.research_domain_allowlist.split(",")
            if item.strip()
        ],
        domainDenylist=[
            item.strip().casefold()
            for item in settings.research_domain_denylist.split(",")
            if item.strip()
        ],
        failureMode=requested.failure_mode,
    )


def _executor(settings: Settings, policy: ResearchPolicy) -> ResearchExecutor:
    fetcher = SafeWebFetcher(
        allowed_schemes=set(policy.allowed_schemes),
        allowed_content_types=set(policy.allowed_content_types),
        maximum_page_bytes=policy.maximum_page_bytes,
        maximum_redirects=settings.research_max_redirects,
        timeout_seconds=settings.research_fetch_timeout_seconds,
        block_private_networks=policy.block_private_networks,
    )
    if policy.provider.casefold() == "fake":
        return ResearchExecutor(DeterministicFakeWebSearchProvider(), FixtureWebFetcher(fetcher))
    return ResearchExecutor(
        create_provider(
            policy.provider,
            settings.research_api_key.get_secret_value(),
            settings.research_fetch_timeout_seconds,
        ),
        fetcher,
    )


@router.post("/plan", response_model=ResearchPlan)
async def plan(
    payload: ResearchExecutionRequest,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> ResearchPlan:
    _require_internal_secret(internal_secret)
    settings = get_settings()
    request = payload.model_copy(update={"policy": _server_policy(settings, payload.policy)})
    return build_research_plan(request)


@router.post("/execute", response_model=ResearchExecutionResponse)
async def execute(
    payload: ResearchExecutionRequest,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> ResearchExecutionResponse:
    _require_internal_secret(internal_secret)
    settings = get_settings()
    request = payload.model_copy(update={"policy": _server_policy(settings, payload.policy)})
    _cancelled_runs.discard(request.research_run_id)
    _run_status[request.research_run_id] = "RUNNING"
    try:
        response = await _executor(settings, request.policy).execute(
            request, lambda: request.research_run_id in _cancelled_runs
        )
        _run_status[request.research_run_id] = response.status
        return response
    except ResearchError as error:
        _run_status[request.research_run_id] = "FAILED"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "RESEARCH_FAILED", "message": str(error)},
        ) from error


@router.post("/cancel")
async def cancel(
    payload: dict[str, str],
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> dict[str, str]:
    _require_internal_secret(internal_secret)
    research_run_id = payload.get("researchRunId")
    if not research_run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="researchRunId is required"
        )
    _cancelled_runs.add(research_run_id)
    _run_status[research_run_id] = "CANCELLED"
    return {"researchRunId": research_run_id, "status": "CANCELLED"}


@router.get("/{research_run_id}/status")
async def get_status(
    research_run_id: str,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> dict[str, str]:
    _require_internal_secret(internal_secret)
    return {
        "researchRunId": research_run_id,
        "status": _run_status.get(research_run_id, "UNKNOWN"),
        "observedAt": datetime.now().isoformat(),
    }
