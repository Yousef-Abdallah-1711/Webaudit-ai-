/**
 * SPEC 008 T015 — the repeatable safety sweep: registration, dispatch, and a
 * real end-to-end run (lease reclaim, drift correction, stranded-stop
 * reconciliation) against PostgreSQL.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { admissionRequest, makeWorld } from '@webaudit/api/test-safety-fixtures';
import { requestAdmission, triggerStop } from '@webaudit/api/safety';
import { JOB_NAMES, dispatch } from '../../src/queue/workers.js';
import {
  SAFETY_SWEEP_JOB_NAME,
  createSafetySweepHandler,
  runSafetySweep,
  scheduleSafetySweep,
} from '../../src/orchestrator/safety-lease-sweep.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('registration and dispatch', () => {
  it('registers one repeatable scheduler keyed by id, with the sweep job name', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    await scheduleSafetySweep({ upsertJobScheduler } as unknown as Queue);
    expect(SAFETY_SWEEP_JOB_NAME).toBe(JOB_NAMES.safetySweep);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'safety-sweep',
      { every: 60_000 },
      expect.objectContaining({ name: 'safety-sweep', data: { kind: 'safety-sweep' } }),
    );
  });

  it('dispatches to the handler, rejects bad payloads, and is a loud error when no handler is wired', async () => {
    let ran = false;
    await dispatch(
      { name: JOB_NAMES.safetySweep, queueName: 'maintenance', data: { kind: 'safety-sweep' } },
      { safetySweep: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
    await expect(
      dispatch(
        { name: JOB_NAMES.safetySweep, queueName: 'maintenance', data: { kind: 'other' } },
        { safetySweep: () => Promise.resolve() },
      ),
    ).rejects.toThrow();
    await expect(
      dispatch(
        { name: JOB_NAMES.safetySweep, queueName: 'maintenance', data: { kind: 'safety-sweep' } },
        {},
      ),
    ).rejects.toThrow();
  });
});

describe('a real sweep', () => {
  it('reclaims an expired lease, then reconciles the stop it was blocking, across two intervals; a rerun is a no-op', async () => {
    const world = await makeWorld('sweep-e2e@example.com');
    const granted = await requestAdmission(db, admissionRequest(world, { executionId: 'exec-sw' }));
    expect(granted.outcome).toBe('GRANTED');
    await triggerStop(db, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    process.env['SAFETY_STOP_ACK_GRACE_SECONDS'] = '0';
    try {
      // lease is live: nothing may move
      expect(await runSafetySweep(db)).toEqual({
        reclaimed: 0,
        driftCorrected: 0,
        acknowledged: 0,
        stopped: 0,
        auditPurged: 0,
      });
      await db.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second'`;
      const first = await runSafetySweep(db);
      expect(first).toMatchObject({ reclaimed: 1, acknowledged: 1, stopped: 0 });
      const second = await createSafetySweepHandler({ db })().then(() => runSafetySweep(db));
      expect(second).toMatchObject({ reclaimed: 0, acknowledged: 0 });
      const row = await db.killSwitchState.findFirstOrThrow();
      expect(row.state).toBe('STOPPED');
      expect(await runSafetySweep(db)).toEqual({
        reclaimed: 0,
        driftCorrected: 0,
        acknowledged: 0,
        stopped: 0,
        auditPurged: 0,
      });
    } finally {
      delete process.env['SAFETY_STOP_ACK_GRACE_SECONDS'];
    }
  });
});

describe('retention housekeeping cannot starve the safety-critical work (audit finding D-H)', () => {
  it('a retention failure (missing plan reference data) does not fail the sweep or block reclaim/reconcile', async () => {
    const world = await makeWorld('sweep-dh@example.com');
    await requestAdmission(db, admissionRequest(world, { executionId: 'dh-unit' }));
    await db.$executeRaw`INSERT INTO "ExecutionAuditEvent" (id,"eventType","actorId","targetAuthorizationId",outcome) VALUES ('dh-evt','ADMISSION_GRANTED','x',${world.grantId},'x')`;
    await db.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second'`;
    await db.plan.deleteMany({}); // the purge resolves each owner's plan; with no plan rows it throws
    const { resetSafetySweepThrottleForTests } =
      await import('../../src/orchestrator/safety-lease-sweep.js');
    resetSafetySweepThrottleForTests();
    try {
      const outcome = await runSafetySweep(db);
      expect(outcome.reclaimed).toBe(1); // the safety-critical work still ran
      expect(outcome.auditPurged).toBe(0);
    } finally {
      await seedPlans(); // restore the shared reference data this test removed
    }
  });
});
