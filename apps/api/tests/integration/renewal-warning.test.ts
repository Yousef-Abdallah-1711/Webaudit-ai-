/**
 * T188 — FR-078's pre-renewal warning: "tell the user, before renewal, how
 * many plan credits they are about to lose."
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { subscribe } from '../../src/services/billing/subscription.service.js';
import { sendRenewalWarnings } from '../../src/services/billing/renewal-warning.js';

const mailer = createCapturingMailer();
const DAY = 86_400_000;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('sendRenewalWarnings', () => {
  it('warns a user whose period ends within 3 days, stating the credits at risk, once', async () => {
    const user = await testDb.user.create({ data: { email: 'rw1@example.com', emailVerifiedAt: new Date() } });
    await subscribe(testDb, { userId: user.id, planId: 'pro' });
    // Move the period end to two days from now, and re-anchor the plan lot's
    // expiry to the exact same instant.
    const periodEnd = new Date(Date.now() + 2 * DAY);
    await testDb.subscription.update({ where: { userId: user.id }, data: { periodEnd } });
    await testDb.creditLot.updateMany({
      where: { userId: user.id, source: 'PLAN_RENEWAL' },
      data: { expiresAt: periodEnd },
    });

    const first = await sendRenewalWarnings(testDb, mailer);
    expect(first.warned).toBe(1);
    expect(mailer.renewalWarnings()).toHaveLength(1);
    expect(mailer.renewalWarnings()[0]?.mail.expiringCredits).toBe(1200);
    expect(mailer.renewalWarnings()[0]?.mail.planName).toBe('Pro');

    mailer.clear();
    const second = await sendRenewalWarnings(testDb, mailer);
    expect(second.warned).toBe(0);
    expect(mailer.renewalWarnings()).toHaveLength(0);
  });

  it('does not warn a subscription whose period ends well in the future', async () => {
    const user = await testDb.user.create({ data: { email: 'rw2@example.com', emailVerifiedAt: new Date() } });
    await subscribe(testDb, { userId: user.id, planId: 'starter' }); // periodEnd ~30 days out

    const result = await sendRenewalWarnings(testDb, mailer);
    expect(result.warned).toBe(0);
  });
});
