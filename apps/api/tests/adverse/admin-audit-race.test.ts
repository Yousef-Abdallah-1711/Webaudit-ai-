/**
 * A 2026-09-04 Session 6 review flagged an unconfirmed, low-likelihood race
 * shared by `plans.service.ts`, `capabilities.service.ts`, and
 * `providers.service.ts`: each reads an audit log's `before` snapshot
 * unlocked, then writes — two concurrent mutations on the same subject can
 * both read the row's state before either commits, so the second write's
 * audit entry claims a `before` that was never actually true immediately
 * before it ran. `users.service.ts`'s `updateUser` had the identical shape
 * and was fixed (2026-09-08) with a `FOR UPDATE`-locked transaction; this
 * suite proves the same race in the other three services, then (once fixed)
 * proves it closed — same pattern as `admin.users.test.ts`'s own race test.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createPlan, updatePlan } from '../../src/services/admin/plans.service.js';
import {
  setCapabilityEnabled,
  setCapabilityPlanRestrictions,
} from '../../src/services/admin/capabilities.service.js';
import { replaceProviderChain } from '../../src/services/admin/providers.service.js';

beforeEach(resetDb);
afterAll(closeDb);

async function makeOperator(): Promise<string> {
  const actor = await testDb.user.create({
    data: { email: `op-${Math.random()}@example.com`, emailVerifiedAt: new Date() },
  });
  return actor.id;
}

describe('admin audit-log races: the second write records what the first actually left behind', () => {
  it('plans.service.ts updatePlan', async () => {
    const operatorId = await makeOperator();
    // `resetDb` deliberately leaves `Plan` alone (reference data, seeded
    // once) — this test's own plan id needs its own cleanup between runs.
    await testDb.plan.deleteMany({ where: { id: 'race-plan' } });
    await createPlan(testDb, {
      operatorId,
      id: 'race-plan',
      name: 'Race Plan',
      monthlyCredits: 100,
      creditsRecur: true,
      allowedInputTypes: ['URL'],
      allowLoadGeneration: false,
      allowReadinessPass: false,
      allowCreditPurchase: false,
      allowCustomCapability: false,
      concurrentScanLimit: 1,
      queuePriority: 1,
      retentionDays: 7,
    });

    await Promise.allSettled([
      updatePlan(testDb, { operatorId, planId: 'race-plan', patch: { monthlyCredits: 200 } }),
      updatePlan(testDb, { operatorId, planId: 'race-plan', patch: { monthlyCredits: 300 } }),
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Plan', subjectId: 'race-plan', action: 'plan.update' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    const [first, second] = entries as unknown as [
      { before: { monthlyCredits: number }; after: { monthlyCredits: number } },
      { before: { monthlyCredits: number }; after: { monthlyCredits: number } },
    ];
    expect(second.before.monthlyCredits).toBe(first.after.monthlyCredits);
  });

  it('capabilities.service.ts setCapabilityEnabled', async () => {
    const operatorId = await makeOperator();
    await testDb.capability.create({
      data: {
        id: 'race-capability',
        name: 'Race Capability',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        isEnabled: false,
      },
    });

    await Promise.allSettled([
      setCapabilityEnabled(testDb, {
        operatorId,
        capabilityId: 'race-capability',
        isEnabled: true,
      }),
      setCapabilityEnabled(testDb, {
        operatorId,
        capabilityId: 'race-capability',
        isEnabled: false,
      }),
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: {
        subjectType: 'Capability',
        subjectId: 'race-capability',
        action: 'capability.update',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    const [first, second] = entries as unknown as [
      { before: { isEnabled: boolean }; after: { isEnabled: boolean } },
      { before: { isEnabled: boolean }; after: { isEnabled: boolean } },
    ];
    expect(second.before.isEnabled).toBe(first.after.isEnabled);
  });

  it('capabilities.service.ts setCapabilityPlanRestrictions', async () => {
    const operatorId = await makeOperator();
    await seedPlans();
    await testDb.capability.create({
      data: {
        id: 'race-capability-2',
        name: 'Race Capability 2',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
      },
    });

    await Promise.allSettled([
      setCapabilityPlanRestrictions(testDb, {
        operatorId,
        capabilityId: 'race-capability-2',
        planIds: ['pro'],
      }),
      setCapabilityPlanRestrictions(testDb, {
        operatorId,
        capabilityId: 'race-capability-2',
        planIds: ['business'],
      }),
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: {
        subjectType: 'Capability',
        subjectId: 'race-capability-2',
        action: 'capability.restrict',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    const [first, second] = entries as unknown as [
      { before: { restrictedToPlans: string[] }; after: { restrictedToPlans: string[] } },
      { before: { restrictedToPlans: string[] }; after: { restrictedToPlans: string[] } },
    ];
    expect(second.before.restrictedToPlans).toEqual(first.after.restrictedToPlans);
  });

  it('providers.service.ts replaceProviderChain', async () => {
    const operatorId = await makeOperator();

    await Promise.allSettled([
      replaceProviderChain(testDb, {
        operatorId,
        entries: [
          { vendor: 'anthropic', model: 'claude' },
          { vendor: 'openai', model: 'gpt' },
        ],
      }),
      replaceProviderChain(testDb, {
        operatorId,
        entries: [
          { vendor: 'openai', model: 'gpt' },
          { vendor: 'google', model: 'gemini' },
        ],
      }),
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'ProviderChain' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    const [first, second] = entries as unknown as [
      { before: { chain: unknown }; after: { chain: unknown } },
      { before: { chain: unknown }; after: { chain: unknown } },
    ];
    expect(second.before.chain).toEqual(first.after.chain);
  });
});
