# Phase 3 Architecture

Phase 3 adds project-scoped knowledge bases and an asynchronous document-ingestion path. The browser asks NestJS for an upload intent, uploads directly to the private MinIO bucket using a short-lived signed PUT URL, and calls complete-upload. NestJS verifies the object size, creates an idempotent BullMQ job, and owns all lifecycle metadata.

The worker calls FastAPI with a request ID, ingestion job ID, typed payload, timeout, and an internal service secret. FastAPI downloads the object with service credentials, validates its signature and safe container limits, normalizes and chunks text deterministically, creates local deterministic embeddings, and upserts Qdrant points. NestJS writes chunks atomically and activates the version only after successful completion.

The internal endpoint is not a browser API. It rejects requests without `X-Internal-Service-Secret`; it never receives user cookies or JWTs. Document content and embedding vectors are not logged.

Current parsers are safe-text for TXT/Markdown/HTML and a guarded stdlib DOCX reader. PDF is accepted at upload validation but requires a production Docling adapter before it can complete. The development scanner is signature and structural validation only, not malware protection; production must provide a fail-closed ClamAV-compatible scanner adapter.
