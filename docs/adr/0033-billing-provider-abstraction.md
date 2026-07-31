# ADR 0033: Billing provider abstraction

Keep billing behind `BillingProvider`. Deterministic fake billing supports local tests; Stripe is the production adapter and webhooks remain provider-state authority.
