/**
 * T028 — Login, refresh rotation, logout.
 *
 * FR-006. Access token 15 minutes in the Authorization header; refresh token
 * 7 days in an httpOnly cookie.
 *
 * Rotation is the security property: presenting a refresh token consumes it.
 * Without that, a stolen cookie is valid for its full lifetime.
 *
 * Consuming it MUST be atomic. A read of `revokedAt` followed by a write is not:
 * concurrent presentations of one stolen cookie all pass the read and each mint
 * a live session. The conditional revoke below is the gate, and its row count is
 * the answer.
 *
 * Reuse policy: presenting a token that was already revoked — by rotation or by
 * logout — more than REUSE_GRACE_MS ago revokes every live session of that user.
 * That is the standard answer to a replayed refresh token, and the schema has no
 * rotation-chain column, so the "family" is the user's whole token set. The cost
 * is that a stale tab replaying its own dead cookie signs the user out
 * everywhere; the grace window keeps the common case — a client racing itself —
 * out of that path, and the alternative is letting a known-leaked token probe
 * indefinitely at no cost to whoever holds it.
 */
import { SignJWT, jwtVerify } from 'jose';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { env } from '../../config/env.js';
import { generateToken, hashToken, verifyPassword } from './crypto.js';
import { normalizeEmail } from './registration.service.js';

export class InvalidCredentialsError extends Error {}
export class EmailNotVerifiedError extends Error {}
export class InvalidRefreshTokenError extends Error {}

export interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AccessClaims {
  sub: string;
  isOperator: boolean;
}

async function signAccessToken(userId: string, isOperator: boolean): Promise<string> {
  return new SignJWT({ isOperator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, env.accessSecret);
  if (typeof payload.sub !== 'string') throw new Error('malformed token');
  return { sub: payload.sub, isOperator: payload['isOperator'] === true };
}

type SessionWriter = Pick<PrismaClient, 'refreshToken'>;

async function issueSession(
  db: SessionWriter,
  user: { id: string; isOperator: boolean },
): Promise<Session> {
  const raw = generateToken();
  const expiresAt = new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
  await db.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt },
  });
  return {
    accessToken: await signAccessToken(user.id, user.isOperator),
    refreshToken: raw,
    refreshExpiresAt: expiresAt,
  };
}

export async function login(
  db: PrismaClient,
  input: { email: string; password: string },
): Promise<Session> {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(input.email) } });

  // An unknown address and a wrong password must be indistinguishable, so the
  // hash comparison runs either way and both raise the same error.
  const stored = user?.passwordHash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await verifyPassword(input.password, stored);

  if (!user || !ok) throw new InvalidCredentialsError();
  // Distinct from the above: the credentials were right, the account is not
  // usable yet. FR-002.
  if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();

  return issueSession(db, user);
}

/**
 * How recently a token may have been consumed for its reuse to be read as a
 * client racing itself rather than as theft.
 *
 * Two tabs, or a retry after a dropped response, genuinely do present the same
 * cookie twice within milliseconds. Signing such a user out of every device is a
 * worse outcome than refusing the duplicate request, and the atomic claim below
 * already denies the duplicate a session either way. A replay that arrives after
 * this window has no benign explanation.
 */
const REUSE_GRACE_MS = 10_000;

export async function refresh(db: PrismaClient, raw: string | undefined): Promise<Session> {
  if (!raw) throw new InvalidRefreshTokenError();

  const now = new Date();
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });
  if (!row) throw new InvalidRefreshTokenError();

  if (row.revokedAt) {
    // A token that was already consumed is being presented again. Inside the
    // grace window that is a client racing itself; outside it, reuse detected.
    if (now.getTime() - row.revokedAt.getTime() > REUSE_GRACE_MS) {
      await revokeFamily(db, row.userId);
    }
    throw new InvalidRefreshTokenError();
  }
  if (row.expiresAt < now) throw new InvalidRefreshTokenError();

  const rotated = await db.$transaction(async (tx) => {
    // The revoke IS the gate. Under concurrency the second and third writers
    // block on this row, then re-evaluate the predicate against the committed
    // row and match nothing. Reading `revokedAt` and then revoking would let
    // every concurrent presentation of one stolen cookie mint a live session.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) return null;

    // Issued inside the same transaction: if this fails the revoke rolls back
    // with it, so a transport error costs the user nothing.
    return issueSession(tx, row.user);
  });

  // Lost the race: another presentation of this same cookie claimed it while
  // this one was in flight. The pre-read saw it live, so this is the benign
  // simultaneous case — refuse this request and leave the family alone.
  if (!rotated) throw new InvalidRefreshTokenError();
  return rotated;
}

/**
 * Standard response to a replayed refresh token: assume the chain is compromised
 * and end every session of that user. The schema carries no rotation-chain
 * column, so "family" is all of the user's live tokens.
 */
async function revokeFamily(db: PrismaClient, userId: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes only the presented session — other devices stay signed in. */
export async function logout(db: PrismaClient, raw: string | undefined): Promise<void> {
  if (!raw) return;
  await db.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
