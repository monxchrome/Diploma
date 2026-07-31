# Stripe

Stripe uses the official SDK. Configure server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_TEAM_PRICE_ID`; never expose them through `NEXT_PUBLIC_` variables.

The API creates or reuses a customer only for the authenticated checkout owner. Checkout is subscription mode with server-owned success/cancel URLs, trusted price ID, idempotency key, and validated metadata. Stripe Customer Portal is created with the stored customer ID. Manual Stripe smoke testing requires test credentials and is not performed by automated tests.
