/**
 * T030 — Social identity resolution.
 *
 * FR-004: a matching confirmed email joins an existing account rather than
 * creating a second one. Duplicates are unrecoverable in practice — once
 * credits have been spent from two balances there is no safe automatic merge.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { grantFreeAllocation } from '../credits/grant.js';
import { normalizeEmail } from './registration.service.js';

export class UnverifiedProviderEmailError extends Error {}

export interface OAuthProfile {
  provider: string;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
}

export interface OAuthResult {
  userId: string;
  created: boolean;
}

type Db = Pick<PrismaClient, 'oAuthIdentity' | 'user' | 'refreshToken' | '$transaction'>;

export async function resolveOAuthIdentity(db: Db, profile: OAuthProfile): Promise<OAuthResult> {
  const email = normalizeEmail(profile.email);

  // 1. Known identity — the ordinary repeat sign-in.
  const identity = await db.oAuthIdentity.findUnique({
    where: {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    },
  });
  if (identity) return { userId: identity.userId, created: false };

  // An unverified provider email is an account-takeover vector: anyone able to
  // claim the address at the provider would inherit the local account. Refuse
  // before any lookup by email.
  if (!profile.emailVerified) {
    throw new UnverifiedProviderEmailError('provider email is unverified');
  }

  // 2. Existing live account with the same address — join it. A deleted account
  // is not a match (FR-009): social sign-in must not resurrect one.
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Account pre-hijacking (the "classic-federation merge" attack): an
    // attacker can register this address with a password of their own
    // choosing before the real owner ever signs in, then simply wait —
    // FR-001 only refuses a *second* registration, so the row exists,
    // unverified, and the attacker's password sits on it. If this join
    // handed the row to the real owner without touching that password, the
    // owner would now be using an account someone else can also log into:
    // the moment `emailVerifiedAt` is set by any later, unrelated path (the
    // victim's own confirmation email, a resend they trigger, anything),
    // the attacker's original password satisfies `login()`'s verification
    // gate and signs straight in. A row nobody had verified before this
    // moment has no legitimate password on it — the provider has just
    // supplied the ONLY proof of ownership this account has ever had, so
    // that proof, not whoever typed a password first, must decide who
    // controls it. Clearing the password (already a valid state — a
    // social-only account has none, see the creation branch below) and
    // revoking any session that password might already have produced closes
    // the path without disturbing the ordinary case: an account the owner
    // already verified themselves keeps its password untouched, exactly as
    // `auth.oauth-join.test.ts` proves.
    if (!existing.emailVerifiedAt) {
      await db.$transaction([
        db.user.update({
          where: { id: existing.id },
          data: { passwordHash: null, emailVerifiedAt: new Date() },
        }),
        db.oAuthIdentity.create({
          data: {
            userId: existing.id,
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        }),
        db.refreshToken.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      return { userId: existing.id, created: false };
    }

    await db.oAuthIdentity.create({
      data: {
        userId: existing.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    });
    return { userId: existing.id, created: false };
  }

  // 3. Nobody matches — create. The provider already confirmed the address, so
  // the account starts verified (FR-003) and with no password.
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, emailVerifiedAt: new Date(), passwordHash: null },
    });
    await tx.oAuthIdentity.create({
      data: {
        userId: user.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    });
    await grantFreeAllocation(tx, user.id);
    return user;
  });

  return { userId: created.id, created: true };
}
