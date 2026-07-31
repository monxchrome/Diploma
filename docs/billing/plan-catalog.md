# Plan Catalog

The trusted catalog is `apps/api/src/modules/billing/billing.types.ts`. Each plan has a code, version, public display fields, feature list, entitlements, and a provider price key. The persisted `PlanDefinition` snapshot carries the same versioned fields.

The public plans endpoint never returns provider price keys or price IDs. Checkout accepts only `PRO` or `TEAM`; the API resolves the active catalog version and the matching server configuration key (`STRIPE_PRO_MONTHLY_PRICE_ID` or `STRIPE_TEAM_MONTHLY_PRICE_ID`). Bump `BILLING_PLAN_CATALOG_VERSION` before changing an existing plan's policy.
