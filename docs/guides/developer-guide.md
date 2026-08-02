# Developer Guide

The repository is a pnpm/Turborepo monorepo. Web code calls the NestJS API; the API calls FastAPI; TypeScript contracts live in `packages/contracts`; Python mirrors API-facing schemas. Do not bypass validation or move provider secrets into browser code.

Use Node 24.0.0, pnpm 11.17.0, Python 3.12, and uv. Run `pnpm install --frozen-lockfile`, `uv sync --group dev` in `apps/ai-service`, then the root format/lint/typecheck/test/build commands. Prisma historical migrations are immutable. The `1.0.0` root package version is checked by `pnpm release:version:check`; use `pnpm release:preflight` before release work.

Follow the phase architecture and ADRs. New product capabilities require an explicit phase change; release work should prioritize defects, security, reproducibility, documentation, and verification evidence.
