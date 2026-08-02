# Verification Evidence

This ledger separates commands that actually ran from checks that still require an isolated service environment. A `NOT EXECUTED` entry is not a passing result.

| Check                                               | Status                                 | Evidence                                                                                                                                    |
| --------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Version mirror check                                | PASS                                   | `pnpm release:version:check` completed on 2026-08-02.                                                                                       |
| Production-metadata preflight fixture               | PASS                                   | `pnpm release:preflight -- --production docs/release/fixtures/production-preflight.env` completed on 2026-08-02; fixture has no secrets.    |
| Static demo artifact check                          | PASS                                   | `pnpm demo:verify` completed on 2026-08-02; it validates only `datasets/demo/release-1.0.0.json`.                                           |
| Working-tree whitespace check                       | PASS                                   | `git diff --check` completed on 2026-08-02.                                                                                                 |
| Formatting                                          | PASS                                   | `pnpm format` completed on 2026-08-02.                                                                                                      |
| Lint                                                | PASS                                   | `pnpm lint` completed on 2026-08-02.                                                                                                        |
| Typecheck                                           | PASS WITH 83 EXISTING PYRIGHT WARNINGS | `pnpm typecheck` completed with zero errors. Warnings are pre-existing unknown/stub diagnostics.                                            |
| Tests                                               | PASS WITH 2 PYTHON TEST WARNINGS       | `pnpm test` completed: API 41, web 16, contracts 8, Python 71 tests passed.                                                                 |
| Build                                               | PASS                                   | `pnpm build` completed: API, web, packages, and Python bytecode build passed.                                                               |
| Prisma format/validate                              | PASS                                   | `prisma format` and `pnpm prisma:validate` completed on 2026-08-02.                                                                         |
| Development and production Compose validation       | PASS                                   | `docker compose config` and production Compose config completed.                                                                            |
| JavaScript dependency audit                         | PASS                                   | A first audit found 5 high / 2 moderate findings. Advisory-specific overrides were added; a second audit reported no known vulnerabilities. |
| Python dependency audit                             | PASS                                   | `pip-audit --local` reported no known vulnerabilities.                                                                                      |
| License inventory                                   | PASS WITH REVIEW REQUIRED              | `pnpm licenses list --prod` and `pip-licenses` ran; see [license inventory](license-inventory.md).                                          |
| Container image build and runtime smoke             | NOT EXECUTED                           | Needs Docker daemon, final image inputs, and isolated services.                                                                             |
| Full E2E, browser, accessibility, responsive checks | NOT EXECUTED                           | Requires running web/API/AI services and test data.                                                                                         |
| Clean migration, upgrade rehearsal, backup/restore  | NOT EXECUTED                           | Destructive/recovery operations require disposable infrastructure.                                                                          |
| Real provider smoke and paid checkout               | NOT EXECUTED                           | Not authorized; no credentials were used.                                                                                                   |

## Required handoff commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm prisma:validate
docker compose config
docker compose --env-file .env.production -f docker-compose.prod.yml config
pnpm release:preflight -- --production .env.production
pnpm demo:verify
```

For the AI service, run `uv sync --group dev`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pyright`, and `uv run pytest`. Record the command, tool version, start/end time, exit code, relevant environment identity, and artifact/log location for every non-trivial test.
