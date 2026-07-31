from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.graphs.analysis_graph import build_analysis_graph
from app.schemas.contracts import HealthResponse, ServiceStatus
from app.services.research import DeterministicFakeWebSearchProvider, SafeWebFetcher

router = APIRouter(prefix="/health", tags=["health"])
SettingsDependency = Annotated[Settings, Depends(get_settings)]


def _health(settings: Settings, status: ServiceStatus = "ok") -> HealthResponse:
    return HealthResponse(
        environment=settings.environment,
        service=settings.service_name,
        status=status,
    )


@router.get("", response_model=HealthResponse)
async def health(settings: SettingsDependency) -> HealthResponse:
    return _health(settings)


@router.get("/live", response_model=HealthResponse)
async def live(settings: SettingsDependency) -> HealthResponse:
    return _health(settings)


@router.get("/ready", response_model=HealthResponse)
async def ready(settings: SettingsDependency) -> HealthResponse:
    return _health(settings)


@router.get("/agents", response_model=HealthResponse)
async def agents(settings: SettingsDependency) -> HealthResponse:
    build_analysis_graph()
    return _health(settings)


@router.get("/research", response_model=HealthResponse)
async def research(settings: SettingsDependency) -> HealthResponse:
    _ = DeterministicFakeWebSearchProvider()
    _ = SafeWebFetcher(
        allowed_schemes={"http", "https"},
        allowed_content_types={"text/html", "text/plain", "application/xhtml+xml"},
        maximum_page_bytes=settings.research_max_page_bytes,
        maximum_redirects=settings.research_max_redirects,
        timeout_seconds=settings.research_fetch_timeout_seconds,
        block_private_networks=settings.research_block_private_networks,
    )
    return _health(settings)


@router.get("/experiments", response_model=HealthResponse)
async def experiments(settings: SettingsDependency) -> HealthResponse:
    return _health(settings)
