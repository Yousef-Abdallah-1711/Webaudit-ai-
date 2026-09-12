# Database and Migrations

The authoritative schema is `apps/api/prisma/schema.prisma`; reviewed SQL migrations live in `apps/api/prisma/migrations/`. `apps/api/src/db/client.ts` is the API Prisma singleton and `apps/worker/src/db.ts` is the worker DB entry point.

Use `pnpm db:migrate` for development migrations, `pnpm db:deploy` for deployment, `pnpm db:generate` to generate the Prisma client, and `pnpm db:seed` for seed data. Do not treat generated client output as source documentation.
