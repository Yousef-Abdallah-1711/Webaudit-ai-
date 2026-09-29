# syntax=docker/dockerfile:1
#
# WebAudit AI — apps/web production image.
# Phase 8 (production-without-Paymob-or-AI master plan).
#
# The one unit with a real build step (`next build`) — infrastructure/
# deploy.md's own summary table. `output: 'standalone'`
# (apps/web/next.config.ts) makes that build produce a self-contained
# `.next/standalone/server.js` plus only the `node_modules` the app actually
# traces as used, which is what makes the final `runner` stage here small
# and correct without hand-copying a workspace-symlinked `node_modules` tree.
#
# Same `turbo prune --docker` shape as apps/api/apps/worker (see
# apps/api/Dockerfile's header for the full reasoning).
#
# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t webaudit-web .

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

FROM base AS pruner
COPY . .
# `apps/web`'s own `package.json` lists `@webaudit/api` and
# `@webaudit/worker` as real (dev) dependencies — its e2e suite
# (`tests/e2e/**`) imports `startApi`/`startWorker` directly to drive a real
# stack. `turbo prune` does not distinguish dev from prod dependencies, so
# pruning for `@webaudit/web` legitimately pulls both of those apps' source
# in too, which is why the Prisma-generate step below is needed here as well
# — confirmed by hitting `next build`'s own `Checking validity of types`
# step failing on `apps/api/src/app.ts`'s `../prisma/generated/client`
# import otherwise (its e2e test files reach that import transitively).
RUN npx --yes turbo@2.10.11 prune @webaudit/web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ ./
# See apps/api/Dockerfile's identical comment: `node-linker=hoisted` here
# only (never the repo's own `.npmrc`) is what makes Prisma 6.1.0's own
# `generate` pre-check able to resolve `@prisma/client` inside a freshly
# `turbo prune`d workspace at all.
RUN pnpm install --frozen-lockfile --config.node-linker=hoisted
# `turbo prune --docker` copies only files reachable from a package.json,
# and turbo.json's own `globalDependencies` entry for `tsconfig.base.json`
# affects cache hashing only — not `out/full`'s contents. `apps/web/
# tsconfig.json` extends this root file by relative path, and `next build`
# genuinely reads it (unlike apps/api/apps/worker, which run via `tsx` and
# never invoke tsc), so it must be copied in by hand or the build fails with
# "Cannot read file '/app/tsconfig.base.json'" — confirmed by hitting
# exactly that error before adding this line.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/out/full/ ./
# @webaudit/api's own generated Prisma client — needed only so `next
# build`'s type-check step can resolve it via the e2e test files' import
# chain (see the `pruner` stage's own comment); never used at runtime by
# apps/web itself.
WORKDIR /app/apps/api
RUN pnpm exec prisma generate --schema prisma/schema.prisma
WORKDIR /app
# NEXT_PUBLIC_API_URL is what apps/web/lib/api.ts's API_BASE actually reads
# (client-side fetches call apps/api directly from the browser), and Next.js
# inlines every NEXT_PUBLIC_* reference at build time — there is no runtime
# override for it once this image exists. A prior comment here claimed
# "nothing public needs to be baked in," which was wrong: without this ARG,
# the build falls back to API_BASE's own http://localhost:3001 default and
# every client-side fetch in production silently targets the visitor's own
# machine (found via a real deploy producing exactly that symptom, not
# assumed from reading the code). docker-compose.production.yml passes this
# as a build arg from the same API_URL the container also gets at runtime.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# DOCKER_BUILD=1 is what next.config.ts checks to turn on `output:
# 'standalone'` — gated rather than unconditional so a plain local `next
# build` (apps/web/tests/e2e, tests/visual) never pays for a standalone
# trace it does not use; see that config's own comment for the real failure
# this avoids.
RUN DOCKER_BUILD=1 pnpm --filter @webaudit/web build
# No `apps/web/public` directory exists in this repo today (fonts/icons are
# self-hosted as regular imports, not static public assets — T127/T247's own
# note) — Next's own convention treats `public/` as optional, but `COPY`
# requires the source path to exist, so this keeps the `runner` stage's copy
# unconditional and safe if one is ever added later.
RUN mkdir -p apps/web/public

FROM base AS runner
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 webaudit \
  && useradd --system --uid 1001 --gid webaudit --create-home --shell /usr/sbin/nologin webaudit
# The standalone server needs exactly three things: its own traced
# node_modules + server.js (`standalone/`), the static assets Next serves
# directly rather than through the traced server (`static/`), and the
# public/ directory — none of the rest of the monorepo.
COPY --from=installer --chown=webaudit:webaudit /app/apps/web/.next/standalone ./
COPY --from=installer --chown=webaudit:webaudit /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=webaudit:webaudit /app/apps/web/public ./apps/web/public
USER webaudit
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
