# Engineering Operating Rules

## Boundaries

- Phase 1 is infrastructure and smoke integration only.
- Do not add authentication, product workflows, RAG, agents, or analysis implementation without an explicit phase change.
- Keep service boundaries strict: web calls the NestJS API; NestJS calls the FastAPI service; shared TypeScript contracts live in `packages/contracts`; Python mirrors the same contract surface with Pydantic schemas.

## Verification

Run the smallest relevant checks while working, then run the full available suite before handing off:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm prisma:validate
docker compose config
```

For Python-only changes:

```bash
cd apps/ai-service
uv run ruff check .
uv run pyright
uv run pytest
```

## Conventions

- Preserve strict TypeScript and strict Python type checking.
- Do not bypass validation schemas or weaken compiler settings to make a check pass.
- Do not disable tests or skip failing suites as a substitute for a fix.
- Do not add secrets, real credentials, or production tokens.
- Update README and architecture notes when commands, service boundaries, ports, or infrastructure behavior changes.
- Keep comments rare and focused on non-obvious constraints or trade-offs.
