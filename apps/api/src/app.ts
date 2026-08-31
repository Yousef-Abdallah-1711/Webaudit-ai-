/**
 * Express application factory.
 *
 * A factory rather than a module-level app, so tests inject their own database
 * and mailer. Nothing is read from a global at construction time.
 *
 * Middleware order below is load-bearing, top to bottom:
 *
 *   trust proxy   before anything that reads `req.ip` or sets a secure cookie
 *   helmet        before any handler can write a response
 *   cors          before the limiters, so a refused preflight still carries the
 *                 CORS headers the browser needs to report a useful error
 *   body parser   after the cheap rejections, so a 1 MB body is not buffered
 *                 for a request that was going to be refused anyway
 *   /health       before the limiters, so an uptime probe is never throttled
 *   limiters      before the routes they protect
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import type { PrismaClient } from '../prisma/generated/client/index.js';
import type { Mailer } from './services/services-types.js';
import { createConsoleMailer } from './services/email/mailer.js';
import { authRoutes } from './routes/auth.routes.js';
import { oauthRoutes } from './routes/oauth.routes.js';
import { targetsRoutes, type TargetRoutesDeps } from './routes/targets.routes.js';
import { scansRoutes, type ScanRoutesDeps } from './routes/scans.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { issuesRoutes, type IssueRoutesDeps } from './routes/issues.routes.js';
import { readinessRoutes, type ReadinessRoutesDeps } from './routes/readiness.routes.js';
import { env } from './config/env.js';
import { createRateLimiters, type RateLimiters } from './middleware/ratelimit.middleware.js';

export interface AppDeps {
  db: PrismaClient;
  mailer?: Mailer;
  /**
   * Rate limiters. Omit for the default (built from `REDIS_URL`, disabled under
   * `NODE_ENV=test` — see `shouldRateLimit`). Pass `null` to disable
   * explicitly, or a constructed set to exercise the limiter in a test.
   */
  rateLimiters?: RateLimiters | null;
  /**
   * Seams for the target routes — how a published verification token is read,
   * and how a submitted URL is canonicalised. Both default to the real thing
   * (safe-net and DNS); a suite injects fakes so it need not host a file.
   */
  targets?: TargetRoutesDeps;
  /**
   * Seams for the scan routes — how a published verification token is read
   * (defaults to the real safe-net probe, same as `targets`), how the first
   * phase job is enqueued (defaults to a real BullMQ producer), and which
   * control level a requested module needs. That last one is what
   * `scans.refusals.test.ts` (T106) substitutes: no first-vertical-slice
   * capability (T119–124) requires `VERIFIED` control, so there is no real
   * capability a test could select today to exercise FR-017's whole-scan
   * 403 without it.
   */
  scans?: ScanRoutesDeps;
  /**
   * Seam for the fix-loop routes — how a re-verification job is enqueued.
   * Defaults to a real BullMQ producer; a suite injects a capturing fake so it
   * can assert what was queued without a running worker.
   */
  issues?: IssueRoutesDeps;
  /**
   * Seam for the readiness routes — the phase-job producer, the certificate
   * storage (pass `null` to disable), and the web base URL for the email link.
   */
  readiness?: ReadinessRoutesDeps;
}

/**
 * Hops of reverse proxy in front of this process.
 *
 * Not optional decoration. `trust proxy` unset means:
 *   - `req.ip` is the load balancer's address, so every client shares one rate
 *     limit bucket and the limiter protects nobody;
 *   - `req.protocol` is always `http`, so `secure` cookie handling and any
 *     HTTPS-only decision downstream sees the wrong answer.
 *
 * `1` matches the deployment target (a single platform proxy in front of the
 * container). Never `true`: that trusts the whole `X-Forwarded-For` chain, which
 * lets any caller name its own IP and forge its way past the limiter.
 * `TRUST_PROXY_HOPS=0` for a process exposed directly to the internet.
 */
function trustProxyHops(): number {
  const raw = process.env['TRUST_PROXY_HOPS'];
  if (raw === undefined || raw.trim() === '') return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

/**
 * The CORS allowlist.
 *
 * `WEB_URL` is the frontend origin; `CORS_ORIGINS` is an optional
 * comma-separated list for preview deployments. Read from `process.env` here
 * rather than from `config/env.ts` because that module is the auth-secret
 * schema; when it grows a service-URL section this should import it instead.
 *
 * There is deliberately no wildcard branch. `Access-Control-Allow-Origin: *`
 * with `credentials: true` is rejected by every browser anyway, and the
 * workaround people reach for — reflecting whatever `Origin` arrives — is worse
 * than a wildcard: it makes every site on the internet a trusted origin for an
 * API that authenticates with cookies. An unlisted origin gets no CORS header.
 */
function corsAllowlist(): ReadonlySet<string> {
  const raw = [process.env['WEB_URL'], process.env['CORS_ORIGINS']]
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim().replace(/\/+$/, ''))
    .filter((v) => v !== '');

  if (raw.length === 0 && !env.isProduction) {
    // Local default, development only. In production an empty allowlist stays
    // empty: silently trusting localhost on a deployed API is a hole.
    return new Set(['http://localhost:3000']);
  }
  return new Set(raw);
}

function corsOptions(): CorsOptions {
  const allowed = corsAllowlist();
  if (allowed.size === 0) {
    console.warn('[cors] no allowlist — set WEB_URL. Browser clients will be refused.');
  }

  return {
    origin(origin, callback) {
      // No Origin header: curl, a server-to-server call, or a same-origin
      // navigation. CORS does not apply and there is nothing to allow.
      if (origin === undefined || origin === '') {
        callback(null, true);
        return;
      }
      // Refuse by omitting the header, not by throwing. A thrown error becomes
      // a 500 that says nothing useful and buries real faults in the logs; the
      // browser's own CORS message is clearer than anything we could send.
      callback(null, allowed.has(origin.replace(/\/+$/, '')));
    },
    // Auth uses an httpOnly refresh cookie, so the browser must be permitted to
    // send it. This is the reason the allowlist above must stay explicit.
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // Without this the browser hides the throttling headers from the client, so
    // the frontend cannot tell a user how long to wait.
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}

/**
 * `helmet` defaults, plus four deliberate overrides. This process serves JSON
 * and nothing else — no HTML, no scripts, no images — so the policy can be far
 * tighter than a web app's.
 */
function securityHeaders(): ReturnType<typeof helmet> {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        // Nothing is legitimately loadable from an API response. If a browser
        // ever renders one of these bodies, this is what stops it executing.
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
    // The only consumers of this API are on a different origin, which is what
    // the allowlist above encodes. helmet's `same-origin` default would be a
    // claim we do not mean.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // One year, subdomains included. No `preload`: that is a submission to a
    // browser-vendor list and a commitment about domains this service does not
    // own, so it is a deployment decision rather than a code one.
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
    // An API path can carry a token or an email in it. Send no referrer at all.
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });
}

/**
 * Whether to install limiters by default.
 *
 * Off under `NODE_ENV=test`. The reason is not convenience: limiter state is
 * per-process and per-IP, and `resetDb()` does not clear it, so a limiter left
 * on makes every suite that shares an app instance order-dependent — the
 * fourteenth registration in a file fails because of the first thirteen, and
 * which test breaks depends on file order. The limiter's own behaviour must be
 * proved by a dedicated suite that owns its store and its clock, and a test may
 * always pass `rateLimiters` explicitly to get one.
 */
function shouldRateLimit(): boolean {
  return env.nodeEnv !== 'test';
}

/** Credential endpoints, relative to the `/auth` mount. */
const CREDENTIAL_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  // Sends mail on an unauthenticated request, exactly like /forgot-password.
  '/verify/resend',
  // Unauthenticated, mints state and writes a cookie, and the callback performs
  // a token exchange against a third party. Both belong behind the strict
  // limiter rather than the general one.
  '/oauth/:provider/start',
  '/oauth/:provider/callback',
] as const;

export function createApp(deps: AppDeps): Express {
  const app = express();
  const mailer = deps.mailer ?? createConsoleMailer();

  const limiters =
    deps.rateLimiters === undefined
      ? shouldRateLimit()
        ? createRateLimiters()
        : null
      : deps.rateLimiters;

  app.set('trust proxy', trustProxyHops());
  app.disable('x-powered-by');

  app.use(securityHeaders());
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Deliberately ahead of the limiters: a platform health check that can be
  // rate-limited will eventually take a healthy service out of rotation.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  if (limiters) {
    app.use(limiters.general);
    for (const path of CREDENTIAL_PATHS) {
      app.use(`/auth${path}`, limiters.strict);
    }
    // Whoever owns the process lifecycle should await this on shutdown to
    // release the Redis connection and the fallback stores' timers.
    app.locals['rateLimiters'] = limiters;
  }

  app.use('/auth', authRoutes(deps.db, mailer));

  // Mounted at `/auth`, not `/auth/oauth`: oauth.routes.ts declares its own
  // paths as `/oauth/:provider/start` and `/github/connect`, so the extra
  // segment would produce `/auth/oauth/oauth/...`. Its start and callback paths
  // are in CREDENTIAL_PATHS above, so the strict limiter covers them.
  app.use('/auth', oauthRoutes(deps.db));

  // Every route here is behind requireAuth, declared inside the router rather
  // than here, so mounting it cannot accidentally expose one.
  app.use('/targets', targetsRoutes(deps.db, deps.targets ?? {}));

  // Every route here is behind requireAuth too, declared inside the router.
  app.use('/scans', scansRoutes(deps.db, deps.scans ?? {}));

  // Mounted at root: reportsRoutes declares its own full paths
  // (`/scans/:id/report`, `/scans/:id/issues`, `/issues/:id`) rather than
  // sharing one prefix, the same way oauthRoutes sits alongside authRoutes.
  app.use(reportsRoutes(deps.db));

  // Also mounted at root: issuesRoutes declares its own full paths
  // (`/issues/:id/assert-fixed`, `/issues/:id/attempts`), the same as
  // reportsRoutes beside it.
  app.use(issuesRoutes(deps.db, deps.issues ?? {}));

  // Root-mounted for the same reason — `/scans/:id/readiness[...]`. The mailer
  // is threaded through so the congratulations email uses the same transport.
  app.use(readinessRoutes(deps.db, { mailer, ...(deps.readiness ?? {}) }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
  });

  // A stack trace in a response body is exactly the kind of finding this
  // product reports on its customers. Never leak internals.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });

  return app;
}
