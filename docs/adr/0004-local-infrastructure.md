# ADR 0004: Local Infrastructure

## Status

Accepted

## Decision

Use Docker Compose for local infrastructure. Core services are PostgreSQL, Redis, Qdrant, and MinIO. Ollama and Langfuse are available through profiles because they are heavier and not required for the core Phase 1 smoke path.

## Consequences

- Application hot reload remains local and fast.
- Infrastructure state is kept in named Docker volumes.
- Optional observability and model-runtime dependencies do not block basic development.
- Local defaults are safe development placeholders and must be overridden for any non-local environment.
