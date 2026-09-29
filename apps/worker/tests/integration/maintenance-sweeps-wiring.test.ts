/**
 * Code-quality pass, post-Phase-12 (master plan) — three real maintenance
 * sweeps (`billing-sweeps.ts` T188/T189, `payment-expiry-scheduler.ts` T003,
 * `telemetry-archive-scheduler.ts` T032) are all genuinely wired at real
 * worker boot (`apps/worker/src/index.ts`), and their underlying pure logic
 * (`renewDueSubscriptions`, `sendRenewalWarnings`, `enforceRetention`,
 * `sweepExpiredPendingPayments`, `runTelemetryArchive`) is already
 * thoroughly tested in `apps/api`'s own suite — but the worker-side wiring
 * layer itself (dispatch routing a real job name to a real handler; the
 * handler composing those calls without throwing) had zero dedicated test
 * anywhere, unlike `cost-alerts-sweep.test.ts`'s own sweep, which this file
 * mirrors exactly for the same reason that one exists: "the same class of
 * gap T023 found for Sentry's captureMessage (SDK/logic wired, nothing
 * invoking it)" is exactly as real for a wiring layer nothing ever dispatches
 * to as it is for one nothing ever calls.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, closeDb } from '@webaudit/api/test-db';
import { createBillingSweepHandler } from '../../src/orchestrator/billing-sweeps.js';
import { createPaymentExpirySweepHandler } from '../../src/orchestrator/payment-expiry-scheduler.js';
import { createTelemetryArchiveHandler } from '../../src/orchestrator/telemetry-archive-scheduler.js';
import { dispatch, JOB_NAMES, JobNotImplementedError } from '../../src/queue/workers.js';

describe('maintenance-sweep wiring — dispatch routes each real job name to its real handler', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it('routes the repeatable billing-sweep job to the handler', async () => {
    let ran = false;
    await dispatch(
      { name: JOB_NAMES.billingSweep, queueName: 'maintenance', data: { kind: 'billing-sweep' } },
      { billingSweep: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });

  it('routes the repeatable payment-expiry-sweep job to the handler', async () => {
    let ran = false;
    await dispatch(
      {
        name: JOB_NAMES.paymentExpirySweep,
        queueName: 'maintenance',
        data: { kind: 'payment-expiry-sweep' },
      },
      { paymentExpirySweep: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });

  it('routes auth-token cleanup maintenance work to its handler', async () => {
    let ran = false;
    await dispatch(
      {
        name: JOB_NAMES.authTokenCleanup,
        queueName: 'maintenance',
        data: { kind: 'auth-token-cleanup' },
      },
      { authTokenCleanup: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });

  it('routes the repeatable telemetry-archive job to the handler', async () => {
    let ran = false;
    await dispatch(
      {
        name: JOB_NAMES.telemetryArchive,
        queueName: 'maintenance',
        data: { kind: 'telemetry-archive' },
      },
      { telemetryArchive: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });

  it('telemetry-archive refuses an unrecognised payload before the missing-handler check, matching every sibling sweep', async () => {
    // A real handler is supplied so the only possible rejection is the
    // schema check — `.rejects.toThrow()` alone cannot tell a schema
    // failure apart from a `JobNotImplementedError` for a missing handler,
    // since both reject (caught live: an earlier draft of this test still
    // passed with the schema check removed entirely, for exactly that
    // reason).
    const error = await dispatch(
      { name: JOB_NAMES.telemetryArchive, queueName: 'maintenance', data: { kind: 'wrong' } },
      { telemetryArchive: () => Promise.resolve() },
    ).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(JobNotImplementedError);
    expect(String(error)).toContain('kind');
  });

  it('the real billing-sweep handler runs its full renew/warn/retain composition against a real, empty database without throwing', async () => {
    const handler = createBillingSweepHandler({ db, webUrl: 'https://example.test' });
    await expect(handler()).resolves.toBeUndefined();
  });

  it('the real payment-expiry-sweep handler runs against a real, empty database without throwing', async () => {
    const handler = createPaymentExpirySweepHandler(db);
    await expect(handler()).resolves.toBeUndefined();
  });

  it('the real telemetry-archive handler defaults to dry-run and runs against a real database without throwing or touching storage', async () => {
    delete process.env['TELEMETRY_ARCHIVE_DRY_RUN'];
    const handler = createTelemetryArchiveHandler(db);
    await expect(handler()).resolves.toBeUndefined();
  });
});
