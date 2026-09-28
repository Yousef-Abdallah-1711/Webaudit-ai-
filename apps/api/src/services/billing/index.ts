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
export { sweepExpiredPendingPayments } from './payment-expiry-sweep.js';

/**
 * Renew every subscription whose period has ended. The pure per-user work is
 * `renewSubscription`; this finds the due ones.
 *
 * **`adminAssigned: false` is load-bearing, not incidental** (Phase 3, master
 * plan). `renewSubscription` unconditionally grants a fresh
 * `plan.monthlyCredits` lot on every renewal — correct for a real,
 * provider-backed (or stubbed dev/test) subscription, where a renewal means
 * a payment actually cleared (or the dev stub stands in for one). An
 * admin-assigned plan (`admin/plan-assignment.service.ts`) has no such
 * payment behind it and sets `adminAssigned: true`; without this filter,
 * this sweep would eventually "renew" (and re-grant credits for) an
 * admin-assigned subscription every cycle once its `periodEnd` passed, for
 * free, forever. `resolveEffectivePlan` already grants the plan for as long
 * as `status === 'ACTIVE'` regardless of `periodEnd`, so excluding these
 * rows from the sweep costs an admin-assigned user nothing — their access
 * does not depend on ever being "renewed". `externalSubscriptionId` was
 * considered and rejected as the signal here: both the dev/test stub
 * provider path (`POST /billing/subscribe`) and even a real Paymob webhook
 * (`webhooks.routes.ts` treats `external` as fully optional) can leave it
 * `null` on a genuinely payment-backed subscription, which would have
 * wrongly excluded those from ever renewing.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { renewSubscription } from './subscription.service.js';

export async function renewDueSubscriptions(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ renewed: number; lapsed: number }> {
  const due = await db.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE'] },
      periodEnd: { lte: now },
      adminAssigned: false,
    },
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
