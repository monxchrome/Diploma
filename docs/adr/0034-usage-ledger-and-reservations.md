# ADR 0034: Usage ledger and reservations

Use immutable, idempotent events plus deterministic aggregates. Use expiring reservations under a database lock for race-safe hard limits.
