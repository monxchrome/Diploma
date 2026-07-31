# ADR 0039: Usage ledger

Usage is modeled as immutable, idempotent events and derived aggregates. Aggregates are a performance projection only and can be rebuilt from the ledger. Provider invoice values are not derived from estimated model costs.
