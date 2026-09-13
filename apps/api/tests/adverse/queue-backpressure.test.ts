import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

const password = 'correct-horse-battery-staple';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  process.env['SCAN_QUEUE_MAX_WAITING'] = '1';
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

describe('queue backpressure and position', () => {
  it('refuses at capacity before debit or enqueue', async () => {
    let enqueued = false;
    const producer = {
      getWaitingCount: async () => 1,
      enqueueFirstPhase: async () => {
        enqueued = true;
        return { jobId: 'never' };
      },
      enqueuePhaseTwo: async () => ({ jobId: 'never' }),
      close: async () => undefined,
    };
    const app = createApp({ db: testDb, scans: { producer } });
    const { token, userId } = await userToken('queue-capacity@example.com');
    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(201);
    const targetId = (target.body as { target: { id: string } }).target.id;
    await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'], acceptedQuote: 10 })
      .expect(503)
      .expect((res) => {
        expect(res.body.error.code).toBe('QUEUE_AT_CAPACITY');
      });
    expect(enqueued).toBe(false);
    expect(await testDb.scan.count({ where: { userId } })).toBe(0);
    expect(await testDb.creditTransaction.count({ where: { userId, type: 'DEBIT' } })).toBe(0);
  });

  it('returns the real producer queue position for a queued scan', async () => {
    const producer = {
      getQueuePosition: async (scanId: string) => (scanId === 'queued-position' ? 3 : null),
      enqueueFirstPhase: async () => ({ jobId: 'job' }),
      enqueuePhaseTwo: async () => ({ jobId: 'job2' }),
      close: async () => undefined,
    };
    const app = createApp({ db: testDb, scans: { producer } });
    const { token, userId } = await userToken('queue-position@example.com');
    const target = await testDb.target.create({
      data: {
        userId,
        inputType: 'URL',
        canonicalValue: 'https://queue-position.example.com',
        displayName: 'queue-position',
      },
    });
    await testDb.scan.create({
      data: {
        id: 'queued-position',
        userId,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 10,
        chargedCredits: 0,
        state: 'QUEUED',
      },
    });
    const response = await request(app).get('/scans/queued-position').set(auth(token)).expect(200);
    expect((response.body as { scan: { queuePosition: number } }).scan.queuePosition).toBe(3);
  });
});
