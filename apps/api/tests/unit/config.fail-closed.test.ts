/**
 * C3 regression — configuration must fail closed.
 *
 * The bug: `require32()` returned a hardcoded constant whenever
 * `NODE_ENV !== 'production'`, and `NODE_ENV` defaults to `development`. A
 * deploy that missed one platform variable therefore signed access tokens with
 * a string committed to this repository, so anyone could mint a token carrying
 * `isOperator: true` — a full auth bypass plus operator escalation, with no log
 * line. `ENCRYPTION_KEY` had the same shape: a missing key silently became
 * `Buffer.alloc(32, 7)`, and every stored GitHub token was then encrypted under
 * a value derivable from source (FR-091).
 *
 * The contract these tests pin:
 *   - absent secret            -> startup throws, naming the variable
 *   - NODE_ENV is irrelevant   -> development/test/unset all still throw
 *   - explicit opt-in          -> boots, and warns loudly naming the variable
 *   - opt-in in production     -> refused outright
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET_VARS = [
  'NODE_ENV',
  'ALLOW_INSECURE_DEV_SECRETS',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
] as const;

const REAL_ACCESS_SECRET = 'a-real-access-secret-of-sufficient-length-000000';
// 32 bytes, base64 — the only shape token-vault accepts.
const REAL_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');

let saved: Record<string, string | undefined>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  saved = {};
  for (const name of SECRET_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.resetModules();
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  warn.mockRestore();
  vi.resetModules();
});

/** Fresh module evaluation: the config is computed once, at import time. */
const loadEnv = () => import('../../src/config/env.js');
const loadVault = () => import('../../src/services/auth/token-vault.js');

const warnings = () => warn.mock.calls.map((c) => String(c[0])).join('\n');

describe('config load with NODE_ENV unset', () => {
  it('refuses to start without JWT_ACCESS_SECRET', async () => {
    expect(process.env['NODE_ENV']).toBeUndefined();

    await expect(loadEnv()).rejects.toThrow(/JWT_ACCESS_SECRET/);
  });

  it('names the remedy in the failure so the crash log is actionable', async () => {
    await expect(loadEnv()).rejects.toThrow(/ALLOW_INSECURE_DEV_SECRETS/);
  });

  it('boots and warns loudly when the insecure fallback is opted into', async () => {
    process.env['ALLOW_INSECURE_DEV_SECRETS'] = 'true';

    const { env } = await loadEnv();

    expect(env.allowInsecureDevSecrets).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(warnings()).toContain('JWT_ACCESS_SECRET');
    expect(warnings()).toContain('INSECURE');
  });
});

describe('NODE_ENV is not an authorization to use a built-in secret', () => {
  // The exact C3 defect: development was the DEFAULT, so this was the shipping
  // configuration of any deploy that forgot NODE_ENV=production.
  it.each(['development', 'test', 'production'])('throws under NODE_ENV=%s', async (nodeEnv) => {
    process.env['NODE_ENV'] = nodeEnv;

    await expect(loadEnv()).rejects.toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('opt-in gate', () => {
  it('accepts only the exact string "true"', async () => {
    for (const value of ['1', 'yes', 'TRUE', 'true ']) {
      vi.resetModules();
      process.env['ALLOW_INSECURE_DEV_SECRETS'] = value;

      await expect(loadEnv()).rejects.toThrow(/JWT_ACCESS_SECRET/);
    }
  });

  it('is refused outright in production, even with the opt-in set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['ALLOW_INSECURE_DEV_SECRETS'] = 'true';
    process.env['JWT_ACCESS_SECRET'] = REAL_ACCESS_SECRET;

    await expect(loadEnv()).rejects.toThrow(/ALLOW_INSECURE_DEV_SECRETS must not be set/);
  });

  it('rejects a secret that is present but too short', async () => {
    process.env['JWT_ACCESS_SECRET'] = 'too-short';

    await expect(loadEnv()).rejects.toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('a correctly configured process', () => {
  it('uses the supplied secret and warns about nothing', async () => {
    process.env['JWT_ACCESS_SECRET'] = REAL_ACCESS_SECRET;

    const { env } = await loadEnv();

    expect(env.allowInsecureDevSecrets).toBe(false);
    expect(new TextDecoder().decode(env.accessSecret)).toBe(REAL_ACCESS_SECRET);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('token vault (ENCRYPTION_KEY)', () => {
  it('refuses to encrypt a credential when the key is absent', async () => {
    process.env['JWT_ACCESS_SECRET'] = REAL_ACCESS_SECRET;

    const { seal } = await loadVault();

    expect(() => seal('ghp_secret')).toThrow(/ENCRYPTION_KEY/);
  });

  it('warns naming ENCRYPTION_KEY when the fallback is opted into', async () => {
    process.env['ALLOW_INSECURE_DEV_SECRETS'] = 'true';

    const { seal, open } = await loadVault();
    const sealed = seal('ghp_secret');

    expect(open(sealed)).toBe('ghp_secret');
    expect(warnings()).toContain('ENCRYPTION_KEY');
  });

  it('round-trips with a real key and warns about nothing', async () => {
    process.env['JWT_ACCESS_SECRET'] = REAL_ACCESS_SECRET;
    process.env['ENCRYPTION_KEY'] = REAL_ENCRYPTION_KEY;

    const { seal, open } = await loadVault();

    expect(open(seal('ghp_secret'))).toBe('ghp_secret');
    expect(warn).not.toHaveBeenCalled();
  });
});
