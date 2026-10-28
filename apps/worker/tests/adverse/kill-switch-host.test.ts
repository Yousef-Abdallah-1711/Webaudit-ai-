/**
 * SPEC 008 T016/T017/T019a/T019b/T019c — the execution host's half of the kill
 * switch, against real PostgreSQL and real Redis. A "unit" here is a small
 * simulated long-running execution that polls its checkpoint; the watcher is
 * the production `startStopWatcher`.
 */

import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDb as db, resetDb, closeDb, TEST_DB_URL } from '@webaudit/api/test-db';
import { admissionRequest, makeWorld, auditTypes } from '@webaudit/api/test-safety-fixtures';
import { PrismaClient } from '@webaudit/api/prisma-client';
import {
  publishStopSignal,
  reclaimExpiredLeases,
  reconcileStrandedStops,
  releaseLeaseByToken,
  renewLease,
  requestAdmission,
  safetyCheckpoint,
} from '@webaudit/api/safety';
import { classifyEnvironment, revokeAuthorization } from '@webaudit/api/authorization';
import { startStopWatcher, STOP_BOUND_MS } from '../../src/orchestrator/kill-switch.js';

beforeEach(resetDb);
afterAll(closeDb);

type World = Awaited<ReturnType<typeof makeWorld>>;

async function startUnit(
  world: World,
  executionId: string,
  opts: { escalationMs?: number; onEscalate?: () => void; dbOverride?: never } = {},
) {
  const granted = await requestAdmission(
    db,
    admissionRequest(world, { executionId, idempotencyKey: executionId }),
  );
  if (granted.outcome !== 'GRANTED' || !granted.leaseId || !granted.holderToken)
    throw new Error('no lease');
  const controller = new AbortController();
  const watcher = startStopWatcher({
    db,
    identity: {
      executionId,
      grantId: world.grantId,
      targetId: world.targetId,
      userId: world.userId,
    },
    abortController: controller,
    pollIntervalMs: 100,
    ...(opts.escalationMs === undefined ? {} : { escalationMs: opts.escalationMs }),
    ...(opts.onEscalate === undefined ? {} : { onEscalate: opts.onEscalate }),
  });
  return {
    lease: { leaseId: granted.leaseId, holderToken: granted.holderToken },
    controller,
    watcher,
  };
}

const stopState = (scope: string, scopeId: string) =>
  db.killSwitchState.findFirst({ where: { scope: scope as never, scopeId } });

describe('T016 revocation reaches a running execution', () => {
  it('observes the stop within 5 s, aborts its signal, and reaches ACKNOWLEDGED in the same window', async () => {
    const world = await makeWorld('w-revoke@example.com');
    const unit = await startUnit(world, 'exec-w1');
    unit.controller.signal.addEventListener('abort', () => void unit.watcher.acknowledge());
    const started = Date.now();
    await revokeAuthorization(db, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    const stop = await unit.watcher.observed;
    await vi.waitFor(
      async () => expect((await stopState('GRANT', world.grantId))?.state).toBe('ACKNOWLEDGED'),
      { timeout: STOP_BOUND_MS, interval: 50 },
    );
    unit.watcher.stop();
    expect(stop?.scope).toBe('GRANT');
    expect(Date.now() - started).toBeLessThan(STOP_BOUND_MS);
    expect(unit.controller.signal.aborted).toBe(true);
    expect(unit.watcher.escalated).toBe(false);
    expect(await auditTypes({ eventType: 'STOP_ACKNOWLEDGED' })).toHaveLength(1);
  });

  it('a checkpoint that sees the stop aborts the composed signal and returns STOP', async () => {
    const world = await makeWorld('w-checkpoint@example.com');
    const unit = await startUnit(world, 'exec-w2');
    unit.watcher.stop();
    await revokeAuthorization(db, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    const controller = new AbortController();
    const result = await safetyCheckpoint(db, {
      executionId: 'exec-w2',
      targetId: world.targetId,
      executionClass: 'BROWSER',
      destination: { host: 'example.com', path: '/', scheme: 'https', port: null },
      idempotencyKey: 'exec-w2',
      consumes: { request: false, concurrency: true },
      abortController: controller,
      lease: { grantId: world.grantId, ...unit.lease },
    });
    expect(result).toMatchObject({ outcome: 'STOP', reason: 'KILL_SWITCH_PENDING' });
    expect(controller.signal.aborted).toBe(true);
  });

  it('a held lease that is fenced is treated as an immediate stop', async () => {
    const world = await makeWorld('w-fenced@example.com');
    const unit = await startUnit(world, 'exec-w3');
    unit.watcher.stop();
    const controller = new AbortController();
    const result = await safetyCheckpoint(db, {
      executionId: 'exec-w3',
      targetId: world.targetId,
      executionClass: 'BROWSER',
      destination: { host: 'example.com', path: '/', scheme: 'https', port: null },
      idempotencyKey: 'exec-w3',
      consumes: { request: false, concurrency: true },
      abortController: controller,
      lease: { grantId: world.grantId, leaseId: unit.lease.leaseId, holderToken: 'superseded' },
    });
    expect(result).toEqual({ outcome: 'STOP', reason: 'LEASE_FENCED' });
    expect(controller.signal.aborted).toBe(true);
  });
});

describe('T017 no resurrection', () => {
  it('every redelivery vector for a STOPPED execution is refused before any budget logic', async () => {
    const world = await makeWorld('w-nores@example.com', { concurrencyBudget: 3 });
    const unit = await startUnit(world, 'exec-nr');
    unit.controller.signal.addEventListener('abort', () => void unit.watcher.acknowledge());
    await db.$transaction(async (tx) => {
      const { triggerStop } = await import('@webaudit/api/safety');
      await triggerStop(tx, {
        scope: 'EXECUTION',
        scopeId: 'exec-nr',
        triggeredBy: world.userId,
        reason: 'USER_CANCELLATION',
      });
    });
    await unit.watcher.observed;
    await vi.waitFor(
      async () => expect((await stopState('EXECUTION', 'exec-nr'))?.state).toBe('ACKNOWLEDGED'),
      { timeout: 5000, interval: 50 },
    );
    await releaseLeaseByToken(db, unit.lease);
    expect(await unit.watcher.complete()).toBe(true);
    unit.watcher.stop();
    const consumedBefore = (await db.budgetCounter.findFirstOrThrow()).consumedRequests;

    const attempts = [
      admissionRequest(world, { executionId: 'exec-nr', idempotencyKey: 'exec-nr' }), // BullMQ retry / replay
      admissionRequest(world, { executionId: 'exec-nr', idempotencyKey: 'stalled-redelivery' }), // stalled-job redelivery
      admissionRequest(world, { executionId: 'exec-nr', idempotencyKey: 'dup-dispatch' }), // duplicate dispatch
      admissionRequest(world, {
        executionId: 'exec-nr',
        idempotencyKey: 'new-worker-same-identity',
      }), // new worker, same identity
    ];
    for (const a of attempts) {
      expect(await requestAdmission(db, a)).toMatchObject({
        outcome: 'REFUSED',
        reason: 'KILL_SWITCH_PENDING',
        scope: 'EXECUTION',
      });
    }
    // a stale worker past lease expiry: its renewal is fenced and it cannot resurrect anything
    // stop takes precedence over fencing; either way the stale holder is told to stop and nothing is renewed
    expect(['STOP_PENDING', 'FENCED']).toContain((await renewLease(db, unit.lease)).status);
    expect((await db.budgetCounter.findFirstOrThrow()).consumedRequests).toBe(consumedBefore);
    expect(await db.admissionLease.count({ where: { releasedAt: null, reclaimedAt: null } })).toBe(
      0,
    );
  });
});

describe('T019a environment reclassification', () => {
  it('a running unit stops when the target is reclassified out of its grant, and a later reclassification back does not cancel it', async () => {
    const world = await makeWorld('w-env@example.com');
    const unit = await startUnit(world, 'exec-env');
    await classifyEnvironment(db, {
      targetId: world.targetId,
      actingUserId: world.userId,
      classification: 'PRODUCTION',
    });
    const stop = await unit.watcher.observed;
    expect(stop).toMatchObject({ scope: 'GRANT' });
    expect(unit.controller.signal.aborted).toBe(true);
    await classifyEnvironment(db, {
      targetId: world.targetId,
      actingUserId: world.userId,
      classification: 'STAGING',
    });
    expect((await stopState('GRANT', world.grantId))?.state).toBe('REQUESTED');
    unit.watcher.stop();
  });
});

describe('T019b escalation', () => {
  it('a unit that never acknowledges is escalated: signal aborted, hook fired, escalatedAt set, distinct ESCALATED event', async () => {
    const world = await makeWorld('w-esc@example.com');
    const onEscalate = vi.fn();
    const unit = await startUnit(world, 'exec-esc', { escalationMs: 700, onEscalate });
    const t0 = Date.now();
    await db.$transaction(async (tx) => {
      const { triggerStop } = await import('@webaudit/api/safety');
      await triggerStop(tx, {
        scope: 'GRANT',
        scopeId: world.grantId,
        triggeredBy: 'SYSTEM',
        reason: 'SYSTEM_SAFETY_POLICY',
      });
    });
    await vi.waitFor(() => expect(onEscalate).toHaveBeenCalledTimes(1), {
      timeout: 4000,
      interval: 50,
    });
    await vi.waitFor(
      async () => expect((await stopState('GRANT', world.grantId))?.escalatedAt).not.toBeNull(),
      { timeout: 4000, interval: 50 },
    );
    expect(Date.now() - t0).toBeLessThan(STOP_BOUND_MS);
    expect(unit.controller.signal.aborted).toBe(true);
    expect(unit.watcher.escalated).toBe(true);
    expect(await auditTypes({ eventType: 'ESCALATED' })).toHaveLength(1);
    expect(await auditTypes({ eventType: 'STOP_REQUESTED' })).toHaveLength(1);
    unit.watcher.stop();
  });

  it('an acknowledged unit is never escalated', async () => {
    const world = await makeWorld('w-noesc@example.com');
    const onEscalate = vi.fn();
    const unit = await startUnit(world, 'exec-noesc', { escalationMs: 600, onEscalate });
    unit.controller.signal.addEventListener('abort', () => void unit.watcher.acknowledge());
    const { triggerStop } = await import('@webaudit/api/safety');
    await triggerStop(db, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await unit.watcher.observed;
    await new Promise((r) => setTimeout(r, 1200));
    unit.watcher.stop();
    expect(onEscalate).not.toHaveBeenCalled();
    expect((await stopState('GRANT', world.grantId))?.escalatedAt).toBeNull();
  });

  it('escalation still kills the unit when its own audit write fails (the kill wins over bookkeeping)', async () => {
    const world = await makeWorld('w-escfail@example.com');
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === '$queryRaw') {
          return (query: { sql?: string; strings?: readonly string[] }, ...rest: unknown[]) => {
            const text = String(query?.sql ?? query?.strings?.join('') ?? '');
            if (text.includes('f07_mark_escalated'))
              return Promise.reject(new Error('database unreachable'));
            return (target.$queryRaw as unknown as (...a: unknown[]) => unknown)(query, ...rest);
          };
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const onEscalate = vi.fn();
    const controller = new AbortController();
    const errors: unknown[] = [];
    const watcher = startStopWatcher({
      db: failing as typeof db,
      identity: {
        executionId: 'exec-ef',
        grantId: world.grantId,
        targetId: world.targetId,
        userId: world.userId,
      },
      abortController: controller,
      pollIntervalMs: 100,
      escalationMs: 300,
      onEscalate,
      onError: (e) => errors.push(e),
    });
    const { triggerStop } = await import('@webaudit/api/safety');
    await triggerStop(db, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    await vi.waitFor(() => expect(onEscalate).toHaveBeenCalledTimes(1), {
      timeout: 4000,
      interval: 50,
    });
    expect(controller.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThanOrEqual(3), {
      timeout: 4000,
      interval: 50,
    });
    watcher.stop();
    expect((await stopState('GRANT', world.grantId))?.escalatedAt).toBeNull();
  });

  it('a watcher that cannot read the kill switch fails closed by aborting its unit', async () => {
    const world = await makeWorld('w-readfail@example.com');
    const broken = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === '$queryRaw') return () => Promise.reject(new Error('db down'));
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const controller = new AbortController();
    const watcher = startStopWatcher({
      db: broken as typeof db,
      identity: {
        executionId: 'x',
        grantId: world.grantId,
        targetId: world.targetId,
        userId: world.userId,
      },
      abortController: controller,
      pollIntervalMs: 100,
      onError: () => undefined,
    });
    await vi.waitFor(() => expect(controller.signal.aborted).toBe(true), {
      timeout: 3000,
      interval: 50,
    });
    watcher.stop();
  });
});

describe('T019c restart recovery', () => {
  it('a stop and a held lease survive a process restart and remain enforced and bounded', async () => {
    const world = await makeWorld('w-restart@example.com');
    const first = await startUnit(world, 'exec-rs');
    first.watcher.stop(); // the host process "dies": watcher state is gone
    const { triggerStop } = await import('@webaudit/api/safety');
    await triggerStop(db, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });

    // a brand-new process: fresh client, fresh watcher, no memory of anything
    const restarted = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    try {
      const controller = new AbortController();
      const watcher = startStopWatcher({
        db: restarted,
        identity: {
          executionId: 'exec-rs',
          grantId: world.grantId,
          targetId: world.targetId,
          userId: world.userId,
        },
        abortController: controller,
        pollIntervalMs: 100,
      });
      expect(await watcher.observed).toMatchObject({ scope: 'GRANT', state: 'REQUESTED' });
      expect(controller.signal.aborted).toBe(true);
      watcher.stop();

      // the dead host never acknowledges and never releases: the lease is not valid forever...
      expect(await reconcileStrandedStops(restarted, { ackGraceSeconds: 0 })).toMatchObject({
        acknowledged: 0,
        stopped: 0,
      });
      await restarted.$executeRaw`UPDATE "AdmissionLease" SET "expiresAt" = now() - interval '1 second'`;
      expect((await reclaimExpiredLeases(restarted)).reclaimed).toBe(1);
      // ...and the stranded stop then completes through the reconciler
      await reconcileStrandedStops(restarted, { ackGraceSeconds: 0 });
      await reconcileStrandedStops(restarted, { ackGraceSeconds: 0 });
      expect((await stopState('GRANT', world.grantId))?.state).toBe('STOPPED');
    } finally {
      await restarted.$disconnect();
    }
  });
});

describe('Redis accelerant (real Redis)', () => {
  it('a published stop wakes the watcher faster than its poll; a malformed message does nothing', async () => {
    const world = await makeWorld('w-redis@example.com');
    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6389/15';
    const sub = new Redis(url, { maxRetriesPerRequest: null });
    const pub = new Redis(url, { maxRetriesPerRequest: null });
    try {
      const granted = await requestAdmission(
        db,
        admissionRequest(world, { executionId: 'exec-redis', idempotencyKey: 'exec-redis' }),
      );
      expect(granted.outcome).toBe('GRANTED');
      const controller = new AbortController();
      let unsubscribed = false;
      const watcher = startStopWatcher({
        db,
        identity: {
          executionId: 'exec-redis',
          grantId: world.grantId,
          targetId: world.targetId,
          userId: world.userId,
        },
        abortController: controller,
        pollIntervalMs: 5000, // the poll alone could not meet this test's bound
        subscribe(channels, onMessage) {
          void sub.subscribe(...channels);
          sub.on('message', onMessage);
          return () => {
            unsubscribed = true;
            sub.off('message', onMessage);
          };
        },
      });
      await new Promise((r) => setTimeout(r, 300));
      // a message with no matching stop row must not abort anything
      await pub.publish(`safety:stop:grant:${world.grantId}`, '{not json');
      await new Promise((r) => setTimeout(r, 400));
      expect(controller.signal.aborted).toBe(false);

      const { triggerStop } = await import('@webaudit/api/safety');
      const stop = await triggerStop(db, {
        scope: 'GRANT',
        scopeId: world.grantId,
        triggeredBy: 'SYSTEM',
        reason: 'SYSTEM_SAFETY_POLICY',
      });
      const t0 = Date.now();
      await publishStopSignal(pub, stop, 'SYSTEM_SAFETY_POLICY');
      await watcher.observed;
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(controller.signal.aborted).toBe(true);
      watcher.stop();
      expect(unsubscribed).toBe(true);
    } finally {
      sub.disconnect();
      pub.disconnect();
    }
  });
});
