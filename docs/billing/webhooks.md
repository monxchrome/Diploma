# Webhooks

`POST /api/webhooks/stripe` receives the raw request body and verifies the provider signature before parsing. Raw payloads and card data are never stored. Only a payload hash, provider event ID, type, processing state, and safe failure code are persisted.

Duplicate provider IDs are idempotent. Events with an older provider timestamp cannot overwrite a newer subscription event. A provider subscription must match stored customer ownership, trusted plan metadata, and a known plan definition; unknown prices, customers, or metadata mismatches are rejected without granting entitlement. Unsupported events are safely marked processed.
