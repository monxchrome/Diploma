# ADR 0045: Analysis AUTO preset

## Status

Accepted

## Decision

Implement `AUTO` only as a client-side resolver over the existing valid modes. AUTO resolves to `MULTI_AGENT`, Focused to `SINGLE_AGENT`, and Multi-perspective to `MULTI_AGENT`.

## Consequences

No API, graph or persistence change is required. The browser never invents a new server mode.
