/**
 * T188 — the pre-renewal expiry warning (FR-078: "tell the user, before
 * renewal, how many plan credits they are about to lose").
 *
 * A sweep: find every ACTIVE subscription whose `periodEnd` is within
 * `RENEWAL_WARNING_LEAD_DAYS` and has not been warned this period
 * (`renewalWarningSentAt` null), compute how many plan credits will be swept at
 * that boundary (`creditsExpiringBefore`), and mail the user. `renewalWarningSentAt`
 * is stamped so a second sweep in the window does not re-send; `renewSubscription`
 * clears it for the next period.
 *
 * A subscription with `cancelAtPeriodEnd` still gets the warning — the plan
 * credits die at `periodEnd` whether the plan renews or lapses, and the user
 * should know either way.
 *
 * Scheduled the same way as the timeout sweep — a BullMQ repeatable job on the
 * maintenance queue (`billing-sweeps.ts`). This module is the pure work.
 */

import { RENEWAL_WARNING_LEAD_DAYS } from '@webaudit/config';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { Mailer } from '../email/mailer.js';
import { creditsExpiringBefore } from '../credits/expiry.js';

const DAY_MS = 86_400_000;

export interface RenewalWarningResult {
  readonly warned: number;
  readonly totalCreditsFlagged: number;
}

export async function sendRenewalWarnings(
  db: PrismaClient,
  mailer: Mailer,
  now: Date = new Date(),
): Promise<RenewalWarningResult> {
  const horizon = new Date(now.getTime() + RENEWAL_WARNING_LEAD_DAYS * DAY_MS);

  const due = await db.subscription.findMany({
    where: {
      status: 'ACTIVE',
      periodEnd: { gt: now, lte: horizon },
      renewalWarningSentAt: null,
    },
    select: {
      userId: true,
      periodEnd: true,
      plan: { select: { name: true } },
      user: { select: { email: true } },
    },
  });

  let warned = 0;
  let totalCreditsFlagged = 0;

  for (const sub of due) {
    const expiringCredits = await creditsExpiringBefore(db, sub.userId, sub.periodEnd);

    // Stamp regardless of whether there is anything to lose — the point is not
    // to look at this subscription again until it renews.
    await db.subscription.update({
      where: { userId: sub.userId },
      data: { renewalWarningSentAt: now },
    });

    if (expiringCredits <= 0) continue;

    await mailer.sendRenewalWarning(sub.user.email, {
      planName: sub.plan.name,
      expiringCredits,
      renewsAt: sub.periodEnd,
    });
    warned += 1;
    totalCreditsFlagged += expiringCredits;
  }

  return { warned, totalCreditsFlagged };
}
