ARG APP_VERSION=1.0.0

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@dip/web", "dev"]

FROM dependencies AS build
ARG APP_VERSION
ENV NEXT_PUBLIC_RELEASE_VERSION=${APP_VERSION}
COPY . .
RUN pnpm --filter @dip/contracts build
RUN pnpm --filter @dip/web build

FROM base AS production
ARG APP_VERSION
LABEL org.opencontainers.image.title="decision-intelligence-web" \
  org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
  APP_VERSION=${APP_VERSION}
RUN useradd --create-home --uid 10001 appuser
COPY --from=build --chown=appuser:appuser /app/apps/web/.next/standalone /app
COPY --from=build --chown=appuser:appuser /app/apps/web/.next/static /app/apps/web/.next/static
USER appuser
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
