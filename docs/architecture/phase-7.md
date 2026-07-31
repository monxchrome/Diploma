# Phase 7 Architecture

Phase 7 adds production deployment, server-owned plans and entitlements, subscriptions, billing adapters, usage metering, and quota reservations. Browser code receives only safe billing snapshots and calls NestJS; NestJS remains the sole authority for plan selection, Stripe price mapping, ledger writes, and webhook processing.

```text
Browser -> Caddy (TLS) -> Next.js / NestJS -> PostgreSQL, Redis, MinIO, Qdrant
                                      -> FastAPI (internal network only)
                                      -> BillingProvider (fake or Stripe)
```

`UsageEvent` is immutable and idempotent. `UsageAggregate` is a deterministic projection. A quota check locks the user/project/metric period, includes outstanding reservations, then creates a short-lived reservation before expensive work starts. Completion finalizes only actual consumption; failure releases unused capacity.

The FREE plan uses no provider customer. Paid plans are active only from provider webhook state; a checkout redirect is never an entitlement signal.
