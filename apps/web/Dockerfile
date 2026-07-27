FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@dip/web", "dev"]

FROM dependencies AS build
COPY . .
RUN pnpm --filter @dip/web build

FROM base AS production
ENV NODE_ENV=production
RUN useradd --create-home --uid 10001 appuser
COPY --from=build --chown=appuser:appuser /app /app
USER appuser
EXPOSE 3000
CMD ["pnpm", "--filter", "@dip/web", "exec", "next", "start", "--port", "3000"]
