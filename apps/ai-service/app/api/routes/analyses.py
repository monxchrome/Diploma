from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.graphs.analysis_graph import execute_analysis
from app.infrastructure.analysis_models import ModelOutputValidationError, ModelUnavailableError
from app.schemas.analysis import AnalysisExecutionResponse, AnalysisInput

router = APIRouter(prefix="/v1/internal", tags=["internal"])


@router.post("/analyses", response_model=AnalysisExecutionResponse)
async def analyze(
    payload: AnalysisInput,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> AnalysisExecutionResponse:
    if internal_secret != get_settings().ingestion_internal_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal authentication failed"
        )
    try:
        return await execute_analysis(payload)
    except ModelUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "MODEL_UNAVAILABLE", "message": str(error)},
        ) from error
    except ModelOutputValidationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "MODEL_OUTPUT_INVALID", "message": str(error)},
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
