/**
 * T191 — billing routes, from contracts/http-api.md:
 *
 *   GET  /billing/plans            the tier table
 *   GET  /billing/credits          FR-076 — full movement history, both kinds
 *   POST /billing/subscribe        FR-078
 *   POST /billing/change-plan      FR-080
 *   POST /billing/cancel           FR-080 — reports the retention consequence
 *   POST /billing/credits/purchase FR-078 — 403 on the free tier
 *
 * `GET /billing/credits` is the FR-076 receipt: every `GRANT` / `DEBIT` /
 * `REFUND` / `EXPIRE`, newest first, and for each `DEBIT` which balance it drew
 * against (from `CreditAllocation` → lot kind), so scenario 6's "the account
 * shows which balance was drawn against" is answerable from one call. The
 * current two-figure balance rides along.
 *
 * Real payment is external. `POST /billing/subscribe` and
 * `/billing/credits/purchase` here apply the effect directly (dev/test path);
 * production also drives the same services from `/webhooks/billing` once the
 * provider confirms the money moved.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { PLAN_TIERS } from '@webaudit/config';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { balanceOf } from '../services/credits/balance.js';
import {
  NoSubscriptionError,
  PlanNotSubscribableError,
  cancelSubscription,
  changePlan,
  subscribe,
} from '../services/billing/subscription.service.js';
import { InvalidPurchaseAmountError, purchaseCredits } from '../services/billing/purchase.service.js';
import { EntitlementError } from '../services/billing/entitlements.js';

const planIdBody = z.object({ planId: z.enum(['starter', 'pro', 'business']) });
const purchaseBody = z.object({ credits: z.number().int().positive().max(1_000_000) });

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
}

export function billingRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/billing/plans', async (_req: AuthedRequest, res: Response) => {
    const plans = await db.plan.findMany({
      where: { isActive: true },
      orderBy: { monthlyCredits: 'asc' },
    });
    res.status(200).json({ plans });
  });

  router.get('/billing/credits', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const [balance, subscription, transactions] = await Promise.all([
      balanceOf(db, userId),
      db.subscription.findUnique({
        where: { userId },
        select: {
          planId: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      db.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          type: true,
          amount: true,
          reason: true,
          scanId: true,
          issueId: true,
          createdAt: true,
          allocations: { select: { amount: true, lot: { select: { kind: true } } } },
        },
      }),
    ]);

    const movements = transactions.map(({ allocations, ...rest }) => {
      // Which balance a debit drew against (FR-078 scenario 6).
      const drewFrom = allocations.reduce<Record<string, number>>((acc, a) => {
        acc[a.lot.kind] = (acc[a.lot.kind] ?? 0) + a.amount;
        return acc;
      }, {});
      return { ...rest, drewFrom };
    });

    res.status(200).json({
      balance: { plan: balance.plan, purchased: balance.purchased, planExpiresAt: balance.planExpiresAt },
      subscription,
      movements,
    });
  });

  router.post('/billing/subscribe', async (req: AuthedRequest, res: Response) => {
    const parsed = planIdBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'subscribe requires planId: one of starter, pro, business.');
      return;
    }
    try {
      const sub = await subscribe(db, { userId: req.auth!.userId, planId: parsed.data.planId });
      res.status(201).json({ subscription: sub });
    } catch (error) {
      if (error instanceof PlanNotSubscribableError) {
        badRequest(res, error.message);
        return;
      }
      throw error;
    }
  });

  router.post('/billing/change-plan', async (req: AuthedRequest, res: Response) => {
    const parsed = planIdBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'change-plan requires planId: one of starter, pro, business.');
      return;
    }
    try {
      const sub = await changePlan(db, { userId: req.auth!.userId, planId: parsed.data.planId });
      res.status(200).json({ subscription: sub });
    } catch (error) {
      if (error instanceof NoSubscriptionError) {
        res.status(409).json({ error: { code: 'NO_SUBSCRIPTION', message: error.message } });
        return;
      }
      if (error instanceof PlanNotSubscribableError) {
        badRequest(res, error.message);
        return;
      }
      throw error;
    }
  });

  router.post('/billing/cancel', async (req: AuthedRequest, res: Response) => {
    try {
      const outcome = await cancelSubscription(db, { userId: req.auth!.userId });
      res.status(200).json({
        subscription: {
          planId: outcome.planId,
          status: outcome.status,
          periodEnd: outcome.periodEnd,
          cancelAtPeriodEnd: outcome.cancelAtPeriodEnd,
        },
        // FR-080: the retention consequence, stated.
        reportsReadableUntil: outcome.reportsReadableUntil,
      });
    } catch (error) {
      if (error instanceof NoSubscriptionError) {
        res.status(409).json({ error: { code: 'NO_SUBSCRIPTION', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.post('/billing/credits/purchase', async (req: AuthedRequest, res: Response) => {
    const parsed = purchaseBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'purchase requires credits: a positive whole number.');
      return;
    }
    try {
      const result = await purchaseCredits(db, {
        userId: req.auth!.userId,
        credits: parsed.data.credits,
      });
      res.status(201).json({ purchase: result });
    } catch (error) {
      if (error instanceof EntitlementError) {
        res.status(403).json({
          error: {
            code: 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: { current: error.currentTier, requiredTier: error.requiredTier },
          },
        });
        return;
      }
      if (error instanceof InvalidPurchaseAmountError) {
        badRequest(res, error.message);
        return;
      }
      throw error;
    }
  });

  return router;
}

/** The tier table for a marketing page that has no session yet. */
export function publicPlanTiers() {
  return PLAN_TIERS;
}
