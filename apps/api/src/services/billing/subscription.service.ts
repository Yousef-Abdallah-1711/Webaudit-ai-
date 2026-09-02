/**
 * T184 — subscription lifecycle: subscribe, renew, change plan, cancel.
 *
 * **The credit model, FR-078 exactly.** A subscription's plan credits arrive as
 * a `PLAN_RENEWAL` `CreditLot` whose `expiresAt` is the period's `periodEnd`.
 * On renewal the ending period's plan lots are *expired* (`expireRenewedLots`,
 * which only ever touches lots with a non-null `expiresAt`) and a fresh lot is
 * granted — replace, never add. Purchased lots (`expiresAt = null`) are
 * invisible to the sweep, so they survive every renewal (SC-022).
 *
 * The free tier's one-time `FREE_GRANT` lot has `expiresAt = null` too, so a
 * user who later subscribes keeps whatever free credits they had left —
 * destroying credits a user still holds is not something the spec asks for.
 *
 * **`changePlan` does not re-grant.** Switching tier mid-period changes the
 * entitlements immediately; the credit allowance follows at the next renewal.
 * Re-granting on every change would be a trivially gameable way to mint credits.
 *
 * Real payment is external. `webhooks.routes.ts` calls `subscribe`/`renew` when
 * the provider confirms money moved; `POST /billing/subscribe` calls the same
 * functions directly for the dev and test path.
 */

import { BILLING_PERIOD_DAYS } from '@webaudit/config';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { grantLot } from '../credits/grant.js';
import { expireRenewedLots } from '../credits/expiry.js';

const DAY_MS = 86_400_000;
const PERIOD_MS = BILLING_PERIOD_DAYS * DAY_MS;

export class PlanNotSubscribableError extends Error {
  override readonly name = 'PlanNotSubscribableError';
  constructor(readonly planId: string) {
    super(
      planId === 'free'
        ? 'The free tier is the default; there is nothing to subscribe to.'
        : `No such active plan: ${planId}.`,
    );
  }
}

export class NoSubscriptionError extends Error {
  override readonly name = 'NoSubscriptionError';
  constructor() {
    super('This account has no active subscription.');
  }
}

export interface SubscriptionSummary {
  readonly planId: string;
  readonly status: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
}

async function loadSubscribablePlan(db: PrismaClient, planId: string) {
  if (planId === 'free') throw new PlanNotSubscribableError('free');
  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, monthlyCredits: true, isActive: true, retentionDays: true },
  });
  if (plan === null || !plan.isActive) throw new PlanNotSubscribableError(planId);
  return plan;
}

/**
 * Start (or restart) a paid subscription and grant the first period's credits.
 */
export async function subscribe(
  db: PrismaClient,
  input: {
    readonly userId: string;
    readonly planId: string;
    readonly external?: {
      customerId?: string | undefined;
      subscriptionId?: string | undefined;
    };
  },
  now: Date = new Date(),
): Promise<SubscriptionSummary> {
  const plan = await loadSubscribablePlan(db, input.planId);
  const periodStart = now;
  const periodEnd = new Date(now.getTime() + PERIOD_MS);

  return db.$transaction(async (tx) => {
    const subData = {
      planId: plan.id,
      status: 'ACTIVE' as const,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd: false,
      renewalWarningSentAt: null,
      externalCustomerId: input.external?.customerId ?? null,
      externalSubscriptionId: input.external?.subscriptionId ?? null,
    };
    const sub = await tx.subscription.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, ...subData },
      update: subData,
    });

    await grantLot(tx, {
      userId: input.userId,
      amount: plan.monthlyCredits,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: periodEnd,
    });

    return {
      planId: sub.planId,
      status: sub.status,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    };
  });
}

/**
 * Advance a subscription one period: expire the ending period's plan credits,
 * grant the new period's, move the boundary. A `cancelAtPeriodEnd` subscription
 * does not renew — it lapses to `EXPIRED` and grants nothing.
 *
 * Not one transaction: `expireRenewedLots` runs its own (it needs `FOR UPDATE`
 * on the lots), then the boundary move and the new grant run in a second. A
 * crash between leaves the user briefly at zero plan credits; a re-run is safe
 * because expiring already-expired lots is a no-op and the boundary check below
 * refuses to renew a period that has not ended.
 */
export async function renewSubscription(
  db: PrismaClient,
  input: { readonly userId: string },
  now: Date = new Date(),
): Promise<SubscriptionSummary> {
  const sub = await db.subscription.findUnique({
    where: { userId: input.userId },
    select: {
      planId: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      cancelAtPeriodEnd: true,
      plan: { select: { monthlyCredits: true, isActive: true } },
    },
  });
  if (sub === null) throw new NoSubscriptionError();

  if (sub.cancelAtPeriodEnd || sub.status === 'CANCELLED') {
    await expireRenewedLots(db, input.userId, sub.periodEnd);
    const lapsed = await db.subscription.update({
      where: { userId: input.userId },
      data: { status: 'EXPIRED', renewalWarningSentAt: null },
      select: { planId: true, status: true, periodStart: true, periodEnd: true, cancelAtPeriodEnd: true },
    });
    return lapsed;
  }

  // Expire the closing period's plan lots first, anchored to its own boundary.
  await expireRenewedLots(db, input.userId, sub.periodEnd);

  const nextStart = sub.periodEnd > now ? sub.periodEnd : now;
  const nextEnd = new Date(nextStart.getTime() + PERIOD_MS);

  return db.$transaction(async (tx) => {
    const updated = await tx.subscription.update({
      where: { userId: input.userId },
      data: {
        status: 'ACTIVE',
        periodStart: nextStart,
        periodEnd: nextEnd,
        renewalWarningSentAt: null,
      },
      select: { planId: true, status: true, periodStart: true, periodEnd: true, cancelAtPeriodEnd: true },
    });

    if (sub.plan.isActive) {
      await grantLot(tx, {
        userId: input.userId,
        amount: sub.plan.monthlyCredits,
        kind: 'PLAN',
        source: 'PLAN_RENEWAL',
        expiresAt: nextEnd,
      });
    }
    return updated;
  });
}

/**
 * Switch tier. Entitlements change now; the credit allowance follows at the
 * next renewal (see the module note). Refuses if there is no subscription to
 * change — `subscribe` is how you get one.
 */
export async function changePlan(
  db: PrismaClient,
  input: { readonly userId: string; readonly planId: string },
): Promise<SubscriptionSummary> {
  const plan = await loadSubscribablePlan(db, input.planId);
  const existing = await db.subscription.findUnique({ where: { userId: input.userId }, select: { id: true } });
  if (existing === null) throw new NoSubscriptionError();

  const updated = await db.subscription.update({
    where: { userId: input.userId },
    data: { planId: plan.id, status: 'ACTIVE', cancelAtPeriodEnd: false },
    select: { planId: true, status: true, periodStart: true, periodEnd: true, cancelAtPeriodEnd: true },
  });
  return updated;
}

export interface CancellationOutcome extends SubscriptionSummary {
  /** FR-080: reports stay readable this long past the period end. */
  readonly reportsReadableUntil: Date;
}

/**
 * Cancel at period end. The plan and its credits stay until `periodEnd`
 * (they were paid for); after that the account is on `free` and new audits
 * are refused, while existing reports remain readable for the lapsed tier's
 * retention window (FR-080).
 */
export async function cancelSubscription(
  db: PrismaClient,
  input: { readonly userId: string },
): Promise<CancellationOutcome> {
  const sub = await db.subscription.findUnique({
    where: { userId: input.userId },
    select: { periodEnd: true, plan: { select: { retentionDays: true } } },
  });
  if (sub === null) throw new NoSubscriptionError();

  const updated = await db.subscription.update({
    where: { userId: input.userId },
    data: { cancelAtPeriodEnd: true },
    select: { planId: true, status: true, periodStart: true, periodEnd: true, cancelAtPeriodEnd: true },
  });

  return {
    ...updated,
    reportsReadableUntil: new Date(
      updated.periodEnd.getTime() + sub.plan.retentionDays * DAY_MS,
    ),
  };
}
