/**
 * T027 — Registration, verification, resend.
 * FR-001, FR-002.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { Mailer } from '../services-types.js';
import { generateToken, hashPassword, hashToken } from './crypto.js';
import { grantFreeAllocation } from '../credits/grant.js';
import { captureAlert } from '../../config/monitoring.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFY_PENDING_TTL_MS = 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export class TokenInvalidError extends Error {}

/**
 * Marks the user's outstanding tokens for a purpose as used.
 *
 * Issuing a replacement without this leaves every earlier link live for its full
 * TTL, so N resends mean N working 24-hour tokens — N chances for an old link
 * sitting in a forwarded email or a proxy log to still work. Exactly one link
 * per purpose may be valid at a time: the newest.
 */
export async function supersedeEmailTokens(
  db: Pick<PrismaClient, 'emailToken'>,
  userId: string,
  purpose: 'verify' | 'reset',
): Promise<number> {
  const { count } = await db.emailToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count;
}

/** Emails are matched case-insensitively; the stored form is lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * FR-E02/quickstart row 9: a mail transport outage must never fail the
 * operation it is attached to -- the account (or the resend) already exists
 * by the time this runs, so a thrown/rejected send here must be logged, not
 * propagated, exactly like `apply-payment-event.ts`'s established pattern
 * for payment-confirmation email.
 */
async function sendVerificationBestEffort(
  mailer: Mailer,
  email: string,
  token: string,
): Promise<void> {
  try {
    await mailer.sendVerification(email, token);
  } catch (error) {
    console.error(`[auth] verification email to ${email} failed to send:`, error);
    captureAlert('email_send_failure', 'Verification email failed to send', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function register(
  db: PrismaClient,
  mailer: Mailer,
  input: { email: string; password: string; name?: string | undefined },
): Promise<{ email: string; pendingVerificationToken: string }> {
  const email = normalizeEmail(input.email);
  // Keep duplicate attempts on the same password-hashing cost path. Their
  // pending cookie receives a random decoy below, never a reference to an
  // account or a token row.
  const pendingVerificationToken = generateToken();
  const passwordHash = await hashPassword(input.password);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    const webUrl = (process.env['WEB_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');
    try {
      await mailer.sendRegistrationAttemptNotice(
        email,
        `${webUrl}/login`,
        `${webUrl}/reset-password`,
      );
    } catch (error) {
      console.error(`[auth] registration-attempt email to ${email} failed to send:`, error);
      captureAlert('email_send_failure', 'Registration-attempt email failed to send', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { email, pendingVerificationToken };
  }

  const raw = generateToken();

  // One transaction: a user without their free allocation, or without a
  // verification token, is a broken account that support has to repair.
  await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash } });
    if (input.name !== undefined) {
      await tx.$executeRaw`UPDATE "User" SET name = ${input.name.trim()} WHERE id = ${created.id}`;
    }
    await tx.emailToken.create({
      data: {
        userId: created.id,
        purpose: 'verify',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    await tx.emailToken.create({
      data: {
        userId: created.id,
        purpose: 'verify_pending',
        tokenHash: hashToken(pendingVerificationToken),
        expiresAt: new Date(Date.now() + VERIFY_PENDING_TTL_MS),
      },
    });
    await grantFreeAllocation(tx, created.id);
  });

  await sendVerificationBestEffort(mailer, email, raw);
  return { email, pendingVerificationToken };
}

export async function verifyEmail(db: PrismaClient, raw: string): Promise<void> {
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(raw) } });

  // Already used, expired, or unknown all collapse to one outcome: no signal
  // about which, and no partial state change.
  if (!row || row.purpose !== 'verify' || row.usedAt || row.expiresAt < new Date()) {
    throw new TokenInvalidError();
  }

  await db.$transaction(async (tx) => {
    const now = new Date();
    const claim = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count === 0) throw new TokenInvalidError();
    await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
  });
}

export async function resendVerification(
  db: PrismaClient,
  mailer: Mailer,
  input: { email?: string; pendingToken?: string },
): Promise<void> {
  const user = input.pendingToken
    ? await (async () => {
        const pending = await db.emailToken.findUnique({
          where: { tokenHash: hashToken(input.pendingToken!) },
          include: { user: true },
        });
        if (
          !pending ||
          pending.purpose !== 'verify_pending' ||
          pending.usedAt ||
          pending.expiresAt < new Date()
        ) {
          return null;
        }
        return pending.user;
      })()
    : input.email
      ? await db.user.findUnique({ where: { email: normalizeEmail(input.email) } })
      : null;

  // Silent when the address is unknown or already verified: the caller must not
  // learn which accounts exist.
  if (!user || user.emailVerifiedAt) return;

  const result = await db.$transaction(async (tx) => {
    // Serialise resends for this account. Checking the latest issuance and
    // creating its replacement under the same lock makes the cooldown hold
    // even when requests arrive concurrently from different IPs.
    await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const mostRecent = await tx.emailToken.findFirst({
      where: { userId: user.id, purpose: 'verify' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (mostRecent && mostRecent.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) {
      return null;
    }

    const raw = generateToken();
    await supersedeEmailTokens(tx, user.id, 'verify');
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: 'verify',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    return raw;
  });

  if (result) await sendVerificationBestEffort(mailer, user.email, result);
}
