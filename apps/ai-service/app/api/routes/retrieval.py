from fastapi import APIRouter, Header, HTTPException, status

from app.core.config import get_settings
from app.schemas.contracts import AiRetrievalRequest, AiRetrievalResponse
from app.services.retrieval import RetrievalEngine

router = APIRouter(prefix="/v1/internal", tags=["internal"])


@router.post("/retrieval", response_model=AiRetrievalResponse)
async def retrieve(
    payload: AiRetrievalRequest,
    internal_secret: str | None = Header(default=None, alias="x-internal-service-secret"),
) -> AiRetrievalResponse:
    settings = get_settings()
    if internal_secret != settings.ingestion_internal_secret.get_secret_value():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Internal authentication failed"
        )
    try:
        return await RetrievalEngine(settings).retrieve(payload)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
