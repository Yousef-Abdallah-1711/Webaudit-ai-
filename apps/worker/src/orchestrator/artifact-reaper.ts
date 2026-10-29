/**
 * SPEC 009 FR-035 — the repeatable job that reclaims orphaned artifact objects (uploaded, but no `Artifact` row references
 * them after the grace period). Same `upsertJobScheduler` pattern as the other maintenance sweeps, so one worker runs it per
 * interval. With no object store configured (no R2 credentials) the handler is a documented no-op.
 */

import type { Queue } from 'bullmq';
import { reclaimOrphanedArtifacts, type ArtifactStore } from '@webaudit/api/evidence';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { JOB_NAMES } from '../queue/workers.js';

export const ARTIFACT_REAPER_JOB_NAME = JOB_NAMES.artifactReaper;

const DEFAULT_INTERVAL_MS = 3_600_000;

function intervalMs(): number {
  const raw = Number(process.env['ARTIFACT_REAPER_INTERVAL_MS']);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

export async function scheduleArtifactReaper(maintenanceQueue: Queue): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    'artifact-reaper',
    { every: intervalMs() },
    {
      name: ARTIFACT_REAPER_JOB_NAME,
      data: { kind: 'artifact-reaper' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export interface ArtifactReaperDeps {
  readonly db: PrismaClient;
  /** `null`: no R2 configured; the job does nothing. */
  readonly store: ArtifactStore | null;
  readonly graceMs?: number;
}

export function createArtifactReaperHandler(
  deps: ArtifactReaperDeps,
): () => Promise<{ scanned: number; reclaimed: number }> {
  return async function runArtifactReaper() {
    if (deps.store === null) return { scanned: 0, reclaimed: 0 };
    const r = await reclaimOrphanedArtifacts(
      deps.db,
      deps.store,
      deps.graceMs === undefined ? {} : { graceMs: deps.graceMs },
    );
    if (r.reclaimed.length > 0) {
      console.warn(
        `[artifact-reaper] reclaimed ${String(r.reclaimed.length)} orphaned object(s) of ${String(r.scanned)} scanned.`,
      );
    }
    return { scanned: r.scanned, reclaimed: r.reclaimed.length };
  };
}
