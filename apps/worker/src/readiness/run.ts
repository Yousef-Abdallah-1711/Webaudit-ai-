/**
 * T162 — the readiness finalization pipeline.
 *
 * FR-067: "audit every area fresh during a readiness pass, and MUST NOT reuse
 * earlier results." That guarantee is kept by *construction*, not by anything
 * in this file: a `READINESS` scan is an ordinary `Scan` that runs the same
 * orchestrator phase pipeline as an `INITIAL` one — `runModule` measures every
 * area from scratch, `persistModuleResult` upserts on `(scanId, module)` scoped
 * to the *readiness* scan's id, so a baseline `ModuleResult` is never read,
 * copied, or touched during the audit.
 *
 * This file is what runs *after* that fresh audit completes: it reads both
 * sides (the baseline only for comparison, FR-068), computes the fingerprint
 * diff (`diff.ts`, T163) and the go/no-go verdict (`verdict.ts`, T164), and
 * writes the single `ReadinessVerdict` row. The orchestrator calls it from the
 * `RUNNING_DOCS` phase when `scan.kind === 'READINESS'`.
 *
 * The certificate (FR-072) and the congratulations email (T166) are *not* done
 * here — they need the R2 client and the mailer, both of which live in
 * `apps/api`. They are generated lazily by `GET /scans/:id/readiness` on the
 * first read of a *go* verdict (`readiness.routes.ts`).
 */

import type { Prisma, PrismaClient } from '@webaudit/api/prisma-client';
import { diffAgainstBaseline, type ReadinessSnapshot } from './diff.js';
import { computeVerdict } from './verdict.js';

async function snapshotOf(db: PrismaClient, scanId: string): Promise<ReadinessSnapshot> {
  const [areas, issues] = await Promise.all([
    db.moduleResult.findMany({
      where: { scanId },
      select: { module: true, state: true, score: true, degradedReason: true },
    }),
    db.issue.findMany({
      where: { scanId },
      select: { fingerprint: true, severity: true, title: true, state: true },
    }),
  ]);
  return { areas, issues };
}

export interface FinalizeReadinessResult {
  readonly verdictId: string;
  readonly isReady: boolean;
  readonly overallScore: number;
  readonly baselineScore: number;
  readonly blockers: readonly string[];
}

/**
 * Compute and persist the readiness verdict for a completed readiness scan.
 * Idempotent — a re-run (a retried DOCS phase) upserts the same row.
 */
export async function finalizeReadiness(
  db: PrismaClient,
  scanId: string,
): Promise<FinalizeReadinessResult | null> {
  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: { id: true, kind: true, baselineScanId: true },
  });
  if (scan === null || scan.kind !== 'READINESS' || scan.baselineScanId === null) return null;

  const [fresh, baseline, baselineScan] = await Promise.all([
    snapshotOf(db, scanId),
    snapshotOf(db, scan.baselineScanId),
    db.scan.findUnique({
      where: { id: scan.baselineScanId },
      select: { overallScore: true },
    }),
  ]);

  const diff = diffAgainstBaseline(baseline, fresh);
  const verdict = computeVerdict({ freshAreas: fresh.areas, regressions: diff.regressions });

  // Merge the FR-068 direction/size into each module outcome so one Json column
  // carries both "did it pass its threshold" (FR-071) and "which way and how
  // far did it move" (FR-068).
  const changeByModule = new Map(diff.areaChanges.map((c) => [c.module, c]));
  const moduleOutcomes = verdict.moduleOutcomes.map((outcome) => {
    const change = changeByModule.get(outcome.module);
    return {
      ...outcome,
      baselineScore: change?.baselineScore ?? null,
      delta: change?.delta ?? null,
      direction: change?.direction ?? 'incomparable',
    };
  });

  const baselineScore = baselineScan?.overallScore ?? verdict.overallScore;

  const row = {
    baselineScanId: scan.baselineScanId,
    isReady: verdict.isReady,
    overallScore: verdict.overallScore,
    baselineScore,
    // Plain arrays of JSON-serialisable objects; Prisma's `InputJsonValue` is
    // structurally narrower than the inferred shape even though every value here
    // is JSON — the same bridge `attempts.ts` makes.
    moduleOutcomes: moduleOutcomes as unknown as Prisma.InputJsonValue,
    regressions: diff.regressions as unknown as Prisma.InputJsonValue,
    improvements: diff.improvements as unknown as Prisma.InputJsonValue,
    blockers: [...verdict.blockers],
  };

  const saved = await db.readinessVerdict.upsert({
    where: { scanId },
    create: { scanId, ...row },
    update: row,
    select: { id: true },
  });

  return {
    verdictId: saved.id,
    isReady: verdict.isReady,
    overallScore: verdict.overallScore,
    baselineScore,
    blockers: verdict.blockers,
  };
}
