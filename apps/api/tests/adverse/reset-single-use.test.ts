/**
 * FR-005: a password reset link is **single-use**.
 *
 * This suite exists because the repository already learned this lesson once and
 * only applied it in one place. Finding C2 removed a read-then-write from
 * `refresh()` — the pre-read saw the token live, so every concurrent
 * presentation of one stolen cookie minted a session. The remediation replaced
 * it with a conditional `updateMany` whose *write* is the gate, and left the
 * comment that says why.
 *
 * `completeReset` is the other single-use-token path in the same service, and it
 * kept the old shape: `findUnique` → check `usedAt` → `$transaction`. Two
 * requests carrying the same reset token both pass the check, both write, and
 * both return success. The second password wins.
 *
 * That is not a theoretical race. A reset link reaches a mailbox, and mailboxes
 * are shared, forwarded, previewed by link-fetching mail clients, and logged by
 * proxies. Anyone who can see the link can submit their own password timed
 * against the victim's click — and the victim's own reset reports success while
 * the account ends up holding somebody else's password. A user told "password
 * changed" has no reason to look further.
 *
 * The assertion is therefore about the *outcome*, not the error: exactly one
 * caller may succeed, and the password that ends up on the account must be the
 * one that belongs to the caller who was told they succeeded.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { completeReset, requestReset } from '../../src/services/auth/reset.service.js';
import { TokenInvalidError } from '../../src/services/auth/registration.service.js';
import { verifyPassword } from '../../src/services/auth/crypto.js';

beforeEach(resetDb);
afterAll(closeDb);

async function userWithResetToken(email: string): Promise<{ userId: string; token: string }> {
  const user = await testDb.user.create({
    data: { email, emailVerifiedAt: new Date(), passwordHash: 'placeholder' },
  });
  const mailer = createCapturingMailer();
  await requestReset(testDb, mailer, email);
  return { userId: user.id, token: mailer.lastResetToken() };
}

function tally(results: PromiseSettledResult<unknown>[]): { ok: number; refused: number } {
  let ok = 0;
  let refused = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok += 1;
    else if (r.reason instanceof TokenInvalidError) refused += 1;
    else throw r.reason;
  }
  return { ok, refused };
}

describe('one reset token, one password change', () => {
  it('lets exactly one of two concurrent resets succeed', async () => {
    const { token } = await userWithResetToken('race@example.com');

    const results = await Promise.allSettled([
      completeReset(testDb, token, 'first-password-9!'),
      completeReset(testDb, token, 'second-password-9!'),
    ]);

    // Both succeeding is the defect: two callers were each told their password
    // is now the account's password, and one of them is wrong.
    expect(tally(results)).toEqual({ ok: 1, refused: 1 });
  });

  it('leaves the account holding the password of the caller who was told it won', async () => {
    const { userId, token } = await userWithResetToken('winner@example.com');

    const results = await Promise.allSettled([
      completeReset(testDb, token, 'alpha-password-9!'),
      completeReset(testDb, token, 'bravo-password-9!'),
    ]);

    const winner = results[0]?.status === 'fulfilled' ? 'alpha-password-9!' : 'bravo-password-9!';
    const loser = winner === 'alpha-password-9!' ? 'bravo-password-9!' : 'alpha-password-9!';

    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(winner, user.passwordHash ?? '')).toBe(true);
    // The one that lost must not be able to sign in. This is the assertion that
    // fails when the second writer silently overwrites the first.
    expect(await verifyPassword(loser, user.passwordHash ?? '')).toBe(false);
  });

  it('survives eight simultaneous presentations of one token', async () => {
    const { userId, token } = await userWithResetToken('storm@example.com');

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_unused, index) =>
        completeReset(testDb, token, `password-number-${String(index)}-9!`),
      ),
    );

    expect(tally(results).ok).toBe(1);

    const winnerIndex = results.findIndex((r) => r.status === 'fulfilled');
    const user = await testDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(
      await verifyPassword(`password-number-${String(winnerIndex)}-9!`, user.passwordHash ?? ''),
    ).toBe(true);
  });

  it('refuses a second use after the first has settled', async () => {
    // The sequential case, which always worked. Kept so a fix that makes the
    // concurrent case pass by breaking the ordinary one is caught here.
    const { token } = await userWithResetToken('sequential@example.com');

    await completeReset(testDb, token, 'good-password-9!');
    await expect(completeReset(testDb, token, 'later-password-9!')).rejects.toThrow(
      TokenInvalidError,
    );
  });

  it('marks the token used exactly once', async () => {
    const { token } = await userWithResetToken('once@example.com');

    await Promise.allSettled([
      completeReset(testDb, token, 'one-password-9!'),
      completeReset(testDb, token, 'two-password-9!'),
    ]);

    const rows = await testDb.emailToken.findMany({ where: { purpose: 'reset' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.usedAt).not.toBeNull();
  });

  it('still revokes every refresh token for the winning reset', async () => {
    // A reset is often a response to compromise. Whichever caller wins, the
    // session revocation must happen — a fix that narrows the transaction must
    // not drop it.
    const { userId, token } = await userWithResetToken('sessions@example.com');
    await testDb.refreshToken.createMany({
      data: [
        { userId, tokenHash: 'hash-a', expiresAt: new Date(Date.now() + 86_400_000) },
        { userId, tokenHash: 'hash-b', expiresAt: new Date(Date.now() + 86_400_000) },
      ],
    });

    await Promise.allSettled([
      completeReset(testDb, token, 'alpha-password-9!'),
      completeReset(testDb, token, 'bravo-password-9!'),
    ]);

    const live = await testDb.refreshToken.count({ where: { userId, revokedAt: null } });
    expect(live).toBe(0);
  });
});
