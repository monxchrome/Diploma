# ADR 0008: Private Direct Document Storage

## Status

Accepted

## Decision

Use server-generated object keys and short-lived, SigV4-signed MinIO PUT URLs. The bucket is private and initialized without anonymous access. NestJS verifies object existence and size before queueing ingestion.
