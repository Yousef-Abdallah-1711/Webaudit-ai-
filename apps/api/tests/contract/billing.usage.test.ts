import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });
const CREDS = { email: 'usage@example.com', password: 'correct-horse-battery-staple' };

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('GET /billing/usage', () => {
  it('summarizes the signed-in user real ledger and scans', async () => {
    await request(app).post('/auth/register').send(CREDS).expect(201);
    const user = await testDb.user.update({
      where: { email: CREDS.email },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await request(app).post('/auth/login').send(CREDS).expect(200);
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://usage.example',
        displayName: 'Usage',
      },
    });
    await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        kind: 'INITIAL',
        state: 'COMPLETED',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 90,
        chargedCredits: 90,
      },
    });
    await testDb.creditTransaction.create({
      data: {
        userId: user.id,
        type: 'DEBIT',
        amount: 90,
        reason: 'scan:full_audit',
        scanId: (await testDb.scan.findFirstOrThrow({ where: { userId: user.id } })).id,
      },
    });

    const res = await request(app)
      .get('/billing/usage')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(res.body.spentCredits).toBe(90);
    expect(res.body.auditsRun).toBe(1);
    expect(res.body.byArea).toEqual(
      expect.arrayContaining([expect.objectContaining({ area: 'SECURITY', credits: 90 })]),
    );
  });
});
