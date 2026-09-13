import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminRoutes } from '../../src/routes/admin/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

const app = express();
app.use(express.json());
app.use(adminRoutes(testDb));

async function tokenFor(userId: string): Promise<string> {
  return new SignJWT({ isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}

async function createUser(isOperator: boolean): Promise<string> {
  const user = await testDb.user.create({
    data: { email: `${isOperator ? 'operator' : 'member'}@cost-alerts.example`, isOperator },
  });
  return tokenFor(user.id);
}

beforeEach(async () => {
  await resetDb();
  await testDb.costAlertThreshold.createMany({
    data: [
      { scope: 'GLOBAL', windowMinutes: 60, thresholdMicros: 1_000 },
      { scope: 'PER_USER', windowMinutes: 30, thresholdMicros: 500 },
    ],
  });
});
afterAll(closeDb);

describe('admin cost-alert thresholds', () => {
  it('refuses a non-operator before exposing monitoring configuration', async () => {
    const token = await createUser(false);
    await request(app).get('/cost-alerts').set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('lists and updates a validated threshold for an operator', async () => {
    const token = await createUser(true);
    const auth = { Authorization: `Bearer ${token}` };

    const list = await request(app).get('/cost-alerts').set(auth).expect(200);
    expect(list.body.thresholds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'GLOBAL', thresholdMicros: 1_000 }),
      ]),
    );

    await request(app)
      .patch('/cost-alerts/thresholds/GLOBAL')
      .set(auth)
      .send({ windowMinutes: 120, thresholdMicros: 2_000 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.threshold).toMatchObject({
          scope: 'GLOBAL',
          windowMinutes: 120,
          thresholdMicros: 2_000,
        });
      });
    await request(app)
      .patch('/cost-alerts/thresholds/GLOBAL')
      .set(auth)
      .send({ thresholdMicros: 0 })
      .expect(400);
  });
});
