from datetime import UTC, datetime
from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette import status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp, ExceptionHandler

from app.schemas.contracts import ApiErrorResponse


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(
        RequestValidationError, cast(ExceptionHandler, validation_error_handler)
    )
    app.add_exception_handler(Exception, cast(ExceptionHandler, unhandled_error_handler))


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return _json_error(
        code="VALIDATION_ERROR",
        message="Request validation failed",
        request=request,
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        details=exc.errors(),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request.app.state.logger.error(
        "Unhandled exception",
        error=str(exc),
        request_id=getattr(request.state, "request_id", None),
    )
    return _json_error(
        code="INTERNAL_SERVER_ERROR",
        message="Internal server error",
        request=request,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _json_error(
    *,
    code: str,
    message: str,
    request: Request,
    status_code: int,
    details: object | None = None,
) -> JSONResponse:
    body = ApiErrorResponse(
        error={
            "code": code,
            "details": details,
            "message": message,
            "path": request.url.path,
            "requestId": getattr(request.state, "request_id", "unknown"),
            "timestamp": datetime.now(UTC),
        }
    )
    return JSONResponse(
        status_code=status_code, content=body.model_dump(mode="json", by_alias=True)
    )


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, body_limit_bytes: int) -> None:
        super().__init__(app)
        self.body_limit_bytes = body_limit_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.body_limit_bytes:
            return _json_error(
                code="PAYLOAD_TOO_LARGE",
                message="Request body is too large",
                request=request,
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        request_id = request.headers.get("x-request-id") or request.headers.get("X-Request-ID")
        request.state.request_id = request_id[:128] if request_id else "unknown"
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response
