/**
 * T191 — billing routes, from contracts/http-api.md:
 *
 *   GET  /billing/plans            the tier table
 *   GET  /billing/credits          FR-076 — full movement history, both kinds
 *   POST /billing/subscribe        FR-078 — dev/test only, 404 in production
 *   POST /billing/change-plan      FR-080
 *   POST /billing/cancel           FR-080 — reports the retention consequence
 *   POST /billing/credits/purchase FR-078 — 403 on the free tier, dev/test only, 404 in production
 *
 * `GET /billing/credits` is the FR-076 receipt: every `GRANT` / `DEBIT` /
 * `REFUND` / `EXPIRE`, newest first, and for each `DEBIT` which balance it drew
 * against (from `CreditAllocation` → lot kind), so scenario 6's "the account
 * shows which balance was drawn against" is answerable from one call. The
 * current two-figure balance rides along.
 *
 * Real payment is external. `POST /billing/subscribe` and
 * `/billing/credits/purchase` here apply the effect directly, but ONLY
 * outside production — see the `devTestOnly` guard below. Production drives
 * the same services exclusively from `/webhooks/billing`, once the provider
 * confirms the money moved.
 *
 * ─── Credit-system hardening audit (see PLAN.md, Finding CRIT-1) ──────────
 *
 * Before this guard existed, both routes applied their real financial effect
 * for ANY authenticated user, in ANY environment including production, with
 * no payment confirmation of any kind — `app.ts` mounts this router
 * unconditionally, and the frontend's real billing screen
 * (`apps/web/app/(dashboard)/billing/page.tsx`) called them directly as the
 * product's actual purchase/subscribe UX. A single `POST
 * /billing/credits/purchase {"credits": 1000000}` call minted a million free
 * credits; a single `POST /billing/subscribe {"planId": "business"}` call
 * granted a free paid subscription. The comment above always called this
 * "the dev and test path," but nothing in the code enforced that — this
 * guard is what makes that claim true.
 *
 * The gate answers 404, not 403: a 403 confirms the route exists and merely
 * refuses this caller: a 404 makes it indistinguishable, in production, from
 * a route that was never built at all — the correct posture for a lever that
 * must not be discoverable. It reads the same `env.isProduction` flag
 * `app.ts`'s own rate-limiter gate already derives from `NODE_ENV`, rather
 * than inventing a second flag — this codebase has already been bitten once
 * by two independently-drifting "are we in production" checks (the
 * committed fallback JWT secret, Finding C3, PROGRESS.md).
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { PLAN_TIERS } from '@webaudit/config';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { env } from '../config/env.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { balanceOf } from '../services/credits/balance.js';
import {
  NoSubscriptionError,
  PlanNotSubscribableError,
  cancelSubscription,
  changePlan,
  subscribe,
} from '../services/billing/subscription.service.js';
import {
  InvalidPurchaseAmountError,
  purchaseCredits,
} from '../services/billing/purchase.service.js';
import { EntitlementError } from '../services/billing/entitlements.js';

const planIdBody = z.object({ planId: z.enum(['starter', 'pro', 'business']) });
const purchaseBody = z.object({ credits: z.number().int().positive().max(1_000_000) });

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
}

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such route.' } };

export interface BillingRoutesDeps {
  /**
   * Omit to read `env.isProduction`. `env` is a frozen snapshot computed once
   * at module-import time (`config/env.ts`), so mutating `process.env`
   * mid-test cannot reach it — the exact same problem `app.ts`'s own
   * `rateLimiters` dependency exists to work around for `shouldRateLimit`. A
   * test that needs to exercise the production gate passes this directly
   * instead.
   */
  isProduction?: boolean;
}

/**
 * True in production. Both direct-effect billing routes below are refused
 * with the same 404 any other nonexistent route gets — see the module note.
 */
function makeDevTestOnlyGuard(isProduction: boolean): (res: Response) => boolean {
  return (res) => {
    if (isProduction) {
      res.status(404).json(NOT_FOUND);
      return false;
    }
    return true;
  };
}

export function billingRoutes(db: PrismaClient, deps: BillingRoutesDeps = {}): Router {
  const devTestOnly = makeDevTestOnlyGuard(deps.isProduction ?? env.isProduction);
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
      balance: {
        plan: balance.plan,
        purchased: balance.purchased,
        planExpiresAt: balance.planExpiresAt,
      },
      subscription,
      movements,
    });
  });

  router.post('/billing/subscribe', async (req: AuthedRequest, res: Response) => {
    if (!devTestOnly(res)) return;
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
    if (!devTestOnly(res)) return;
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
