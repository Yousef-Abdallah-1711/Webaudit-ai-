# syntax=docker/dockerfile:1
#
# WebAudit AI — apps/worker production image.
# Phase 8 (production-without-Paymob-or-AI master plan).
#
# Same `turbo prune --docker` shape as apps/api/Dockerfile (see its own
# header for the full reasoning) — `@webaudit/worker` depends on
# `@webaudit/api` as a real workspace package (it shares the generated
# Prisma client rather than duplicating it — infrastructure/deploy.md's own
# note), so pruning for `@webaudit/worker` automatically pulls
# `@webaudit/api`'s source in too; nothing here special-cases that.
#
# Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t webaudit-worker .

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# See apps/api/Dockerfile's identical fix: a fixed, world-readable cache path
# so the non-root `webaudit` user the `runner` stage runs as can still find
# the pnpm binary `corepack prepare` (running as root) cached here — without
# it, `pnpm` at container runtime tries to re-fetch from the registry and
# fails with no network egress (verified via a real `docker compose up`
# smoke test).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.10.11 prune @webaudit/worker --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ ./
# See apps/api/Dockerfile's identical comment: `node-linker=hoisted` here
# only (never the repo's own `.npmrc`) is what makes Prisma 6.1.0's own
# `generate` pre-check able to resolve `@prisma/client` inside a freshly
# `turbo prune`d workspace at all — verified directly, not assumed.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
COPY --from=pruner /app/out/full/ ./
# Same reasoning as apps/api/Dockerfile: the query-engine binary must match
# this container, so it is regenerated here, never copied from the host.
WORKDIR /app/apps/api
RUN pnpm exec prisma generate --schema prisma/schema.prisma
WORKDIR /app
# See apps/api/Dockerfile's identical step: strips devDependencies
# (`prisma` CLI, `typescript`, `vitest`, ...) from the shipped image now
# that generation is done. `tsx` survives — a real `dependencies` entry of
# both @webaudit/api and @webaudit/worker now, not merely reached via the
# root's devDependency.
# `confirmModulesPurge=false` is required: without it, the interactive
# (Y/n) prompt pnpm shows when switching to `--prod` reads EOF under
# `docker build` and silently no-ops instead of purging devDependencies —
# verified directly against apps/api's identical step (image stayed at full
# size without this flag, dropped ~40% with it).
RUN pnpm install --prod --frozen-lockfile --config.node-linker=hoisted --config.confirmModulesPurge=false

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 webaudit \
  && useradd --system --uid 1001 --gid webaudit --create-home --shell /usr/sbin/nologin webaudit
COPY --from=installer --chown=webaudit:webaudit /app ./
# Real, writable scan-workspace storage — WORKSPACE_BASE_DIR is a required
# boot-time env var (installTerminalTeardown's own guard); the compose file
# mounts a real volume here, this just ensures the mountpoint exists and is
# owned by the user the process actually runs as.
RUN mkdir -p /app/.workspaces && chown webaudit:webaudit /app/.workspaces
USER webaudit
# No EXPOSE: the worker holds no inbound port at all, by design (a pure
# BullMQ consumer reached only via Redis — infrastructure/deploy.md).
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD node apps/worker/docker-healthcheck.mjs
CMD ["pnpm", "--filter", "@webaudit/worker", "start"]
