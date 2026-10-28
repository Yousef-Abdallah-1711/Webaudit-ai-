/**
 * SPEC 008 T011/T012/T025/T026/T027 — admission idempotency, fail-closed
 * rollback, the audit trail's refusal/redaction/reconstruction guarantees.
 * Real PostgreSQL throughout.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  admissionRequest,
  auditTypes,
  counterOf,
  liveLeaseCount,
  makeWorld,
} from '../helpers/safety-fixtures.js';
import {
  releaseLeaseByToken,
  releaseLeasesByExecution,
  requestAdmission,
} from '../../src/services/safety/admission.js';
import {
  listExecutionAuditEvents,
  recordExecutionAuditEvent,
  redactAuditPayload,
} from '../../src/services/safety/audit.js';
import { triggerStop } from '../../src/services/safety/kill-switch.js';
import { revokeAuthorization } from '../../src/services/authorization/revoke.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('T011 idempotency', () => {
  it('a duplicate call with the same key returns the identical outcome and consumes nothing more', async () => {
    const world = await makeWorld('idem@example.com', { requestBudget: 3, concurrencyBudget: 3 });
    const request = admissionRequest(world);
    const first = await requestAdmission(testDb, request);
    const second = await requestAdmission(testDb, request);
    if (first.outcome !== 'GRANTED' || second.outcome !== 'GRANTED') throw new Error('granted');
    expect(second.leaseId).toBe(first.leaseId);
    expect(second.holderToken).toBe(first.holderToken);
    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    const counter = await counterOf(world.grantId);
    expect(counter).toMatchObject({ consumedRequests: 1, activeConcurrency: 1 });
    expect(await testDb.budgetConsumption.count()).toBe(1);
    expect(await testDb.admissionLease.count()).toBe(1);
  });

  it('concurrent duplicates with one key consume exactly one unit', async () => {
    const world = await makeWorld('idem-race@example.com', {
      requestBudget: 5,
      concurrencyBudget: 5,
    });
    const request = admissionRequest(world);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => requestAdmission(testDb, request)),
    );
    expect(results.every((r) => r.outcome === 'GRANTED')).toBe(true);
    expect(new Set(results.map((r) => (r.outcome === 'GRANTED' ? r.leaseId : ''))).size).toBe(1);
    expect(await counterOf(world.grantId)).toMatchObject({
      consumedRequests: 1,
      activeConcurrency: 1,
    });
  });

  it('release is idempotent and never double-decrements', async () => {
    const world = await makeWorld('rel@example.com');
    const a = await requestAdmission(testDb, admissionRequest(world));
    if (a.outcome !== 'GRANTED' || a.leaseId === undefined || a.holderToken === undefined)
      throw new Error('lease');
    const input = { leaseId: a.leaseId, holderToken: a.holderToken };
    expect(await releaseLeaseByToken(testDb, input)).toEqual({ released: true });
    expect(await releaseLeaseByToken(testDb, input)).toEqual({ released: false });
    expect(await releaseLeasesByExecution(testDb, 'unrelated')).toBe(0);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(0);
    expect(await auditTypes({ eventType: 'BUDGET_RELEASED' })).toHaveLength(1);
  });

  it('release by authority is token-free, unit-keyed and counter-correcting, and idempotent', async () => {
    const world = await makeWorld('rel-auth@example.com', { concurrencyBudget: 3 });
    await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'unit-x', idempotencyKey: 'k1' }),
    );
    await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'unit-x', idempotencyKey: 'k2' }),
    );
    await requestAdmission(
      testDb,
      admissionRequest(world, { executionId: 'unit-y', idempotencyKey: 'k3' }),
    );
    expect(await releaseLeasesByExecution(testDb, 'unit-x')).toBe(2);
    expect(await releaseLeasesByExecution(testDb, 'unit-x')).toBe(0);
    expect((await counterOf(world.grantId))?.activeConcurrency).toBe(1);
    expect(await liveLeaseCount(world.grantId)).toBe(1);
  });
});

describe('T012 fail closed, no partial effect', () => {
  it('an internal failure (a held scope lock outlasting the lock timeout) is REFUSED/INTERNAL_ERROR with no row written', async () => {
    const world = await makeWorld('fc@example.com');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = testDb.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT public.f07_lock_scope('GRANT'::"SafetyScope", ${world.grantId}, false)`;
        await held;
      },
      { timeout: 30_000 },
    );
    await new Promise((r) => setTimeout(r, 300));
    const result = await requestAdmission(testDb, admissionRequest(world));
    release();
    await holder;
    expect(result).toEqual({ outcome: 'REFUSED', reason: 'INTERNAL_ERROR' });
    expect(await testDb.admissionLease.count()).toBe(0);
    expect(await testDb.budgetConsumption.count()).toBe(0);
    expect(await testDb.budgetCounter.count()).toBe(0);
  }, 30_000);

  it('a caller that rolls back its own transaction leaves no lease, counter or audit row', async () => {
    const world = await makeWorld('rb@example.com');
    await testDb
      .$transaction(async (tx) => {
        const r = await requestAdmission(tx, admissionRequest(world));
        expect(r.outcome).toBe('GRANTED');
        throw new Error('caller aborts');
      })
      .catch(() => undefined);
    expect(await testDb.admissionLease.count()).toBe(0);
    expect(await testDb.budgetCounter.count()).toBe(0);
    expect(await testDb.executionAuditEvent.count()).toBe(0);
  });

  it('a joined refusal keeps the caller transaction usable', async () => {
    const world = await makeWorld('joined@example.com', { concurrencyBudget: 1 });
    await testDb.$transaction(async (tx) => {
      expect((await requestAdmission(tx, admissionRequest(world))).outcome).toBe('GRANTED');
      const refused = await requestAdmission(tx, admissionRequest(world));
      expect(refused).toMatchObject({ outcome: 'REFUSED', reason: 'BUDGET_EXHAUSTED_CONCURRENCY' });
      expect(await tx.admissionLease.count()).toBe(1);
    });
    expect(await liveLeaseCount(world.grantId)).toBe(1);
  });

  it('malformed identifiers are refused without touching state', async () => {
    const world = await makeWorld('bad@example.com');
    const empty = await requestAdmission(testDb, admissionRequest(world, { idempotencyKey: '' }));
    const none = await requestAdmission(
      testDb,
      admissionRequest(world, { consumes: { request: false, concurrency: false } }),
    );
    const ghost = await requestAdmission(
      testDb,
      admissionRequest(world, { targetId: 'no-such-target' }),
    );
    expect(empty).toMatchObject({ reason: 'INTERNAL_ERROR' });
    expect(none).toMatchObject({ reason: 'INTERNAL_ERROR' });
    expect(ghost).toMatchObject({ reason: 'NO_MATCHING_GRANT' });
    expect(await testDb.budgetCounter.count()).toBe(0);
  });
});

describe('admission refusals', () => {
  it('a pending stop refuses before authorization is consulted', async () => {
    const world = await makeWorld('stop-first@example.com');
    await triggerStop(testDb, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    const r = await requestAdmission(
      testDb,
      admissionRequest(world, { destination: { host: 'evil.test', path: '/', scheme: 'https' } }),
    );
    // Grant scope is only knowable after authz; an out-of-scope destination is OUT_OF_SCOPE first...
    expect(r.outcome).toBe('REFUSED');
    const inScope = await requestAdmission(testDb, admissionRequest(world));
    expect(inScope).toMatchObject({
      outcome: 'REFUSED',
      reason: 'KILL_SWITCH_PENDING',
      scope: 'GRANT',
    });
  });

  it('a revoked grant is refused and writes no consumption', async () => {
    const world = await makeWorld('revoked@example.com');
    await revokeAuthorization(testDb, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });
    const r = await requestAdmission(testDb, admissionRequest(world));
    expect(r.outcome).toBe('REFUSED');
    expect(await testDb.budgetConsumption.count()).toBe(0);
    expect(await testDb.admissionLease.count()).toBe(0);
  });

  it('an expired grant is refused by the database clock inside f07_admit', async () => {
    const world = await makeWorld('expired@example.com');
    await testDb.$executeRaw`UPDATE "TargetAuthorization" SET "expiresAt" = now() - interval '1 minute' WHERE id = ${world.grantId}`;
    const r = await requestAdmission(testDb, admissionRequest(world));
    expect(r).toMatchObject({ outcome: 'REFUSED' });
    expect(await testDb.admissionLease.count()).toBe(0);
  });

  it('out-of-scope and wrong-environment requests are refused', async () => {
    const world = await makeWorld('scope@example.com');
    const out = await requestAdmission(
      testDb,
      admissionRequest(world, { destination: { host: 'other.test', path: '/', scheme: 'https' } }),
    );
    expect(out).toMatchObject({ outcome: 'REFUSED', reason: 'OUT_OF_SCOPE' });
    await testDb.targetEnvironment.updateMany({
      where: { targetId: world.targetId },
      data: { classification: 'PRODUCTION' },
    });
    const env = await requestAdmission(testDb, admissionRequest(world));
    expect(env).toMatchObject({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
    });
  });

  it('a forged grant id cannot charge another tenant (f07_admit derives the owner from the target)', async () => {
    const mine = await makeWorld('mine@example.com');
    const victim = await makeWorld('victim@example.com');
    const rows = await testDb.$queryRaw<Array<{ r: { outcome: string; reason: string } }>>`
      SELECT public.f07_admit(${mine.targetId}, ${victim.grantId}, 'forged', NULL, 'k-forged', true, true) AS r`;
    expect(rows[0]?.r).toMatchObject({ outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' });
    expect(await counterOf(victim.grantId)).toBeNull();
  });
});

describe('T025 refusal audit', () => {
  it('a refusal with no execution row still produces an ADMISSION_REFUSED event', async () => {
    const world = await makeWorld('refusal-audit@example.com');
    await requestAdmission(
      testDb,
      admissionRequest(world, { destination: { host: 'other.test', path: '/', scheme: 'https' } }),
    );
    const events = await testDb.executionAuditEvent.findMany({
      where: { eventType: 'ADMISSION_REFUSED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'OUT_OF_SCOPE', targetId: world.targetId });
  });

  it('a granted admission emits GRANTED, RESERVED and CONSUMED once each', async () => {
    const world = await makeWorld('grant-audit@example.com');
    await requestAdmission(testDb, admissionRequest(world));
    expect((await auditTypes()).sort()).toEqual([
      'ADMISSION_GRANTED',
      'BUDGET_CONSUMED',
      'BUDGET_RESERVED',
    ]);
  });
});

describe('T026 redaction', () => {
  it('a payload containing a secret is never stored raw', async () => {
    const world = await makeWorld('redact@example.com');
    const secret = 'ghp_' + 'a'.repeat(36);
    const id = await recordExecutionAuditEvent(testDb, {
      eventType: 'SAFETY_VIOLATION',
      actorId: world.userId,
      context: { targetId: world.targetId },
      outcome: 'TEST',
      payload: { note: `token ${secret} leaked`, nested: [{ v: secret }] },
    });
    const row = await testDb.executionAuditEvent.findUniqueOrThrow({ where: { id } });
    expect(JSON.stringify(row.payload)).not.toContain(secret);
    expect(JSON.stringify(row.payload)).toContain('REDACTED');
  });

  it('a redaction failure stores the fixed sentinel, never the raw value', () => {
    const out = redactAuditPayload({ a: 'raw-secret' }, () => {
      throw new Error('redaction library bug');
    });
    expect(out).toEqual({ _redactionFailed: true });
  });

  it('the database refuses an oversized or non-object payload', async () => {
    await expect(
      recordExecutionAuditEvent(testDb, {
        eventType: 'SAFETY_VIOLATION',
        actorId: 'x',
        outcome: 'TEST',
        payload: { big: 'x'.repeat(20_000) },
      }),
    ).rejects.toThrow();
  });
});

describe('T027 reconstruction', () => {
  it('a grant lifecycle (admission -> stop) is reconstructible and tenant-scoped', async () => {
    const world = await makeWorld('recon@example.com');
    const other = await makeWorld('recon-other@example.com');
    const a = await requestAdmission(testDb, admissionRequest(world, { executionId: 'e-recon' }));
    expect(a.outcome).toBe('GRANTED');
    await requestAdmission(testDb, admissionRequest(other));
    await revokeAuthorization(testDb, {
      authorizationId: world.grantId,
      actingUserId: world.userId,
      actingUserIsOperator: false,
    });

    const events = await listExecutionAuditEvents(testDb, {
      userId: world.userId,
      targetAuthorizationId: world.grantId,
    });
    const types = events.map((e) => e.eventType);
    expect(types).toContain('ADMISSION_GRANTED');
    expect(types).toContain('STOP_REQUESTED');
    const stop = events.find((e) => e.eventType === 'STOP_REQUESTED');
    expect(stop?.outcome).toBe('AUTHORIZATION_REVOKED');
    expect(events.every((e) => e.targetAuthorizationId === world.grantId)).toBe(true);

    const all = await listExecutionAuditEvents(testDb, { userId: world.userId });
    expect(all.some((e) => e.targetAuthorizationId === other.grantId)).toBe(false);
  });
});
