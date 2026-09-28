/**
 * Phase 3 (master plan) — an operator assigns a plan/tier to a user without
 * payment, through the same `Subscription`/entitlement architecture a real
 * paid subscription uses (`billing/subscription.service.ts`'s `subscribe`) —
 * not a parallel bypass. Frozen lifecycle semantics, read from source before
 * writing this file (`entitlements.ts`, `subscription.service.ts`,
 * `billing/index.ts`'s `renewDueSubscriptions`, the `Subscription` Prisma
 * model):
 *
 * - **One row per user, upserted by `userId`** — identical to `subscribe()`'s
 *   own upsert, because `Subscription.userId` is `@unique` (one active
 *   subscription per user, full stop). This is the single canonical
 *   entitlement path `resolveEffectivePlan` reads; nothing here adds a
 *   second one.
 * - **`status: 'ACTIVE'`, `adminAssigned: true`.** `resolveEffectivePlan`'s
 *   `ownsPeriod` check grants the plan for as long as `status === 'ACTIVE'`,
 *   *regardless of `periodEnd`* — so an admin-assigned plan is in effect
 *   immediately and stays in effect until an operator changes it, with no
 *   dependency on `periodEnd` ever being reached or not.
 * - **Never grants a credit lot.** Credit granting is a distinct, already-
 *   built capability (`services/credits/adjust.ts`) an operator calls
 *   separately. Reusing `subscribe()` verbatim was rejected specifically
 *   because it unconditionally grants `plan.monthlyCredits` — conflating
 *   "assign a plan" with "grant credits" would be exactly the kind of second,
 *   parallel financial mutation path the frozen decisions forbid.
 * - **A REAL, PREVIOUSLY-UNGUARDED INTERACTION FOUND WHILE VERIFYING THIS**:
 *   `renewDueSubscriptions` (`billing/index.ts`) sweeps every `Subscription`
 *   with `status IN (ACTIVE, PAST_DUE)` and `periodEnd <= now`, calling
 *   `renewSubscription` — which unconditionally grants a fresh
 *   `plan.monthlyCredits` lot on every renewal. Before this file, that query
 *   had no way to distinguish a real (or dev-stubbed) subscription from an
 *   admin-assigned one: an admin-assigned `pro` subscription whose
 *   `periodEnd` ever passed would have been silently "renewed" by the
 *   billing sweep every cycle thereafter, re-granting `pro`'s monthly
 *   credits for free, indefinitely, with no payment ever involved.
 *   `externalSubscriptionId` was considered as the distinguishing signal and
 *   rejected — both the dev/test stub path and even a real Paymob webhook
 *   can leave it `null` on a genuinely payment-backed subscription. Fixed
 *   properly with a new, explicit, additive column instead:
 *   `Subscription.adminAssigned` (migration `20260923000000_subscription_admin_assigned`).
 *   `renewDueSubscriptions` filters `adminAssigned: false`; `subscribe()`
 *   always writes `adminAssigned: false` so a real subscription can never be
 *   silently excluded, and always clears a stale admin assignment on the same
 *   row (see the next point).
 * - **A real Paymob subscription later supersedes this cleanly, with zero
 *   migration.** `subscribe()` upserts the exact same row by `userId`; the
 *   moment a user pays for real, `adminAssigned` is written back to `false`
 *   and the billing sweep correctly picks the row up for auto-renewal from
 *   then on.
 * - **Revert to free**: sets `status: 'EXPIRED'`. `resolveEffectivePlan`'s
 *   `ownsPeriod` check does not grant `EXPIRED`, so the user falls back to
 *   `free` immediately — the exact same status a real subscription lapses to
 *   when it is not renewed, not a new invented state.
 * - **Audited**: every assignment/revert writes one `AuditLogEntry` in the
 *   same `$transaction` as the `Subscription` mutation, mirroring
 *   `adjust.ts`'s and `users.service.ts`'s own pattern exactly.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { recordAuditLog } from './audit-log.js';
import { getUser, UserNotFoundError, type AdminUserDetail } from './users.service.js';

export class PlanNotAssignableError extends Error {
  override readonly name = 'PlanNotAssignableError';
  constructor(readonly planId: string) {
    super(`No such active plan: ${planId}.`);
  }
}

export class InvalidPlanAssignmentError extends Error {
  override readonly name = 'InvalidPlanAssignmentError';
  constructor(message: string) {
    super(message);
  }
}

/** ~100 years — "indefinite until an operator changes it," never reached by any real sweep. */
const INDEFINITE_PERIOD_MS = 100 * 365 * 86_400_000;

export interface AssignPlanInput {
  /** `requireOperator`'s own `req.auth.userId` — never client-supplied. */
  readonly operatorId: string;
  readonly targetUserId: string;
  readonly planId: string;
  /**
   * Optional. Omit for an indefinite assignment (the common case — an
   * operator granting ongoing access, not a time-boxed trial). When given,
   * `sendRenewalWarnings` will correctly warn the user as it approaches,
   * exactly as it would for a real subscription — that sweep already
   * degrades to a harmless no-op when there is no credit lot tied to the
   * boundary (see the module note), so this is safe either way.
   */
  readonly periodEnd?: Date;
  readonly reason: string;
}

function validate(input: AssignPlanInput): void {
  if (input.reason.trim().length === 0) {
    throw new InvalidPlanAssignmentError('reason is required');
  }
  if (input.periodEnd !== undefined && input.periodEnd.getTime() <= Date.now()) {
    throw new InvalidPlanAssignmentError('periodEnd, if given, must be in the future');
  }
}

/**
 * Assigns `input.planId` to `input.targetUserId` with no payment involved, or
 * reverts them to `free` when `input.planId === 'free'`. Returns the user's
 * full admin detail view (`getUser`) so a caller sees the entitlement change
 * take effect immediately, not just a raw `Subscription` row.
 */
export async function assignPlan(
  db: PrismaClient,
  input: AssignPlanInput,
): Promise<AdminUserDetail> {
  validate(input);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
    if (user === null) throw new UserNotFoundError(input.targetUserId);

    const before = await getUser(tx, input.targetUserId);

    if (input.planId === 'free') {
      // Revert to free: expire whatever subscription exists. No-op if the
      // user is already free (no row to expire) — reported as an
      // identical-before/after audit entry, honestly, not skipped.
      await tx.subscription.updateMany({
        where: { userId: input.targetUserId },
        data: { status: 'EXPIRED', cancelAtPeriodEnd: false, renewalWarningSentAt: null },
      });
    } else {
      const plan = await tx.plan.findUnique({
        where: { id: input.planId },
        select: { id: true, isActive: true },
      });
      if (plan === null || !plan.isActive) throw new PlanNotAssignableError(input.planId);

      const now = new Date();
      const periodEnd = input.periodEnd ?? new Date(now.getTime() + INDEFINITE_PERIOD_MS);
      const subData = {
        planId: plan.id,
        status: 'ACTIVE' as const,
        periodStart: now,
        periodEnd,
        cancelAtPeriodEnd: false,
        renewalWarningSentAt: null,
        externalCustomerId: null,
        externalSubscriptionId: null,
        // The signal that keeps the billing sweep from ever auto-renewing
        // (and re-granting credits for) this row — see the module note.
        adminAssigned: true,
      };
      await tx.subscription.upsert({
        where: { userId: input.targetUserId },
        create: { userId: input.targetUserId, ...subData },
        update: subData,
      });
    }

    const after = await getUser(tx, input.targetUserId);

    await recordAuditLog(tx, {
      actorId: input.operatorId,
      action: 'plan.assign',
      subjectType: 'User',
      subjectId: input.targetUserId,
      before: { planId: before.planId, subscriptionStatus: before.subscriptionStatus },
      after: { planId: after.planId, subscriptionStatus: after.subscriptionStatus },
    });

    return after;
  });
}
