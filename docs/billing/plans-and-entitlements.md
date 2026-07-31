# Plans and entitlements

The catalog is versioned by `BILLING_PLAN_CATALOG_VERSION` and provides FREE, PRO, and TEAM plans. It includes limits for projects, members, knowledge bases, documents, storage, uploads, monthly analysis/research/fetch/experiment consumption, experiment variants/repetitions, concurrency, JSON/CSV exports, research, and experiments.

Plan, price, subscription status, provider identifiers, and overrides are never accepted from browser input. The FREE plan has no Stripe dependency. Paid access is derived from a verified provider subscription and remains available through the paid period when cancellation is scheduled. Downgrades preserve data but block future creations above the new limit.

Administrative overrides are explicit, time-bound, and must be audit logged. They are not returned to ordinary users.
