/**
 * T031 — Encrypted third-party token storage.
 *
 * FR-091: credentials are encrypted at rest and never logged, echoed in errors,
 * or placed in AI prompts. The schema has no plaintext column for these, so
 * there is no path that stores one by accident.
 *
 * AES-256-GCM with a fresh 12-byte IV per record. GCM is authenticated, so a
 * tampered ciphertext fails to decrypt rather than yielding garbage that later
 * code might treat as a token.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env, warnInsecureFallback } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

const ENCRYPTION_KEY_REMEDY =
  'set ENCRYPTION_KEY to 32 random bytes, base64 (openssl rand -base64 32)';

/**
 * Fails closed, like the signing key. The previous behaviour keyed the
 * placeholder off `NODE_ENV !== 'production'`, and `NODE_ENV` defaults to
 * `development` — so a deploy that forgot one platform variable encrypted every
 * customer's GitHub token under a constant derivable from this repository.
 * FR-091 requires those credentials to be encrypted at rest; a key everyone
 * knows is not encryption. Absent configuration therefore refuses to run unless
 * the operator affirmatively set ALLOW_INSECURE_DEV_SECRETS=true.
 */
function key(): Buffer {
  const raw = env.encryptionKey;
  if (!raw) {
    if (!env.allowInsecureDevSecrets) {
      throw new Error(
        `ENCRYPTION_KEY is not set. Refusing to encrypt third-party credentials: ${ENCRYPTION_KEY_REMEDY}. ` +
          'For local development only, set ALLOW_INSECURE_DEV_SECRETS=true to use a placeholder.',
      );
    }
    warnInsecureFallback('ENCRYPTION_KEY', ENCRYPTION_KEY_REMEDY);
    // Self-describing rather than plausible: a value recovered from a dump is
    // immediately identifiable as a development placeholder.
    return createHash('sha256')
      .update('INSECURE-DEV-PLACEHOLDER-DO-NOT-DEPLOY-ENCRYPTION_KEY')
      .digest();
  }
  const k = Buffer.from(raw, 'base64');
  if (k.length !== KEY_BYTES) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  return k;
}

export interface SealedToken {
  ciphertext: Buffer;
  iv: Buffer;
}

export function seal(plaintext: string): SealedToken {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // The auth tag travels with the ciphertext so one column holds both.
  return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]), iv };
}

export function open(sealed: SealedToken): string {
  const tagStart = sealed.ciphertext.length - 16;
  const body = sealed.ciphertext.subarray(0, tagStart);
  const tag = sealed.ciphertext.subarray(tagStart);
  const decipher = createDecipheriv(ALGORITHM, key(), sealed.iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
