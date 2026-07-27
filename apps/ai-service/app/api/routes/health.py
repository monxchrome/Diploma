from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.contracts import HealthResponse, ServiceStatus

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
