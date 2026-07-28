# Phase 4 Architecture

Phase 4 introduces a deterministic, project-scoped retrieval path: browser to NestJS authorization, then an authenticated internal FastAPI request. FastAPI executes dense and sparse Qdrant retrieval, RRF fusion for hybrid requests, deterministic reranking/evidence selection, and optional grounded answer construction. NestJS owns public serialization, history, citations, feedback, and audit boundaries.

The active collection is `dip_document_chunks_v2`. It keeps named `dense` and `sparse` vectors in one collection and carries mandatory project and lifecycle payload fields. The previous dense-only collection is intentionally retained. `pnpm retrieval:reindex -- --dry-run --verify` reads completed active chunks from PostgreSQL and idempotently upserts the v2 points; it never deletes a collection. Rollback is a configuration/traffic switch back to the prior collection while v2 is retained for investigation.

Search never invokes answer generation. Ask invokes the same retrieval pipeline and only returns citations whose evidence IDs, document IDs, and quotations were selected from the evidence pack. If no evidence remains after filtering, it returns an explicit insufficient-evidence answer.
