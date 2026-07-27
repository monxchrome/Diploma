from fastapi import APIRouter, Request

from app.graphs.echo_graph import run_echo_graph
from app.schemas.contracts import AiEchoRequest, AiEchoResponse

router = APIRouter(prefix="/v1/system", tags=["system"])


@router.post("/echo", response_model=AiEchoResponse)
async def echo(payload: AiEchoRequest, request: Request) -> AiEchoResponse:
    request_id = payload.request_id or request.state.request_id
    return run_echo_graph(message=payload.message, request_id=request_id)
