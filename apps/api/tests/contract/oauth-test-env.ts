/**
 * Test secrets, checked before anything reads them.
 *
 * `src/config/env.ts` fails closed and reads `process.env` once, at import
 * time. `vitest.workspace.ts` now supplies the secrets for the whole `unit`
 * project, so this module normally does nothing — it exists for two reasons:
 *
 *  1. It has to be the FIRST import in a suite that touches encryption, because
 *     ES modules evaluate imports in source order and `env.ts` latches its
 *     values on first import.
 *  2. `ENCRYPTION_KEY` must decode to exactly 32 bytes or `token-vault.seal()`
 *     throws. The value currently in `vitest.workspace.ts` decodes to 35, which
 *     turns every sealing route into a 500. That file belongs to another change
 *     in flight; rather than edit it from here, this repairs an out-of-spec key
 *     locally and says so. Delete this module once the runner's key is 32 bytes.
 */
const KEY_BYTES = 32;

function fallback(name: string, value: string): void {
  if (!process.env[name]) process.env[name] = value;
}

fallback('JWT_ACCESS_SECRET', 'test-only-access-secret-not-a-real-key-0123456789');
fallback('JWT_REFRESH_SECRET', 'test-only-refresh-secret-not-a-real-key-0123456789');

const encryptionKey = process.env['ENCRYPTION_KEY'];
if (!encryptionKey || Buffer.from(encryptionKey, 'base64').length !== KEY_BYTES) {
  process.env['ENCRYPTION_KEY'] = Buffer.alloc(KEY_BYTES, 0x2a).toString('base64');
}
