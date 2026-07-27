# ADR 0010: Document Parsing

## Status

Accepted

## Decision

Files are streamed to a temporary file, validated by signature, and deleted in a `finally` path. HTML is parsed without executing scripts or loading external resources. DOCX ZIP entry and decompressed-size limits are enforced. Docling is the intended production PDF adapter.
