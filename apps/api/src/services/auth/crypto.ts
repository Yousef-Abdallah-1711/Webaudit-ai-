/**
 * T026 — Password and token hashing.
 *
 * Constitution: "Passwords MUST be bcrypt-hashed at cost 12 or greater."
 */
import { compare, hash } from '@node-rs/bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, env.bcryptCost);
}

export function verifyPassword(plain: string, stored: string): Promise<boolean> {
  return compare(plain, stored);
}

/**
 * A single-use token: 32 random bytes, base64url. The raw value is emailed once
 * and never stored; only its hash is persisted, so a database read cannot mint
 * a working verification or reset link.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 rather than bcrypt. These tokens are already 256 bits of entropy, so
 * there is nothing to brute-force, and a lookup must be fast enough to be a
 * single indexed query.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Constant-time comparison for any secret compared outside the database. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
