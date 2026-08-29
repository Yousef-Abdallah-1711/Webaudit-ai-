/**
 * Expired auth-token cleanup.
 *
 * `EmailToken` and `RefreshToken` are append-only on the hottest paths in the
 * product: every login writes a refresh token, every rotation writes another,
 * and every resend writes an email token. Nothing removed them. Both models
 * already carry `@@index([expiresAt])` for exactly this sweep, which had no
 * caller — so the tables grew without bound and the index paid for a query
 * nobody ran.
 *
 * Deliberately a plain function, not a scheduler: it takes its clock and its
 * grace window as arguments so a test can drive it, and a job runner (or an
 * operator, by hand) decides when it runs. Nothing here is a timer.
 *
 * Only rows already past `expiresAt` are eligible, so this can never revoke a
 * usable credential. The grace window is a deliberate delay on top of that: a
 * just-expired row is still useful when someone reports "my reset link stopped
 * working", and deleting it immediately turns that into an unanswerable
 * question.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

/** Long enough to answer a support question, short enough to bound the table. */
export const DEFAULT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type CleanupClient = Pick<PrismaClient, 'emailToken' | 'refreshToken'>;

export interface CleanupOptions {
  /** How long past expiry a row is kept. Defaults to 30 days. */
  graceMs?: number;
  /** Injectable clock. Defaults to now. */
  now?: Date;
}

export interface CleanupResult {
  emailTokens: number;
  refreshTokens: number;
  /** Rows at or after this instant were kept. */
  cutoff: Date;
}

export async function purgeExpiredAuthTokens(
  db: CleanupClient,
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  if (graceMs < 0) throw new RangeError('graceMs must not be negative');

  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - graceMs);

  // Two statements rather than one transaction: they are independent, each is a
  // single indexed range delete, and a half-completed sweep is harmless — the
  // next run finishes it.
  const emailTokens = await db.emailToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  const refreshTokens = await db.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });

  return {
    emailTokens: emailTokens.count,
    refreshTokens: refreshTokens.count,
    cutoff,
  };
}
