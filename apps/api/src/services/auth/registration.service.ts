/**
 * T027 — Registration, verification, resend.
 * FR-001, FR-002.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { Mailer } from '../services-types.js';
import { generateToken, hashPassword, hashToken } from './crypto.js';
import { grantFreeAllocation } from '../credits/grant.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export class EmailTakenError extends Error {}
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

export async function register(
  db: PrismaClient,
  mailer: Mailer,
  input: { email: string; password: string },
): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new EmailTakenError();

  const passwordHash = await hashPassword(input.password);
  const raw = generateToken();

  // One transaction: a user without their free allocation, or without a
  // verification token, is a broken account that support has to repair.
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash } });
    await tx.emailToken.create({
      data: {
        userId: created.id,
        purpose: 'verify',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    await grantFreeAllocation(tx, created.id);
    return created;
  });

  await mailer.sendVerification(email, raw);
  return { userId: user.id };
}

export async function verifyEmail(db: PrismaClient, raw: string): Promise<void> {
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(raw) } });

  // Already used, expired, or unknown all collapse to one outcome: no signal
  // about which, and no partial state change.
  if (!row || row.purpose !== 'verify' || row.usedAt || row.expiresAt < new Date()) {
    throw new TokenInvalidError();
  }

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    db.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
}

export async function resendVerification(
  db: PrismaClient,
  mailer: Mailer,
  emailInput: string,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await db.user.findUnique({ where: { email } });

  // Silent when the address is unknown or already verified: the caller must not
  // learn which accounts exist.
  if (!user || user.emailVerifiedAt) return;

  const raw = generateToken();

  // One transaction: superseding without issuing would leave the account with no
  // way to confirm itself.
  await db.$transaction(async (tx) => {
    await supersedeEmailTokens(tx, user.id, 'verify');
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: 'verify',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
  });

  await mailer.sendVerification(email, raw);
}
