# Decision Intelligence Platform

Production-grade Phase 1 foundation for an AI Decision Intelligence Platform. This repository contains a pnpm/Turborepo monorepo with a Next.js web app, NestJS API, FastAPI AI service, shared contracts, local infrastructure, tests, Docker configuration, and CI checks.

Phase 1 implements only infrastructure and a verifiable smoke flow:

```text
Next.js /api/status -> NestJS /api/system/status -> FastAPI /v1/system/echo -> JSON
```

It does not implement authentication, product workflows, RAG, agents, or analysis features.

## Architecture

```text
apps/web        Next.js App Router status UI and internal API route
apps/api        NestJS API, Prisma, Redis, BullMQ, Swagger, health and system modules
apps/ai-service FastAPI service with Pydantic schemas and a LangGraph echo graph
packages/*      Shared contracts, config helpers, lint and TypeScript presets, UI utilities
infrastructure  Reserved directories for Docker, monitoring, and nginx assets
docs            Phase 1 architecture notes and ADRs
```

## Prerequisites

- Node.js 24 LTS or newer compatible LTS runtime
- pnpm 11 via Corepack
- Python 3.12 or newer
- uv
- Docker and Docker Compose

## Setup

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
cd apps/ai-service
uv sync --group dev
cd ../..
cp .env.example .env
```

## Environment

All local defaults are documented in `.env.example`. Use `.env` for local overrides only. Never put production credentials or real provider keys in this repository.

Important values:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
AI_SERVICE_URL=http://localhost:8000
DATABASE_URL=postgresql://dip_user:dip_password@localhost:5432/dip?schema=public
REDIS_URL=redis://localhost:6379/0
BULLMQ_CONNECTION_URL=redis://localhost:6379/1
```

## Local Infrastructure

Core infrastructure:

```bash
pnpm infra:up
pnpm infra:logs
pnpm infra:down
```

Optional heavier services:

```bash
docker compose --profile ai-heavy up -d ollama
docker compose --profile observability up -d langfuse
```

## Development

Run infrastructure in Docker and apps locally with hot reload:

```bash
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Service URLs:

```text
Web:        http://localhost:3000
API:        http://localhost:3001
Swagger:    http://localhost:3001/docs
AI Service: http://localhost:8000
AI Docs:    http://localhost:8000/docs
Qdrant:     http://localhost:6333/dashboard
MinIO:      http://localhost:9001
Langfuse:   http://localhost:3002
Ollama:     http://localhost:11434
```

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm infra:up
pnpm infra:down
pnpm infra:logs
pnpm db:migrate
pnpm db:generate
pnpm db:studio
pnpm healthcheck
```

Python-only commands:

```bash
cd apps/ai-service
uv run ruff check .
uv run pyright
uv run pytest
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## End-to-End Smoke Check

With infrastructure and all three apps running:

```bash
curl -H "X-Request-ID: smoke-1" http://localhost:3000/api/status
```

Expected response includes:

```json
{
  "services": {
    "web": "ok",
    "api": "ok",
    "aiService": "ok"
  },
  "requestId": "smoke-1"
}
```

## Troubleshooting

- If `pnpm` is unavailable, run `corepack enable` and `corepack prepare pnpm@11.17.0 --activate`.
- If `uv` is unavailable, install it before Python checks.
- If Prisma cannot connect, confirm `pnpm infra:up` started PostgreSQL and `DATABASE_URL` matches `.env`.
- If `/api/status` returns an upstream error, check that `apps/api` is running on port `3001` and `apps/ai-service` is running on port `8000`.
- If optional Langfuse or Ollama services are slow to start, keep them in their Docker Compose profiles and run core checks first.
