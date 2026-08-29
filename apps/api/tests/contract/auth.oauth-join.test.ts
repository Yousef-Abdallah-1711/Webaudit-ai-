/**
 * T025 — FR-004: a social identity joins an existing account when the confirmed
 * email matches, rather than creating a second account.
 *
 * The failure this prevents is silent and expensive: a user signs up with email,
 * later clicks "Continue with Google", and ends up with two accounts — two
 * credit balances, two scan histories, and a support ticket. Once duplicates
 * exist there is no safe automatic merge, because credits have been spent.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { resolveOAuthIdentity } from '../../src/services/auth/oauth.service.js';
import { deleteAccount } from '../../src/services/auth/deletion.service.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

const GOOGLE = {
  provider: 'google',
  providerUserId: 'google-uid-1',
  email: 'join@example.com',
  emailVerified: true,
};

describe('resolveOAuthIdentity', () => {
  it('joins an existing password account on a matching verified email', async () => {
    const existing = await testDb.user.create({
      data: {
        email: GOOGLE.email,
        passwordHash: '$2b$12$fakehashfakehashfakehashfakehashfakehashfakehashfake',
        emailVerifiedAt: new Date(),
      },
    });

    const result = await resolveOAuthIdentity(testDb, GOOGLE);

    expect(result.userId).toBe(existing.id);
    expect(result.created).toBe(false);
    expect(await testDb.user.count()).toBe(1);

    const identity = await testDb.oAuthIdentity.findFirstOrThrow();
    expect(identity.userId).toBe(existing.id);
    expect(identity.provider).toBe('google');
  });

  it('preserves the existing password so both sign-in methods keep working', async () => {
    const hash = '$2b$12$fakehashfakehashfakehashfakehashfakehashfakehashfake';
    await testDb.user.create({
      data: { email: GOOGLE.email, passwordHash: hash, emailVerifiedAt: new Date() },
    });

    await resolveOAuthIdentity(testDb, GOOGLE);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: GOOGLE.email } });
    expect(user.passwordHash).toBe(hash);
  });

  it('creates a verified account with the free grant when no user matches', async () => {
    const result = await resolveOAuthIdentity(testDb, GOOGLE);

    expect(result.created).toBe(true);
    const user = await testDb.user.findUniqueOrThrow({ where: { email: GOOGLE.email } });
    // A provider-confirmed address counts as confirmed (FR-003).
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();

    const lots = await testDb.creditLot.findMany({ where: { userId: user.id } });
    expect(lots).toHaveLength(1);
    expect(lots[0]?.amountGranted).toBe(50);
  });

  it('returns the same user on a second sign-in, creating nothing', async () => {
    const first = await resolveOAuthIdentity(testDb, GOOGLE);
    const second = await resolveOAuthIdentity(testDb, GOOGLE);

    expect(second.userId).toBe(first.userId);
    expect(second.created).toBe(false);
    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.oAuthIdentity.count()).toBe(1);
  });

  it('matches on email case-insensitively', async () => {
    const existing = await testDb.user.create({
      data: { email: 'join@example.com', emailVerifiedAt: new Date() },
    });

    const result = await resolveOAuthIdentity(testDb, { ...GOOGLE, email: 'Join@Example.COM' });

    expect(result.userId).toBe(existing.id);
    expect(await testDb.user.count()).toBe(1);
  });

  it('links a second provider to the same account', async () => {
    const first = await resolveOAuthIdentity(testDb, GOOGLE);
    const second = await resolveOAuthIdentity(testDb, {
      provider: 'github',
      providerUserId: 'gh-uid-1',
      email: GOOGLE.email,
      emailVerified: true,
    });

    expect(second.userId).toBe(first.userId);
    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.oAuthIdentity.count()).toBe(2);
  });

  it('refuses to join on an unverified provider email', async () => {
    const existing = await testDb.user.create({
      data: { email: GOOGLE.email, passwordHash: 'x', emailVerifiedAt: new Date() },
    });

    // An unverified provider email is an account-takeover vector: anyone who can
    // claim the address at the provider would inherit the account.
    await expect(resolveOAuthIdentity(testDb, { ...GOOGLE, emailVerified: false })).rejects.toThrow(
      /unverified/i,
    );

    expect(await testDb.oAuthIdentity.count()).toBe(0);
    expect(await testDb.user.findUniqueOrThrow({ where: { id: existing.id } })).toBeTruthy();
  });

  it('treats a re-signup after deletion as a brand new account', async () => {
    const first = await resolveOAuthIdentity(testDb, GOOGLE);
    await deleteAccount(testDb, first.userId);

    // FR-009 destroys rather than hides, so the address is free again and the
    // new account inherits nothing — not credits, not scans, not identities.
    const second = await resolveOAuthIdentity(testDb, GOOGLE);

    expect(second.created).toBe(true);
    expect(second.userId).not.toBe(first.userId);
    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.oAuthIdentity.count()).toBe(1);

    const lots = await testDb.creditLot.findMany();
    expect(lots).toHaveLength(1);
    expect(lots[0]?.userId).toBe(second.userId);
  });
});
