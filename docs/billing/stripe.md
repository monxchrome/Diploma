# Stripe adapter

`StripeBillingProvider` calls Stripe's server API with trusted price IDs only. Checkout and portal return URLs come from configuration, not request input. Customer IDs and subscription IDs stay server-side; no card data is stored.

`POST /api/webhooks/stripe` verifies the timestamped Stripe signature before parsing, hashes rather than persists the payload, stores the event ID under a provider-unique key, and ignores duplicates. Webhooks, rather than browser redirects, update subscriptions. Exercise real payment scenarios in Stripe test mode: checkout, renewal, payment failure, cancellation at period end, resume, and out-of-order delivery.

The deterministic fake provider is for tests/local development. It produces reproducible checkout identifiers and signed test webhook events, but is not a production payment processor.
