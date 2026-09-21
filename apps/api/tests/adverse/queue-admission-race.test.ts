import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createRedisAdmissionGate } from '../../src/services/queue/admission-gate.js';

/**
 * T040-closure regression — reproduces, then proves fixed, the queue-capacity
 * admission TOCTOU race found during full-system load testing
 * (`load-testing/REPORT-2026-09-20-capacity.md`): 10 concurrent scan-creation
 * requests against a real queue depth of 0 and a capacity of 3 all observed
 * the same pre-reservation count and all succeeded — `queue-backpressure.
 * test.ts`'s existing coverage is sequential-only, which is why this was
 * never caught. Every scenario here runs against a real Redis-backed
 * `AdmissionGate` (never a mock of the gate itself — only the BullMQ
 * producer's `getWaitingCount` is simulated, since the point is proving
 * *this* primitive's atomicity), each with its own random queue name so
 * concurrent test files never share admission state.
 */

const password = 'correct-horse-battery-staple';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(async () => {
  delete process.env['SCAN_QUEUE_MAX_WAITING'];
  await closeDb();
});

async function userToken(email: string): Promise<{ token: string; userId: string }> {
  const app = createApp({ db: testDb });
  await request(app).post('/auth/register').send({ email, password }).expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
  return { userId: user.id, token: (login.body as { accessToken: string }).accessToken };
}

/** A producer whose real BullMQ depth never moves — isolates the admission
 * gate itself from anything the mocked `enqueueFirstPhase` does. */
function fakeProducer(realDepth: number) {
  let enqueued = 0;
  return {
    producer: {
      getWaitingCount: async () => realDepth,
      enqueueFirstPhase: async () => {
        enqueued += 1;
        return { jobId: `job-${String(enqueued)}` };
      },
      enqueuePhaseTwo: async () => ({ jobId: 'never' }),
      close: async () => undefined,
    },
    enqueuedCount: () => enqueued,
  };
}

async function createNTargetsAndAttempt(
  app: ReturnType<typeof createApp>,
  n: number,
  acceptedQuote = 20,
): Promise<{ status: number; body: { error?: { code?: string } } }[]> {
  const users = await Promise.all(
    Array.from({ length: n }, (_, i) => userToken(`admission-race-${randomUUID()}-${String(i)}@example.com`)),
  );
  const targets = await Promise.all(
    users.map(({ token }, i) =>
      request(app)
        .post('/targets')
        .set(auth(token))
        .send({ inputType: 'URL', value: `https://example.com/?vu=${String(i)}` })
        .expect(201),
    ),
  );
  const responses = await Promise.all(
    users.map(({ token }, i) =>
      request(app)
        .post('/scans')
        .set(auth(token))
        .send({
          targetId: (targets[i]!.body as { target: { id: string } }).target.id,
          modules: ['SECURITY'],
          acceptedQuote,
        }),
    ),
  );
  return responses.map((r) => ({ status: r.status, body: r.body as { error?: { code?: string } } }));
}

/**
 * The pre-fix defect (no `admissionGate` wired, plain `queueDepth >=
 * capacity` comparison) is a genuine TOCTOU race, but its manifestation is
 * scheduler-dependent — reliably reproducible over real concurrent HTTP
 * connections (see `load-testing/REPORT-2026-09-20-capacity.md`'s live
 * reproduction: 10/10 admitted against a capacity of 3), but not
 * deterministically via an in-process `supertest` harness, whose own
 * request scheduling does not always create the same interleaving. A test
 * that asserts the overshoot would therefore be flaky in CI — exactly the
 * kind of test this project's own testing discipline rejects. The
 * authoritative "before" evidence is the live reproduction already on
 * record; the tests below are the deterministic regression guard for the
 * fix itself.
 */
describe('queue admission — concurrent reservation is atomic', () => {
  it('never admits more than the configured capacity under real concurrency', async () => {
    process.env['SCAN_QUEUE_MAX_WAITING'] = '3';
    const { producer, enqueuedCount } = fakeProducer(0);
    const admissionGate = createRedisAdmissionGate(`test-admission-${randomUUID()}`);
    const app = createApp({ db: testDb, scans: { producer, admissionGate } });

    const results = await createNTargetsAndAttempt(app, 10);
    const succeeded = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 503);

    expect(succeeded).toBe(3);
    expect(refused).toHaveLength(7);
    for (const r of refused) expect(r.body.error?.code).toBe('QUEUE_AT_CAPACITY');
    expect(enqueuedCount()).toBe(3);
  });

  it('preserves the credit guarantee: refused admission costs zero credits and writes no scan', async () => {
    process.env['SCAN_QUEUE_MAX_WAITING'] = '3';
    const { producer } = fakeProducer(0);
    const admissionGate = createRedisAdmissionGate(`test-admission-${randomUUID()}`);
    const app = createApp({ db: testDb, scans: { producer, admissionGate } });

    const results = await createNTargetsAndAttempt(app, 10);
    const succeeded = results.filter((r) => r.status === 201).length;

    expect(await testDb.scan.count()).toBe(succeeded);
    expect(
      await testDb.creditTransaction.count({ where: { type: 'DEBIT', reason: 'scan:create' } }),
    ).toBe(succeeded);
    // No account went negative and no account was charged without a matching scan.
    const lots = await testDb.creditLot.findMany({ select: { amountRemaining: true } });
    expect(lots.every((l) => l.amountRemaining >= 0)).toBe(true);
  });

  it('releases the reservation on success, so it does not double-count against real depth', async () => {
    process.env['SCAN_QUEUE_MAX_WAITING'] = '3';
    const { producer } = fakeProducer(0);
    const queueName = `test-admission-${randomUUID()}`;
    const admissionGate = createRedisAdmissionGate(queueName);
    const app = createApp({ db: testDb, scans: { producer, admissionGate } });

    await createNTargetsAndAttempt(app, 3);

    // All 3 successful admissions should have released their reservation —
    // a fresh reserve() against the same (still-zero) real depth must see
    // capacity available again, not "still full from before".
    const after = await admissionGate.reserve(0, 3);
    expect(after.admitted).toBe(true);
    expect(after.effectiveDepth).toBe(1);
    if (after.reservationId !== null) await admissionGate.release(after.reservationId);
  });

  it('releases the reservation when a later step fails (insufficient credits, after admission)', async () => {
    process.env['SCAN_QUEUE_MAX_WAITING'] = '2';
    const { producer } = fakeProducer(0);
    const queueName = `test-admission-${randomUUID()}`;
    const admissionGate = createRedisAdmissionGate(queueName);
    const app = createApp({ db: testDb, scans: { producer, admissionGate } });

    const { token } = await userToken(`admission-fail-${randomUUID()}@example.com`);
    // Drain the free plan's real balance to zero so the post-admission
    // insufficient-credits refusal fires deterministically.
    await testDb.creditLot.updateMany({ data: { amountRemaining: 0 } });
    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(201);

    await request(app)
      .post('/scans')
      .set(auth(token))
      .send({
        targetId: (target.body as { target: { id: string } }).target.id,
        modules: ['SECURITY'],
        acceptedQuote: 20,
      })
      .expect(402);

    // The reservation taken before the insufficient-credits refusal must
    // have been released in the `finally` — capacity 2 stays fully free.
    const r1 = await admissionGate.reserve(0, 2);
    const r2 = await admissionGate.reserve(0, 2);
    expect(r1.admitted).toBe(true);
    expect(r2.admitted).toBe(true);
    if (r1.reservationId !== null) await admissionGate.release(r1.reservationId);
    if (r2.reservationId !== null) await admissionGate.release(r2.reservationId);
  });

  it('self-expires an abandoned reservation without any manual cleanup (crash simulation)', async () => {
    const queueName = `test-admission-${randomUUID()}`;
    const shortTtlGate = createRedisAdmissionGate(queueName, undefined, 150);

    const abandoned = await shortTtlGate.reserve(0, 1);
    expect(abandoned.admitted).toBe(true);

    // Capacity 1 is fully consumed by the abandoned reservation — nothing
    // else may be admitted while it is live. Deliberately never released,
    // simulating a process crash between reservation and enqueue.
    const whileLive = await shortTtlGate.reserve(0, 1);
    expect(whileLive.admitted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 250));

    // No release call was ever made — TTL expiry alone must free the slot.
    const afterExpiry = await shortTtlGate.reserve(0, 1);
    expect(afterExpiry.admitted).toBe(true);
    if (afterExpiry.reservationId !== null) await shortTtlGate.release(afterExpiry.reservationId);
  });

  it('boundary: capacity 3 admits exactly 3 whether 1, 3, 4, or 10 attempt at once', async () => {
    for (const n of [1, 3, 4, 10]) {
      const queueName = `test-admission-${randomUUID()}`;
      const gate = createRedisAdmissionGate(queueName);
      const attempts = await Promise.all(Array.from({ length: n }, () => gate.reserve(0, 3)));
      const admitted = attempts.filter((a) => a.admitted);
      expect(admitted).toHaveLength(Math.min(n, 3));
    }
  });

  it('accounts for pre-existing real queue depth, not just live reservations', async () => {
    // capacity 5, real depth already 3 (e.g. from jobs a worker has not yet
    // drained) — at most 2 of 10 concurrent attempts may reserve a slot.
    const queueName = `test-admission-${randomUUID()}`;
    const gate = createRedisAdmissionGate(queueName);
    const attempts = await Promise.all(Array.from({ length: 10 }, () => gate.reserve(3, 5)));
    const admitted = attempts.filter((a) => a.admitted);
    expect(admitted).toHaveLength(2);
  });
});
