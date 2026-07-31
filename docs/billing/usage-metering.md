# Usage metering and quota reservations

The immutable ledger records successful analysis runs, model token/cost events when supplied, research queries, fetched pages, experiment runs, exports, uploaded storage, and active-member metrics. An idempotency key ties each event to its source resource, so BullMQ redelivery cannot double count it. Aggregates can be rebuilt deterministically from the ledger.

Before a costly action, the API resolves entitlements, takes a transaction-scoped advisory lock, includes active reservations, and inserts an expiring reservation. Completion finalizes actual usage; cancellation/failure releases it. A quota error returns `QUOTA_EXCEEDED`, resource, current usage, limit, reset date, upgrade flag, and allowed plan options.

Estimated AI cost is operational telemetry, not an invoice source of truth.
