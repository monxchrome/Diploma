# Decision Intelligence Platform

Production-grade foundation for an AI Decision Intelligence Platform. This repository contains a pnpm/Turborepo monorepo with a Next.js web app, NestJS API, FastAPI AI service, shared contracts, local infrastructure, tests, Docker configuration, and CI checks.

Phase 1 implements infrastructure and a verifiable smoke flow:

```text
Next.js /api/status -> NestJS /api/system/status -> FastAPI /v1/system/echo -> JSON
```

Phase 2 adds identity, access, sessions, profile management, and project management. Phase 3 adds project-scoped knowledge bases, private direct-to-MinIO document upload, and asynchronous ingestion; it does not implement query-time RAG, agents, billing, subscriptions, or analysis workflows.

Phase 4 adds project-scoped dense, sparse, and hybrid retrieval plus grounded Q&A. There is no web search, tool calling, autonomous agent, or long-term agent memory.

Phase 5 adds a bounded, asynchronous decision-analysis engine. A decision analysis uses the existing project-scoped retrieval boundary, then executes either a single-agent baseline or a fixed LangGraph workflow with allowlisted market, financial, legal/regulatory, risk, and strategy specialists. The graph persists sanitized checkpoints and validates citations before an immutable report is stored. It supports queued-run cancellation and idempotent BullMQ redelivery.

Phase 6 adds controlled, explicitly enabled external research and a scientific evaluation dashboard. Analyses support `INTERNAL_ONLY`, `EXTERNAL_ONLY`, and `HYBRID` evidence modes. External research is disabled by default, follows a server-owned safety policy, uses bounded provider/search/fetch calls, stores immutable source snapshots, and assigns external evidence identifiers `W1…`; no browser can submit provider credentials or arbitrary tools. Phase 6 also adds project-scoped experiment variants, test cases, queued runs, metric exports, and versioned human evaluation. The initial experiment worker reports deterministic synthetic metrics labelled `SYNTHETIC_EVALUATION`; it is a smoke/integration baseline, not a production benchmark.

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
EXTERNAL_RESEARCH_ENABLED=false
EXTERNAL_RESEARCH_DEFAULT_MODE=INTERNAL_ONLY
RESEARCH_PROVIDER=fake
RESEARCH_API_KEY=
RESEARCH_MAX_QUERIES=3
RESEARCH_MAX_FETCHED_PAGES=5
RESEARCH_MAX_TOTAL_BYTES=2000000
RESEARCH_BLOCK_PRIVATE_NETWORKS=true
RESEARCH_QUEUE_NAME=external-research
EXPERIMENT_QUEUE_NAME=experiments
EXPERIMENT_MAX_VARIANTS=4
EXPERIMENT_MAX_CASES=10
EVALUATION_RUBRIC_VERSION=phase-6-v1
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

The Ollama container is configured to use one NVIDIA GPU when Docker Desktop
GPU support is available. On Windows, enable the WSL 2 engine and GPU support
in Docker Desktop, then verify the host driver with `nvidia-smi`. To select a
specific GPU, set `OLLAMA_GPU_DEVICES` (for example, `0`) in `.env`; the CPU
continues to run the API and other services alongside GPU inference.

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
POST   /api/projects/:projectId/analyses
GET    /api/projects/:projectId/analyses
GET    /api/projects/:projectId/analyses/:analysisId
POST   /api/projects/:projectId/analyses/:analysisId/run
POST   /api/projects/:projectId/analyses/:analysisId/cancel
GET    /api/projects/:projectId/research/policy
GET    /api/projects/:projectId/analyses/:analysisId/runs/:runId/research
GET    /api/projects/:projectId/analyses/:analysisId/runs/:runId/research/queries
GET    /api/projects/:projectId/analyses/:analysisId/runs/:runId/research/sources
GET    /api/projects/:projectId/analyses/:analysisId/runs/:runId/research/conflicts
GET    /api/projects/:projectId/research/sources/:sourceId
GET    /api/projects/:projectId/research/sources/:sourceId/snapshots/:snapshotId
POST   /api/projects/:projectId/experiments
GET    /api/projects/:projectId/experiments
GET    /api/projects/:projectId/experiments/:experimentId
PATCH  /api/projects/:projectId/experiments/:experimentId
DELETE /api/projects/:projectId/experiments/:experimentId
POST   /api/projects/:projectId/experiments/:experimentId/variants
POST   /api/projects/:projectId/experiments/:experimentId/cases
POST   /api/projects/:projectId/experiments/:experimentId/run
POST   /api/projects/:projectId/experiments/:experimentId/cancel
GET    /api/projects/:projectId/experiments/:experimentId/runs
GET    /api/projects/:projectId/experiments/:experimentId/metrics
GET    /api/projects/:projectId/experiments/:experimentId/report
POST   /api/projects/:projectId/experiments/:experimentId/evaluate
GET    /api/projects/:projectId/experiments/:experimentId/export.json
GET    /api/projects/:projectId/experiments/:experimentId/export.csv
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

The Phase 6 synthetic smoke corpus is at `datasets/phase-6/synthetic-cases.json`. Enable a real provider only with `EXTERNAL_RESEARCH_ENABLED=true`, a configured `RESEARCH_PROVIDER`, and a server-side `RESEARCH_API_KEY`; the provider key is never part of public API input. The research health endpoint is `GET /health/research`; experiment readiness is `GET /health/experiments` on the AI service.

For local deterministic research, create the ignored root `.env` with these exact values:

```dotenv
EXTERNAL_RESEARCH_ENABLED=true
EXTERNAL_RESEARCH_DEFAULT_MODE=HYBRID
RESEARCH_PROVIDER=fake
RESEARCH_API_KEY=
RESEARCH_POLICY_VERSION=phase-6-v1
RESEARCH_MAX_QUERIES=3
RESEARCH_RESULTS_PER_QUERY=5
RESEARCH_MAX_FETCHED_PAGES=5
RESEARCH_MAX_PAGE_BYTES=500000
RESEARCH_MAX_TOTAL_BYTES=2000000
RESEARCH_MAX_REDIRECTS=3
RESEARCH_FETCH_TIMEOUT_SECONDS=10
RESEARCH_TOTAL_TIMEOUT_SECONDS=60
RESEARCH_MAX_CONTEXT_TOKENS=4000
RESEARCH_CACHE_TTL_SECONDS=86400
RESEARCH_ALLOWED_SCHEMES=http,https
RESEARCH_ALLOWED_CONTENT_TYPES=text/html,text/plain,application/xhtml+xml
RESEARCH_BLOCK_PRIVATE_NETWORKS=true
RESEARCH_DOMAIN_ALLOWLIST=
RESEARCH_DOMAIN_DENYLIST=
```

The API and analysis worker use the same root `.env`; the AI service also reads `../../.env` when run from `apps/ai-service`. Startup logs emit only the enabled flag, provider, policy version, and project policy state (`not_configured`); credentials are never logged.

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

## Phase 7 production deployment and billing

Production uses [docker-compose.prod.yml](docker-compose.prod.yml) on a single Linux VM. Caddy is the only service exposing host ports (80/443), handles automatic TLS and HTTP-to-HTTPS redirects, and proxies only the web application and `/api/*`. PostgreSQL, Redis, Qdrant, MinIO, FastAPI, Ollama, and workers remain on private Docker networking.

Copy `.env.production.example` to an ignored `.env.production`, create the external Docker secrets declared by the production Compose file, and deploy with:

```bash
scripts/production/deploy.sh .env.production
```

Migrations are a separate controlled step (`scripts/production/migrate.sh`). The release process runs readiness checks after deployment. Application images can be rolled back only when they remain schema-compatible; database migrations are forward-only. See `docs/deployment/production.md` and `docs/deployment/rollback.md`.

Production configuration validates URL origins, trusted proxy configuration, secure cookie settings, database/Redis/MinIO/Qdrant/internal-service configuration, and provider settings before the app accepts traffic. API secrets may come from environment variables or `*_FILE` Docker secret paths and are never returned or logged.

Phase 8 billing offers server-owned, versioned FREE, PRO, and TEAM catalog entries. The local fake provider is deterministic and needs no Stripe key. Stripe uses trusted configured price IDs, signed webhooks, idempotent event storage, and webhook-driven subscription state; a checkout redirect never grants access. Billing routes are:

```text
GET  /api/billing/plans
GET  /api/billing/subscription
GET  /api/billing/entitlements
GET  /api/billing/usage
POST /api/billing/checkout
POST /api/billing/portal
POST /api/billing/cancel
POST /api/billing/resume
POST /api/webhooks/stripe
```

For local fake billing, retain `BILLING_PROVIDER=fake` and `BILLING_FAKE_PROVIDER_ENABLED=true`. Fake checkout is completed only through the authenticated, non-production controlled endpoint; the redirect itself has no billing effect. Production rejects `BILLING_PROVIDER=fake` unless `BILLING_ALLOW_FAKE_IN_PRODUCTION_UNSAFE=true` is explicitly set, which is intentionally not a supported deployment mode.

For Stripe test mode, configure the server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_TEAM_PRICE_ID` in an ignored environment file, set `BILLING_PROVIDER=stripe`, then forward signed webhooks to `/api/webhooks/stripe`. No real IDs or secrets are committed. `BILLING_PLAN_CATALOG_VERSION` must change when a plan definition changes.

Usage uses an immutable, idempotent ledger with account-scoped reservations for expensive work. Quota rejection returns `QUOTA_EXCEEDED` with the constrained resource, current usage, limit, reset time, and available upgrade options. Users can view safe subscription and usage details at `/settings/billing` and `/settings/usage`. See [billing overview](docs/billing/overview.md) and [billing troubleshooting](docs/billing/troubleshooting.md).

Billing limitations: Stripe is the only production adapter; TEAM is not seat-based billing; there are no usage overage charges, coupons, manual discounts, internal invoices, tax engine, PayPal, crypto, App Store, or Google Play billing. Estimated model cost is telemetry, not an invoice source of truth. Downgrades preserve data, and over-limit users can still read and delete existing resources.

Run `scripts/production/backup.sh .env.production` for timestamped PostgreSQL, MinIO, and Qdrant backup artifacts. Restore is deliberately manual and requires `CONFIRM_RESTORE=yes`; see `docs/deployment/backups-and-restore.md`. The reference deployment is single-region, has no Kubernetes or multi-region failover, cannot automatically roll back a database migration, supports Stripe as the only production payment adapter, and treats estimated AI costs as telemetry rather than invoice truth.
