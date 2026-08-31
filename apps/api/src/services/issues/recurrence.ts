/**
 * T152 — recurrence: an issue that was verified fixed in an earlier audit and
 * has come back.
 *
 * FR-064: "reopen a previously resolved issue that recurs, and MUST retain
 * that it was previously verified." The Issue entity's own words: "a stable
 * identifier that survives re-auditing so the same problem is recognizable
 * across audits" — that identifier is the fingerprint (R3), and this function
 * is what does the recognising.
 *
 * **`Issue` is per-scan** (`@@unique([scanId, fingerprint])`), so a recurrence
 * is not one row changing state — it is a *new* row, in a later scan, whose
 * fingerprint matches a row in an earlier scan of the same target that reached
 * `RESOLVED` (or was itself already a reopened recurrence). That new row is
 * born `OPEN` like any finding; this pass re-labels it `REOPENED` and sets
 * `previouslyResolved` so the fixes board can say "this was green once" and the
 * readiness diff (FR-069) can name it as a regression.
 *
 * This is a birth-time classification, not a fix-loop transition — the
 * `ISSUE_STATE_TRANSITIONS` table in `@webaudit/types` governs what the user
 * and the re-check may do to an issue once it exists; deciding what state a
 * brand-new issue should start in is a separate concern and is done here, once,
 * right after the scan's issues are persisted.
 *
 * Runs in the worker after a scan's areas are all written — reached through
 * `@webaudit/api/issues`, the same package-subpath shape `@webaudit/api/credits`
 * and `@webaudit/api/control-gate` already use so `apps/worker` gets the
 * service without depending on `apps/api`'s routes.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';

export interface MarkRecurrencesResult {
  readonly reopened: number;
  /** The fingerprints re-labelled, for a caller that wants to log or diff them. */
  readonly fingerprints: readonly string[];
}

export async function markRecurrences(
  db: PrismaClient,
  input: { readonly scanId: string },
): Promise<MarkRecurrencesResult> {
  const scan = await db.scan.findUnique({
    where: { id: input.scanId },
    select: { id: true, targetId: true, createdAt: true },
  });
  if (scan === null) return { reopened: 0, fingerprints: [] };

  // Fingerprints proven fixed (or already recurring) in an earlier scan of the
  // same target. `previouslyResolved` catches an issue that was resolved then
  // reopened in an even earlier audit — it stays "previously verified".
  const priorlyVerified = await db.issue.findMany({
    where: {
      scan: {
        targetId: scan.targetId,
        id: { not: scan.id },
        createdAt: { lt: scan.createdAt },
      },
      OR: [{ state: 'RESOLVED' }, { previouslyResolved: true }],
    },
    select: { fingerprint: true },
    distinct: ['fingerprint'],
  });
  if (priorlyVerified.length === 0) return { reopened: 0, fingerprints: [] };

  const fingerprints = priorlyVerified.map((row) => row.fingerprint);

  const recurring = await db.issue.findMany({
    where: { scanId: scan.id, state: 'OPEN', fingerprint: { in: fingerprints } },
    select: { id: true, fingerprint: true },
  });
  if (recurring.length === 0) return { reopened: 0, fingerprints: [] };

  const now = new Date();
  await db.issue.updateMany({
    where: { id: { in: recurring.map((r) => r.id) } },
    data: { state: 'REOPENED', reopenedAt: now, previouslyResolved: true },
  });

  return { reopened: recurring.length, fingerprints: recurring.map((r) => r.fingerprint) };
}
