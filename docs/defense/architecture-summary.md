# Architecture Summary for Defence

The browser sends authenticated requests to the NestJS API. The API applies project authorization, quotas, auditing, and job control, then delegates AI work through a private FastAPI service boundary. PostgreSQL is the authoritative state store, MinIO holds private objects, Qdrant holds derived retrieval vectors, and Redis/BullMQ carries asynchronous work. Controlled web research and model providers are server-owned and bounded; credentials never enter browser contracts.

The design intentionally separates the normal decision-support lane from the research benchmark lane. Reporting operates on immutable sanitized snapshots, while reproducibility exports preserve hashes, versioned configuration, budgets, and safe results without exposing hidden reasoning or provider secrets. See the [architecture overview](../architecture/overview.md) for the diagram.
