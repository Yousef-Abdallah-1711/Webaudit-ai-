/**
 * Fail-closed infrastructure selection for every write-capable E2E process.
 *
 * `resetDb` truncates tables, and the stack's worker consumes BullMQ queues, so
 * a spec that fell back to the development database `webaudit` (or to Redis
 * DB 0, which a live dev worker uses) would destroy or steal real work. The
 * database must be clearly a test database; Redis defaults to the isolated
 * DB 15 the Vitest projects use and refuses DB 0 (the ambient REDIS_URL is ignored).
 */

const DEV_DATABASE = 'webaudit';
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';
const DEFAULT_TEST_REDIS_URL = 'redis://localhost:6389/15';

export function isolatedTestDatabaseUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const url = env['TEST_DATABASE_URL'] ?? DEFAULT_TEST_DATABASE_URL;
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL is not a parseable URL; refusing to run E2E.');
  }
  if (name === DEV_DATABASE || !/[_-]test$/.test(name)) {
    throw new Error(`Database "${name}" is not clearly a test database; refusing to run E2E.`);
  }
  return url;
}

export function isolatedTestRedisUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  // A dedicated variable, like TEST_DATABASE_URL: the ambient REDIS_URL is the dev workload's.
  const url = env['TEST_REDIS_URL'] ?? DEFAULT_TEST_REDIS_URL;
  let db: string;
  try {
    db = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error('TEST_REDIS_URL is not a parseable URL; refusing to run E2E.');
  }
  if (db === '' || db === '0') {
    throw new Error('E2E must not use Redis DB 0 (the development workload); use DB 15.');
  }
  return url;
}
