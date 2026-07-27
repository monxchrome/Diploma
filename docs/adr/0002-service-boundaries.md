# ADR 0002: Service Boundaries

## Status

Accepted

## Decision

Use three application boundaries in Phase 1:

- `apps/web`: UI and browser-facing Next.js route handlers.
- `apps/api`: public backend API, persistence adapters, Redis/BullMQ foundation, and Python service client.
- `apps/ai-service`: Python runtime integrations and graph execution smoke checks.

Browser code calls the Next.js internal route. The Next.js route calls the NestJS API. The NestJS API calls the FastAPI service.

## Consequences

- CORS is constrained to the API edge and local development origins.
- Request ID propagation can be tested across all services.
- Future domain logic has clear ownership but is not implemented in Phase 1.
