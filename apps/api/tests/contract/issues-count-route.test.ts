import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });
const creds = { email: 'issues-count@example.com', password: 'correct-horse-battery-staple' };

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});

afterAll(closeDb);

describe('GET /issues/count', () => {
  it('returns the authenticated user’s outstanding issue count', async () => {
    await request(app).post('/auth/register').send(creds).expect(201);
    const user = await testDb.user.update({
      where: { email: creds.email },
      data: { emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://issues-count.example.com',
        displayName: 'issues-count',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        kind: 'INITIAL',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'COMPLETED',
        overallScore: 70,
      },
    });
    const moduleResult = await testDb.moduleResult.create({
      data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 70 },
    });
    await testDb.issue.create({
      data: {
        scanId: scan.id,
        moduleResultId: moduleResult.id,
        fingerprint: 'issues-count-fingerprint',
        checkId: 'security.example',
        severity: 'HIGH',
        title: 'Outstanding issue',
        explanation: 'explanation',
        consequence: 'consequence',
        attribution: 'MEASURED',
        fixPrompt: 'fix prompt',
        state: 'OPEN',
      },
    });

    const login = await request(app).post('/auth/login').send(creds).expect(200);
    const token = (login.body as { accessToken: string }).accessToken;
    const response = await request(app)
      .get('/issues/count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ count: 1 });
  });
});
