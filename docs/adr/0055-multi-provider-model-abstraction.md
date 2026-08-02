# ADR 0055: Multi-provider model abstraction

## Decision

Use a FastAPI provider registry with one neutral request/result contract for OpenAI, Anthropic and the Ollama runtime.

## Consequences

NestJS stores trusted profiles and safe invocation metadata, while keys and raw provider payloads remain in the AI service. Provider-specific capabilities are recorded rather than assumed.
