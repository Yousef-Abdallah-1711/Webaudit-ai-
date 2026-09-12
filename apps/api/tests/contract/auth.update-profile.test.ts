import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { authRoutes } from '../../src/routes/auth.routes.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = express();
app.use(express.json());
app.use('/auth', authRoutes(testDb, mailer));

async function tokenFor(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}

beforeEach(async () => {
  await resetDb();
  mailer.clear();
});
afterAll(closeDb);

describe('PATCH /auth/me', () => {
  it('persists an approved display name and returns it from GET /auth/me', async () => {
    const user = await testDb.user.create({
      data: { email: 'profile@example.com', emailVerifiedAt: new Date() },
    });
    const token = await tokenFor(user.id);

    await request(app)
      .patch('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ada Lovelace' })
      .expect(200);

    const row = await testDb.$queryRaw<
      { name: string | null }[]
    >`SELECT name FROM "User" WHERE id = ${user.id}`;
    expect(row[0]?.name).toBe('Ada Lovelace');

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.name).toBe('Ada Lovelace');
  });

  it('rejects email mutation through the profile endpoint', async () => {
    const user = await testDb.user.create({
      data: { email: 'profile-email@example.com', emailVerifiedAt: new Date() },
    });
    const token = await tokenFor(user.id);
    await request(app)
      .patch('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'changed@example.com' })
      .expect(422);
  });
});
