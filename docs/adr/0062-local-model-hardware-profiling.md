# ADR 0062: Local model hardware profiling

## Decision

Associate local-runtime profiles with optional hardware metadata and capture Ollama model metadata where available.

## Consequences

Local Qwen results record model ID, digest, size and quantization and are not silently compared as hardware-independent cloud measurements.
