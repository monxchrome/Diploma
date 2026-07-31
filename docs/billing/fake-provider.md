# Fake Billing Provider

`DeterministicFakeBillingProvider` has deterministic customer and checkout identifiers, signed normalized events, cancellation, resume, and a controlled completion operation. Its checkout redirect intentionally does nothing to a subscription.

In a non-production environment with `BILLING_FAKE_PROVIDER_ENABLED=true`, the authenticated owner can complete a stored fake checkout at `POST /api/billing/fake/checkout/:sessionId/complete`. This endpoint is unavailable for Stripe and production. `BILLING_PROVIDER=fake` is rejected in production unless the explicit unsafe override is set.
