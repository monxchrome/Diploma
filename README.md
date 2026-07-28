# Decision Intelligence Platform

Production-grade foundation for an AI Decision Intelligence Platform. This repository contains a pnpm/Turborepo monorepo with a Next.js web app, NestJS API, FastAPI AI service, shared contracts, local infrastructure, tests, Docker configuration, and CI checks.

Phase 1 implements infrastructure and a verifiable smoke flow:

```text
Next.js /api/status -> NestJS /api/system/status -> FastAPI /v1/system/echo -> JSON
```

Phase 2 adds identity, access, sessions, profile management, and project management. Phase 3 adds project-scoped knowledge bases, private direct-to-MinIO document upload, and asynchronous ingestion; it does not implement query-time RAG, agents, billing, subscriptions, or analysis workflows.

Phase 4 adds project-scoped dense, sparse, and hybrid retrieval plus grounded Q&A. There is no web search, tool calling, autonomous agent, or long-term agent memory.

## Architecture

```text
apps/web        Next.js App Router status, auth, dashboard, projects, and settings UI
apps/api        NestJS API, Prisma, Redis, BullMQ, Swagger, health, auth, users, sessions, audit, and projects modules
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
JWT_ACCESS_SECRET=replace-with-local-development-access-secret-32
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL=30d
REFRESH_TOKEN_PEPPER=replace-with-local-development-refresh-pepper-32
AUTH_COOKIE_NAME=dip_refresh
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
MINIO_ENDPOINT=http://localhost:9000
MINIO_BUCKET=dip-documents
DOCUMENT_MAX_UPLOAD_BYTES=25000000
INGESTION_INTERNAL_SECRET=replace-with-local-development-ingestion-secret-32
RETRIEVAL_CANDIDATE_LIMIT=40
RETRIEVAL_TIMEOUT_SECONDS=20
DENSE_WEIGHT=1
SPARSE_WEIGHT=1
RAG_GENERATION_ENABLED=false
RAG_MODEL=llama3.2:3b
```

Production must replace the JWT secret and refresh pepper, and must use secure cookie settings. `AUTH_COOKIE_SAME_SITE=none` requires `AUTH_COOKIE_SECURE=true`.

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

Frontend routes:

```text
/login
/register
/dashboard
/projects
/projects/new
/projects/[projectId]
/settings/profile
/settings/sessions
```

Auth and project API routes:

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/logout-all
GET    /api/auth/me
GET    /api/auth/sessions
DELETE /api/auth/sessions/:sessionId
GET    /api/users/me
PATCH  /api/users/me
POST   /api/projects
GET    /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId
POST   /api/projects/:projectId/restore
GET    /api/projects/:projectId/members
POST   /api/projects/:projectId/retrieval/search
POST   /api/projects/:projectId/retrieval/ask
POST   /api/projects/:projectId/retrieval/responses/:ragResponseId/feedback
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
pnpm retrieval:reindex -- --dry-run --verify
```

Auth/project checks are included in:

```bash
pnpm --filter @dip/api test
pnpm --filter @dip/web test
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

## Auth Smoke Check

With PostgreSQL, Redis, web, and API running, register or sign in through `http://localhost:3000/register` or `http://localhost:3000/login`. The API sets the refresh token as an HttpOnly cookie; the web app keeps the access token only in memory and retries one request after a successful refresh.

## Troubleshooting

- If `pnpm` is unavailable, run `corepack enable` and `corepack prepare pnpm@11.17.0 --activate`.
- If `uv` is unavailable, install it before Python checks.
- If Prisma cannot connect, confirm `pnpm infra:up` started PostgreSQL and `DATABASE_URL` matches `.env`.
- If auth refresh fails in the browser, confirm `NEXT_PUBLIC_API_BASE_URL` points to a browser-reachable API URL and that `CORS_ORIGINS` includes the web origin.
- If cookies are not set cross-site, confirm `credentials: include`, `AUTH_COOKIE_SAME_SITE`, `AUTH_COOKIE_SECURE`, and `AUTH_COOKIE_DOMAIN`.
- If `/api/status` returns an upstream error, check that `apps/api` is running on port `3001` and `apps/ai-service` is running on port `8000`.
- If optional Langfuse or Ollama services are slow to start, keep them in their Docker Compose profiles and run core checks first.
- The `minio-init` service creates the private document bucket. If uploads return 404, run `docker compose up -d minio minio-init`.
- Failed ingestion jobs retain sanitized status metadata in PostgreSQL; inspect `IngestionJob` rows or the BullMQ queue. Reprocessing creates a new immutable version in the next increment.
- Hybrid indexing uses `dip_document_chunks_v2` with named `dense` and `sparse` vectors. The v1 collection is not deleted. Reindex is idempotent and accepts `--project`, `--knowledge-base`, `--document`, `--batch-size`, `--resume`, `--force`, `--verify`, and `--dry-run`.
- Sparse retrieval is a CPU-only local deterministic baseline. `RAG_GENERATION_ENABLED=false` keeps Ask extractive and grounded; enabling an Ollama model is an operational choice and does not enable tools or web access.
- TXT, Markdown, HTML, DOCX, and PDF uploads are accepted. PDF completion currently requires a production Docling adapter. The development file scanner is structural validation, not malware scanning; production must configure a fail-closed scanner.
