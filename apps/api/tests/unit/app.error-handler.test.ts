/**
 * T023 — app.ts's global error handler tags a real Prisma connection failure
 * as `db_connectivity_failure` and everything else as `api_error_rate`.
 *
 * Reached through a real route rather than invoked directly: the handler is
 * declared inline as the last `app.use((err, req, res, _next) => ...)` in
 * app.ts and is not exported. `requireOperator` (auth.middleware.ts) is the
 * simplest real call site that does exactly one `db.user.findUnique` before
 * any handler runs, so a fake `db` whose `user.findUnique` throws drives the
 * error straight into this handler without touching any other route logic.
 * `requireAuth` itself needs no db (JWT-only, session.service.ts), so signing
 * in through a normal, real-db app first and reusing that token against the
 * fake-db app is enough to reach `requireOperator`.
 */
import * as Sentry from '@sentry/node';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { Prisma, type PrismaClient } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

// `import * as Sentry` is a real ES module namespace object, whose properties
// are non-configurable per spec — `vi.spyOn` throws "Cannot redefine
// property" against it. Mocking the whole module replaces it with a plain,
// writable object instead (see apps/api/tests/unit/monitoring.test.ts).
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return { ...actual, captureMessage: vi.fn(() => 'event-id') };
});

const CREDS = { email: 'error-handler@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<string> {
  const app = createApp({ db: testDb, mailer: createCapturingMailer() });
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

function auth(bearer: string) {
  return { Authorization: `Bearer ${bearer}` };
}

/** A `db` that only implements what `requireOperator` touches before throwing. */
function fakeDbThrowing(error: Error): PrismaClient {
  return { user: { findUnique: () => Promise.reject(error) } } as unknown as PrismaClient;
}

beforeEach(resetDb);
afterEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
});
afterAll(closeDb);

describe("T023 — app.ts's unhandled-error handler", () => {
  it('tags a Prisma connection failure as db_connectivity_failure, not api_error_rate', async () => {
    const token = await signIn();

    const error = new Prisma.PrismaClientKnownRequestError('Connection refused', {
      code: 'P1001',
      clientVersion: '5.0.0',
    });
    const app = createApp({ db: fakeDbThrowing(error), mailer: createCapturingMailer() });

    const res = await request(app).get('/admin/users').set(auth(token));

    expect(res.status).toBe(500);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Database connection failed',
      expect.objectContaining({ tags: { alert_condition: 'db_connectivity_failure' } }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalledWith(
      'An unhandled API route error occurred',
      expect.anything(),
    );
  });

  it('tags PrismaClientInitializationError as db_connectivity_failure too', async () => {
    const token = await signIn();

    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      '5.0.0',
    );
    const app = createApp({ db: fakeDbThrowing(error), mailer: createCapturingMailer() });

    await request(app).get('/admin/users').set(auth(token)).expect(500);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Database connection failed',
      expect.objectContaining({ tags: { alert_condition: 'db_connectivity_failure' } }),
    );
  });

  it('tags an ordinary unhandled error as api_error_rate, not db_connectivity_failure', async () => {
    const token = await signIn();

    const error = new TypeError('something else broke');
    const app = createApp({ db: fakeDbThrowing(error), mailer: createCapturingMailer() });

    const res = await request(app).get('/admin/users').set(auth(token));

    expect(res.status).toBe(500);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'An unhandled API route error occurred',
      expect.objectContaining({ tags: { alert_condition: 'api_error_rate' } }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalledWith(
      'Database connection failed',
      expect.anything(),
    );
  });

  it('a Prisma error code that is not connectivity-related still counts as api_error_rate', async () => {
    const token = await signIn();

    // P2025: "record not found" — a real Prisma error, but not a connectivity
    // failure, so it must not be misfiled as one.
    const error = new Prisma.PrismaClientKnownRequestError('An operation failed', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    const app = createApp({ db: fakeDbThrowing(error), mailer: createCapturingMailer() });

    await request(app).get('/admin/users').set(auth(token)).expect(500);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'An unhandled API route error occurred',
      expect.objectContaining({ tags: { alert_condition: 'api_error_rate' } }),
    );
  });
});
