# ADR 0003: Contract Strategy

## Status

Accepted

## Decision

Use TypeScript Zod schemas as the Phase 1 source for shared browser/API contracts, and mirror only the required API boundary models in Python with Pydantic.

This is a deliberately small starting point. The migration path for later phases is OpenAPI-first generation from the NestJS API once the domain surface stabilizes. At that point TypeScript clients and Python models should be generated from the same OpenAPI document.

## Consequences

- Phase 1 keeps runtime validation in TypeScript without introducing a generation pipeline too early.
- Python schemas are limited to externally exchanged messages and must stay aligned with the ADR.
- Any new cross-service message requires updating `packages/contracts`, Python Pydantic schemas, tests, and this documentation if the strategy changes.
