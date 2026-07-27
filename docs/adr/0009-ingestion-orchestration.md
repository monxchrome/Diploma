# ADR 0009: Ingestion Orchestration

## Status

Accepted

## Decision

NestJS owns document lifecycle and BullMQ jobs; FastAPI performs bounded document processing through an authenticated internal endpoint. Completion is idempotent for a document version and failed processing exposes only a sanitized error.
