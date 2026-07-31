# Phase 8 Architecture

Phase 8 adds server-controlled billing without changing the existing project ownership model. A user owns one billing account through their `Subscription` and optional `BillingCustomer`; a project operation is charged to the project owner captured when the operation starts.

`PlanDefinition` stores versioned FREE, PRO, and TEAM definitions. `EntitlementsService` resolves the exact subscription plan version, applies valid, non-expired overrides, and falls back to the latest FREE definition only when paid access is no longer effective.

Checkout, customer portal, and webhooks are adapter operations behind `BillingProvider`. The browser can submit only a paid plan code. Price IDs, URLs, customer IDs, and subscription identifiers stay server-side. Stripe webhooks and controlled fake-provider events update subscriptions; a browser redirect never grants a plan.

Usage is an immutable idempotent ledger. Account and project aggregates are rebuildable from events. Reservations use PostgreSQL advisory transaction locks and expiry to prevent concurrent requests from exceeding a limit. Existing data remains readable after a downgrade; only new, limited operations are rejected.
