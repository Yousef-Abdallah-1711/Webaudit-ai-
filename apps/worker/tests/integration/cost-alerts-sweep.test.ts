/**
 * T028 gap fix — `evaluateCostAlerts` (FR-C01-C04) and its admin endpoints
 * existed and were unit-tested, but nothing anywhere ever scheduled it: the
 * same class of gap T023 found for Sentry's `captureMessage` (SDK/logic
 * wired, nothing invoking it). Without this wiring, a `CostAlertThreshold`
 * breach would never fire in a real deployment no matter how much AI spend
 * accrued. This covers the wiring that closes it: `createCostAlertsSweepHandler`
 * runs the real evaluation against a real database, and `dispatch` routes the
 * repeatable `cost-alerts-sweep` job to it. FR-C04's windowing logic itself is
 * already covered by `apps/api/tests/unit/cost-alerts.test.ts` — not repeated
 * here.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, closeDb } from '@webaudit/api/test-db';
import { createCostAlertsSweepHandler } from '../../src/orchestrator/cost-alerts-scheduler.js';
import { dispatch, JOB_NAMES, JobNotImplementedError } from '../../src/queue/workers.js';

describe('FR-C01-C04 cost-alert sweep — scheduled and wired', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it('the real handler evaluates real thresholds against a real database and records a breach', async () => {
    await db.costAlertThreshold.upsert({
      where: { scope: 'GLOBAL' },
      create: { scope: 'GLOBAL', windowMinutes: 60, thresholdMicros: 100 },
      update: { windowMinutes: 60, thresholdMicros: 100, isEnabled: true },
    });
    await db.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 150,
        outcome: 'SUCCESS',
      },
    });

    await createCostAlertsSweepHandler(db)();

    await expect(db.costAlertEvent.count({ where: { scope: 'GLOBAL' } })).resolves.toBe(1);
  });

  it('dispatch routes the repeatable cost-alerts-sweep job to the handler', async () => {
    let ran = false;
    await dispatch(
      {
        name: JOB_NAMES.costAlertsSweep,
        queueName: 'maintenance',
        data: { kind: 'cost-alerts-sweep' },
      },
      { costAlertsSweep: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });

  it('dispatch refuses an unrecognised cost-alerts-sweep payload before the missing-handler check', async () => {
    // A real handler is supplied so the only possible rejection is the
    // schema check — `.rejects.toThrow()` alone against an empty `{}`
    // handlers object cannot tell a schema failure apart from
    // `JobNotImplementedError` for a missing handler, since both reject
    // (found live building an analogous test elsewhere: with no schema
    // check at all, this exact shape of assertion still passed, because the
    // missing-handler throw satisfied it just as well).
    const error = await dispatch(
      { name: JOB_NAMES.costAlertsSweep, queueName: 'maintenance', data: { kind: 'wrong' } },
      { costAlertsSweep: () => Promise.resolve() },
    ).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(JobNotImplementedError);
    expect(String(error)).toContain('kind');
  });
});
