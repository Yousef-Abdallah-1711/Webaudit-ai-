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
import { createResendMailerFromEnv } from './services/email/resend-mailer.js';
import { createSmtpMailerFromEnv, createSmtpMailer } from './services/email/smtp-mailer.js';
import { authRoutes } from './routes/auth.routes.js';
import { oauthRoutes } from './routes/oauth.routes.js';
import { targetsRoutes, type TargetRoutesDeps } from './routes/targets.routes.js';
import { scansRoutes, type ScanRoutesDeps } from './routes/scans.routes.js';
import { intakeRoutes, type IntakeRoutesDeps } from './routes/intake.routes.js';
import { billingRoutes, type BillingRoutesDeps } from './routes/billing.routes.js';
import { receiptsRoutes } from './routes/receipts.routes.js';
import { webhooksRoutes, type WebhookRoutesDeps } from './routes/webhooks.routes.js';
import { paymentReturnRoutes } from './routes/payment-return.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { issuesRoutes, type IssueRoutesDeps } from './routes/issues.routes.js';
import { readinessRoutes, type ReadinessRoutesDeps } from './routes/readiness.routes.js';
import { adminRoutes, type AdminRoutesDeps } from './routes/admin/index.js';
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
  /**
   * Seams for source intake — how GitHub is reached and where a staged archive
   * is written. Both default to the real thing; a suite injects fakes so it
   * needs neither a GitHub token nor an R2 bucket.
   */
  intake?: IntakeRoutesDeps;
  /**
   * Seam for the billing webhook — the HMAC signing secret and the header it
   * arrives in. Defaults to `BILLING_WEBHOOK_SECRET` / `x-webhook-signature`;
   * a suite injects a known secret so it can sign a test payload.
   */
  webhooks?: WebhookRoutesDeps;
  /**
   * Seam for the admin surface (T211) — currently only the queue router has
   * one of its own (its `QueueAdminService`, which opens real BullMQ/Redis
   * connections). Defaults to a real one.
   */
  admin?: AdminRoutesDeps;
  /**
   * Seam for the billing routes — currently only `isProduction`, which gates
   * `/billing/subscribe` and `/billing/credits/purchase` to non-production
   * (PLAN.md, Finding CRIT-1). Defaults to the real `env.isProduction`; a
   * suite overrides it directly since `env` cannot be changed by mutating
   * `process.env` after module load.
   */
  billing?: BillingRoutesDeps;
}

function createDefaultMailer(db: PrismaClient): Mailer {
  if (process.env['EMAIL_TRANSPORT']?.toUpperCase() === 'SMTP') {
    // Rebuild with the audit callback so every SMTP attempt is queryable.
    createSmtpMailerFromEnv();
    return createSmtpMailer({
      host: process.env['SMTP_HOST'] ?? 'smtp.hostinger.com',
      port: Number(process.env['SMTP_PORT'] ?? '465'),
      user: process.env['SMTP_USER'] ?? '',
      password: process.env['SMTP_PASSWORD'] ?? '',
      from: process.env['EMAIL_FROM'] ?? '',
      recordAttempt: async (attempt) => {
        await db.$executeRaw`
          INSERT INTO "EmailSendAttempt" ("id", "recipient", "messageType", "succeeded", "providerError")
          VALUES (gen_random_uuid()::text, ${attempt.recipient}, ${attempt.messageType}, ${attempt.succeeded}, ${attempt.providerError ?? null})
        `;
      },
    });
  }
  if (env.isProduction) return createResendMailerFromEnv();
  return createConsoleMailer();
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
 * The error shapes `express.json()` (via `body-parser`/`raw-body`) throws for
 * a request it refuses to read: unreadable JSON, a body over the configured
 * limit, an unsupported charset, a client that aborted mid-upload, or a
 * length mismatch. Every one of these is built with `http-errors`, which sets
 * BOTH `status` and `statusCode` to the same value, and a `type` unique to
 * body-parser's own errors — checked here so this handler cannot mistake an
 * unrelated error that happens to carry a `status` (a route handler's own
 * thrown `HttpError`, say) for one of these.
 */
const BODY_PARSER_ERROR_TYPES = new Set([
  'entity.parse.failed',
  'entity.too.large',
  'entity.verify.failed',
  'charset.unsupported',
  'encoding.unsupported',
  'request.aborted',
  'request.size.invalid',
]);

interface BodyParserError {
  readonly type: string;
  readonly status?: number;
  readonly statusCode?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof err.type === 'string' &&
    BODY_PARSER_ERROR_TYPES.has(err.type)
  );
}

function bodyParserErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isBodyParserError(err)) {
    next(err);
    return;
  }
  const status = err.statusCode ?? err.status ?? 400;
  res.status(status).json({
    error: { code: 'BAD_REQUEST', message: 'The request body could not be read.' },
  });
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
export function corsAllowlist(): ReadonlySet<string> {
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
  const mailer = deps.mailer ?? createDefaultMailer(deps.db);

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

  // Ahead of `express.json()`: the billing webhook verifies an HMAC over the
  // *raw* request body, and the provider sends `application/json` — so the JSON
  // parser would consume the stream before the signature could be checked. The
  // router installs its own `express.raw` on that one path (T187).
  app.use(webhooksRoutes(deps.db, deps.webhooks ?? {}));

  app.use(express.json({ limit: '1mb' }));
  // `express.json()` reports a malformed body or one over the 1mb limit by
  // calling `next(err)` synchronously — Express then skips every ordinary
  // middleware and routes straight to the first 4-argument handler, which
  // without this would be the catch-all below. That handler exists for
  // genuine server faults: it answers 500 and logs the error as `unhandled`.
  // A client that sent broken JSON is not a server fault, and treating every
  // one exactly like a real crash — same status, same alerting signal, same
  // log line — buries the incidents that log actually exists to catch under
  // routine, expected client noise (a fuzzer, a stale client, a truncated
  // upload). This handler answers with the status body-parser already
  // computed (400 for unreadable JSON, 413 for over-limit) before the
  // request ever reaches that catch-all.
  app.use(bodyParserErrorHandler);
  app.use(cookieParser());

  app.use(
    paymentReturnRoutes(
      deps.db,
      deps.webhooks?.paymentProvider === undefined
        ? {}
        : { paymentProvider: deps.webhooks.paymentProvider },
    ),
  );

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

  // Root-mounted and deliberately *ahead* of scansRoutes: it declares
  // `/repos` and `/scans/upload`, and the upload handler must reach the raw
  // request body. Order matters only for the second — a router mounted at
  // `/scans` that has no `/upload` route still falls through, but keeping the
  // multipart handler first makes it impossible for a later `/scans` route to
  // shadow it by accident.
  app.use(intakeRoutes(deps.db, deps.intake ?? {}));

  // Every route here is behind requireAuth too, declared inside the router.
  app.use('/scans', scansRoutes(deps.db, deps.scans ?? {}));

  // Also mounted at root: issuesRoutes declares its own full paths
  // (`/issues/count`, `/issues/:id/assert-fixed`, `/issues/:id/attempts`).
  // It must precede reportsRoutes because reportsRoutes owns the parameterized
  // `/issues/:id` route; otherwise `/issues/count` is consumed as an issue ID
  // and the real sidebar badge endpoint returns 404.
  app.use(issuesRoutes(deps.db, deps.issues ?? {}));

  // Mounted at root: reportsRoutes declares its own full paths
  // (`/scans/:id/report`, `/scans/:id/issues`, `/issues/:id`) rather than
  // sharing one prefix, the same way oauthRoutes sits alongside authRoutes.
  app.use(reportsRoutes(deps.db));

  // Root-mounted for the same reason — `/scans/:id/readiness[...]`. The mailer
  // is threaded through so the congratulations email uses the same transport.
  app.use(readinessRoutes(deps.db, { mailer, ...(deps.readiness ?? {}) }));

  // `/billing/*` — plans, the movement-history receipt, subscribe/change/cancel,
  // and credit purchase. All behind requireAuth, declared inside the router.
  app.use(billingRoutes(deps.db, deps.billing ?? {}));
  app.use(receiptsRoutes(deps.db));

  // `/admin/*` — users, plans, margin, capabilities, providers, queue.
  // requireAuth then requireOperator, both declared inside adminRoutes so no
  // route added under `routes/admin/` in the future can be reached by a
  // non-operator "however constructed" (FR-008, T202).
  app.use('/admin', adminRoutes(deps.db, deps.admin ?? {}));

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
