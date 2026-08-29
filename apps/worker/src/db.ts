/**
 * T113 — the worker's own connection to the one Postgres database.
 *
 * `apps/api` owns `schema.prisma` and runs migrations; this reuses its
 * *generated client* (types + query builder, no route or business logic)
 * rather than duplicating a second copy of the schema. That is deliberately
 * different from the `@webaudit/worker` dependency direction T107 drew a
 * hard line around: a generated ORM client is closer to `@webaudit/types`
 * than to application code — both processes read and write the same tables
 * in the same database, and there is no second schema to keep in sync. A
 * cleaner long-term shape is a dedicated `packages/db` package neither app
 * currently has; recorded in PROGRESS.md rather than built here, since
 * extracting one now would mean re-plumbing `apps/api`'s already-tested
 * Prisma setup for no behavioural change this sub-phase needs.
 *
 * Reads `DATABASE_URL` the same way `new PrismaClient()` always has — no
 * fallback, unlike `apps/api/src/services/queue/scan-phase-producer.ts`'s
 * Redis default, because a worker that cannot reach its database cannot do
 * anything at all and should fail loudly at boot, not connect to a
 * plausible-looking default.
 */

import { PrismaClient } from '@webaudit/api/prisma-client';

export function createWorkerDb(): PrismaClient {
  if (process.env['DATABASE_URL'] === undefined || process.env['DATABASE_URL'] === '') {
    throw new Error(
      'DATABASE_URL is not set. The worker cannot run an audit without a database connection.',
    );
  }
  return new PrismaClient();
}

export type { PrismaClient };
