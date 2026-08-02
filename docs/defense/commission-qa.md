# Expected Commission Questions

**How do you prevent hallucinations?** The system does not guarantee prevention. It scopes retrieval, validates citations, exposes uncertainties and quality gates, and treats output as decision support.

**Why use multiple agents?** The implementation provides a bounded orchestration comparison surface. It does not claim a universal quality improvement; the hypothesis needs actual benchmark evidence.

**How is external web research controlled?** It is explicit, server-owned, bounded by provider/policy/time/size/redirect limits, and blocks private-network access by default.

**How do you protect data?** Project authorization, private storage, hashed share tokens, controlled exports, logging redaction, and server-side secrets are implemented. Deployment-specific controls still require operator verification.

**Can results be reproduced?** The benchmark design records frozen inputs, profiles, parameters, budgets, seeds, hashes, and safe outputs. Cloud model behaviour may still vary; a completed source artifact is required for a real result claim.

**Is the release ready for production?** Not yet. The audit identifies missing demo seed/reset, full regression evidence, migration rehearsals, and recovery drill as release blockers.
