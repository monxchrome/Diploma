FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

FROM base AS dependencies
COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock* ./apps/ai-service/
WORKDIR /app/apps/ai-service
RUN uv sync --no-dev

FROM dependencies AS development
RUN uv sync --group dev
COPY apps/ai-service /app/apps/ai-service
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM dependencies AS production
RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser apps/ai-service /app/apps/ai-service
USER appuser
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
