/**
 * The billing services, re-exported for `apps/worker` through the
 * `@webaudit/api/billing` package subpath (same shape as `/credits`,
 * `/control-gate`, `/issues`). The worker's maintenance scheduler
 * (`billing-sweeps.ts`) runs the renewal and retention sweeps on an interval.
 */

export {
  PlanNotSubscribableError,
  NoSubscriptionError,
  subscribe,
  renewSubscription,
  changePlan,
  cancelSubscription,
  type SubscriptionSummary,
} from './subscription.service.js';

export { purchaseCredits, InvalidPurchaseAmountError } from './purchase.service.js';

export {
  resolveEffectivePlan,
  assertEntitled,
  assertConcurrencyHeadroom,
  permittingTierFor,
  EntitlementError,
  type EntitlementFeature,
  type EffectivePlan,
} from './entitlements.js';

export { sendRenewalWarnings, type RenewalWarningResult } from './renewal-warning.js';

/**
 * Renew every subscription whose period has ended. The pure per-user work is
 * `renewSubscription`; this finds the due ones.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { renewSubscription } from './subscription.service.js';

export async function renewDueSubscriptions(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ renewed: number; lapsed: number }> {
  const due = await db.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, periodEnd: { lte: now } },
    select: { userId: true, cancelAtPeriodEnd: true },
  });
  let renewed = 0;
  let lapsed = 0;
  for (const sub of due) {
    try {
      await renewSubscription(db, { userId: sub.userId }, now);
      if (sub.cancelAtPeriodEnd) lapsed += 1;
      else renewed += 1;
    } catch (error) {
      console.warn(`[billing] could not renew subscription for ${sub.userId}:`, error);
    }
  }
  return { renewed, lapsed };
}
