/**
 * Artifact write path, orphan reclamation and retention (artifact-contract.md, FR-032..035).
 *
 * Ordering rule (R8): the object is stored BEFORE the row exists, so a row never points at a missing object. The one
 * direction that can still diverge (upload succeeded, insert failed) is closed by `reclaimOrphanedArtifacts`.
 * Budgets are refused outright — nothing is truncated — and the per-scan sum is re-checked under a per-scan advisory
 * lock in the insert transaction, so concurrent writers cannot jointly exceed it.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../../../prisma/generated/client/index.js';
import { inTransaction, type SafetyDb } from '../safety/db.js';
import { artifactKeyFor, assertArtifactKey, type ArtifactStore } from './store.js';

/** Fixed budgets (FR-033). Technical defaults chosen at implementation time (R7); not a pricing or retention policy. */
export const ARTIFACT_LIMITS = {
  maxObjectBytes: 50 * 1024 * 1024,
  maxScanBytes: 500 * 1024 * 1024,
  /** An orphan must be this old before it is deleted, so an in-flight upload is never reaped. */
  orphanGraceMs: 60 * 60 * 1000,
} as const;

export type ArtifactRefusal =
  'OBJECT_BUDGET_EXCEEDED' | 'SCAN_BUDGET_EXCEEDED' | 'INVALID_ARTIFACT' | 'UNIT_NOT_FOUND';

export class ArtifactRefusedError extends Error {
  constructor(readonly reason: ArtifactRefusal) {
    super(reason);
    this.name = 'ArtifactRefusedError';
  }
}

export type ArtifactBody = Uint8Array | AsyncIterable<Uint8Array>;

/** Collects a body while enforcing the per-object cap, so an unbounded stream is rejected without being held. */
export async function boundedBytes(body: ArtifactBody, maxBytes: number): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) throw new ArtifactRefusedError('OBJECT_BUDGET_EXCEEDED');
    return body;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new ArtifactRefusedError('OBJECT_BUDGET_EXCEEDED');
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export interface CreatedArtifact {
  id: string;
  storageKey: string;
  sizeBytes: number;
}

const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,100}$/i;

export async function createArtifact(
  db: SafetyDb,
  store: ArtifactStore,
  input: {
    scanId: string;
    userId: string;
    executionUnitId: string;
    contentType: string;
    body: ArtifactBody;
  },
  limits: Pick<typeof ARTIFACT_LIMITS, 'maxObjectBytes' | 'maxScanBytes'> = ARTIFACT_LIMITS,
): Promise<CreatedArtifact> {
  if (!CONTENT_TYPE.test(input.contentType)) throw new ArtifactRefusedError('INVALID_ARTIFACT');
  // The unit must belong to this tenant, and the scan id must be the one its plan belongs to (never trusted from the caller).
  const owner = await db.executionUnit.findFirst({
    where: { id: input.executionUnitId, userId: input.userId },
    select: { scanPlan: { select: { scanId: true } } },
  });
  if (owner === null || owner.scanPlan.scanId !== input.scanId)
    throw new ArtifactRefusedError('UNIT_NOT_FOUND');

  const bytes = await boundedBytes(input.body, limits.maxObjectBytes);
  const sizeBytes = bytes.byteLength;
  const used = await scanBytes(db, input.scanId);
  if (used + sizeBytes > limits.maxScanBytes)
    throw new ArtifactRefusedError('SCAN_BUDGET_EXCEEDED');

  // Content-addressed where the content is hashable (R8); a fresh random leaf would also be legal.
  const leaf = createHash('sha256').update(bytes).digest('hex');
  const storageKey = artifactKeyFor(input.scanId, input.executionUnitId, leaf);
  await store.put(storageKey, bytes, input.contentType); // 1. object first (R8)

  try {
    return await inTransaction(db, async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`artifact-scan:${input.scanId}`}))`,
      );
      // Authoritative re-check under the lock: concurrent writers cannot jointly exceed the per-scan budget.
      if ((await scanBytes(tx, input.scanId)) + sizeBytes > limits.maxScanBytes) {
        throw new ArtifactRefusedError('SCAN_BUDGET_EXCEEDED');
      }
      const existing = await tx.artifact.findUnique({
        where: { storageKey },
        select: { id: true, sizeBytes: true },
      });
      if (existing !== null) return { id: existing.id, storageKey, sizeBytes: existing.sizeBytes }; // same content, same key
      const row = await tx.artifact.create({
        data: {
          scanId: input.scanId,
          userId: input.userId,
          executionUnitId: input.executionUnitId,
          storageKey,
          contentType: input.contentType,
          sizeBytes,
        },
      });
      return { id: row.id, storageKey, sizeBytes };
    });
  } catch (error) {
    // The object is orphaned if no row references it; remove it now when it is certainly ours to remove.
    if (
      error instanceof ArtifactRefusedError &&
      (await db.artifact.findUnique({ where: { storageKey }, select: { id: true } })) === null
    ) {
      await store.delete(storageKey).catch(() => undefined);
    }
    throw error; // a failed insert is a failed attempt; the reaper handles any leftover (step 5)
  }
}

async function scanBytes(db: SafetyDb, scanId: string): Promise<number> {
  const sum = await db.artifact.aggregate({ where: { scanId }, _sum: { sizeBytes: true } });
  return sum._sum.sizeBytes ?? 0;
}

/**
 * FR-035: delete objects under `artifacts/` older than the grace period that no `Artifact` row references.
 * Rule 1 makes that safe to assume: this module is the only writer under the prefix.
 */
export async function reclaimOrphanedArtifacts(
  db: SafetyDb,
  store: ArtifactStore,
  options: { now?: Date; graceMs?: number } = {},
): Promise<{ scanned: number; reclaimed: string[] }> {
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - (options.graceMs ?? ARTIFACT_LIMITS.orphanGraceMs);
  const objects = await store.list('artifacts/');
  const old = objects.filter((o) => o.lastModified.getTime() < cutoff);
  if (old.length === 0) return { scanned: objects.length, reclaimed: [] };
  const referenced = new Set(
    (
      await db.artifact.findMany({
        where: { storageKey: { in: old.map((o) => o.key) } },
        select: { storageKey: true },
      })
    ).map((r) => r.storageKey),
  );
  const reclaimed: string[] = [];
  for (const o of old) {
    if (referenced.has(o.key)) continue;
    assertArtifactKey(o.key);
    await store.delete(o.key);
    reclaimed.push(o.key);
  }
  return { scanned: objects.length, reclaimed };
}

/**
 * FR-034: remove a scan's Artifact rows in the SAME transaction the retention sweep already uses for that scan's
 * report data. Returns the object keys; the caller deletes them from the store after the commit (a failed delete
 * leaves an orphan the reaper reclaims, never a row pointing at a deleted object).
 */
export async function enforceArtifactRetention(tx: SafetyDb, scanId: string): Promise<string[]> {
  const rows = await tx.artifact.findMany({
    where: { scanId },
    select: { storageKey: true, id: true },
  });
  if (rows.length === 0) return [];
  await tx.evidence.updateMany({
    where: { artifactId: { in: rows.map((r) => r.id) } },
    data: { artifactId: null },
  });
  await tx.artifact.deleteMany({ where: { scanId } });
  return rows.map((r) => r.storageKey);
}

export function newArtifactLeaf(): string {
  return randomBytes(16).toString('hex');
}
