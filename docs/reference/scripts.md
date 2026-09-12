# Scripts

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

Runnable scripts declared by the project's package manager.

| Script | Command |
| --- | --- |
| `build` | `turbo run build` |
| `credits:check` | `tsx scripts/credits-integrity-check.ts` |
| `db:deploy` | `prisma migrate deploy --schema apps/api/prisma/schema.prisma` |
| `db:generate` | `prisma generate --schema apps/api/prisma/schema.prisma` |
| `db:migrate` | `prisma migrate dev --schema apps/api/prisma/schema.prisma` |
| `db:reset` | `prisma migrate reset --schema apps/api/prisma/schema.prisma` |
| `db:seed` | `tsx scripts/seed.ts` |
| `db:studio` | `prisma studio --schema apps/api/prisma/schema.prisma` |
| `dev` | `turbo run dev` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `lint` | `pnpm run lint:code && pnpm run lint:adherence` |
| `lint:adherence` | `oxlint -c design-system/_adherence.oxlintrc.json apps/web` |
| `lint:code` | `eslint .` |
| `services:down` | `docker compose -f infrastructure/docker-compose.yml down` |
| `services:up` | `docker compose -f infrastructure/docker-compose.yml up -d` |
| `test` | `vitest run --project unit --passWithNoTests --no-file-parallelism` |
| `test:adverse` | `vitest run --project adverse --passWithNoTests --no-file-parallelism` |
| `test:visual` | `vitest run --project visual --passWithNoTests --no-file-parallelism` |
| `test:watch` | `vitest --project unit --no-file-parallelism` |
| `typecheck` | `tsc --noEmit -p tsconfig.json && turbo run typecheck` |
