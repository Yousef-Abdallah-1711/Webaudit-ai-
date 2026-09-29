/**
 * T034 — Auth routes, per contracts/http-api.md.
 */
import { Router, type Response as ExResponse } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import type { Mailer } from '../services/services-types.js';
import { env } from '../config/env.js';
import {
  TokenInvalidError,
  register,
  resendVerification,
  verifyEmail,
} from '../services/auth/registration.service.js';
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  login,
  logout,
  refresh,
} from '../services/auth/session.service.js';
import { completeReset, requestReset } from '../services/auth/reset.service.js';
import { deleteAccount } from '../services/auth/deletion.service.js';
import { updateProfile } from '../services/auth/profile.service.js';
import {
  changePassword,
  InvalidCurrentPasswordError,
} from '../services/auth/change-password.service.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';

const REFRESH_COOKIE = 'refresh_token';
const PENDING_VERIFICATION_COOKIE = 'pending_verification';
const PENDING_VERIFICATION_TTL_MS = 60 * 60 * 1000;

/** Length beats composition rules for real-world password strength. */
const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  name: z.string().trim().min(1).max(100).optional(),
});

const profileBody = z.object({ name: z.string().trim().min(1).max(100) }).strict();

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } };
const BAD_CREDENTIALS = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
};
const TOKEN_GONE = {
  error: { code: 'TOKEN_INVALID', message: 'This link is no longer valid.' },
};

/**
 * Exported so `oauth.routes.ts` sets an identical cookie after a social
 * sign-in. One definition: a social session that differed in `httpOnly`,
 * `sameSite`, or `path` from a password session would be a silent downgrade.
 *
 * `secure` is `env.isProduction && req.secure`, not `env.isProduction` alone.
 * A browser refuses to store a `Secure` cookie received over plain HTTP — so
 * `env.isProduction` on its own is correct once TLS is live, but actively
 * breaks every login during the genuine interim window this deployment
 * documents (P8-T5: the reverse proxy ships HTTP-only until a real
 * certificate exists). Verified directly: a real login through the current
 * HTTP-only compose stack returned `Set-Cookie: ...; Secure` before this fix,
 * which no browser would have stored. `req.secure` reads `X-Forwarded-Proto`
 * once `trust proxy` is set (app.ts), so this becomes accurate the moment the
 * proxy actually terminates TLS, with no further code change.
 */
export function setRefreshCookie(
  req: AuthedRequest,
  res: ExResponse,
  token: string,
  expires: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true, // the page must never be able to read it
    secure: env.isProduction && req.secure,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

function cookieToken(req: AuthedRequest): string | undefined {
  const jar = req.cookies as Record<string, string> | undefined;
  return jar?.[REFRESH_COOKIE];
}

function pendingVerificationToken(req: AuthedRequest): string | undefined {
  const jar = req.cookies as Record<string, string> | undefined;
  return jar?.[PENDING_VERIFICATION_COOKIE];
}

export function authRoutes(db: PrismaClient, mailer: Mailer): Router {
  const r = Router();

  r.post('/register', async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(422)
        .json({ error: { code: 'VALIDATION', message: 'Invalid email or password.' } });
      return;
    }
    const result = await register(db, mailer, parsed.data);
    // The raw cookie value is a one-hour opaque reference on new accounts and
    // an unpersisted decoy for duplicate attempts, keeping response shape and
    // cookie presence enumeration-safe.
    res.cookie(PENDING_VERIFICATION_COOKIE, result.pendingVerificationToken, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      path: '/auth',
      expires: new Date(Date.now() + PENDING_VERIFICATION_TTL_MS),
    });
    res.status(201).json({
      message: 'Check your email to confirm your address.',
      email: result.email,
    });
  });

  r.post('/verify/resend', async (req, res) => {
    const body = req.body as { email?: unknown };
    const email = z.string().email().safeParse(body?.email);
    const pendingToken = pendingVerificationToken(req);
    // Always 202: the response must not disclose whether an address exists.
    // A present cookie takes precedence, including when it is invalid (for
    // example the decoy sent after a duplicate registration). Legacy callers
    // without the cookie may continue to submit their email address.
    if (pendingToken) {
      await resendVerification(db, mailer, { pendingToken });
    } else if (email.success) {
      await resendVerification(db, mailer, { email: email.data });
    }
    res
      .status(202)
      .json({ message: 'If that address needs confirming, a new link is on its way.' });
  });

  r.post('/verify/:token', async (req, res) => {
    try {
      await verifyEmail(db, req.params.token);
      res.status(200).json({ message: 'Address confirmed. You can sign in now.' });
    } catch (e) {
      // 410 Gone: used, expired, and unknown collapse to one outcome with no
      // signal about which.
      if (e instanceof TokenInvalidError) {
        res.status(410).json(TOKEN_GONE);
        return;
      }
      throw e;
    }
  });

  r.post('/login', async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json(BAD_CREDENTIALS);
      return;
    }
    try {
      const session = await login(db, parsed.data);
      setRefreshCookie(req, res, session.refreshToken, session.refreshExpiresAt);
      res.status(200).json({ accessToken: session.accessToken });
    } catch (e) {
      if (e instanceof EmailNotVerifiedError) {
        res.status(403).json({
          error: { code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your address first.' },
        });
        return;
      }
      if (e instanceof InvalidCredentialsError) {
        res.status(401).json(BAD_CREDENTIALS);
        return;
      }
      throw e;
    }
  });

  r.post('/refresh', async (req: AuthedRequest, res) => {
    try {
      const session = await refresh(db, cookieToken(req));
      setRefreshCookie(req, res, session.refreshToken, session.refreshExpiresAt);
      res.status(200).json({ accessToken: session.accessToken });
    } catch (e) {
      if (e instanceof InvalidRefreshTokenError) {
        res.clearCookie(REFRESH_COOKIE, { path: '/' });
        res.status(401).json(UNAUTHORIZED);
        return;
      }
      throw e;
    }
  });

  r.post('/logout', async (req: AuthedRequest, res) => {
    await logout(db, cookieToken(req));
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.status(204).end();
  });

  r.post('/forgot-password', async (req, res) => {
    const body = req.body as { email?: unknown };
    const email = z.string().email().safeParse(body?.email);
    if (email.success) await requestReset(db, mailer, email.data);
    res
      .status(202)
      .json({ message: 'If that address has an account, a reset link is on its way.' });
  });

  r.post('/reset-password', async (req, res) => {
    const parsed = z
      .object({ token: z.string().min(1), password: z.string().min(12).max(200) })
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(422)
        .json({ error: { code: 'VALIDATION', message: 'Invalid token or password.' } });
      return;
    }
    try {
      await completeReset(db, parsed.data.token, parsed.data.password);
      res.status(200).json({ message: 'Password changed. All sessions were signed out.' });
    } catch (e) {
      if (e instanceof TokenInvalidError) {
        res.status(410).json(TOKEN_GONE);
        return;
      }
      throw e;
    }
  });

  r.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(12).max(200),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid password.' } });
      return;
    }
    try {
      await changePassword(db, {
        userId: req.auth!.userId,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      res.status(200).json({ message: 'Password changed. All sessions were signed out.' });
    } catch (e) {
      if (e instanceof InvalidCurrentPasswordError) {
        // 403, not 401: `requireAuth` already established this bearer token
        // is genuinely valid — this failure is about a second credential
        // (the current password), not the session itself. `lib/api.ts`'s
        // `request()` treats every 401 from anywhere as "the session is
        // gone" and force-logs the browser out (`notifyUnauthorized()`) —
        // a real bug this status code caused, found by
        // `settings-account.spec.ts`'s real-browser Phase 10 run: typing a
        // wrong current password silently logged the user out instead of
        // showing the inline error the page already renders correctly.
        res.status(403).json(BAD_CREDENTIALS);
        return;
      }
      throw e;
    }
  });

  r.get('/me', requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    // One round trip, not two. A balance is derived from lots, never stored,
    // and is reported as two figures because the two kinds have different
    // lifetimes (FR-078) — so the live lots come back with the user rather than
    // in a follow-up query.
    const now = new Date();
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        subscription: { include: { plan: true } },
        lots: {
          where: {
            amountRemaining: { gt: 0 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { kind: true, amountRemaining: true },
        },
      },
    });
    if (!user) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }

    const nameRows = await db.$queryRaw<
      { name: string | null }[]
    >`SELECT name FROM "User" WHERE id = ${userId}`;

    const sum = (kind: 'PLAN' | 'PURCHASED'): number =>
      user.lots.filter((l) => l.kind === kind).reduce((n, l) => n + l.amountRemaining, 0);

    res.status(200).json({
      id: user.id,
      email: user.email,
      name: nameRows[0]?.name ?? null,
      githubLogin: user.githubLogin,
      isOperator: user.isOperator,
      emailVerified: user.emailVerifiedAt !== null,
      plan: user.subscription?.plan.id ?? 'free',
      credits: {
        plan: sum('PLAN'),
        purchased: sum('PURCHASED'),
        planExpiresAt: user.subscription?.periodEnd ?? null,
      },
    });
  });

  r.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: { code: 'VALIDATION', message: 'Invalid profile update.' } });
      return;
    }
    const profile = await updateProfile(db, { userId: req.auth!.userId, name: parsed.data.name });
    res.status(200).json({ ...profile });
  });

  r.delete('/me', requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    await deleteAccount(db, userId);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.status(204).end();
  });

  return r;
}
