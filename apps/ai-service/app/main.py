from fastapi import FastAPI
from fastapi.middleware import Middleware
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.ingestions import router as ingestions_router
from app.api.routes.retrieval import router as retrieval_router
from app.api.routes.system import router as system_router
from app.core.config import get_settings
from app.core.errors import RequestContextMiddleware, register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.infrastructure.langfuse import initialize_langfuse


async def root() -> dict[str, str]:
    return {
        "service": get_settings().service_name,
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.service_name, settings.environment)
    logger = get_logger()

    middleware = [
        Middleware(
            CORSMiddleware,
            allow_credentials=False,
            allow_headers=["*"],
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_origins=settings.cors_origin_list,
        ),
        Middleware(RequestContextMiddleware, body_limit_bytes=settings.body_limit_bytes),
    ]
    app = FastAPI(
        title="Decision Intelligence AI Service",
        description="Phase 1 AI service foundation",
        version="0.1.0",
        middleware=middleware,
    )
    app.state.logger = logger
    app.state.langfuse = initialize_langfuse(settings)

    app.add_api_route("/", root, include_in_schema=False, methods=["GET"])

    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(ingestions_router)
    app.include_router(retrieval_router)
    app.include_router(system_router)
    return app


app = create_app()
