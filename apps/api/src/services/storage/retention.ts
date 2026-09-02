/**
 * T189 — report retention (FR-092).
 *
 * A completed scan's report is readable for `plan.retentionDays` past its
 * `completedAt`. This sweep runs the two states around that boundary:
 *
 *   1. **Warn** — a report whose removal is within `RETENTION_WARNING_LEAD_DAYS`
 *      and has not been warned (`retentionWarningSentAt` null) gets one email
 *      pointing at the export route (FR-093 is how it outlives retention).
 *   2. **Remove** — a report past its boundary has its findings, area results,
 *      verdict, and stored artifacts deleted, `reportRemovedAt` stamped, and its
 *      score/summary nulled. The `Scan` row itself survives so the
 *      credit-movement history still resolves it; the report route returns a
 *      "removed" response.
 *
 * **The retention window follows the user's *current* effective plan**, not a
 * plan snapshotted on the scan (there is no such column). A downgrade therefore
 * shortens retention for existing reports — a deliberate simplification,
 * recorded here: FR-080 says "the lapsed tier's retention period", and the
 * effective plan *is* the lapsed tier once a paid subscription ends.
 *
 * Scheduled as a maintenance repeatable job (`billing-sweeps.ts`); this is the
 * pure work, `deps` injected so a test needs no R2 and no real mail.
 */

import { RETENTION_WARNING_LEAD_DAYS } from '@webaudit/config';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { Mailer } from '../email/mailer.js';
import type { ReportStorage } from './reports.js';
import { resolveEffectivePlan } from '../billing/entitlements.js';

const DAY_MS = 86_400_000;

export interface RetentionDeps {
  readonly mailer: Mailer;
  /** `null` skips artifact deletion (dev with no R2). Rows are still removed. */
  readonly storage: ReportStorage | null;
  /** Base URL for the export link in the warning email. */
  readonly webUrl: string;
}

export interface RetentionResult {
  readonly warned: number;
  readonly removed: number;
}

async function retentionExpiryFor(
  db: PrismaClient,
  scan: { userId: string; completedAt: Date | null },
): Promise<Date | null> {
  if (scan.completedAt === null) return null;
  const plan = await resolveEffectivePlan(db, scan.userId);
  return new Date(scan.completedAt.getTime() + plan.retentionDays * DAY_MS);
}

export async function enforceRetention(
  db: PrismaClient,
  deps: RetentionDeps,
  now: Date = new Date(),
): Promise<RetentionResult> {
  const warnHorizon = new Date(now.getTime() + RETENTION_WARNING_LEAD_DAYS * DAY_MS);
  const webUrl = deps.webUrl.replace(/\/+$/, '');

  const candidates = await db.scan.findMany({
    where: { state: 'COMPLETED', completedAt: { not: null }, reportRemovedAt: null },
    select: {
      id: true,
      userId: true,
      completedAt: true,
      retentionWarningSentAt: true,
      target: { select: { displayName: true, canonicalValue: true } },
      user: { select: { email: true } },
    },
    orderBy: { completedAt: 'asc' },
    take: 500,
  });

  let warned = 0;
  let removed = 0;

  for (const scan of candidates) {
    const expiry = await retentionExpiryFor(db, scan);
    if (expiry === null) continue;

    if (expiry <= now) {
      await db.$transaction([
        db.issue.deleteMany({ where: { scanId: scan.id } }),
        db.moduleResult.deleteMany({ where: { scanId: scan.id } }),
        db.readinessVerdict.deleteMany({ where: { scanId: scan.id } }),
        db.scan.update({
          where: { id: scan.id },
          data: { reportRemovedAt: now, overallScore: null, summary: null },
        }),
      ]);
      if (deps.storage !== null) {
        try {
          await deps.storage.deleteScanObjects(scan.id);
        } catch (error) {
          console.warn(`[retention] could not delete artifacts for ${scan.id}:`, error);
        }
      }
      removed += 1;
      continue;
    }

    if (expiry <= warnHorizon && scan.retentionWarningSentAt === null) {
      await db.scan.update({
        where: { id: scan.id },
        data: { retentionWarningSentAt: now },
      });
      await deps.mailer.sendRetentionWarning(scan.user.email, {
        targetName: scan.target.displayName || scan.target.canonicalValue,
        removesAt: expiry,
        exportUrl: `${webUrl}/scans/${scan.id}/export`,
      });
      warned += 1;
    }
  }

  return { warned, removed };
}
