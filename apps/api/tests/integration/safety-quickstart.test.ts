/**
 * SPEC 008 quickstart Part B (B1, B2, B3) and T028 — executed, not described.
 * Real PostgreSQL; the simulated execution unit is a loop that calls the
 * checkpoint, exactly as the quickstart specifies.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { EXECUTION_AUDIT_EVENT_TYPES } from '@webaudit/types';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { admissionRequest, makeWorld, WEB_DESTINATION } from '../helpers/safety-fixtures.js';
import {
  acknowledgeStop,
  markEscalated,
  recordStopped,
  releaseLeaseByToken,
  renewLease,
  requestAdmission,
  safetyCheckpoint,
  triggerStop,
  listExecutionAuditEvents,
  recordExecutionAuditEvent,
} from '../../src/services/safety/index.js';
import { revokeAuthorization } from '../../src/services/authorization/revoke.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('B1: concurrency oversell race', () => {
  it('exactly one of two concurrent calls wins; releasing the lease frees the slot for a third', async () => {
    const world = await makeWorld('qs-b1@example.com', { concurrencyBudget: 1 });
    const [x, y] = await Promise.all([
      requestAdmission(testDb, admissionRequest(world)),
      requestAdmission(testDb, admissionRequest(world)),
    ]);
    const winner = [x, y].find((r) => r.outcome === 'GRANTED');
    const loser = [x, y].find((r) => r.outcome === 'REFUSED');
    expect(winner).toBeDefined();
    expect(loser).toMatchObject({ reason: 'BUDGET_EXHAUSTED_CONCURRENCY' });
    if (winner?.outcome !== 'GRANTED' || !winner.leaseId || !winner.holderToken)
      throw new Error('lease');
    expect(
      await releaseLeaseByToken(testDb, {
        leaseId: winner.leaseId,
        holderToken: winner.holderToken,
      }),
    ).toEqual({ released: true });
    expect((await requestAdmission(testDb, admissionRequest(world))).outcome).toBe('GRANTED');
  });
});

describe('B2: revocation-to-stop propagation', () => {
  it('a unit checkpointing once per second is told to STOP within 5 s of revocation; no further consumption; redelivery refused', async () => {
    const world = await makeWorld('qs-b2@example.com');
    const request = admissionRequest(world, { executionId: 'qs-unit', idempotencyKey: 'qs-unit' });
    const first = await requestAdmission(testDb, request);
    if (first.outcome !== 'GRANTED' || !first.leaseId || !first.holderToken)
      throw new Error('lease');
    const lease = {
      grantId: first.grantId,
      leaseId: first.leaseId,
      holderToken: first.holderToken,
    };
    const consumedBefore = await testDb.budgetConsumption.count();

    const controller = new AbortController();
    let stopped: Awaited<ReturnType<typeof safetyCheckpoint>> | undefined;
    const loop = (async () => {
      for (let i = 0; i < 12 && stopped === undefined; i += 1) {
        const r = await safetyCheckpoint(testDb, {
          executionId: 'qs-unit',
          targetId: world.targetId,
          executionClass: 'BROWSER',
          destination: WEB_DESTINATION,
          idempotencyKey: 'qs-unit',
          consumes: { request: false, concurrency: true },
          abortController: controller,
          lease,
        });
        if (r.outcome === 'STOP') stopped = r;
        else await new Promise((res) => setTimeout(res, 1000));
      }
    })();
    await new Promise((res) => setTimeout(res, 1500));
    const revokedAt = Date.now();
    await revokeAuthorization(testDb, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    await loop;

    expect(stopped).toMatchObject({
      outcome: 'STOP',
      reason: 'KILL_SWITCH_PENDING',
      scope: 'GRANT',
    });
    expect(Date.now() - revokedAt).toBeLessThan(5000);
    expect(controller.signal.aborted).toBe(true);
    await acknowledgeStop(testDb, {
      executionId: 'qs-unit',
      scope: 'GRANT',
      scopeId: world.grantId,
    });
    expect((await testDb.killSwitchState.findFirstOrThrow()).state).toBe('ACKNOWLEDGED');
    expect(await testDb.budgetConsumption.count()).toBe(consumedBefore);

    // redelivering the same unit's job after it has fully stopped is refused before any budget logic
    await releaseLeaseByToken(testDb, lease);
    await triggerStop(testDb, {
      scope: 'EXECUTION',
      scopeId: 'qs-unit',
      triggeredBy: world.userId,
      reason: 'USER_CANCELLATION',
    }).catch(() => undefined);
    const redelivered = await requestAdmission(testDb, request);
    expect(redelivered).toMatchObject({ outcome: 'REFUSED', reason: 'KILL_SWITCH_PENDING' });
    expect(await testDb.budgetConsumption.count()).toBe(consumedBefore);
  }, 30_000);
});

describe('B3: audit reconstruction with redaction', () => {
  it('a refusal, a granted execution with a secret-bearing payload and a stop are all found, distinguishable and redacted', async () => {
    const world = await makeWorld('qs-b3@example.com', { requestBudget: 1, concurrencyBudget: 2 });
    const granted = await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'qs-b3', idempotencyKey: 'qs-b3-1' }),
    );
    expect(granted.outcome).toBe('GRANTED');
    const refused = await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'qs-b3', idempotencyKey: 'qs-b3-2' }),
    );
    expect(refused).toMatchObject({ reason: 'BUDGET_EXHAUSTED_REQUEST' });

    const cookie = 'session=ghp_' + 'c'.repeat(36);
    await recordExecutionAuditEvent(testDb, {
      eventType: 'SAFETY_VIOLATION',
      actorId: world.userId,
      context: { targetAuthorizationId: world.grantId, executionId: 'qs-b3' },
      outcome: 'SIMULATED_RESPONSE',
      payload: { responseHeaders: { 'set-cookie': cookie }, note: `cookie ${cookie}` },
    });
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await markEscalated(testDb, { executionId: 'qs-b3', scope: 'GRANT', scopeId: world.grantId });

    const events = await listExecutionAuditEvents(testDb, {
      userId: world.userId,
      targetAuthorizationId: world.grantId,
    });
    const types = events.map((e) => e.eventType);
    expect(types).toContain('BUDGET_EXHAUSTED'); // the refusal
    expect(types).toContain('BUDGET_CONSUMED');
    expect(types).toContain('ESCALATED');
    expect(JSON.stringify(events)).not.toContain(cookie);
    const stop = events.find((e) => e.eventType === 'STOP_REQUESTED');
    expect(stop?.outcome).toBe('SYSTEM_SAFETY_POLICY'); // not USER_CANCELLATION, not OPERATOR_EMERGENCY_STOP
    expect(
      events.some(
        (e) => e.outcome === 'USER_CANCELLATION' || e.outcome === 'OPERATOR_EMERGENCY_STOP',
      ),
    ).toBe(false);
  });
});

describe('T028 every ExecutionAuditEventType has a real emitter', () => {
  it('a single scenario produces all twelve event types from real call sites', async () => {
    const world = await makeWorld('qs-t028@example.com', {
      requestBudget: 1,
      concurrencyBudget: 1,
    });
    const g = await requestAdmission(testDb, admissionRequest(world, { executionId: 't028' })); // GRANTED, RESERVED, CONSUMED
    if (g.outcome !== 'GRANTED' || !g.leaseId || !g.holderToken) throw new Error('lease');
    await requestAdmission(testDb, admissionRequest(world)); // BUDGET_EXHAUSTED
    await requestAdmission(
      testDb,
      admissionRequest(world, { destination: { host: 'x.test', path: '/', scheme: 'https' } }),
    ); // ADMISSION_REFUSED
    await renewLease(testDb, { leaseId: g.leaseId, holderToken: 'superseded' }); // (fenced by token: no row) ...
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second' WHERE id = ${g.leaseId}`;
    await renewLease(testDb, { leaseId: g.leaseId, holderToken: g.holderToken }); // SAFETY_VIOLATION (expired, fenced)
    await testDb.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() + interval '30 seconds' WHERE id = ${g.leaseId}`;
    await releaseLeaseByToken(testDb, {
      leaseId: g.leaseId,
      holderToken: g.holderToken,
      completed: true,
    }); // BUDGET_RELEASED + EXECUTION_COMPLETED
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    }); // STOP_REQUESTED
    const ids = { executionId: 't028', scope: 'GRANT', scopeId: world.grantId } as const;
    await acknowledgeStop(testDb, ids); // STOP_ACKNOWLEDGED
    await markEscalated(testDb, ids); // ESCALATED
    await recordStopped(testDb, ids); // STOPPED

    const seen = new Set(
      (await testDb.executionAuditEvent.findMany({ select: { eventType: true } })).map(
        (e) => e.eventType,
      ),
    );
    for (const type of EXECUTION_AUDIT_EVENT_TYPES)
      expect(seen.has(type), `${type} was never emitted`).toBe(true);
  });
});
