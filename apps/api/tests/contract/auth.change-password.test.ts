import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { hashPassword } from '../../src/services/auth/crypto.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

beforeEach(async () => {
  await resetDb();
  mailer.clear();
});
afterAll(closeDb);

async function bearerFor(userId: string): Promise<string> {
  return new SignJWT({ isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(env.accessSecret);
}

describe('POST /auth/change-password', () => {
  it('changes the password and revokes every live refresh session', async () => {
    const user = await testDb.user.create({
      data: {
        email: 'change-password@example.com',
        passwordHash: await hashPassword('current-correct-password'),
        emailVerifiedAt: new Date(),
      },
    });
    await testDb.refreshToken.createMany({
      data: [
        { userId: user.id, tokenHash: 'live-token-a', expiresAt: new Date(Date.now() + 60_000) },
        { userId: user.id, tokenHash: 'live-token-b', expiresAt: new Date(Date.now() + 60_000) },
      ],
    });

    const response = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${await bearerFor(user.id)}`)
      .send({ currentPassword: 'current-correct-password', newPassword: 'new-correct-password' });

    expect(response.status).toBe(200);
    expect(
      (await testDb.refreshToken.findMany({ where: { userId: user.id } })).every(
        (row) => row.revokedAt,
      ),
    ).toBe(true);
  });

  it('rejects an incorrect current password without changing the account', async () => {
    const passwordHash = await hashPassword('current-correct-password');
    const user = await testDb.user.create({
      data: { email: 'wrong-current@example.com', passwordHash, emailVerifiedAt: new Date() },
    });

    const response = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${await bearerFor(user.id)}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'new-correct-password' });

    expect(response.status).toBe(401);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(
      passwordHash,
    );
  });

  it('enforces the registration password length boundary', async () => {
    const user = await testDb.user.create({
      data: {
        email: 'weak-new-password@example.com',
        passwordHash: await hashPassword('current-correct-password'),
        emailVerifiedAt: new Date(),
      },
    });

    const response = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${await bearerFor(user.id)}`)
      .send({ currentPassword: 'current-correct-password', newPassword: 'short' });

    expect(response.status).toBe(422);
  });
});
