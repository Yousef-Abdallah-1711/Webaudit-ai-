/**
 * T185 — plan entitlement resolution and enforcement (FR-079).
 *
 * A user's *effective plan* is the tier their next chargeable operation runs
 * under. It is the `Plan` on their `Subscription` while that subscription still
 * owns the current period, and `free` otherwise:
 *
 *   - `ACTIVE`                          → the plan
 *   - `CANCELLED`, `periodEnd` future   → the plan (they paid for this period)
 *   - `CANCELLED`/`EXPIRED`, past       → `free`
 *   - `PAST_DUE`                        → `free` (no new chargeable work until paid)
 *   - no subscription                  → `free`
 *
 * FR-080's "keep existing reports readable for the lapsed tier's retention
 * period" is a *retention* concern (`retention.ts`), not an entitlement one —
 * a lapsed user can still read what they have, they just cannot start new work.
 *
 * The middleware in `entitlements.middleware.ts` composes these: a route that
 * needs an entitlement runs the check *before* the handler that charges, so an
 * `EntitlementError` is a refusal, never a refund (FR-016: "before charging").
 */

import { PLAN_TIERS } from '@webaudit/config';
import type { InputType } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

/** The Plan fields every entitlement decision reads. */
export interface EffectivePlan {
  readonly id: string;
  readonly name: string;
  readonly allowedInputTypes: readonly InputType[];
  readonly allowLoadGeneration: boolean;
  readonly allowReadinessPass: boolean;
  readonly allowCreditPurchase: boolean;
  readonly allowCustomCapability: boolean;
  readonly concurrentScanLimit: number;
  readonly queuePriority: number;
  readonly retentionDays: number;
}

const PLAN_SELECT = {
  id: true,
  name: true,
  allowedInputTypes: true,
  allowLoadGeneration: true,
  allowReadinessPass: true,
  allowCreditPurchase: true,
  allowCustomCapability: true,
  concurrentScanLimit: true,
  queuePriority: true,
  retentionDays: true,
} as const;

export type EntitlementFeature =
  | 'ARCHIVE_INPUT'
  | 'REPOSITORY_INPUT'
  | 'LOAD_GENERATION'
  | 'READINESS_PASS'
  | 'CREDIT_PURCHASE'
  | 'CUSTOM_CAPABILITY';

export class EntitlementError extends Error {
  override readonly name = 'EntitlementError';
  constructor(
    readonly feature: EntitlementFeature | 'CONCURRENCY',
    readonly currentTier: string,
    /** The cheapest active tier that would permit this, or null if none. */
    readonly requiredTier: string | null,
    message: string,
  ) {
    super(message);
  }
}

/** The plan a user's next chargeable operation runs under. */
export async function resolveEffectivePlan(
  db: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<EffectivePlan> {
  const subscription = await db.subscription.findUnique({
    where: { userId },
    select: { status: true, periodEnd: true, plan: { select: PLAN_SELECT } },
  });

  // ACTIVE runs on the plan. A CANCELLED subscription keeps its plan until the
  // period it was paid for ends. PAST_DUE (a failed renewal payment, retrying)
  // and everything expired fall back to free — no new chargeable work until the
  // payment lands.
  const ownsPeriod =
    subscription !== null &&
    (subscription.status === 'ACTIVE' ||
      (subscription.status === 'CANCELLED' && subscription.periodEnd > now));

  if (ownsPeriod) return subscription.plan;

  return db.plan.findUniqueOrThrow({ where: { id: 'free' }, select: PLAN_SELECT });
}

function planAllows(plan: EffectivePlan, feature: EntitlementFeature): boolean {
  switch (feature) {
    case 'ARCHIVE_INPUT':
      return plan.allowedInputTypes.includes('ARCHIVE');
    case 'REPOSITORY_INPUT':
      return plan.allowedInputTypes.includes('REPOSITORY');
    case 'LOAD_GENERATION':
      return plan.allowLoadGeneration;
    case 'READINESS_PASS':
      return plan.allowReadinessPass;
    case 'CREDIT_PURCHASE':
      return plan.allowCreditPurchase;
    case 'CUSTOM_CAPABILITY':
      return plan.allowCustomCapability;
  }
}

/**
 * The cheapest active tier permitting `feature`, from the shared tier table.
 * `monthlyCredits` ascending is the price proxy — the spec fixes credits per
 * tier and leaves the currency amount open.
 */
export function permittingTierFor(feature: EntitlementFeature): string | null {
  const ordered = [...PLAN_TIERS].sort((a, b) => a.monthlyCredits - b.monthlyCredits);
  for (const tier of ordered) {
    if (
      planAllows(
        {
          ...tier,
          allowedInputTypes: [...tier.allowedInputTypes],
        },
        feature,
      )
    ) {
      return tier.id;
    }
  }
  return null;
}

/** Throws `EntitlementError` if the user's effective plan does not permit the feature. */
export async function assertEntitled(
  db: PrismaClient,
  userId: string,
  feature: EntitlementFeature,
): Promise<EffectivePlan> {
  const plan = await resolveEffectivePlan(db, userId);
  if (planAllows(plan, feature)) return plan;
  const requiredTier = permittingTierFor(feature);
  throw new EntitlementError(
    feature,
    plan.id,
    requiredTier,
    requiredTier === null
      ? `${describe(feature)} is not available on any plan.`
      : `${describe(feature)} requires the ${requiredTier} plan or higher; you are on ${plan.id}.`,
  );
}

/**
 * FR-079's concurrent-audit limit. Counts the user's non-terminal scans and
 * refuses to start another once the plan's limit is reached — before any debit.
 */
export async function assertConcurrencyHeadroom(
  db: PrismaClient,
  userId: string,
): Promise<EffectivePlan> {
  const plan = await resolveEffectivePlan(db, userId);
  const running = await db.scan.count({
    where: {
      userId,
      state: { notIn: ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'] },
    },
  });
  if (running >= plan.concurrentScanLimit) {
    const higher = [...PLAN_TIERS]
      .sort((a, b) => a.monthlyCredits - b.monthlyCredits)
      .find((t) => t.concurrentScanLimit > plan.concurrentScanLimit);
    throw new EntitlementError(
      'CONCURRENCY',
      plan.id,
      higher?.id ?? null,
      `Your plan allows ${String(plan.concurrentScanLimit)} concurrent audit${
        plan.concurrentScanLimit === 1 ? '' : 's'
      }; ${String(running)} ${running === 1 ? 'is' : 'are'} already running.`,
    );
  }
  return plan;
}

function describe(feature: EntitlementFeature): string {
  return {
    ARCHIVE_INPUT: 'Auditing an uploaded archive',
    REPOSITORY_INPUT: 'Auditing a connected repository',
    LOAD_GENERATION: 'Load-generation checks',
    READINESS_PASS: 'The production-readiness pass',
    CREDIT_PURCHASE: 'Purchasing additional credits',
    CUSTOM_CAPABILITY: 'Operator-installed custom capabilities',
  }[feature];
}
