# Billing Overview

Billing is account-owner scoped. Every project operation uses the project owner's entitlement and records usage against that owner, even when an editor starts it. The owner snapshot is persisted for queued analyses, experiments, and uploads so a later ownership change cannot rewrite historical usage.

FREE requires neither a provider customer nor Stripe configuration. PRO and TEAM use the configured provider through a narrow adapter boundary. Stripe is the only production adapter; fake billing is deterministic and restricted to development and tests.
