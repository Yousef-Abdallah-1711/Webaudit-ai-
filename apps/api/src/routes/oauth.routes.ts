/**
 * T030/T031 (routes) — social sign-in and code-hosting connection.
 *
 * Four routes from contracts/http-api.md:
 *   GET    /auth/oauth/:provider/start     FR-003
 *   GET    /auth/oauth/:provider/callback  FR-004 — joins on verified email
 *   POST   /auth/github/connect            FR-007, stored encrypted (FR-091)
 *   DELETE /auth/github/connect            FR-007  (also /disconnect, see below)
 *
 * Mounted under `/auth` alongside `authRoutes`. Kept in its own file because
 * the provider handshake has a different failure surface from the rest of auth:
 * every step here can fail because of a third party, and each of those failures
 * has to become a refusal rather than a 500.
 *
 * Order matters in the callback and is enforced by the code below: the `state`
 * comparison happens BEFORE the authorisation code is used for anything. A
 * callback we cannot tie to a browser we sent away is not a login attempt, it is
 * an attack, and it must cost the provider nothing.
 */
import { Router, type Response as ExResponse } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { env } from '../config/env.js';
import {
  UnverifiedProviderEmailError,
  resolveOAuthIdentity,
} from '../services/auth/oauth.service.js';
import {
  OAUTH_TX_COOKIE,
  OAuthExchangeError,
  OAuthProfileError,
  OAuthStateError,
  ProviderNotConfiguredError,
  UnsupportedProviderError,
  assertIntent,
  assertProvider,
  assertSameProvider,
  assertStateMatches,
  beginAuthorization,
  defaultHttpClient,
  exchangeCode,
  fetchProviderProfile,
  issueSessionForUser,
  openTransaction,
  safeReturnTo,
  sealTransaction,
  webUrl,
  type HttpClient,
  type OAuthTransaction,
} from '../services/auth/oauth-flow.service.js';
import { seal } from '../services/auth/token-vault.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { setRefreshCookie } from './auth.routes.js';

const TX_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/** Where the web app lands after a sign-in with no explicit `returnTo`. */
const DEFAULT_LANDING = '/dashboard';

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } };

/**
 * The pending-transaction cookie. `sameSite: 'lax'` is required, not a
 * preference: the callback arrives as a top-level cross-site navigation from
 * the provider, and `strict` would withhold the cookie exactly then, breaking
 * every sign-in. `lax` still withholds it from cross-site sub-requests, which
 * is where the CSRF risk lives. The connect flow reads it from an XHR the web
 * app makes, which is same-site as long as the API and the web app share a
 * registrable domain (api.example.com / example.com).
 */
function setTransactionCookie(res: ExResponse, value: string): void {
  res.cookie(OAUTH_TX_COOKIE, value, {
    httpOnly: true, // the verifier must be unreadable to page script
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/auth',
    maxAge: TX_COOKIE_MAX_AGE_MS,
  });
}

function clearTransactionCookie(res: ExResponse): void {
  res.clearCookie(OAUTH_TX_COOKIE, { path: '/auth' });
}

function transactionCookie(req: AuthedRequest): string | undefined {
  const jar = req.cookies as Record<string, string> | undefined;
  return jar?.[OAUTH_TX_COOKIE];
}

/**
 * The `:provider` path segment as a plain string. Read defensively: annotating
 * the handler's request drops Express's route-parameter inference, so this must
 * not assume the shape of what came off the URL.
 */
function providerParam(req: AuthedRequest): string {
  const value: unknown = req.params['provider'];
  return typeof value === 'string' ? value : '';
}

function fail(res: ExResponse, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

/**
 * Maps a provider-flow failure to a refusal. Returns false when the error is
 * ours rather than theirs, so the caller rethrows and the app's error handler
 * turns it into a 500 without leaking internals.
 *
 * Every message here is fixed text or a status code. FR-091: an error never
 * carries a token, a client secret, or a provider response body.
 */
function refuse(res: ExResponse, e: unknown): boolean {
  if (e instanceof UnsupportedProviderError) {
    fail(res, 404, 'PROVIDER_UNSUPPORTED', 'That sign-in provider is not supported.');
    return true;
  }
  if (e instanceof ProviderNotConfiguredError) {
    // 501, not 500: the deployment is missing configuration, the request was
    // fine, and a retry will not help until an operator acts.
    fail(res, 501, 'PROVIDER_NOT_CONFIGURED', 'That sign-in provider is not available here.');
    return true;
  }
  if (e instanceof OAuthStateError) {
    fail(
      res,
      400,
      'OAUTH_STATE_INVALID',
      'This sign-in link is no longer valid. Start again from the sign-in page.',
    );
    return true;
  }
  if (e instanceof OAuthExchangeError) {
    fail(res, 502, 'OAUTH_EXCHANGE_FAILED', 'The provider would not complete the sign-in.');
    return true;
  }
  if (e instanceof OAuthProfileError) {
    fail(res, 502, 'OAUTH_PROFILE_FAILED', 'The provider would not share the account details.');
    return true;
  }
  if (e instanceof UnverifiedProviderEmailError) {
    // 403 and no further detail. An unverified provider address is an
    // account-takeover path (anyone who can claim the address at the provider
    // would inherit the local account), so this is a refusal, not a prompt.
    fail(
      res,
      403,
      'PROVIDER_EMAIL_UNVERIFIED',
      'Confirm your email address with that provider first, then try again.',
    );
    return true;
  }
  return false;
}

const startQuery = z.object({
  intent: z.enum(['signin', 'connect']).default('signin'),
  returnTo: z.string().optional(),
});

const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(256).optional(),
});

const connectBody = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(512),
});

/**
 * @param db     Prisma client.
 * @param http   Provider HTTP client. Injected so contract tests stub every
 *               provider response — no suite in this repo touches the network.
 */
export function oauthRoutes(db: PrismaClient, http: HttpClient = defaultHttpClient): Router {
  const r = Router();

  // ── FR-003: begin ─────────────────────────────────────────────────────────
  // Deliberately unauthenticated, including for `intent=connect`: this is a
  // top-level browser redirect that carries no Authorization header. Nothing is
  // granted here — the connect intent only becomes a stored credential at
  // POST /github/connect, which does require a session.
  r.get('/oauth/:provider/start', (req: AuthedRequest, res) => {
    try {
      const provider = assertProvider(providerParam(req));
      const query = startQuery.safeParse(req.query);
      if (!query.success) {
        fail(res, 422, 'VALIDATION', 'Invalid sign-in request.');
        return;
      }

      const { authorizeUrl, transaction } = beginAuthorization(
        provider,
        query.data.intent,
        safeReturnTo(query.data.returnTo),
      );
      setTransactionCookie(res, sealTransaction(transaction));
      res.redirect(302, authorizeUrl);
    } catch (e) {
      if (refuse(res, e)) return;
      throw e;
    }
  });

  // ── FR-004: return ────────────────────────────────────────────────────────
  r.get('/oauth/:provider/callback', async (req: AuthedRequest, res) => {
    try {
      const provider = assertProvider(providerParam(req));
      const query = callbackQuery.safeParse(req.query);
      if (!query.success) {
        fail(res, 422, 'VALIDATION', 'Invalid sign-in response.');
        return;
      }

      // The provider says the user declined, or refused us. Not an error on our
      // side, and the reason text is theirs — it is not echoed back.
      if (query.data.error) {
        clearTransactionCookie(res);
        fail(res, 400, 'OAUTH_DENIED', 'Sign-in was not completed.');
        return;
      }

      let tx: OAuthTransaction;
      try {
        tx = openTransaction(transactionCookie(req));
      } finally {
        // One attempt per cookie, whatever happens next.
        clearTransactionCookie(res);
      }

      // Nothing above this line has cost the provider anything, and nothing
      // below it runs until the request is tied to a browser we sent away.
      assertSameProvider(tx, provider);
      assertIntent(tx, 'signin');
      assertStateMatches(tx, query.data.state);

      if (!query.data.code) {
        fail(res, 422, 'VALIDATION', 'Invalid sign-in response.');
        return;
      }

      // From here the token is a live credential. It is never stored for a
      // sign-in — the profile is all we needed — and never logged.
      const providerToken = await exchangeCode(tx, query.data.code, http);
      const profile = await fetchProviderProfile(provider, providerToken, http);

      // FR-004: the join decision lives in oauth.service, not here.
      const { userId } = await resolveOAuthIdentity(db, {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        emailVerified: profile.emailVerified,
      });

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, isOperator: true },
      });
      if (!user) {
        // The row vanished between resolve and read — a concurrent account
        // deletion. Refuse rather than resurrect (FR-009).
        fail(res, 400, 'OAUTH_STATE_INVALID', 'This sign-in could not be completed.');
        return;
      }

      const session = await issueSessionForUser(db, user);
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);

      // The access token is NOT put in the redirect: a URL lands in browser
      // history, in the Referer header, and in every proxy log on the way. The
      // web app exchanges the refresh cookie it just received at
      // POST /auth/refresh instead.
      res.redirect(302, webUrl(tx.returnTo === '' ? DEFAULT_LANDING : tx.returnTo));
    } catch (e) {
      if (refuse(res, e)) return;
      throw e;
    }
  });

  // ── FR-007: connect ───────────────────────────────────────────────────────
  //
  // The browser finishes the GitHub handshake on the web app (that is where
  // `intent=connect` points `redirect_uri`), then the web app posts the code
  // here with its access token. So this route, unlike the callback above, knows
  // exactly whose account the credential belongs to.
  //
  // It takes a `code`, never a token. Accepting a bearer token in a request
  // body would mean a live GitHub credential in whatever logs or error
  // reporters see request bodies; exchanging a single-use code server-side
  // means the token exists only in this process's memory before it is sealed.
  r.post('/github/connect', requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    try {
      const body = connectBody.safeParse(req.body);
      if (!body.success) {
        fail(res, 422, 'VALIDATION', 'A GitHub authorization code and state are required.');
        return;
      }

      let tx: OAuthTransaction;
      try {
        tx = openTransaction(transactionCookie(req));
      } finally {
        clearTransactionCookie(res);
      }

      assertSameProvider(tx, 'github');
      assertIntent(tx, 'connect');
      assertStateMatches(tx, body.data.state);

      const providerToken = await exchangeCode(tx, body.data.code, http);
      // Reading the profile also proves the token works before it is stored, so
      // a dead credential is never persisted.
      const profile = await fetchProviderProfile('github', providerToken, http);

      // FR-091: sealed with AES-256-GCM before it reaches the database. There is
      // no plaintext column for it, so there is no path that stores one.
      const sealed = seal(providerToken);
      await db.user.update({
        where: { id: userId },
        data: {
          githubTokenEnc: sealed.ciphertext,
          githubTokenIv: sealed.iv,
          githubLogin: profile.login,
        },
      });

      // The handle, never the credential.
      res.status(200).json({ connected: true, login: profile.login });
    } catch (e) {
      if (refuse(res, e)) return;
      throw e;
    }
  });

  // ── FR-007: disconnect ────────────────────────────────────────────────────
  // The contract table names `DELETE /auth/github/connect`; the task brief and
  // the web app call it `/disconnect`. Both are registered rather than picking
  // a side and breaking one of them.
  const disconnect = async (req: AuthedRequest, res: ExResponse): Promise<void> => {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    // updateMany, so disconnecting an already-disconnected account is a
    // no-op 204 rather than a 500 on a missing row.
    await db.user.updateMany({
      where: { id: userId },
      data: { githubTokenEnc: null, githubTokenIv: null, githubLogin: null },
    });
    res.status(204).end();
  };

  r.delete('/github/connect', requireAuth, disconnect);
  r.delete('/github/disconnect', requireAuth, disconnect);

  return r;
}
