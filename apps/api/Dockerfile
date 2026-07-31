FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
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
RUN pnpm --filter @dip/config build && pnpm --filter @dip/contracts build
RUN pnpm --filter @dip/api db:generate
RUN pnpm --filter @dip/api build

FROM dependencies AS production-dependencies
RUN CI=true pnpm install --frozen-lockfile --prod

FROM base AS production
ENV NODE_ENV=production
RUN useradd --create-home --uid 10001 appuser
COPY --from=production-dependencies --chown=appuser:appuser /app/node_modules /app/node_modules
COPY --from=build --chown=appuser:appuser /app/apps/api /app/apps/api
COPY --from=build --chown=appuser:appuser /app/packages/config /app/packages/config
COPY --from=build --chown=appuser:appuser /app/packages/contracts /app/packages/contracts
RUN find /app -name "*.map" -type f -delete
USER appuser
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
