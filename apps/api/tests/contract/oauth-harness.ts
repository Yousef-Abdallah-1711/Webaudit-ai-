/**
 * Shared fixtures for the OAuth contract suites.
 *
 * Not a `*.test.ts` file, so vitest does not collect it (`vitest.workspace.ts`
 * includes `**\/*.test.ts` only).
 *
 * Two things live here:
 *
 *  1. A provider HTTP stub. Every provider call in these suites is answered
 *     from memory — no suite in this repo reaches the network, and a call the
 *     test did not anticipate throws rather than silently succeeding.
 *  2. A minimal app that mounts `oauthRoutes` next to `authRoutes`. The suites
 *     build their own app rather than using `createApp`, because
 *     `src/app.ts` does not mount the OAuth router yet — that edit belongs to
 *     whoever owns that file. Once it is mounted these can switch to
 *     `createApp` with no change to the assertions.
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { authRoutes } from '../../src/routes/auth.routes.js';
import { oauthRoutes } from '../../src/routes/oauth.routes.js';
import type {
  HttpClient,
  HttpRequest,
  HttpResponseLike,
} from '../../src/services/auth/oauth-flow.service.js';
import { testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

/** Values a real provider would never issue, so a leak is unmistakable. */
export const GOOGLE_ACCESS_TOKEN = 'ya29.stub-google-access-token-do-not-leak';
export const GITHUB_ACCESS_TOKEN = 'gho_stub-github-access-token-do-not-leak';

export interface StubbedResponse {
  status?: number;
  body: unknown;
}

export interface ProviderResponses {
  token?: StubbedResponse;
  googleUserinfo?: StubbedResponse;
  githubUser?: StubbedResponse;
  githubEmails?: StubbedResponse;
}

export interface ProviderStub {
  http: HttpClient;
  /** Every provider call, in order. Empty means the provider was never touched. */
  calls: { method: string; url: string }[];
  /** The form bodies posted to the token endpoint, parsed. */
  tokenRequests: URLSearchParams[];
}

function pick(responses: ProviderResponses, url: string): StubbedResponse | undefined {
  if (url.includes('/login/oauth/access_token') || url.includes('oauth2.googleapis.com/token')) {
    return responses.token;
  }
  if (url.includes('openidconnect.googleapis.com/v1/userinfo')) return responses.googleUserinfo;
  // Longest path first: /user/emails would otherwise match /user.
  if (url.includes('api.github.com/user/emails')) return responses.githubEmails;
  if (url.includes('api.github.com/user')) return responses.githubUser;
  return undefined;
}

export function createProviderStub(responses: ProviderResponses): ProviderStub {
  const calls: { method: string; url: string }[] = [];
  const tokenRequests: URLSearchParams[] = [];

  const http: HttpClient = (url: string, request: HttpRequest): Promise<HttpResponseLike> => {
    calls.push({ method: request.method, url });
    if (request.method === 'POST' && request.body !== undefined) {
      tokenRequests.push(new URLSearchParams(request.body));
    }
    const hit = pick(responses, url);
    if (!hit) {
      // A real network call would have happened here. Fail loudly.
      return Promise.reject(new Error(`unstubbed provider call: ${request.method} ${url}`));
    }
    const status = hit.status ?? 200;
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(hit.body),
    });
  };

  return { http, calls, tokenRequests };
}

export function googleStub(profile: {
  sub?: string;
  email: string;
  emailVerified: boolean;
}): ProviderStub {
  return createProviderStub({
    token: { body: { access_token: GOOGLE_ACCESS_TOKEN, token_type: 'Bearer' } },
    googleUserinfo: {
      body: {
        sub: profile.sub ?? 'google-sub-1',
        email: profile.email,
        email_verified: profile.emailVerified,
      },
    },
  });
}

export function githubStub(profile: {
  id?: number;
  login?: string;
  email: string;
  verified: boolean;
}): ProviderStub {
  return createProviderStub({
    token: { body: { access_token: GITHUB_ACCESS_TOKEN, token_type: 'bearer', scope: 'repo' } },
    githubUser: { body: { id: profile.id ?? 424242, login: profile.login ?? 'octocat' } },
    githubEmails: {
      body: [{ email: profile.email, primary: true, verified: profile.verified }],
    },
  });
}

/** Mirrors `src/app.ts`: same body parser, same cookie parser, same error shape. */
export function createOAuthTestApp(http: HttpClient): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/auth', authRoutes(testDb, createCapturingMailer()));
  app.use('/auth', oauthRoutes(testDb, http));
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });
  return app;
}

/** Provider credentials the flow requires. Values are fake and never asserted on. */
export function configureProviderEnv(): void {
  process.env['GOOGLE_OAUTH_CLIENT_ID'] = 'google-test-client-id';
  process.env['GOOGLE_OAUTH_CLIENT_SECRET'] = 'google-test-client-secret';
  process.env['GITHUB_OAUTH_CLIENT_ID'] = 'github-test-client-id';
  process.env['GITHUB_OAUTH_CLIENT_SECRET'] = 'github-test-client-secret';
  process.env['API_URL'] = 'https://api.webaudit.test';
  process.env['WEB_URL'] = 'https://app.webaudit.test';
}

export function cookiesOf(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  if (Array.isArray(raw)) return raw as string[];
  return typeof raw === 'string' ? [raw] : [];
}

export function cookieValue(setCookies: string[], name: string): string | undefined {
  const hit = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  const value = hit.slice(name.length + 1).split(';')[0];
  return value === undefined || value === '' ? undefined : decodeURIComponent(value);
}
