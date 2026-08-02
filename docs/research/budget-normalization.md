# Budget Normalization

`EQUAL_TOTAL_TOKEN_BUDGET` fixes a total configured output-token envelope across variants; the implementation records each role budget and flags the result as an approximation because providers count tokens differently. `PRODUCTION_DEFAULT_BUDGET` preserves each profile's configured operating budget.

Estimates are preflight guards, not invoices. Actual provider usage, latency and cost estimates are stored per invocation when available. A missing field remains missing rather than being fabricated.
