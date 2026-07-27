# ADR 0012: Embedding and Vector Index

## Status

Accepted

## Decision

Phase 3 uses a local deterministic 64-dimension embedding for offline-safe testing and Qdrant collection `dip_document_chunks_v1` with cosine distance. It does not implement retrieval or query-time RAG.
