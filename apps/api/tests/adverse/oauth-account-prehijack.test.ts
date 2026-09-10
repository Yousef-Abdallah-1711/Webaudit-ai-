/**
 * Full auth-system security audit (2026-09-10) — "classic-federation merge"
 * account pre-hijacking.
 *
 * The attack (documented in the industry as "Account Pre-hijacking", Andrsecurity
 * 2022; found in production at several real SSO+password products):
 *
 *   1. An attacker registers an account using the VICTIM's real email address
 *      and a password the attacker chooses. `POST /auth/register` happily
 *      creates the row — FR-001 only refuses a *second* registration for an
 *      address, and this is the first. The account sits unverified; the
 *      attacker cannot log into it (email confirmation is required), but the
 *      row — and the attacker's password on it — now exists.
 *   2. The real victim, who has never used this product before, later signs
 *      up the normal way people do today: "Continue with Google". FR-004
 *      requires a provider-confirmed email to join an *existing* account
 *      rather than create a second one — `resolveOAuthIdentity` finds the
 *      attacker's row by email and joins it, exactly as FR-004 asks, without
 *      asking whether that existing row was ever actually verified by
 *      anyone. The victim is signed in — to the attacker's account.
 *   3. At some point the row's `emailVerifiedAt` gets set — the victim
 *      clicking the confirmation email their own registration attempt
 *      produced, a "resend confirmation" they trigger out of confusion, or
 *      any future flow that verifies the address. `completeReset`,
 *      `verifyEmail`, and the OAuth-join path itself are all reachable
 *      through nothing but the victim's own real inbox.
 *   4. `login()`'s email-verification gate — the ONLY thing standing between
 *      the attacker's original password and a session — is now satisfied.
 *      The attacker's password, set in step 1 and never invalidated by the
 *      join in step 2, logs straight into the victim's real account: their
 *      scans, their credits, their connected GitHub token.
 *
 * `auth.oauth-join.test.ts` proves the *legitimate* case of FR-004 — joining
 * a password account that was ALREADY verified before the OAuth sign-in ever
 * happened — extensively, but every one of its fixtures sets
 * `emailVerifiedAt: new Date()` on the pre-existing row. None of them cover
 * an existing row that was never verified by anyone, which is exactly the
 * row shape step 1 above produces. That gap is what this file closes.
 *
 * This test reproduces the full chain end to end against the real routes —
 * register, resolveOAuthIdentity (standing in for a real Google callback,
 * which contract tests elsewhere already prove wires this same function
 * up), verify, then login — and its first run (before the fix in
 * `oauth.service.ts`) demonstrates the attacker's password working on the
 * victim's account after step 4. The fix must break step 4 without breaking
 * the legitimate case `auth.oauth-join.test.ts` already covers.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resolveOAuthIdentity } from '../../src/services/auth/oauth.service.js';
import { verifyEmail } from '../../src/services/auth/registration.service.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const VICTIM_EMAIL = 'prehijack-victim@example.com';
const ATTACKER_PASSWORD = 'attacker-chosen-password-1';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('account pre-hijacking: OAuth join onto an unverified pre-existing registration', () => {
  it('an attacker-set password must not survive a real owner joining by verified OAuth email', async () => {
    // 1. Attacker registers the victim's real address. Unverified, but the row
    //    — and the attacker's password on it — now exists.
    await request(app)
      .post('/auth/register')
      .send({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD })
      .expect(201);
    const attackerRow = await testDb.user.findUniqueOrThrow({ where: { email: VICTIM_EMAIL } });
    expect(attackerRow.emailVerifiedAt).toBeNull();
    const verifyToken = mailer.lastVerificationToken();

    // Confirms the row is genuinely not usable yet — the attacker cannot log
    // in either, so nothing before this point is itself the vulnerability.
    await request(app)
      .post('/auth/login')
      .send({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD })
      .expect(403);

    // 2. The real victim signs in with a provider that has genuinely confirmed
    //    their ownership of the address (FR-004's join path).
    const joined = await resolveOAuthIdentity(testDb, {
      provider: 'google',
      providerUserId: 'victim-google-uid',
      email: VICTIM_EMAIL,
      emailVerified: true,
    });
    expect(joined.userId).toBe(attackerRow.id);
    expect(joined.created).toBe(false);

    // 3. The address gets verified through the victim's own inbox — the
    //    confirmation link their own earlier registration attempt is sitting
    //    on, or any other legitimate verification path. This must not be
    //    read as "so don't verify it" — FR-002 requires verification to be
    //    reachable, and the inbox is genuinely the victim's.
    await verifyEmail(testDb, verifyToken);

    // 4. The security property under test: once verified, the ORIGINAL
    //    password — set by whoever registered the row, not by the person who
    //    just proved address ownership via OAuth — must never again grant
    //    access to this account.
    const attackerLoginAttempt = await request(app)
      .post('/auth/login')
      .send({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD });
    expect(attackerLoginAttempt.status).toBe(401);
    expect((attackerLoginAttempt.body as { error: { code: string } }).error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    // The victim's own access must be unaffected: their Google identity still
    // resolves to the same account, and the account is usable.
    const secondSignIn = await resolveOAuthIdentity(testDb, {
      provider: 'google',
      providerUserId: 'victim-google-uid',
      email: VICTIM_EMAIL,
      emailVerified: true,
    });
    expect(secondSignIn.userId).toBe(attackerRow.id);
    expect(secondSignIn.created).toBe(false);
    expect(await testDb.user.count()).toBe(1);
  });

  it('does not touch a password when the existing account was already verified (the legitimate FR-004 case)', async () => {
    // The ordinary case `auth.oauth-join.test.ts` covers must keep working:
    // a user who registered AND verified their own address, then adds Google
    // as a second sign-in method, keeps their original password.
    const hash = '$2b$12$fakehashfakehashfakehashfakehashfakehashfakehashfake';
    const existing = await testDb.user.create({
      data: {
        email: 'already-verified@example.com',
        passwordHash: hash,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await resolveOAuthIdentity(testDb, {
      provider: 'google',
      providerUserId: 'legit-google-uid',
      email: 'already-verified@example.com',
      emailVerified: true,
    });

    expect(result.userId).toBe(existing.id);
    const after = await testDb.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.passwordHash).toBe(hash);
    expect(after.emailVerifiedAt).toEqual(existing.emailVerifiedAt);
  });
});
