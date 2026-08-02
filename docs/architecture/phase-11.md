# Phase 11 Architecture

Phase 11 adds a separately governed scientific-benchmark lane. It does not alter the Phase 5 analysis graph, the Phase 6 synthetic experiment worker, or the normal Home composer.

```text
Web benchmark workspace -> NestJS benchmark API -> BullMQ benchmarks queue
                                                -> FastAPI provider registry
                                                   -> OpenAI | Anthropic | Ollama runtime
PostgreSQL <- immutable suite/dataset/evidence/run/invocation/evaluation records
```

`ModelProfile` is server-owned and pins provider, model family, exact model identifier, runtime, capability metadata, cost profile and local hardware metadata. OpenAI and Anthropic are cloud providers. Ollama is a local runtime; Qwen is a model family recorded in the profile, never an Ollama model family. API keys and arbitrary provider URLs never leave the AI service.

Benchmark suites refer to frozen dataset versions and versioned prompt/model assignments. A run persists its protocol, budget mode, seed, random execution plan, environment snapshot, per-case invocation metadata, safe output snapshot, deterministic metrics, failures and statistical comparisons. Used profiles, evidence packages and frozen suites remain immutable.

`CONTROLLED_EVIDENCE` reuses one frozen evidence package for the same benchmark case and does not trigger retrieval or live research. `END_TO_END` makes a per-case synthetic evidence snapshot in the Phase 11 lane; it is explicitly labelled as pipeline evidence, not controlled architecture evidence. Both modes maintain project authorization.

The provider adapters normalize structured output, usage, latency, errors and metadata. They persist hashes and safe accounting fields, not raw requests/responses or hidden reasoning. Statistical summaries use paired case/repetition observations, deterministic bootstrap intervals and Holm correction; they present limitations rather than declare an overall winner.

The Phase 11 schema change is `0011_phase_11_benchmarking`. It is additive and does not change Phase 1–10 migrations. The opt-in `benchmark:seed` script is idempotent and adds inert placeholder profiles, prompt identities, rubric, judge policy and synthetic controlled cases. A profile becomes eligible only after an administrator supplies a pinned exact model ID.

Requesting a reproducibility export creates a private ZIP in the configured benchmark bucket. It contains the manifest, structured case outputs, safe invocation accounting, evaluations and statistical comparisons; an authorized requester receives only a short-lived signed download URL. The archive intentionally excludes prompts, raw provider payloads, hidden reasoning, secrets and private evidence text.

Known boundary: Phase 11 evaluates configured benchmark variants; it does not fine-tune models, choose production routing, create thesis prose or implement Phase 12 release material.
