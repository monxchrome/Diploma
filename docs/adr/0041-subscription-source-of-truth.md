# ADR 0041: Subscription source of truth

Verified provider state is authoritative for subscription lifecycle changes. A checkout success redirect is informational only. Duplicate and out-of-order events are retained as safe audit state but cannot duplicate or regress a subscription mutation.
