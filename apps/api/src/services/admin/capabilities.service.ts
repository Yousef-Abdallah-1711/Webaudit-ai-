/**
 * T207 — operator administration of the capability registry (FR-086):
 * list, enable/disable, and tier-restrict a capability. Deliberately does
 * NOT touch consumption — `registry.ts` (`CapabilityRegistry.build`) and
 * `snapshot.ts` (`resolveSnapshot`) already read `Capability.isEnabled` and
 * `CapabilityPlan` fresh on every registry build; this file is only the
 * write side an operator reaches through the admin API. See
 * `capability-enable.test.ts` (T204) for the proof that a write here reaches
 * the next scan with no deploy (SC-010).
 *
 * ─── The DELETE-vs-never-delete conflict, resolved ──────────────────────
 *
 * `contracts/http-api.md`'s Administration table lists
 * `DELETE /admin/capabilities/:id` with no further note. `reconcile.ts`'s own
 * module comment states, unconditionally, "a capability row is never
 * deleted" — because `CapabilityExecution.capability` has no cascade and
 * Principle VI needs the per-capability cost history it holds forever. The
 * actual migration confirms this is not just a design intention:
 * `CapabilityExecution_capabilityId_fkey` is `ON DELETE RESTRICT`
 * (20260823131524_init/migration.sql), so a hard delete of a capability that
 * has ever executed would fail at the database layer regardless of what
 * this file does.
 *
 * `reconcile.ts`'s statement is about *reconciliation* specifically — it is
 * explaining why a restart must not silently drop a row whose directory
 * disappeared. It is not a blanket claim that no admin action may ever
 * remove a row. Read literally, "a capability row is never deleted" is true
 * exactly when there is cost history to lose, which is precisely what the
 * FK already enforces.
 *
 * The resolution taken here is **(b) from the task brief**: `removeCapability`
 * checks for any `CapabilityExecution` row first and refuses with a named
 * error (`CapabilityHasHistoryError`, translated to 409 by the route) before
 * even attempting the delete — a capability with real cost history is never
 * a candidate for deletion, full stop, and the caller gets a clear reason
 * rather than a raw Postgres FK violation. A capability with zero recorded
 * executions (added by mistake, or added and never run) may be removed —
 * `CapabilityPlan` rows cascade with it (`onDelete: Cascade` on that side),
 * so no separate cleanup is needed. This keeps the documented endpoint real
 * rather than dead code, without ever letting an admin action erase cost
 * history reconcile.ts promises is permanent. The check-then-delete is not
 * atomic against a concurrent execution landing in between, so the `delete`
 * call is still wrapped to translate a late FK violation (Prisma P2003) into
 * the same 409, rather than a raw 500, as a defensive backstop.
 *
 * ─── CapabilityPlan (tier restriction): a real but partial gap ──────────
 *
 * `setCapabilityPlanRestrictions` below is genuine, working admin CRUD over
 * `CapabilityPlan` — and unlike a from-scratch feature, it plugs directly
 * into enforcement that already exists: `CapabilityRegistry.build` already
 * joins `plans: { select: { planId: true } }` into `restrictedToPlans`, and
 * `resolveSnapshot`'s `statusFor` already turns a non-empty, non-matching
 * `restrictedToPlans` into `BLOCKED_PLAN` (FR-026). So a restriction declared
 * here takes effect on the very next scan snapshot, the same way `isEnabled`
 * does — there is no separate enforcement gap at the snapshot layer.
 *
 * The real, honest gap is narrower than "nothing enforces this": nothing
 * outside the snapshot layer re-checks a `CapabilityPlan` restriction. If a
 * quote, an estimate, or any other code path reads capability lists by some
 * route other than `resolveSnapshot`, it would not see this restriction. As
 * of this task, `resolveSnapshot` is the only consumer that matters (it is
 * what the orchestrator and the quote both build from), so in practice the
 * restriction is enforced — but this file does not add, and must not add,
 * any *new* enforcement call site (e.g. `create-scan.ts`). That would be a
 * separate, larger, cross-cutting change nobody has asked for.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { recordAuditLog } from './audit-log.js';

export class CapabilityNotFoundError extends Error {
  override readonly name = 'CapabilityNotFoundError';
  constructor(readonly capabilityId: string) {
    super(`No such capability: ${capabilityId}.`);
  }
}

export class PlanNotFoundError extends Error {
  override readonly name = 'PlanNotFoundError';
  constructor(readonly planId: string) {
    super(`No such plan: ${planId}.`);
  }
}

/** See the module note above: refused, never silently ignored. */
export class CapabilityHasHistoryError extends Error {
  override readonly name = 'CapabilityHasHistoryError';
  constructor(
    readonly capabilityId: string,
    readonly executionCount: number,
  ) {
    super(
      `Capability ${capabilityId} has ${executionCount} recorded execution(s) and cannot be ` +
        'deleted — disable it instead. Cost history has no cascade (Principle VI) and is never removed.',
    );
  }
}

export interface AdminCapabilitySummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly module: string;
  readonly layer: string;
  readonly trust: string;
  readonly isEnabled: boolean;
  /** Plan ids this capability is restricted to. Empty means every plan (FR-026). */
  readonly restrictedToPlans: readonly string[];
  readonly estimatedTokens: number;
  readonly executionCount: number;
  readonly updatedAt: Date;
}

/** Enough detail for an operator console to act on (FR-086), not the full row. */
export async function listCapabilities(
  db: PrismaClient,
): Promise<readonly AdminCapabilitySummary[]> {
  const rows = await db.capability.findMany({
    orderBy: { id: 'asc' },
    include: {
      plans: { select: { planId: true } },
      _count: { select: { executions: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    module: row.module,
    layer: row.layer,
    trust: row.trust,
    isEnabled: row.isEnabled,
    restrictedToPlans: row.plans.map((p) => p.planId),
    estimatedTokens: row.estimatedTokens,
    executionCount: row._count.executions,
    updatedAt: row.updatedAt,
  }));
}

async function requireCapability(
  db: PrismaClient,
  capabilityId: string,
): Promise<{ readonly isEnabled: boolean }> {
  const row = await db.capability.findUnique({
    where: { id: capabilityId },
    select: { isEnabled: true },
  });
  if (row === null) throw new CapabilityNotFoundError(capabilityId);
  return row;
}

export interface SetCapabilityEnabledInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  readonly capabilityId: string;
  readonly isEnabled: boolean;
}

/**
 * Flips `Capability.isEnabled`. This is the entire mechanism SC-010 depends
 * on — see the module note and `capability-enable.test.ts`.
 */
export async function setCapabilityEnabled(
  db: PrismaClient,
  input: SetCapabilityEnabledInput,
): Promise<AdminCapabilitySummary> {
  const before = await requireCapability(db, input.capabilityId);

  await db.capability.update({
    where: { id: input.capabilityId },
    data: { isEnabled: input.isEnabled },
  });

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'capability.update',
    subjectType: 'Capability',
    subjectId: input.capabilityId,
    before: { isEnabled: before.isEnabled },
    after: { isEnabled: input.isEnabled },
  });

  const [summary] = await listCapabilities(db).then((rows) =>
    rows.filter((r) => r.id === input.capabilityId),
  );
  // requireCapability above already proved the row exists, and nothing here
  // can have removed it in between.
  return summary!;
}

export interface SetCapabilityPlanRestrictionsInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  readonly capabilityId: string;
  /**
   * The full, replacement set of plan ids this capability is restricted to.
   * Empty means "no restriction — every plan" (matches `restrictedToPlans`'s
   * existing meaning in registry.ts). This replaces the set rather than
   * adding/removing one at a time, so the operator's PATCH body is always a
   * complete, unambiguous statement of "this is what it's restricted to now".
   */
  readonly planIds: readonly string[];
}

/**
 * Refuses a nonexistent plan id — a pure read, no side effects. Exported so
 * a caller combining this mutation with another one in the same request
 * (`capabilities.routes.ts`'s combined PATCH) can validate every part of the
 * request BEFORE committing any part of it. `setCapabilityPlanRestrictions`
 * below still runs this same check itself, so it stays safe to call
 * directly too — this is belt-and-braces, not a relocation.
 */
export async function validatePlanIdsExist(
  db: PrismaClient,
  planIds: readonly string[],
): Promise<void> {
  const uniquePlanIds = [...new Set(planIds)];
  if (uniquePlanIds.length === 0) return;
  const found = await db.plan.findMany({
    where: { id: { in: uniquePlanIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((p) => p.id));
  const missing = uniquePlanIds.find((id) => !foundIds.has(id));
  if (missing !== undefined) throw new PlanNotFoundError(missing);
}

/**
 * Declares which plans a capability is restricted to (FR-026). This is
 * admin CRUD only — see the module note on what already enforces it and
 * what does not.
 */
export async function setCapabilityPlanRestrictions(
  db: PrismaClient,
  input: SetCapabilityPlanRestrictionsInput,
): Promise<AdminCapabilitySummary> {
  await requireCapability(db, input.capabilityId);
  await validatePlanIdsExist(db, input.planIds);
  const uniquePlanIds = [...new Set(input.planIds)];

  const before = await db.capabilityPlan.findMany({
    where: { capabilityId: input.capabilityId },
    select: { planId: true },
  });

  // Replace-the-set: delete what's there, then (re)create the declared set,
  // in one transaction so a reader never observes an empty intermediate
  // state (briefly "restricted to nobody" is not the same statement as
  // "restricted to no plans / everyone").
  await db.$transaction([
    db.capabilityPlan.deleteMany({ where: { capabilityId: input.capabilityId } }),
    ...(uniquePlanIds.length > 0
      ? [
          db.capabilityPlan.createMany({
            data: uniquePlanIds.map((planId) => ({ capabilityId: input.capabilityId, planId })),
          }),
        ]
      : []),
  ]);

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'capability.restrict',
    subjectType: 'Capability',
    subjectId: input.capabilityId,
    before: { restrictedToPlans: before.map((p) => p.planId).sort() },
    after: { restrictedToPlans: [...uniquePlanIds].sort() },
  });

  const [summary] = await listCapabilities(db).then((rows) =>
    rows.filter((r) => r.id === input.capabilityId),
  );
  return summary!;
}

export interface RemoveCapabilityResult {
  readonly capabilityId: string;
}

/**
 * Removes a capability row. See the module note above for why this is
 * refused whenever the row has any recorded execution history, and permitted
 * only for a row that has none. Always records an `AuditLogEntry` — an
 * operator action was taken (a refusal is still a decision worth a record)
 * regardless of whether the row ends up gone.
 */
export async function removeCapability(
  db: PrismaClient,
  input: { readonly operatorId: string; readonly capabilityId: string },
): Promise<RemoveCapabilityResult> {
  const row = await db.capability.findUnique({
    where: { id: input.capabilityId },
    include: { _count: { select: { executions: true } } },
  });
  if (row === null) throw new CapabilityNotFoundError(input.capabilityId);

  if (row._count.executions > 0) {
    await recordAuditLog(db, {
      actorId: input.operatorId,
      action: 'capability.delete_refused',
      subjectType: 'Capability',
      subjectId: input.capabilityId,
      before: { executionCount: row._count.executions },
    });
    throw new CapabilityHasHistoryError(input.capabilityId, row._count.executions);
  }

  try {
    await db.capability.delete({ where: { id: input.capabilityId } });
  } catch (error) {
    // Defensive backstop for the race the check-then-delete above cannot
    // close: an execution landing between the count and the delete would
    // surface here as Prisma's foreign-key-violation code instead of the
    // pre-check above.
    if (isForeignKeyViolation(error)) {
      const count = await db.capabilityExecution.count({
        where: { capabilityId: input.capabilityId },
      });
      await recordAuditLog(db, {
        actorId: input.operatorId,
        action: 'capability.delete_refused',
        subjectType: 'Capability',
        subjectId: input.capabilityId,
        before: { executionCount: count },
      });
      throw new CapabilityHasHistoryError(input.capabilityId, count);
    }
    throw error;
  }

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'capability.delete',
    subjectType: 'Capability',
    subjectId: input.capabilityId,
    before: { id: row.id, name: row.name },
  });

  return { capabilityId: input.capabilityId };
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}
