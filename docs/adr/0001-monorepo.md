# ADR 0001: Monorepo Foundation

## Status

Accepted

## Decision

Use a pnpm workspace managed by Turborepo. Applications live under `apps/*`; shared TypeScript packages live under `packages/*`; infrastructure, documentation, datasets, experiments, and scripts are top-level directories.

## Consequences

- Shared contracts and tooling can be versioned together.
- CI can run package-scoped checks through Turborepo.
- Python remains in the same repository but keeps dependency management isolated through `uv`.
- Cross-service changes remain reviewable as one coherent diff without forcing deployment coupling.
