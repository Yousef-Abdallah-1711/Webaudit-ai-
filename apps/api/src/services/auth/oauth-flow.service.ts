/**
 * T030 (flow half) — the OAuth 2.0 authorisation-code exchange itself.
 *
 * `oauth.service.ts` decides *which account* a provider profile belongs to.
 * This file is everything that happens before that: building the authorise
 * URL, proving the callback belongs to the browser we sent away, exchanging the
 * code, and reading the profile.
 *
 * Two defences are mandatory here, not optional:
 *
 *  - **`state`** — an unguessable value minted at `/start`, bound to the
 *    browser, and required to match at the callback. Without it, an attacker
 *    can feed their own authorisation code into a victim's callback and end up
 *    with the victim signed in to the attacker's account (login CSRF).
 *  - **PKCE** (RFC 7636, S256) — the code is only redeemable by whoever holds
 *    the verifier. Without it, a code intercepted in a redirect, a referrer
 *    header, or a shared browser log is redeemable by anyone with the client
 *    id.
 *
 * Where the pending transaction lives: sealed inside a short-lived httpOnly
 * cookie (see `sealTransaction`). Rationale and tradeoff are documented there.
 *
 * FR-091: no function in this file logs, returns, or embeds an access token or
 * a client secret in an error. Errors carry a reason, never a value.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT } from 'jose';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { env } from '../../config/env.js';
import { generateToken, hashToken } from './crypto.js';
import { open, seal } from './token-vault.js';

/** The two providers the MVP supports (contracts/http-api.md, FR-003, FR-007). */
export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

/**
 * `signin` creates or joins an account (FR-003/FR-004); `connect` attaches a
 * code-hosting token to an account that is already signed in (FR-007).
 */
export const OAUTH_INTENTS = ['signin', 'connect'] as const;
export type OAuthIntent = (typeof OAUTH_INTENTS)[number];

export class UnsupportedProviderError extends Error {}
export class ProviderNotConfiguredError extends Error {}
/** Missing, expired, tampered, or mismatched `state`. Never reaches an exchange. */
export class OAuthStateError extends Error {}
export class OAuthExchangeError extends Error {}
export class OAuthProfileError extends Error {}

// ── The HTTP seam ────────────────────────────────────────────────────────────
// Provider calls go through an injected client so contract tests can stub every
// provider response. A suite that needs live network is a broken suite
// (Constitution, Principle IV).

export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequest {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export type HttpClient = (url: string, request: HttpRequest) => Promise<HttpResponseLike>;

export const defaultHttpClient: HttpClient = (url, request) =>
  fetch(url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
  });

// ── Profiles ─────────────────────────────────────────────────────────────────

/**
 * What a provider tells us about the person. `login` is the code-hosting
 * handle, present for GitHub only, and stored unencrypted because it is a
 * public name rather than a credential.
 */
export interface ProviderProfile {
  provider: OAuthProviderId;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  login: string | null;
}

// ── Provider configuration ───────────────────────────────────────────────────

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Least privilege per intent (FR-007). */
  scopes: Record<OAuthIntent, readonly string[]>;
  fetchProfile(accessToken: string, http: HttpClient): Promise<ProviderProfile>;
}

const googleUserinfo = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  // Google sends a real boolean on the OIDC userinfo endpoint; some legacy
  // responses send the string form. Absent is treated as unverified, never as
  // verified.
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]).optional(),
});

const githubUser = z.object({
  id: z.union([z.number(), z.string()]),
  login: z.string().min(1),
});

const githubEmails = z.array(
  z.object({ email: z.string().email(), primary: z.boolean(), verified: z.boolean() }),
);

async function getJson(
  http: HttpClient,
  url: string,
  accessToken: string,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const res = await http(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...extraHeaders,
    },
  });
  if (!res.ok) {
    // The status is safe to surface. The token is not, and is not interpolated.
    throw new OAuthProfileError(`provider profile request failed with status ${res.status}`);
  }
  return res.json();
}

const GITHUB_API_HEADERS: Record<string, string> = {
  'x-github-api-version': '2022-11-28',
  'user-agent': 'webaudit-ai',
};

const PROVIDERS: Record<OAuthProviderId, ProviderSpec> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    // Identity only. Google hosts no repositories, so the connect intent asks
    // for nothing extra.
    scopes: { signin: ['openid', 'email'], connect: ['openid', 'email'] },
    async fetchProfile(accessToken, http) {
      const parsed = googleUserinfo.safeParse(
        await getJson(http, 'https://openidconnect.googleapis.com/v1/userinfo', accessToken),
      );
      if (!parsed.success) throw new OAuthProfileError('unreadable google userinfo response');
      const verified = parsed.data.email_verified;
      return {
        provider: 'google',
        providerUserId: parsed.data.sub,
        email: parsed.data.email,
        emailVerified: verified === true || verified === 'true',
        login: null,
      };
    },
  },

  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    // FR-007 asks for only the access needed to read the repositories the user
    // selects. Classic OAuth has no read-only private-repository scope: `repo`
    // is the narrowest that can read a private repo at all, and it is requested
    // only for the connect intent, never to sign in. Narrowing further needs a
    // GitHub App with per-repository selection — recorded as the follow-up
    // rather than silently over-asking on every sign-in.
    scopes: { signin: ['read:user', 'user:email'], connect: ['read:user', 'repo'] },
    async fetchProfile(accessToken, http) {
      const user = githubUser.safeParse(
        await getJson(http, 'https://api.github.com/user', accessToken, GITHUB_API_HEADERS),
      );
      if (!user.success) throw new OAuthProfileError('unreadable github user response');

      // GitHub's /user does not say whether the address is verified, and the
      // public profile email may be absent or a non-primary alias. Only
      // /user/emails carries the verified flag that FR-004's join decision
      // depends on.
      const emails = githubEmails.safeParse(
        await getJson(http, 'https://api.github.com/user/emails', accessToken, GITHUB_API_HEADERS),
      );
      if (!emails.success) throw new OAuthProfileError('unreadable github emails response');
      const primary = emails.data.find((e) => e.primary) ?? emails.data[0];
      if (!primary) throw new OAuthProfileError('github account exposes no email address');

      return {
        provider: 'github',
        providerUserId: String(user.data.id),
        email: primary.email,
        emailVerified: primary.verified,
        login: user.data.login,
      };
    },
  },
};

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Credentials are read per request rather than at import time, so an
 * unconfigured provider is one clear refusal on one route instead of a process
 * that will not boot.
 */
function credentials(provider: OAuthProviderId): ProviderCredentials {
  const config = PROVIDERS[provider];
  const clientId = readEnv(config.clientIdEnv);
  const clientSecret = readEnv(config.clientSecretEnv);
  if (!clientId || !clientSecret) {
    // Names the provider, never a value.
    throw new ProviderNotConfiguredError(`${provider} is not configured on this deployment`);
  }
  return { clientId, clientSecret };
}

export function isProviderConfigured(provider: OAuthProviderId): boolean {
  try {
    credentials(provider);
    return true;
  } catch {
    return false;
  }
}

/** Narrows a path parameter, or refuses it. */
export function assertProvider(value: string): OAuthProviderId {
  if (!isOAuthProvider(value)) throw new UnsupportedProviderError('unsupported provider');
  return value;
}

// ── Service URLs ─────────────────────────────────────────────────────────────

function baseUrl(name: 'API_URL' | 'WEB_URL', fallback: string): string {
  return (readEnv(name) ?? fallback).replace(/\/+$/, '');
}

/**
 * Where the provider sends the browser back to. Sign-in returns to this API,
 * which can set the refresh cookie itself. Connect returns to the web app,
 * which already holds an access token and can POST the code to
 * `/auth/github/connect` — the API cannot authenticate a bare browser redirect
 * as a specific signed-in user, so it must not pretend to.
 */
export function redirectUriFor(provider: OAuthProviderId, intent: OAuthIntent): string {
  return intent === 'signin'
    ? `${baseUrl('API_URL', 'http://localhost:3001')}/auth/oauth/${provider}/callback`
    : `${baseUrl('WEB_URL', 'http://localhost:3000')}/settings/integrations/${provider}/callback`;
}

/** Builds a URL on our own web origin. Never takes a host from the request. */
export function webUrl(path: string): string {
  return `${baseUrl('WEB_URL', 'http://localhost:3000')}${path}`;
}

/**
 * `returnTo` is attacker-supplied, so only a path on our own origin survives.
 * A protocol-relative `//evil.example` is a fully qualified URL to a browser,
 * and a backslash is normalised to a slash by some of them.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') return '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '';
  return raw.slice(0, 512);
}

// ── The pending transaction ──────────────────────────────────────────────────

export const OAUTH_TX_COOKIE = 'oauth_tx';
const TX_TTL_MS = 10 * 60 * 1000;

const transactionSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  intent: z.enum(OAUTH_INTENTS),
  state: z.string().min(20),
  codeVerifier: z.string().min(43),
  redirectUri: z.string().min(1),
  returnTo: z.string(),
  expiresAt: z.number().int().positive(),
});

export type OAuthTransaction = z.infer<typeof transactionSchema>;

/**
 * Storage choice: the pending `state` and PKCE verifier are AES-256-GCM sealed
 * (`token-vault.seal`) and carried in a short-lived httpOnly cookie.
 *
 * Why: the flow then needs no shared store, so it survives a rolling deploy and
 * any number of API instances, and there is no per-attempt Redis key to expire.
 * The cookie is server-trusted despite living in the browser because GCM is
 * authenticated — a tampered or hand-written cookie fails to open — and
 * httpOnly keeps page script, including an XSS payload, from reading the
 * verifier.
 *
 * The tradeoff, stated plainly: a sealed cookie cannot be *revoked*, so within
 * its ten-minute window the same transaction could in principle be presented
 * twice. Three things bound that: the TTL is checked on open, the callback
 * clears the cookie before it responds, and the authorisation code itself is
 * single-use at the provider, so a second presentation fails the exchange. If
 * replay inside the window ever needs to be impossible rather than merely
 * useless, move the record to Redis keyed by `state` and delete it on use — the
 * interface in this file does not change.
 */
export function sealTransaction(tx: OAuthTransaction): string {
  const sealed = seal(JSON.stringify(tx));
  return `${sealed.iv.toString('base64url')}.${sealed.ciphertext.toString('base64url')}`;
}

export function openTransaction(cookie: string | undefined): OAuthTransaction {
  if (!cookie) throw new OAuthStateError('no pending authorization request');

  const parts = cookie.split('.');
  const ivPart = parts[0];
  const ctPart = parts[1];
  if (parts.length !== 2 || !ivPart || !ctPart) {
    throw new OAuthStateError('malformed authorization request');
  }

  let raw: string;
  try {
    raw = open({
      iv: Buffer.from(ivPart, 'base64url'),
      ciphertext: Buffer.from(ctPart, 'base64url'),
    });
  } catch {
    // Authentication failure: someone edited the cookie, or the encryption key
    // rotated. Either way there is no trustworthy transaction here.
    throw new OAuthStateError('authorization request failed authentication');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new OAuthStateError('unreadable authorization request');
  }
  const tx = transactionSchema.safeParse(payload);
  if (!tx.success) throw new OAuthStateError('unreadable authorization request');
  if (tx.data.expiresAt < Date.now()) throw new OAuthStateError('authorization request expired');
  return tx.data;
}

/** Constant-time, and it refuses an absent value rather than comparing it. */
export function assertStateMatches(tx: OAuthTransaction, presented: unknown): void {
  if (typeof presented !== 'string' || presented.length === 0) {
    throw new OAuthStateError('missing state');
  }
  const expected = Buffer.from(tx.state);
  const actual = Buffer.from(presented);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new OAuthStateError('state mismatch');
  }
}

export function assertIntent(tx: OAuthTransaction, expected: OAuthIntent): void {
  if (tx.intent !== expected) {
    throw new OAuthStateError('authorization request was started for a different purpose');
  }
}

export function assertSameProvider(tx: OAuthTransaction, provider: OAuthProviderId): void {
  if (tx.provider !== provider) {
    throw new OAuthStateError('authorization request was started for a different provider');
  }
}

// ── Step 1: start ────────────────────────────────────────────────────────────

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export interface Authorization {
  authorizeUrl: string;
  transaction: OAuthTransaction;
}

export function beginAuthorization(
  provider: OAuthProviderId,
  intent: OAuthIntent,
  returnTo: string,
): Authorization {
  const config = PROVIDERS[provider];
  const { clientId } = credentials(provider);

  const transaction: OAuthTransaction = {
    provider,
    intent,
    state: randomBytes(32).toString('base64url'),
    // 64 characters, inside RFC 7636's 43..128.
    codeVerifier: randomBytes(48).toString('base64url'),
    redirectUri: redirectUriFor(provider, intent),
    returnTo,
    expiresAt: Date.now() + TX_TTL_MS,
  };

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', transaction.redirectUri);
  url.searchParams.set('scope', config.scopes[intent].join(' '));
  url.searchParams.set('state', transaction.state);
  // GitHub currently ignores PKCE on OAuth Apps; it is sent regardless, because
  // the day it honours it we want it already there, and `state` carries the
  // anti-CSRF property meanwhile.
  url.searchParams.set('code_challenge', challengeFor(transaction.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') {
    // Without this, Google silently reuses a prior consent, which makes
    // "sign in as someone else" impossible on a shared machine.
    url.searchParams.set('prompt', 'select_account');
  }

  return { authorizeUrl: url.toString(), transaction };
}

// ── Step 2: exchange ─────────────────────────────────────────────────────────

const tokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

const tokenError = z.object({ error: z.string().min(1) });

/**
 * Exchanges the authorisation code for an access token. Only ever called once
 * `assertStateMatches` has passed.
 *
 * The returned string is a live credential: it is returned, never logged, and
 * every caller either seals it or discards it.
 */
export async function exchangeCode(
  tx: OAuthTransaction,
  code: string,
  http: HttpClient = defaultHttpClient,
): Promise<string> {
  const config = PROVIDERS[tx.provider];
  const { clientId, clientSecret } = credentials(tx.provider);

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: tx.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: tx.codeVerifier, // PKCE: the code is useless without this
  });

  const res = await http(config.tokenUrl, {
    method: 'POST',
    headers: {
      // GitHub returns a form-encoded body unless asked otherwise.
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new OAuthExchangeError('provider returned an unreadable token response');
  }

  // A provider may report a refusal with a 200 and an `error` field, so the
  // body is inspected before the status.
  const failure = tokenError.safeParse(payload);
  if (failure.success) {
    throw new OAuthExchangeError(`provider refused the authorization code: ${failure.data.error}`);
  }
  if (!res.ok) {
    throw new OAuthExchangeError(`token exchange failed with status ${res.status}`);
  }

  const parsed = tokenResponse.safeParse(payload);
  if (!parsed.success) throw new OAuthExchangeError('provider returned no access token');
  return parsed.data.access_token;
}

// ── Step 3: profile ──────────────────────────────────────────────────────────

export function fetchProviderProfile(
  provider: OAuthProviderId,
  accessToken: string,
  http: HttpClient = defaultHttpClient,
): Promise<ProviderProfile> {
  return PROVIDERS[provider].fetchProfile(accessToken, http);
}

// ── Step 4: the session ──────────────────────────────────────────────────────

export interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Issues the same access/refresh pair `POST /auth/login` issues, for a user who
 * proved themselves at a provider instead of with a password.
 *
 * DUPLICATION, DELIBERATE AND TEMPORARY: `session.service.ts` has exactly this
 * logic in a private `issueSession`, and `login` is the only way in — but
 * `login` demands a password, and a social-only account has none
 * (`User.passwordHash` is nullable precisely for this). That file is owned by
 * another change in flight, so this cannot export the helper today. When
 * `issueSession` becomes exported, delete this function and its one call site
 * in `oauth.routes.ts`; the shape is identical on purpose so that swap is
 * mechanical.
 */
export async function issueSessionForUser(
  db: Pick<PrismaClient, 'refreshToken'>,
  user: { id: string; isOperator: boolean },
): Promise<OAuthSession> {
  const raw = generateToken();
  const expiresAt = new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
  await db.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(raw), expiresAt },
  });
  const accessToken = await new SignJWT({ isOperator: user.isOperator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
  return { accessToken, refreshToken: raw, refreshExpiresAt: expiresAt };
}
