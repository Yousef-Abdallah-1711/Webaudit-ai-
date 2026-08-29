/**
 * Task 5 (2026-08-27 credit-refund-integrity plan) — R1.3: cancellation
 * never goes through `apps/worker`'s `transition()` (Task 4's
 * `terminal-refund.ts` observer only fires on FAILED/COMPLETED there), so
 * `POST /scans/:id/cancel` has to refund the undelivered share itself, at
 * the source. This is the executable spec for that fix.
 *
 * Each scan here is created through the real `POST /scans` route (via the
 * `quote`/`createTarget`/`signIn` helpers copied from
 * `tests/contract/scans.refusals.test.ts`) so the debit and `Scan` row exist
 * exactly the way production creates them. "Some/no/all modules already
 * ran" is then simulated the same way `apps/worker/tests/integration/
 * terminal-refund.test.ts` does it: writing `ModuleResult` rows directly
 * before calling cancel.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import type { PrismaClient } from '../../prisma/generated/client/index.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const CREDS = { email: 'cancel-refund@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<string> {
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

async function createTarget(bearer: string): Promise<string> {
  const res = await request(app)
    .post('/targets')
    .set(auth(bearer))
    .send({ inputType: 'URL', value: 'https://example.com/' })
    .expect(201);
  return (res.body as { target: { id: string } }).target.id;
}

async function quote(
  bearer: string,
  targetId: string,
  modules: readonly string[],
): Promise<number> {
  const res = await request(app)
    .post('/scans/quote')
    .set(auth(bearer))
    .send({ targetId, modules })
    .expect(200);
  return (res.body as { quote: { credits: number } }).quote.credits;
}

/** Creates a real SECURITY+SEO scan (2 modules) through the real /scans route. Returns its id and the charged credits. */
async function createTwoModuleScan(
  bearer: string,
): Promise<{ scanId: string; chargedCredits: number }> {
  const targetId = await createTarget(bearer);
  const modules = ['SECURITY', 'SEO'];
  const cost = await quote(bearer, targetId, modules);
  const res = await request(app)
    .post('/scans')
    .set(auth(bearer))
    .send({ targetId, modules, acceptedQuote: cost })
    .expect(201);
  const scanId = (res.body as { scan: { id: string } }).scan.id;
  return { scanId, chargedCredits: cost };
}

/**
 * Wraps `testDb` so its very first `scan.findUniqueOrThrow` call rejects,
 * then delegates to the real implementation for every call after that —
 * simulating exactly the transient-DB-error class of failure the widened
 * try/catch in the cancel route exists to survive. Every other model/method
 * passes straight through untouched.
 */
function withFlakyFirstScanLookup(): { db: PrismaClient; callCount: () => number } {
  let calls = 0;
  const db = new Proxy(testDb, {
    get(target, prop, receiver) {
      if (prop !== 'scan') return Reflect.get(target, prop, receiver) as unknown;
      const realScan = Reflect.get(target, prop, receiver);
      return new Proxy(realScan, {
        get(scanTarget, scanProp, scanReceiver) {
          if (scanProp !== 'findUniqueOrThrow') {
            return Reflect.get(scanTarget, scanProp, scanReceiver) as unknown;
          }
          return (...args: Parameters<typeof testDb.scan.findUniqueOrThrow>) => {
            calls += 1;
            if (calls === 1) {
              return Promise.reject(new Error('simulated transient db failure'));
            }
            // `Reflect.get` returns the real, generically-overloaded
            // `findUniqueOrThrow` here — its inferred type does not
            // sufficiently overlap with this narrower, concrete signature
            // for TypeScript's structural checker to accept a direct `as`.
            // Routing through `unknown` is TS's own documented escape hatch
            // for exactly this case: we know the runtime shape (it's the
            // same bound method every other call to `db.scan
            // .findUniqueOrThrow` in this file already uses), just not one
            // TS can verify from a `Reflect.get` return type alone.
            const real = Reflect.get(scanTarget, scanProp, scanReceiver) as unknown as (
              ...a: Parameters<typeof testDb.scan.findUniqueOrThrow>
            ) => ReturnType<typeof testDb.scan.findUniqueOrThrow>;
            return real.apply(scanTarget, args);
          };
        },
      });
    },
  }) as PrismaClient;
  return { db, callCount: () => calls };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('POST /scans/:id/cancel refunds the undelivered share', () => {
  it('refunds credits for modules that had not yet run when cancelled', async () => {
    const token = await signIn();
    const { scanId, chargedCredits } = await createTwoModuleScan(token);

    // One of the two modules already completed; the other never ran.
    await testDb.moduleResult.create({
      data: { scanId, module: 'SEO', state: 'COMPLETE', score: 90 },
    });

    const res = await request(app).post(`/scans/${scanId}/cancel`).set(auth(token)).expect(200);
    expect((res.body as { scan: { state: string } }).scan.state).toBe('CANCELLED');

    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId, type: 'REFUND' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(Math.floor(chargedCredits / 2));
  });

  it('refunds the whole charge when cancelled before anything ran', async () => {
    const token = await signIn();
    const { scanId, chargedCredits } = await createTwoModuleScan(token);

    // No ModuleResult rows at all — nothing has run yet.
    const res = await request(app).post(`/scans/${scanId}/cancel`).set(auth(token)).expect(200);
    expect((res.body as { scan: { state: string } }).scan.state).toBe('CANCELLED');

    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId, type: 'REFUND' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(chargedCredits);
  });

  it('does not fail cancellation if there is nothing to refund (everything already delivered)', async () => {
    const token = await signIn();
    const { scanId } = await createTwoModuleScan(token);

    // Both modules already completed before the cancel request arrives.
    await testDb.moduleResult.create({
      data: { scanId, module: 'SECURITY', state: 'COMPLETE', score: 80 },
    });
    await testDb.moduleResult.create({
      data: { scanId, module: 'SEO', state: 'COMPLETE', score: 90 },
    });

    const res = await request(app).post(`/scans/${scanId}/cancel`).set(auth(token)).expect(200);
    expect((res.body as { scan: { state: string } }).scan.state).toBe('CANCELLED');

    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId, type: 'REFUND' },
    });
    expect(refunds).toHaveLength(0);
  });

  it('still returns 200 with the cancelled scan when the post-cancel scan lookup throws (widened try/catch)', async () => {
    const token = await signIn();
    const { scanId } = await createTwoModuleScan(token);

    // The guarded CANCELLED write happens on the real `app`/`testDb` first —
    // it must already have committed by the time the flaky lookup below
    // fires, exactly like the transient failure this test is standing in
    // for. The cancel request itself goes through a second app instance
    // wired to a `db` whose very first `scan.findUniqueOrThrow` call
    // (the re-fetch the refund logic depends on) rejects. Before the fix
    // this narrower try/catch wrapped only `refundPartial`, so this
    // rejection propagated unhandled and Express would have returned 500
    // to a caller whose cancellation had, in fact, already succeeded.
    const { db: flakyDb, callCount } = withFlakyFirstScanLookup();
    const flakyApp = createApp({ db: flakyDb, mailer });

    const res = await request(flakyApp)
      .post(`/scans/${scanId}/cancel`)
      .set(auth(token))
      .expect(200);
    expect((res.body as { scan: { state: string } }).scan.state).toBe('CANCELLED');
    // Two calls: the failed attempt inside the try, then the catch block's
    // fallback fetch that recovers a scan for the response.
    expect(callCount()).toBe(2);

    // The scan is still genuinely CANCELLED in the database, not just in
    // the response body.
    const persisted = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(persisted.state).toBe('CANCELLED');

    // The refund itself never ran (the failure happened before the refund
    // computation), so no REFUND transaction exists yet — this is the
    // known, accepted cost of "never fail cancellation over a refund
    // problem": the credits stay unrefunded rather than the response
    // becoming a 500 for a cancellation that already succeeded.
    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId, type: 'REFUND' },
    });
    expect(refunds).toHaveLength(0);
  });
});
