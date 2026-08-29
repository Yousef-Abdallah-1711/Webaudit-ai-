/**
 * Prisma client singleton.  (T021)
 *
 * PostgreSQL is the only system of record (Constitution, Technology and
 * Security Constraints). Every write to a credit lot, an issue state, or a
 * module result goes through this client.
 *
 * One instance per process. A fresh client per request exhausts the connection
 * pool under load, and the worker holds long-running transactions — notably the
 * serializable credit debit — that must not compete with themselves for
 * connections.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';

const LOG_LEVELS = {
  development: ['warn', 'error'] as const,
  production: ['error'] as const,
  test: ['error'] as const,
};

/**
 * Connection pool sizing.
 *
 * Prisma's default is `num_cpus * 2 + 1` PER PROCESS. On an 8-vCPU container
 * that is 17, and the pool is claimed per process, not per deployment: with two
 * `api` replicas and two `worker` replicas that is 68 of PostgreSQL's default
 * `max_connections = 100` before a single migration, `psql`, or metrics scraper
 * connects. The failure mode is not slow queries; it is
 * `FATAL: too many connections`, which takes out the healthy replicas too.
 *
 * Sized against plan.md's actual MVP scale — **1,000 users, ~60 concurrent
 * audits** — not against a hypothetical 10,000:
 *
 *   budget      100 max_connections
 *               - 3 superuser_reserved_connections
 *               - ~7 for migrations, psql, Prisma Studio, monitoring
 *               = ~90 usable by application processes
 *   claimants   api + worker hold credentials (web, probe-pool and
 *               sandbox-runner do not — R1 gives the sandbox no DB access).
 *               2 + 2 replicas at MVP, so 4 pools, with headroom to double to 8
 *               replicas without touching the database configuration.
 *   per process 90 / 8 ≈ 11  ->  10, leaving slack for a rolling deploy where
 *               old and new replicas overlap.
 *
 * Why 10 is ample for 60 concurrent audits: an audit is a ~5-minute wall-clock
 * job (plan.md, Performance Goals) that touches PostgreSQL in short bursts —
 * claim the job, write module results, debit credits. Concurrency of the pool
 * has to cover concurrent *in-flight queries*, not concurrent audits. Four
 * pools of 10 give 40 simultaneous statements, several times the burst 60
 * mostly-waiting audits produce. Prisma queues callers beyond the limit rather
 * than failing, so an unexpected burst becomes latency, not an error — provided
 * `pool_timeout` exceeds the longest transaction we hold, which is the
 * serializable credit debit.
 *
 * Both values are env-overridable because the correct number depends on the
 * replica count and on the managed database's real `max_connections`, neither of
 * which is knowable from source. A pooler (PgBouncer in transaction mode)
 * replaces this arithmetic; set the limit explicitly then.
 */
const DEFAULT_CONNECTION_LIMIT = 10;
const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return parsed;
}

/**
 * Prisma takes pool settings as connection-string parameters, so they are
 * applied here rather than being duplicated into every deployment's
 * `DATABASE_URL`. A value already present in the URL wins: an operator who set
 * it deliberately (or a pooler that requires `connection_limit=1`) is not
 * overridden by our default.
 */
export function withPoolSettings(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set(
      'connection_limit',
      String(positiveIntFromEnv('DATABASE_CONNECTION_LIMIT', DEFAULT_CONNECTION_LIMIT)),
    );
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set(
      'pool_timeout',
      String(positiveIntFromEnv('DATABASE_POOL_TIMEOUT', DEFAULT_POOL_TIMEOUT_SECONDS)),
    );
  }
  return parsed.toString();
}

function createClient(): PrismaClient {
  const env = process.env['NODE_ENV'] ?? 'development';
  const log =
    env === 'production'
      ? LOG_LEVELS.production
      : env === 'test'
        ? LOG_LEVELS.test
        : LOG_LEVELS.development;

  const url = process.env['DATABASE_URL'];

  return new PrismaClient({
    log: [...log],
    // Never log query parameters: scanned source and headers pass through here
    // and may carry credentials (FR-091 — secrets must not reach logs).
    errorFormat: 'minimal',
    // Absent DATABASE_URL is left to Prisma to report against the schema's
    // datasource, which names the variable in its error.
    ...(url ? { datasources: { db: { url: withPoolSettings(url) } } } : {}),
  });
}

/**
 * Hot reload in development creates a new module instance on every change,
 * which leaks a connection pool per reload until the database refuses new
 * connections. Parking the instance on the global object survives reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Release the pool. Call from a worker's shutdown handler, not from a request. */
export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
