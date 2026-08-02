from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.infrastructure.model_providers import (
    ModelProviderError,
    ModelProviderRegistry,
    TrustedModelProfile,
)
from app.schemas.benchmark import BenchmarkExecutionRequest, BenchmarkExecutionResponse
from app.services.benchmark import execute_benchmark_case

router = APIRouter(prefix="/v1/internal/benchmarks", tags=["internal"])


def _authorize(internal_secret: str | None) -> None:
    if internal_secret != get_settings().ingestion_internal_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal authentication failed"
        )


@router.post("/model-profiles/health")
async def health_check_model_profile(
    profile: TrustedModelProfile,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> dict[str, object]:
    _authorize(internal_secret)
    try:
        provider = ModelProviderRegistry(get_settings()).for_profile(profile)
        health = await provider.health_check(profile)
        metadata = await provider.get_model_metadata(profile)
        return {"health": health, "metadata": metadata.model_dump(by_alias=True)}
    except ModelProviderError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": error.code, "message": str(error)},
        ) from error


@router.post("/case-runs", response_model=BenchmarkExecutionResponse)
async def execute_case_run(
    payload: BenchmarkExecutionRequest,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> BenchmarkExecutionResponse:
    settings = get_settings()
    _authorize(internal_secret)
    if not settings.benchmark_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "BENCHMARK_DISABLED", "message": "Benchmark execution is disabled"},
        )
    try:
        return await execute_benchmark_case(payload, settings)
    except ModelProviderError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": error.code, "message": str(error)},
        ) from error
