/**
 * Fail-closed guard for test code that hands a database URL to a child process.
 *
 * A child spawned with `...process.env` inherits whatever `DATABASE_URL` the
 * invoking shell has, and an unset one used to fall back to the development
 * database `webaudit`. A test that boots the real API would then write to it.
 * The URL a child receives must therefore come from the test configuration, be
 * validated here, and replace (never merge with) the ambient value.
 */

export class UnsafeTestDatabaseError extends Error {
  override readonly name = 'UnsafeTestDatabaseError';
}

/** The development database; never acceptable to a test. */
const DEVELOPMENT_DATABASE = 'webaudit';

/**
 * Returns `url` unchanged if it names a clearly isolated test database
 * (name ends in `_test` or `-test`); throws otherwise. Messages carry the
 * database name only, never the credentials.
 */
export function assertIsolatedTestDatabaseUrl(url: string | undefined): string {
  if (url === undefined || url.trim() === '') {
    throw new UnsafeTestDatabaseError(
      'No test database is configured; refusing to fall back to any other database.',
    );
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new UnsafeTestDatabaseError('The test database URL is not a parseable URL.');
  }
  if (name === DEVELOPMENT_DATABASE) {
    throw new UnsafeTestDatabaseError(
      `Refusing the development database "${DEVELOPMENT_DATABASE}" in a test.`,
    );
  }
  if (!/[_-]test$/.test(name)) {
    throw new UnsafeTestDatabaseError(
      `Database "${name}" is not clearly a test database (its name must end in "_test").`,
    );
  }
  return url;
}

/**
 * A child-process environment whose `DATABASE_URL` is the validated test
 * database. The ambient `DATABASE_URL`, set or not, is overridden, never trusted.
 */
export function isolatedChildEnv(
  ambient: Readonly<Record<string, string | undefined>>,
  testDatabaseUrl: string | undefined,
): Record<string, string | undefined> {
  return { ...ambient, DATABASE_URL: assertIsolatedTestDatabaseUrl(testDatabaseUrl) };
}
