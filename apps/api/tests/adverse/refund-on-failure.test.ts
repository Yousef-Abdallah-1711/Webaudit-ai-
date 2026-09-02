/**
 * T180 — SC-008: "Zero users are charged for an operation the platform failed
 * to deliver."
 *
 * Two halves, and the second is the one this suite adds over the existing
 * worker-side refund tests:
 *
 *   1. A scan that fails through a platform fault restores the credits for
 *      every area it did not deliver — the whole charge when nothing ran,
 *      the undelivered share when some areas completed first.
 *   2. **The restoration is visible** (FR-076). `GET /billing/credits` shows a
 *      `REFUND` movement stating the amount, the reason, and when — a bare
 *      balance that happens to be correct is not the same as a receipt.
 *
 * The failure itself is simulated the way `apps/worker/src/orchestrator/
 * terminal-refund.ts` performs it (that observer's own wiring is tested in
 * `apps/worker/tests/integration/terminal-refund.test.ts`); this drives the
 * refund + the visibility endpoint at the API boundary.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { refundForUndelivered } from '@webaudit/config';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { refundPartial } from '../../src/services/credits/refund.js';
import { totalAvailable } from '../../src/services/credits/balance.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const CREDS = { email: 'sc008@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({ where: { email: CREDS.email }, data: { emailVerifiedAt: new Date() } });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function createScan(token: string, modules: string[]): Promise<{ scanId: string; charged: number }> {
  const target = await request(app)
    .post('/targets')
    .set(auth(token))
    .send({ inputType: 'URL', value: 'https://example.com/' })
    .expect(201);
  const targetId = (target.body as { target: { id: string } }).target.id;
  const quote = await request(app).post('/scans/quote').set(auth(token)).send({ targetId, modules }).expect(200);
  const cost = (quote.body as { quote: { credits: number } }).quote.credits;
  const created = await request(app)
    .post('/scans')
    .set(auth(token))
    .send({ targetId, modules, acceptedQuote: cost })
    .expect(201);
  return { scanId: (created.body as { scan: { id: string } }).scan.id, charged: cost };
}

/** What terminal-refund.ts does on a FAILED transition. */
async function simulatePlatformFailure(scanId: string, deliveredModules: string[]): Promise<number> {
  const scan = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
  for (const module of deliveredModules) {
    await testDb.moduleResult.create({
      data: { scanId, module: module as never, state: 'COMPLETE', score: 70 },
    });
  }
  await testDb.scan.update({ where: { id: scanId }, data: { state: 'FAILED', failureReason: 'provider chain crashed' } });

  const credits = refundForUndelivered({
    chargedCredits: scan.chargedCredits,
    requestedCount: scan.requestedModules.length,
    deliveredCount: deliveredModules.length,
  });
  if (credits <= 0) return 0;
  const debitTx = await testDb.creditTransaction.findFirstOrThrow({
    where: { scanId, type: 'DEBIT' },
  });
  const r = await refundPartial(testDb, {
    debitTransactionId: debitTx.id,
    credits,
    reason: `platform-failure:${scanId}`,
  });
  return r.amount;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('SC-008 — a platform failure is not billed, and the refund is visible', () => {
  it('a scan that fails before any area ran is refunded in full', async () => {
    const token = await signIn();
    const before = await totalAvailable(testDb, (await testDb.user.findFirstOrThrow()).id);
    const { scanId, charged } = await createScan(token, ['SECURITY', 'SEO']);

    const refunded = await simulatePlatformFailure(scanId, []);
    expect(refunded).toBe(charged);

    const after = await totalAvailable(testDb, (await testDb.user.findFirstOrThrow()).id);
    expect(after).toBe(before); // made whole
  });

  it('a scan that delivered one of two areas is refunded the undelivered half', async () => {
    const token = await signIn();
    const { scanId, charged } = await createScan(token, ['SECURITY', 'SEO']);

    const refunded = await simulatePlatformFailure(scanId, ['SEO']);
    expect(refunded).toBe(Math.floor(charged / 2));
  });

  it('the refund shows in GET /billing/credits with amount, reason, and time (FR-076)', async () => {
    const token = await signIn();
    const { scanId } = await createScan(token, ['SECURITY', 'SEO']);
    const refunded = await simulatePlatformFailure(scanId, []);

    const res = await request(app).get('/billing/credits').set(auth(token)).expect(200);
    const movements = (res.body as {
      movements: { type: string; amount: number; reason: string; scanId: string | null; createdAt: string }[];
    }).movements;

    const refundLine = movements.find((m) => m.type === 'REFUND');
    expect(refundLine).toBeDefined();
    expect(refundLine?.amount).toBe(refunded);
    expect(refundLine?.reason).toContain('platform-failure');
    expect(refundLine?.scanId).toBe(scanId);
    expect(new Date(refundLine!.createdAt).getTime()).toBeGreaterThan(0);

    // And the matching DEBIT is right above it in the same history.
    expect(movements.some((m) => m.type === 'DEBIT' && m.scanId === scanId)).toBe(true);
  });
});
