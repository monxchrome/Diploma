# ADR 0011: Chunking Strategy

## Status

Accepted

## Decision

Use deterministic whitespace-token chunks with a fixed 1,200-token target, 160-token overlap, stable SHA-256 content hashes, and UUIDv5 vector point identifiers. Empty chunks are discarded.
