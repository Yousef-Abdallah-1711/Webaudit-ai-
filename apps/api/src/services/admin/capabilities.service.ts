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
 * ─── T254: deleting an INSTALLED row also removes its bundle from disk ──
 *
 * T253 gave `reconcile.ts`'s "disk is existence" half a way to write a new
 * directory (`installedRoot/<id>/`) outside of discovery finding it there
 * already. That exposed a real gap this same file's history check never
 * covered: a `trust: 'INSTALLED'` row with zero executions could be deleted
 * from the database while its bundle and manifest stayed on disk — and the
 * very next reconciliation (a routine boot, or the on-demand `reconcileNow`
 * every upload already triggers) would find that manifest, see no matching
 * database row, and silently `create` it again. An operator's delete of an
 * unreviewed, potentially-malicious uploaded capability must not be
 * reversible by a process restart.
 *
 * The fix removes `installedRoot/<capabilityId>/` from disk **before**
 * deleting the database row, not after: reconciliation reads "does this id
 * exist in the database" and "is this id's manifest on disk" independently,
 * so the dangerous window is the one where the database row is already gone
 * but the directory still exists — removing the directory first closes that
 * window instead of narrowing it. If the disk removal itself fails, the
 * database delete never runs and the capability is left fully intact (fail
 * closed) rather than half-deleted. `trust: 'VENDORED'` rows never take this
 * path — their directory lives under `packages/capabilities-vendored/`,
 * which this file has no business touching and reconcile.ts's own docs say
 * is never operator-removable.
 *
 * **A second, previously-latent race this same change makes worth closing
 * properly rather than tolerating.** Before T254, the check-then-delete's
 * only failure mode when a `CapabilityExecution` landed between the count
 * check and the `delete` was a caught FK violation translated to the same
 * 409 the up-front check gives — annoying, but harmless: nothing had
 * happened yet, so refusing after the fact left the row exactly as it was.
 * Once the pre-delete step can destroy a real bundle on disk, that is no
 * longer true: the same race would remove `installedRoot/<id>/` and *then*
 * discover (via the FK violation) that the row cannot actually be deleted —
 * leaving a capability whose cost history and `Capability` row survive, but
 * whose code is permanently gone and will never run again, appearing
 * `isEnabled: true` with no error surfaced anywhere. `removeCapability`
 * closes this by taking the same `lockCapability` `FOR UPDATE` lock the
 * other two mutations in this file already use, and re-counting executions
 * *after* acquiring it, before ever touching disk: Postgres requires a
 * `FOR KEY SHARE` lock on the referenced row for any `CapabilityExecution`
 * insert to satisfy the FK, which conflicts with `FOR UPDATE` — so once this
 * lock is held, no concurrent execution can land until the transaction
 * commits or rolls back. The recount is therefore authoritative for the
 * rest of the transaction, and disk removal only ever runs once that is
 * true. The disk removal happens *inside* the same transaction, strictly
 * before the row delete, so both "closes, not narrows" properties above
 * hold simultaneously rather than trading one race for the other.
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

import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { defaultInstalledRoot } from '../registry/boot.js';
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
  db: Pick<PrismaClient, 'capability'>,
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
  db: Pick<PrismaClient, 'capability'>,
  capabilityId: string,
): Promise<{ readonly isEnabled: boolean }> {
  const row = await db.capability.findUnique({
    where: { id: capabilityId },
    select: { isEnabled: true },
  });
  if (row === null) throw new CapabilityNotFoundError(capabilityId);
  return row;
}

/**
 * Locks the `Capability` row `FOR UPDATE` inside `tx` — the transaction the
 * caller is already in — and throws if it does not exist. Both mutations
 * below take this lock before their own `before` read, closing the same
 * class of audit-log race `users.service.ts`'s `updateUser` closed: without
 * it, two concurrent PATCHes on the same capability both read the row's
 * state before either commits.
 */
async function lockCapability(
  tx: Pick<PrismaClient, '$queryRaw'>,
  capabilityId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Capability" WHERE id = ${capabilityId} FOR UPDATE
  `;
  if (locked.length === 0) throw new CapabilityNotFoundError(capabilityId);
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
  return db.$transaction(async (tx) => {
    await lockCapability(tx, input.capabilityId);
    const before = await requireCapability(tx, input.capabilityId);

    await tx.capability.update({
      where: { id: input.capabilityId },
      data: { isEnabled: input.isEnabled },
    });

    await recordAuditLog(tx, {
      actorId: input.operatorId,
      action: 'capability.update',
      subjectType: 'Capability',
      subjectId: input.capabilityId,
      before: { isEnabled: before.isEnabled },
      after: { isEnabled: input.isEnabled },
    });

    const [summary] = await listCapabilities(tx).then((rows) =>
      rows.filter((r) => r.id === input.capabilityId),
    );
    // lockCapability above already proved the row exists, and nothing here
    // can have removed it in between.
    return summary!;
  });
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
  db: Pick<PrismaClient, 'plan'>,
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
/**
 * Everything below — the capability lock, the `before` read, the
 * replace-the-set write, and the audit log — runs inside one transaction.
 * Without the lock, two concurrent PATCHes on the same capability's
 * restrictions don't just produce a misleading audit entry (the class of
 * race `users.service.ts`'s `updateUser` fixed) — their `deleteMany`s and
 * `createMany`s can genuinely interleave and delete rows out from under
 * each other, leaving the actual `CapabilityPlan` state matching neither
 * caller's request.
 */
export async function setCapabilityPlanRestrictions(
  db: PrismaClient,
  input: SetCapabilityPlanRestrictionsInput,
): Promise<AdminCapabilitySummary> {
  return db.$transaction(async (tx) => {
    await lockCapability(tx, input.capabilityId);
    await validatePlanIdsExist(tx, input.planIds);
    const uniquePlanIds = [...new Set(input.planIds)];

    const before = await tx.capabilityPlan.findMany({
      where: { capabilityId: input.capabilityId },
      select: { planId: true },
    });

    // Replace-the-set: delete what's there, then (re)create the declared
    // set. Both statements run inside the same transaction and under the
    // capability's own row lock, so no concurrent caller can observe an
    // empty intermediate state or interleave with this replace.
    await tx.capabilityPlan.deleteMany({ where: { capabilityId: input.capabilityId } });
    if (uniquePlanIds.length > 0) {
      await tx.capabilityPlan.createMany({
        data: uniquePlanIds.map((planId) => ({ capabilityId: input.capabilityId, planId })),
      });
    }

    await recordAuditLog(tx, {
      actorId: input.operatorId,
      action: 'capability.restrict',
      subjectType: 'Capability',
      subjectId: input.capabilityId,
      before: { restrictedToPlans: before.map((p) => p.planId).sort() },
      after: { restrictedToPlans: [...uniquePlanIds].sort() },
    });

    const [summary] = await listCapabilities(tx).then((rows) =>
      rows.filter((r) => r.id === input.capabilityId),
    );
    return summary!;
  });
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
 *
 * T254 — for a `trust: 'INSTALLED'` row, this also removes
 * `installedRoot/<capabilityId>/` from disk, strictly before the database
 * delete (see the module note's "T254" section for why the order matters):
 * otherwise the next reconciliation finds the manifest still on disk with no
 * matching row and resurrects it. The up-front `_count.executions` check
 * below is a fast, unlocked rejection for the common case (avoids taking a
 * row lock at all when the answer is an obvious no); the real decision for
 * an actual deletion is made *inside* the locked transaction that follows,
 * which re-counts under `FOR UPDATE` before doing anything irreversible —
 * see the module note's second T254 paragraph for why the recount, not just
 * the disk-then-database ordering, is what actually closes the race.
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
    await db.$transaction(async (tx) => {
      await lockCapability(tx, input.capabilityId);

      // Authoritative recount, taken under the lock above. Nothing else can
      // insert a `CapabilityExecution` referencing this id while this
      // transaction holds `FOR UPDATE` on the row (Postgres requires a
      // `FOR KEY SHARE` lock on the referenced row to satisfy the FK, which
      // conflicts with `FOR UPDATE`) — so once this passes, it stays true
      // for the rest of this transaction, including the disk removal below.
      const executionCount = await tx.capabilityExecution.count({
        where: { capabilityId: input.capabilityId },
      });
      if (executionCount > 0) {
        throw new CapabilityHasHistoryError(input.capabilityId, executionCount);
      }

      if (row.trust === 'INSTALLED') {
        await rm(path.join(defaultInstalledRoot(), input.capabilityId), {
          recursive: true,
          force: true,
        });
      }

      await tx.capability.delete({ where: { id: input.capabilityId } });

      await recordAuditLog(tx, {
        actorId: input.operatorId,
        action: 'capability.delete',
        subjectType: 'Capability',
        subjectId: input.capabilityId,
        before: { id: row.id, name: row.name },
      });
    });
  } catch (error) {
    if (error instanceof CapabilityHasHistoryError) {
      await recordAuditLog(db, {
        actorId: input.operatorId,
        action: 'capability.delete_refused',
        subjectType: 'Capability',
        subjectId: input.capabilityId,
        before: { executionCount: error.executionCount },
      });
      throw error;
    }
    // Defensive backstop only: with the recount above taken under the same
    // lock a concurrent insert would need, this should be unreachable in
    // practice. Kept because a raw Postgres FK violation surfacing as a 500
    // would be a worse failure mode than this 409 if some future change
    // ever lets a write past the lock above.
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
