# Build Reproducibility

The release source of truth is the root `package.json` version. `pnpm release:version:check` verifies that application/package manifests, the Python package, and the release manifest mirror it. A deployment must set `DEPLOYMENT_VERSION` to that same value; production preflight additionally requires a Git SHA, ISO-8601 build timestamp, and `DEPLOYMENT_DIRTY=false`.

| Input                   | Pinned or declared value                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Node.js                 | `24.0.0` in `.nvmrc`; CI uses Node 24                                                                |
| pnpm                    | `11.17.0` in `packageManager`                                                                        |
| Python                  | `3.12` in `.python-version` and the AI package requirement                                           |
| JavaScript dependencies | `pnpm-lock.yaml` with frozen installs in CI and Docker                                               |
| Python dependencies     | `apps/ai-service/uv.lock` with `uv sync --group dev`                                                 |
| Docker bases            | Explicit Node, Python, Postgres, Redis, Qdrant, MinIO, Caddy, and Ollama tags in Compose/Dockerfiles |
| Locale/time             | Build timestamps must be UTC ISO-8601 values; operational scripts use UTC timestamps                 |

The final image digest, SBOM, commit SHA, build timestamp, and tested platform are not generated in this source-only audit. They must be attached to the actual release candidate; see [release manifest](release-manifest.json).
