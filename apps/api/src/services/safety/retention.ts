/**
 * SPEC 008 FR-024 / Clarifications 2026-10-07 — `ExecutionAuditEvent` follows the
 * same retention policy and timing as report data: a tenant's events are kept for
 * that tenant's current effective plan's `retentionDays` (the same rule
 * `storage/retention.ts` applies to reports), measured from the event time.
 * Events no tenant owns any more (operator-scope stops, or whose tenant, target
 * and scan no longer exist) are kept for the longest plan retention.
 *
 * Deletion is done by `f07_purge_*` definer functions; no runtime role has
 * DELETE on the table, and the append-only trigger still forbids UPDATE.
 */

import { PLAN_TIERS } from '@webaudit/config';
import { Prisma } from '../../../prisma/generated/client/index.js';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { resolveEffectivePlan } from '../billing/entitlements.js';

const DAY_MS = 86_400_000;

export interface AuditPurgeResult {
  owners: number;
  purged: number;
  unownedPurged: number;
}

export async function purgeExpiredExecutionAudit(
  db: PrismaClient,
  now: Date = new Date(),
  options: { ownerLimit?: number } = {},
): Promise<AuditPurgeResult> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT public.f07_audit_owner_ids(${options.ownerLimit ?? 1000}::int) AS id`);
  let purged = 0;
  for (const { id } of rows) {
    const plan = await resolveEffectivePlan(db, id);
    const cutoff = new Date(now.getTime() - plan.retentionDays * DAY_MS);
    const result = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT public.f07_purge_execution_audit(${id}, ${cutoff}::timestamptz) AS n`);
    purged += Number(result[0]?.n ?? 0);
  }
  const longest = Math.max(...PLAN_TIERS.map((tier) => tier.retentionDays));
  const unownedCutoff = new Date(now.getTime() - longest * DAY_MS);
  const unowned = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT public.f07_purge_unowned_execution_audit(${unownedCutoff}::timestamptz) AS n`);
  return { owners: rows.length, purged, unownedPurged: Number(unowned[0]?.n ?? 0) };
}
