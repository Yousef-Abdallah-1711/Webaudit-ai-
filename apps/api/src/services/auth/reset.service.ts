/**
 * T029 — Password reset.
 * FR-005: a single-use, time-limited link.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { Mailer } from '../services-types.js';
import { generateToken, hashPassword, hashToken } from './crypto.js';
import { normalizeEmail, supersedeEmailTokens } from './registration.service.js';
import { TokenInvalidError } from './registration.service.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter than verification

/** Always resolves. The caller must not learn whether an address is registered. */
export async function requestReset(
  db: PrismaClient,
  mailer: Mailer,
  emailInput: string,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;

  const raw = generateToken();

  // FR-005 says single-use, which is only true if there is one use to make: a
  // second request must retire the first link rather than add to it.
  await db.$transaction(async (tx) => {
    await supersedeEmailTokens(tx, user.id, 'reset');
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: 'reset',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
  });

  await mailer.sendPasswordReset(email, raw);
}

export async function completeReset(
  db: PrismaClient,
  raw: string,
  newPassword: string,
): Promise<void> {
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.purpose !== 'reset' || row.usedAt || row.expiresAt < new Date()) {
    throw new TokenInvalidError();
  }

  // Hashed before the transaction opens: bcrypt at cost 12 is deliberately slow,
  // and holding a row lock across it would serialise every reset in the system
  // behind one caller's key-stretching.
  const passwordHash = await hashPassword(newPassword);

  const claimed = await db.$transaction(async (tx) => {
    // **The `usedAt` write IS the gate**, exactly as the revoke is the gate in
    // `refresh()`. The read above is a cheap early refusal and nothing more; it
    // cannot decide single-use, because between it and the write another
    // request carrying the same token passes the same read. Under concurrency
    // the second writer blocks on this row, re-evaluates `usedAt: null` against
    // the committed row, and matches nothing.
    //
    // FR-005 says single-use, and read-then-write does not implement it. Finding
    // C2 taught this repository the lesson in the refresh path; this is the same
    // defect in the other single-use-token path, and the consequence is worse.
    // A reset link is visible to anyone with sight of the mailbox — shared,
    // forwarded, link-previewed, proxy-logged — and two callers both being told
    // "password changed" means the account holds the second one's password
    // while the first has no reason to look.
    const gate = await tx.emailToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (gate.count === 0) return false;

    // Inside the same transaction as the claim: if either write fails, the
    // claim rolls back with it and the user's link is not silently burned.
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });

    // Changing a password ends every existing session: a reset is often a
    // response to compromise, and leaving old refresh tokens live defeats it.
    await tx.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return true;
  });

  // Lost the race. Refusing is the honest answer — the caller's password is not
  // the account's password, and reporting success would be the whole defect.
  if (!claimed) throw new TokenInvalidError();
}
