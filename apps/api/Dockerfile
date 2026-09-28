# syntax=docker/dockerfile:1
#
# WebAudit AI — apps/api production image.
# Phase 8 (production-without-Paymob-or-AI master plan).
#
# This monorepo runs TypeScript directly via `tsx` for apps/api/apps/worker —
# no compiled JS output (infrastructure/deploy.md's own note: "No build
# step... this monorepo runs TypeScript directly via tsx"). So "build" here
# means `turbo prune`'d source + a real `pnpm install`, never a transpile
# step — the pruned .ts source IS the runtime artifact, exactly as it is
# outside a container.
#
# `turbo prune --docker` is the officially documented pnpm+turborepo Docker
# layout: `out/json/` (only the package.json files needed for a cacheable
# `pnpm install`, before any source changes bust the cache) and `out/full/`
# (the actual pruned source for @webaudit/api and every workspace package it
# depends on — including @webaudit/api's own AI-executor/config/etc.
# dependencies — nothing unrelated to this one deployable unit).
#
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t webaudit-api .

FROM node:22-bookworm-slim AS base
# Prisma's query-engine binary links against OpenSSL and only warns (falling
# back to a guessed version) without it — installed explicitly per Prisma's
# own Docker guidance, not left to the fallback guess.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Fixed, world-readable cache path — `corepack prepare` below runs as root
# (default at this point) and would otherwise cache pnpm under /root's own
# $HOME, invisible to the non-root `webaudit` user the `runner` stage switches
# to. Without this, `pnpm` at container runtime tries to re-fetch pnpm from
# the registry and fails with no network egress — verified directly via a
# real `docker compose up` smoke test (the `migrate` service failed with
# `getaddrinfo EAI_AGAIN registry.npmjs.org` before this fix).
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.10.11 prune @webaudit/api --docker

FROM base AS installer
# Dependency manifests only, first — so an ordinary source change does not
# invalidate this layer's `pnpm install` cache.
COPY --from=pruner /app/out/json/ ./
# `node-linker=hoisted` for this build stage only (never the repo's own
# `.npmrc`, which local dev still uses unmodified): a real, flat
# node_modules tree rather than pnpm's default symlinked/virtual-store
# isolation, which is what actually made Prisma 6.1.0's own `generate`
# pre-check able to resolve `@prisma/client` at all inside a freshly
# `turbo prune`d workspace — verified directly (DEBUG=prisma:* tracing)
# that its internal resolution failed against the isolated layout even
# though a plain `require.resolve('@prisma/client')` succeeded there,
# meaning the CLI's own check uses something stricter than Node's own
# module resolution.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
# The real pruned source, on top of the already-installed dependencies.
COPY --from=pruner /app/out/full/ ./
# Prisma's query-engine binary must match the container's own OS/libc, never
# the host that ran `docker build` (Windows dev workstation, in this repo's
# case) — always regenerated here from the pruned schema, never copied from
# a host-generated `prisma/generated/client`. Run from apps/api's own
# directory (matching exactly how a local `pnpm --filter @webaudit/api`
# script already runs) rather than through `pnpm --filter ... exec`, which
# could not resolve `@prisma/client` correctly against this pruned
# workspace's isolated node_modules layout.
WORKDIR /app/apps/api
RUN pnpm exec prisma generate --schema prisma/schema.prisma
WORKDIR /app
# Phase 12's own real deployment smoke test found a genuine gap: Postgres has
# no published port in this topology (`backend` is `internal: true`, by
# design — P8-T4), so an operator's own machine can never reach it directly,
# and `scripts/bootstrap-admin.ts` (Phase 7) is root-level tooling `turbo
# prune`'s pruned tree never included — there was no way to actually
# bootstrap the first admin against a real deployment at all. Copied in from
# the `pruner` stage's own unpruned `/app` (same technique as apps/web's
# `tsconfig.base.json`); its imports are relative paths into `apps/api`,
# already present here, so it runs unmodified via
# `docker compose ... run --rm api node --import tsx scripts/bootstrap-admin.ts <email>`
# — see infrastructure/deploy.md's own runbook section.
COPY --from=pruner /app/scripts ./scripts
# Real, critical gap Phase 12's own end-to-end smoke test found: apps/api is
# the ONLY process in this whole deployment that ever calls
# `reconcileCapabilitiesAtBoot` (apps/api/src/index.ts) — apps/worker never
# does — and that reconciliation reads `packages/capabilities-vendored/`
# from a path hardcoded relative to apps/api/src/services/registry/boot.ts.
# apps/api's own package.json has no dependency on any individual
# `@webaudit/capability-*` package (only apps/worker does), so `turbo prune
# @webaudit/api` correctly never included this directory — and without it,
# api's boot-time discovery finds zero capabilities on every real
# deployment, forever: the `Capability` table never gets populated by
# anything else, so every real scan's every module resolves to
# NOT_APPLICABLE. Confirmed directly: a real scan against a freshly deployed,
# unpatched image returned NOT_APPLICABLE for every requested module: a
# functionally broken product on a genuinely fresh install. Copied in from
# the `pruner` stage's own unpruned `/app` (1.4MB, manifests + `.ts` entry
# files only — `.dockerignore` already excludes each capability's own local
# `node_modules`, which api never needs since it only reads each manifest
# and asserts the entrypoint *file* exists, `assert-local.ts`'s own check —
# it never imports or executes a capability itself, only apps/worker does).
COPY --from=pruner /app/packages/capabilities-vendored ./packages/capabilities-vendored
# Every capability directory (and the parent itself) is its own pnpm
# workspace member (pnpm-workspace.yaml: `packages/capabilities-vendored`
# and `packages/capabilities-vendored/*`) — copying their `package.json`
# files in without their entries ever having been part of `out/json/`
# confuses the next, `--frozen-lockfile` install ("specifiers in the
# lockfile don't match specs in package.json"). api needs none of it: only
# each `capability.manifest.json` and its declared entrypoint source file
# (`assert-local.ts`'s own check is a file-existence check, never an
# import), so every `package.json` is removed right after copying —
# `discoverCapabilities` never reads one.
RUN find packages/capabilities-vendored -name package.json -delete
# Now that generation is done (it needs the root's `prisma` CLI
# devDependency), reinstall production-only: removes `prisma`, `typescript`,
# `vitest`, and every other devDependency from the image that ships. `tsx`
# survives this because it is a real `dependencies` entry of @webaudit/api
# now (this app's own "start" script genuinely cannot run without it,
# unlike the tooling this step removes) — the already-generated
# `prisma/generated/client` source files are untouched, only node_modules
# is re-resolved.
# `confirmModulesPurge=false` is required, not cosmetic: switching from a
# full install to `--prod` here needs pnpm to wipe and rebuild node_modules,
# which pnpm normally gates behind an interactive (Y/n) prompt. Under `docker
# build` that prompt reads EOF on stdin and silently no-ops instead of
# purging — verified directly: without this flag the shipped image still
# contained typescript/vitest/prisma at full size (946MB); with it,
# `Packages: +1 -327` actually runs and node_modules drops to ~254MB.
RUN pnpm install --prod --frozen-lockfile --config.node-linker=hoisted --config.confirmModulesPurge=false

FROM base AS runner
ENV NODE_ENV=production
# Non-root by default — never run application code as the container's root
# user, the same discipline `apps/sandbox-runner`'s isolation design already
# applies to untrusted-capability execution, extended here to every unit.
RUN groupadd --system --gid 1001 webaudit \
  && useradd --system --uid 1001 --gid webaudit --create-home --shell /usr/sbin/nologin webaudit
COPY --from=installer --chown=webaudit:webaudit /app ./
USER webaudit
EXPOSE 3001
# `/health` (apps/api/src/app.ts) is real, unauthenticated, and deliberately
# mounted ahead of the rate limiters — safe to hit every 15s without ever
# training the limiter to see this container as a client.
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# `pnpm --filter` rather than a hand-built `node --import tsx ...` invocation
# — this is the exact same "start" script `infrastructure/deploy.md`'s
# runbook and every local dev session already use, so the container runs
# literally the same command a human would type, not a Docker-only
# reinterpretation of it.
CMD ["pnpm", "--filter", "@webaudit/api", "start"]
