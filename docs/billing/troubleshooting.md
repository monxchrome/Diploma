# Billing Troubleshooting

- `BILLING_UNAVAILABLE`: verify that the selected paid plan is active and its trusted server price ID is configured.
- `QUOTA_EXCEEDED`: inspect the safe `resource`, `currentUsage`, `limit`, and `resetAt` fields, then remove data, wait for reset, or change plan.
- Stripe webhook rejection: use the exact raw request body and current webhook secret; do not replay a parsed JSON body.
- Fake checkout unavailable: use a non-production environment, set `BILLING_PROVIDER=fake` and `BILLING_FAKE_PROVIDER_ENABLED=true`, and create checkout as the current user first.
- Missing paid entitlement: confirm the provider webhook was processed and that its customer, price, plan code, and plan version match stored trusted records.
