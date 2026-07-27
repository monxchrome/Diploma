FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@dip/api", "dev"]

FROM dependencies AS build
COPY . .
RUN pnpm --filter @dip/api db:generate
RUN pnpm --filter @dip/api build

FROM base AS production
ENV NODE_ENV=production
RUN useradd --create-home --uid 10001 appuser
COPY --from=build --chown=appuser:appuser /app /app
USER appuser
EXPOSE 3001
CMD ["pnpm", "--filter", "@dip/api", "start"]
