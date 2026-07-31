# ADR 0037: Billing provider abstraction

Billing providers expose provider-neutral checkout, portal, subscription, webhook, and health operations. Stripe-specific objects do not cross the adapter boundary. This permits deterministic fake billing without weakening the production Stripe boundary.
