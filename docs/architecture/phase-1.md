# Phase 1 Architecture

## Scope

Phase 1 creates the project foundation and verifies the service-to-service path. It intentionally stops before authentication, domain workflows, RAG, agents, analytics, or SaaS tenant features.

## Runtime Flow

```text
Browser
  -> Next.js status page
  -> Next.js GET /api/status
  -> NestJS GET /api/system/status
  -> FastAPI POST /v1/system/echo
  -> LangGraph echo graph
  -> JSON response
```

The same `X-Request-ID` is propagated across the path. If a caller does not provide it, the edge service creates one.

## Services

`apps/web` is the user-facing status surface. It validates runtime configuration with Zod and calls only its internal route from browser code.

`apps/api` owns the public API prefix `/api`, OpenAPI docs at `/docs`, JSON error shape, request ID middleware, health endpoints, Prisma, Redis, BullMQ, and the HTTP client for the Python service.

`apps/ai-service` owns the FastAPI app, Pydantic schemas, structured logging, Langfuse initialization hooks, and the LangGraph echo graph.

## Contracts

TypeScript contracts are implemented with Zod in `packages/contracts`. Python mirrors the same Phase 1 shape with Pydantic models in `apps/ai-service/app/schemas/contracts.py`.

The chosen strategy is documented in `docs/adr/0003-contract-strategy.md`.

## Observability

The foundation includes JSON structured logging, request IDs, service and environment fields, latency logs in the API, and safe error responses. OpenTelemetry collector/exporter wiring is intentionally left for a later phase.

## Security

The foundation includes CORS allowlists, safe headers, body size limits, rate-limit wiring in NestJS, environment validation, non-root Docker users, `.env.example` placeholders, and no real credentials.
