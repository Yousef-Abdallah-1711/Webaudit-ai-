/**
 * Regression coverage for the fail-closed test-database guard
 * (`helpers/isolated-database.ts`), added after `email-boot-guard`'s children
 * were found to fall back to the development database when `DATABASE_URL` was
 * unset in the invoking shell.
 */

import { describe, expect, it } from 'vitest';
import {
  assertIsolatedTestDatabaseUrl,
  isolatedChildEnv,
  UnsafeTestDatabaseError,
} from '../helpers/isolated-database.js';

const TEST_URL = 'postgresql://webaudit:s3cret-pw@localhost:5442/webaudit_test?schema=public';
const DEV_URL = 'postgresql://webaudit:s3cret-pw@localhost:5442/webaudit?schema=public';

describe('assertIsolatedTestDatabaseUrl', () => {
  it('fails closed when no database is configured (missing DATABASE_URL case)', () => {
    expect(() => assertIsolatedTestDatabaseUrl(undefined)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertIsolatedTestDatabaseUrl('')).toThrow(UnsafeTestDatabaseError);
    expect(() => assertIsolatedTestDatabaseUrl('   ')).toThrow(UnsafeTestDatabaseError);
  });

  it('rejects the development database in every URL spelling', () => {
    for (const url of [
      DEV_URL,
      'postgresql://u:p@localhost:5442/webaudit',
      'postgresql://u:p@db.internal:5432/webaudit?schema=public&connection_limit=5',
      'postgres://u:p@localhost/webaudit',
    ]) {
      expect(() => assertIsolatedTestDatabaseUrl(url), url).toThrow(/development database/);
    }
  });

  it('rejects any database that is not clearly a test database', () => {
    for (const url of [
      'postgresql://u:p@localhost:5442/webaudit_prod',
      'postgresql://u:p@localhost:5442/testing_data',
      'postgresql://u:p@localhost:5442/webaudit_test_backup',
      'postgresql://u:p@localhost:5442/',
    ]) {
      expect(() => assertIsolatedTestDatabaseUrl(url), url).toThrow(UnsafeTestDatabaseError);
    }
  });

  it('rejects an unparseable URL', () => {
    expect(() => assertIsolatedTestDatabaseUrl('not a url')).toThrow(UnsafeTestDatabaseError);
  });

  it('accepts a clearly isolated test database unchanged', () => {
    expect(assertIsolatedTestDatabaseUrl(TEST_URL)).toBe(TEST_URL);
    expect(assertIsolatedTestDatabaseUrl('postgresql://u:p@h:1/other-test')).toContain(
      'other-test',
    );
  });

  it('never puts credentials into an error message', () => {
    for (const url of [DEV_URL, 'postgresql://webaudit:s3cret-pw@localhost/webaudit_prod']) {
      try {
        assertIsolatedTestDatabaseUrl(url);
        expect.unreachable();
      } catch (error) {
        expect(String((error as Error).message)).not.toMatch(/s3cret-pw/);
      }
    }
  });
});

describe('isolatedChildEnv', () => {
  it('overrides an ambient development DATABASE_URL instead of inheriting it', () => {
    const env = isolatedChildEnv({ DATABASE_URL: DEV_URL, KEEP: 'yes' }, TEST_URL);
    expect(env['DATABASE_URL']).toBe(TEST_URL);
    expect(env['KEEP']).toBe('yes');
  });

  it('never falls back to the development database when DATABASE_URL is missing', () => {
    expect(isolatedChildEnv({}, TEST_URL)['DATABASE_URL']).toBe(TEST_URL);
    expect(() => isolatedChildEnv({}, undefined)).toThrow(UnsafeTestDatabaseError);
  });

  it('refuses to build an environment from an unsafe configured URL', () => {
    expect(() => isolatedChildEnv({ DATABASE_URL: TEST_URL }, DEV_URL)).toThrow(
      UnsafeTestDatabaseError,
    );
  });
});
