/**
 * SPEC 009 Result & Evidence platform — Artifact, Evidence and Finding materialization against real PostgreSQL
 * with an in-memory object store (no R2 credentials are available in this environment; the S3 adapter is covered by a
 * command-level stub test).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprintOf } from '@webaudit/scoring';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import {
  makeRuntimeWorld,
  makeUnit,
  uid,
  type RuntimeWorld,
} from '../../helpers/runtime-fixtures.js';
import { finalizeExecutionUnit } from '../../../src/services/execution-runtime/index.js';
import {
  ARTIFACT_LIMITS,
  ArtifactRefusedError,
  EvidenceRefusedError,
  INLINE_EVIDENCE_MAX_BYTES,
  MaterializeRefusedError,
  artifactKeyFor,
  assertArtifactKey,
  createArtifact,
  createMemoryArtifactStore,
  createR2ArtifactStore,
  enforceArtifactRetention,
  materializeFinding,
  reclaimOrphanedArtifacts,
  recordEvidence,
  scanCoverageSummary,
} from '../../../src/services/evidence/index.js';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

const HOUR = 3_600_000;
const bytes = (n: number, fill = 1): Uint8Array => new Uint8Array(n).fill(fill);

async function unitIn(w: RuntimeWorld, o: Parameters<typeof makeUnit>[1] = {}) {
  return makeUnit(w, { status: 'RUNNING', ...o });
}

const art = (w: RuntimeWorld, unitId: string, body: Uint8Array, contentType = 'image/png') => ({
  scanId: w.scanId,
  userId: w.userId,
  executionUnitId: unitId,
  contentType,
  body,
});

describe('artifact keys', () => {
  it('accepts the exact artifacts/<scan>/<unit>/<leaf> shape and refuses every manipulated key', () => {
    expect(assertArtifactKey('artifacts/scan1/unit1/' + 'a'.repeat(64))).toContain('artifacts/');
    for (const bad of [
      '',
      '../x',
      'artifacts/../../x/y/z',
      'artifacts/a/b',
      'artifacts/a/b/c/d',
      'uploads/u/' + 'a'.repeat(64),
      'scans/s/k',
      'artifacts/a//b12345678',
      'artifacts/a/b/..',
      'artifacts/a/b/%2e%2e%2e%2e%2e%2e%2e%2e',
      'artifacts/a b/c/' + 'a'.repeat(64),
    ]) {
      expect(() => assertArtifactKey(bad)).toThrow();
    }
    expect(() => artifactKeyFor('../s', 'u', 'a'.repeat(64))).toThrow();
  });
});

describe('createArtifact', () => {
  it('stores the object first, then the row; content-addressed and idempotent', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    const a = await createArtifact(testDb, store, art(w, u.id, bytes(100)));
    expect(a.storageKey).toMatch(new RegExp(`^artifacts/${w.scanId}/${u.id}/[a-f0-9]{64}$`));
    expect(store.objects.has(a.storageKey)).toBe(true);
    const row = (await testDb.artifact.findUnique({ where: { id: a.id } }))!;
    expect(row).toMatchObject({
      scanId: w.scanId,
      userId: w.userId,
      executionUnitId: u.id,
      sizeBytes: 100,
      retentionPolicyRef: 'report-retention-parity',
    });
    const again = await createArtifact(testDb, store, art(w, u.id, bytes(100)));
    expect(again.id).toBe(a.id);
    expect(await testDb.artifact.count({ where: { executionUnitId: u.id } })).toBe(1);
  });

  it('never lets the caller choose the scan: the unit must belong to this tenant and that scan', async () => {
    const w = await makeRuntimeWorld();
    const other = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    await expect(
      createArtifact(testDb, store, { ...art(w, u.id, bytes(5)), userId: other.userId }),
    ).rejects.toMatchObject({ reason: 'UNIT_NOT_FOUND' });
    await expect(
      createArtifact(testDb, store, { ...art(w, u.id, bytes(5)), scanId: other.scanId }),
    ).rejects.toMatchObject({ reason: 'UNIT_NOT_FOUND' });
    expect(store.objects.size).toBe(0);
  });

  it('refuses over-budget objects outright, touching neither store nor database', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    const limits = { maxObjectBytes: 1000, maxScanBytes: 2500 };
    await expect(
      createArtifact(testDb, store, art(w, u.id, bytes(1001)), limits),
    ).rejects.toMatchObject({ reason: 'OBJECT_BUDGET_EXCEEDED' });
    await createArtifact(testDb, store, art(w, u.id, bytes(1000, 1)), limits);
    await createArtifact(testDb, store, art(w, u.id, bytes(1000, 2)), limits);
    await expect(
      createArtifact(testDb, store, art(w, u.id, bytes(1000, 3)), limits),
    ).rejects.toMatchObject({ reason: 'SCAN_BUDGET_EXCEEDED' });
    expect(store.objects.size).toBe(2);
    expect(await testDb.artifact.count({ where: { scanId: w.scanId } })).toBe(2);
    await expect(
      createArtifact(
        testDb,
        store,
        { ...art(w, u.id, bytes(1)), contentType: 'not a type' },
        limits,
      ),
    ).rejects.toMatchObject({ reason: 'INVALID_ARTIFACT' });
  });

  it('cannot be pushed over the per-scan budget by concurrent writers, and leaves no orphan behind', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    const limits = { maxObjectBytes: 1000, maxScanBytes: 3000 };
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createArtifact(testDb, store, art(w, u.id, bytes(1000, i + 10)), limits),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(3);
    const sum = await testDb.artifact.aggregate({
      where: { scanId: w.scanId },
      _sum: { sizeBytes: true },
    });
    expect(sum._sum.sizeBytes).toBe(3000);
    // Every refused writer's uploaded object was removed again: store and table agree.
    expect(store.objects.size).toBe(3);
  });

  it('enforces the object cap on a stream without holding an unbounded body', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    let produced = 0;
    async function* endless(): AsyncGenerator<Uint8Array> {
      for (;;) {
        produced += 1;
        yield bytes(1024);
        if (produced > 10_000) throw new Error('stream was read past any sane bound');
      }
    }
    await expect(
      createArtifact(
        testDb,
        store,
        { ...art(w, u.id, bytes(0)), body: endless() },
        { maxObjectBytes: 8 * 1024, maxScanBytes: 1 << 30 },
      ),
    ).rejects.toBeInstanceOf(ArtifactRefusedError);
    expect(produced).toBeLessThan(20);
    async function* fine(): AsyncGenerator<Uint8Array> {
      yield bytes(10, 7);
      yield bytes(10, 8);
    }
    const ok = await createArtifact(testDb, store, { ...art(w, u.id, bytes(0)), body: fine() });
    expect(ok.sizeBytes).toBe(20);
  });
});

describe('reclaimOrphanedArtifacts (FR-035)', () => {
  it('deletes only unreferenced objects older than the grace period', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    const kept = await createArtifact(testDb, store, art(w, u.id, bytes(10, 1)));
    const orphanOld = artifactKeyFor(w.scanId, u.id, 'b'.repeat(64));
    const orphanNew = artifactKeyFor(w.scanId, u.id, 'c'.repeat(64));
    await store.put(orphanOld, bytes(5), 'image/png');
    await store.put(orphanNew, bytes(5), 'image/png');
    const longAgo = new Date(Date.now() - 3 * HOUR);
    store.backdate(orphanOld, longAgo);
    store.backdate(kept.storageKey, longAgo);
    const result = await reclaimOrphanedArtifacts(testDb, store);
    expect(result.reclaimed).toEqual([orphanOld]);
    expect(store.objects.has(kept.storageKey)).toBe(true);
    expect(store.objects.has(orphanNew)).toBe(true);
    expect((await reclaimOrphanedArtifacts(testDb, store)).reclaimed).toEqual([]);
  });
});

describe('enforceArtifactRetention (FR-034)', () => {
  it('removes the rows inside the caller transaction and detaches evidence; a rollback leaves everything intact', async () => {
    const w = await makeRuntimeWorld();
    const u = await unitIn(w);
    const store = createMemoryArtifactStore();
    const a = await createArtifact(testDb, store, art(w, u.id, bytes(10)));
    const ev = await testDb.evidence.create({
      data: { executionUnitId: u.id, kind: 'SCREENSHOT', artifactId: a.id },
    });

    await expect(
      testDb.$transaction(async (tx) => {
        await enforceArtifactRetention(tx, w.scanId);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await testDb.artifact.count({ where: { id: a.id } })).toBe(1);
    expect((await testDb.evidence.findUnique({ where: { id: ev.id } }))!.artifactId).toBe(a.id);

    const keys = await testDb.$transaction((tx) => enforceArtifactRetention(tx, w.scanId));
    expect(keys).toEqual([a.storageKey]);
    expect(await testDb.artifact.count({ where: { scanId: w.scanId } })).toBe(0);
    expect((await testDb.evidence.findUnique({ where: { id: ev.id } }))!.artifactId).toBeNull();
    // The caller deletes the objects after commit; a failure there is an orphan the reaper handles.
    for (const k of keys) await store.delete(k);
    expect(store.objects.size).toBe(0);
  });
});

describe('recordEvidence', () => {
  const SECRET = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';

  it('stores a small payload inline, unredacted for a passive class', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w, { cls: 'PASSIVE_HTTP', status: 'RUNNING' });
    const store = createMemoryArtifactStore();
    const ev = await recordEvidence(testDb, store, {
      executionUnitId: u.id,
      userId: w.userId,
      kind: 'HTTP_TRANSACTION',
      payload: { status: 500, path: '/x' },
    });
    expect(ev).toMatchObject({ inline: true, redacted: false, artifactId: null });
    const row = (await testDb.evidence.findUnique({ where: { id: ev.id } }))!;
    expect(row.inlinePayload).toEqual({ status: 500, path: '/x' });
    expect(store.objects.size).toBe(0);
  });

  it.each(['ACTIVE_SECURITY', 'AUTHENTICATED_WORKFLOW', 'SOURCE_EXECUTION'])(
    'redacts %s evidence before anything is written (no bypass exists)',
    async (cls) => {
      const w = await makeRuntimeWorld();
      const u = await unitIn(w, { cls });
      const store = createMemoryArtifactStore();
      const ev = await recordEvidence(testDb, store, {
        executionUnitId: u.id,
        userId: w.userId,
        kind: 'SECURITY_REPRODUCTION',
        payload: { note: `token ${SECRET} leaked` },
      });
      expect(ev.redacted).toBe(true);
      const row = (await testDb.evidence.findUnique({ where: { id: ev.id } }))!;
      expect(JSON.stringify(row.inlinePayload)).not.toContain(SECRET);
      // "redacted" records that the mechanism ran, even for a payload with nothing to redact.
      const clean = await recordEvidence(testDb, store, {
        executionUnitId: u.id,
        userId: w.userId,
        kind: 'SECURITY_REPRODUCTION',
        payload: { note: 'nothing secret' },
      });
      expect(clean.redacted).toBe(true);
    },
  );

  it('moves an oversized payload to an artifact on its own decision; the redacted classes redact first', async () => {
    const w = await makeRuntimeWorld();
    const store = createMemoryArtifactStore();
    const big = 'x'.repeat(INLINE_EVIDENCE_MAX_BYTES + 100);
    const plain = await makeUnit(w, { cls: 'PASSIVE_HTTP', status: 'RUNNING' });
    const a = await recordEvidence(testDb, store, {
      executionUnitId: plain.id,
      userId: w.userId,
      kind: 'HAR',
      payload: { big },
    });
    expect(a).toMatchObject({ inline: false, artifactId: expect.any(String) });
    expect((await testDb.evidence.findUnique({ where: { id: a.id } }))!.inlinePayload).toBeNull();

    const sec = await unitIn(w, { cls: 'ACTIVE_SECURITY' });
    const b = await recordEvidence(testDb, store, {
      executionUnitId: sec.id,
      userId: w.userId,
      kind: 'HAR',
      payload: { big, secret: SECRET },
    });
    expect(b.inline).toBe(false);
    const stored = [...store.objects.values()].map((o) => Buffer.from(o.body).toString('utf8'));
    expect(stored.some((s) => s.includes(SECRET))).toBe(false);
    expect(store.objects.size).toBe(2);
  });

  it('puts binary content in an artifact, refusing it for the redacted classes and without a content type', async () => {
    const w = await makeRuntimeWorld();
    const store = createMemoryArtifactStore();
    const browser = await unitIn(w);
    const ev = await recordEvidence(testDb, store, {
      executionUnitId: browser.id,
      userId: w.userId,
      kind: 'SCREENSHOT',
      payload: bytes(64, 9),
      contentType: 'image/png',
    });
    expect(ev.inline).toBe(false);
    await expect(
      recordEvidence(testDb, store, {
        executionUnitId: browser.id,
        userId: w.userId,
        kind: 'SCREENSHOT',
        payload: bytes(64),
      }),
    ).rejects.toBeInstanceOf(EvidenceRefusedError);
    const sec = await unitIn(w, { cls: 'ACTIVE_SECURITY' });
    await expect(
      recordEvidence(testDb, store, {
        executionUnitId: sec.id,
        userId: w.userId,
        kind: 'SCREENSHOT',
        payload: bytes(64),
        contentType: 'image/png',
      }),
    ).rejects.toMatchObject({ reason: 'BINARY_NOT_REDACTABLE' });
  });

  it('is tenant-scoped, refuses unserializable payloads, and does not fence terminal units (engines fence their own writes)', async () => {
    const w = await makeRuntimeWorld();
    const other = await makeRuntimeWorld();
    const store = createMemoryArtifactStore();
    const u = await unitIn(w);
    await expect(
      recordEvidence(testDb, store, {
        executionUnitId: u.id,
        userId: other.userId,
        kind: 'DEPENDENCY',
        payload: {},
      }),
    ).rejects.toMatchObject({ reason: 'UNIT_NOT_FOUND' });
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    await expect(
      recordEvidence(testDb, store, {
        executionUnitId: u.id,
        userId: w.userId,
        kind: 'DEPENDENCY',
        payload: circular,
      }),
    ).rejects.toMatchObject({ reason: 'UNSERIALIZABLE_PAYLOAD' });
    await expect(
      recordEvidence(testDb, store, {
        executionUnitId: u.id,
        userId: w.userId,
        kind: 'DEPENDENCY',
        payload: { n: 1n },
      }),
    ).rejects.toMatchObject({ reason: 'UNSERIALIZABLE_PAYLOAD' });
    await finalizeExecutionUnit(testDb, u.id, u.key, { kind: 'COMPLETED' });
    const late = await recordEvidence(testDb, store, {
      executionUnitId: u.id,
      userId: w.userId,
      kind: 'DEPENDENCY',
      payload: { after: 'terminal' },
    });
    expect(late.inline).toBe(true);
  });

  it('keeps evidence committed before a crash: it survives, independent of finalization', async () => {
    const w = await makeRuntimeWorld();
    const store = createMemoryArtifactStore();
    const u = await unitIn(w);
    const ev = await recordEvidence(testDb, store, {
      executionUnitId: u.id,
      userId: w.userId,
      kind: 'LOAD_METRICS',
      payload: { p95: 120 },
    });
    await finalizeExecutionUnit(testDb, u.id, u.key, {
      kind: 'FAILED',
      failureClass: 'ENGINE_DEFECT',
    });
    expect(await testDb.evidence.count({ where: { id: ev.id } })).toBe(1);
  });
});

describe('materializeFinding', () => {
  const finding = {
    severity: 'HIGH' as const,
    title: 'Open redirect',
    explanation: 'e',
    consequence: 'c',
    location: '/login',
    fixPrompt: 'fix it',
    fixable: true,
  };

  async function setup() {
    const w = await makeRuntimeWorld();
    const mr = await testDb.moduleResult.create({
      data: { scanId: w.scanId, module: 'SECURITY', state: 'COMPLETE', score: 70, summary: 's' },
    });
    const store = createMemoryArtifactStore();
    const u = await unitIn(w);
    const ev = await recordEvidence(testDb, store, {
      executionUnitId: u.id,
      userId: w.userId,
      kind: 'HTTP_TRANSACTION',
      payload: { a: 1 },
    });
    const ev2 = await recordEvidence(testDb, store, {
      executionUnitId: u.id,
      userId: w.userId,
      kind: 'HTTP_TRANSACTION',
      payload: { a: 2 },
    });
    return { w, mr, store, u, ev, ev2 };
  }

  const input = (
    s: Awaited<ReturnType<typeof setup>>,
    extra: Partial<Parameters<typeof materializeFinding>[1]> = {},
  ) => ({
    executionUnitId: s.u.id,
    userId: s.w.userId,
    module: 'SECURITY' as const,
    moduleResultId: s.mr.id,
    checkId: 'security.open-redirect',
    fingerprintParts: ['/login'],
    finding,
    supportingEvidenceIds: [s.ev.id, s.ev2.id],
    ...extra,
  });

  it('uses the existing fingerprint, always attributes MEASURED, and links every piece of evidence idempotently', async () => {
    const s = await setup();
    const r = await materializeFinding(testDb, input(s));
    expect(r.fingerprint).toBe(
      fingerprintOf({
        targetId: s.w.targetId,
        module: 'SECURITY',
        checkId: 'security.open-redirect',
        parts: ['/login'],
      }),
    );
    expect(r).toMatchObject({ created: true, linksCreated: 2 });
    const issue = (await testDb.issue.findUnique({ where: { id: r.issueId } }))!;
    expect(issue).toMatchObject({
      attribution: 'MEASURED',
      scanId: s.w.scanId,
      fingerprint: r.fingerprint,
      moduleResultId: s.mr.id,
    });
    const again = await materializeFinding(testDb, input(s));
    expect(again).toMatchObject({ issueId: r.issueId, created: false, linksCreated: 0 });
    expect(await testDb.issueEvidenceLink.count({ where: { issueId: r.issueId } })).toBe(2);
    expect(await testDb.issue.count({ where: { scanId: s.w.scanId } })).toBe(1);
  });

  it('supports many-to-many: one evidence row can back several findings', async () => {
    const s = await setup();
    const a = await materializeFinding(
      testDb,
      input(s, { fingerprintParts: ['/a'], supportingEvidenceIds: [s.ev.id] }),
    );
    const b = await materializeFinding(
      testDb,
      input(s, { fingerprintParts: ['/b'], supportingEvidenceIds: [s.ev.id] }),
    );
    expect(a.issueId).not.toBe(b.issueId);
    expect(await testDb.issueEvidenceLink.count({ where: { evidenceId: s.ev.id } })).toBe(2);
  });

  it('collapses concurrent materialization of the same finding into one issue', async () => {
    const s = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => materializeFinding(testDb, input(s))),
    );
    expect(new Set(results.map((r) => r.issueId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await testDb.issueEvidenceLink.count({ where: { issueId: results[0]!.issueId } })).toBe(
      2,
    );
  });

  it('refuses a unit of another tenant, a unit that never ran, a foreign module result, foreign evidence and an empty finding', async () => {
    const s = await setup();
    const other = await setup();
    await expect(
      materializeFinding(testDb, input(s, { userId: other.w.userId })),
    ).rejects.toMatchObject({ reason: 'UNIT_NOT_FOUND' });
    const idle = await makeUnit(s.w, { status: 'PLANNED' });
    await expect(
      materializeFinding(testDb, input(s, { executionUnitId: idle.id })),
    ).rejects.toMatchObject({ reason: 'UNIT_DID_NOT_RUN' });
    await expect(
      materializeFinding(testDb, input(s, { moduleResultId: other.mr.id })),
    ).rejects.toMatchObject({ reason: 'MODULE_RESULT_NOT_FOUND' });
    await expect(
      materializeFinding(testDb, input(s, { supportingEvidenceIds: [other.ev.id] })),
    ).rejects.toMatchObject({ reason: 'EVIDENCE_NOT_FOUND' });
    await expect(
      materializeFinding(testDb, input(s, { supportingEvidenceIds: [s.ev.id, 'ghost'] })),
    ).rejects.toMatchObject({ reason: 'EVIDENCE_NOT_FOUND' });
    await expect(
      materializeFinding(testDb, input(s, { finding: { ...finding, title: ' ' } })),
    ).rejects.toBeInstanceOf(MaterializeRefusedError);
    expect(await testDb.issue.count({ where: { scanId: s.w.scanId } })).toBe(0);
    expect(await testDb.issueEvidenceLink.count({ where: { evidenceId: s.ev.id } })).toBe(0);
  });

  it("keeps a COMPLETED unit's findings whatever its siblings did (FR-038)", async () => {
    const s = await setup();
    const sibling = await unitIn(s.w);
    await finalizeExecutionUnit(testDb, sibling.id, sibling.key, {
      kind: 'KILLED',
      f07Reason: 'OPERATOR_EMERGENCY_STOP',
    });
    await finalizeExecutionUnit(testDb, s.u.id, s.u.key, { kind: 'COMPLETED' });
    const r = await materializeFinding(testDb, input(s));
    expect(r.created).toBe(true);
  });
});

describe('scanCoverageSummary (FR-038/039)', () => {
  it('reports what ran, what did not and why — facts only, tenant-scoped', async () => {
    const w = await makeRuntimeWorld();
    const done = await unitIn(w);
    const killed = await unitIn(w);
    const refused = await makeUnit(w);
    await finalizeExecutionUnit(testDb, done.id, done.key, { kind: 'COMPLETED' });
    await finalizeExecutionUnit(testDb, killed.id, killed.key, {
      kind: 'KILLED',
      f07Reason: 'AUTHORIZATION_REVOKED',
    });
    await finalizeExecutionUnit(testDb, refused.id, refused.key, {
      kind: 'REFUSED',
      reason: 'SCAN_DEADLINE_EXPIRED',
    });
    const c = await scanCoverageSummary(testDb, w.planId, w.userId);
    expect(c.completedUnits.map((u) => u.id)).toEqual([done.id]);
    const byId = Object.fromEntries(c.nonCompletedUnits.map((n) => [n.unit.id, n]));
    expect(byId[killed.id]).toMatchObject({ status: 'KILLED', reason: 'AUTHORIZATION_REVOKED' });
    expect(byId[refused.id]).toMatchObject({ status: 'REFUSED', reason: 'SCAN_DEADLINE_EXPIRED' });
    expect(Object.keys(c).sort()).toEqual(['completedUnits', 'nonCompletedUnits']);
    const stranger = await makeRuntimeWorld();
    expect(await scanCoverageSummary(testDb, w.planId, stranger.userId)).toEqual({
      completedUnits: [],
      nonCompletedUnits: [],
    });
  });
});

describe('R2 adapter', () => {
  it('sends validated PUT/DELETE/LIST commands only for artifacts/ keys and pages listings', async () => {
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
    let page = 0;
    const client = {
      send: (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        if (cmd.constructor.name === 'ListObjectsV2Command') {
          page += 1;
          return Promise.resolve(
            page === 1
              ? {
                  Contents: [{ Key: 'artifacts/s/u/' + 'a'.repeat(64), LastModified: new Date() }],
                  IsTruncated: true,
                  NextContinuationToken: 'T',
                }
              : {
                  Contents: [{ Key: 'artifacts/s/u/' + 'b'.repeat(64), LastModified: new Date() }],
                  IsTruncated: false,
                },
          );
        }
        return Promise.resolve({});
      },
    };
    const store = createR2ArtifactStore(client as never, 'bucket');
    await store.put('artifacts/s/u/' + 'a'.repeat(64), bytes(3), 'image/png');
    await store.delete('artifacts/s/u/' + 'a'.repeat(64));
    expect((await store.list('artifacts/')).length).toBe(2);
    expect(sent.map((s) => s.name)).toEqual([
      'PutObjectCommand',
      'DeleteObjectCommand',
      'ListObjectsV2Command',
      'ListObjectsV2Command',
    ]);
    expect(sent[3]!.input['ContinuationToken']).toBe('T');
    await expect(store.put('../x', bytes(1), 'a/b')).rejects.toThrow();
    await expect(store.delete('scans/s/k')).rejects.toThrow();
    await expect(store.list('uploads/')).rejects.toThrow();
    expect(sent).toHaveLength(4);
    expect(ARTIFACT_LIMITS.maxObjectBytes).toBeLessThan(ARTIFACT_LIMITS.maxScanBytes);
    expect(uid('x')).toBeTruthy();
  });
});
