# ADR 0025: Controlled external web research

External research is an opt-in analysis evidence mode, not an agent capability. `INTERNAL_ONLY` remains the default. `EXTERNAL_ONLY` and `HYBRID` require user consent and a server-side feature switch, and all requests are bounded by a versioned policy persisted with the run.
