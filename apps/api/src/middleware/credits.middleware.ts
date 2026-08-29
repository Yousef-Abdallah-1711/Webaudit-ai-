/**
 * T042 — requireCredits.
 *
 * FR-074: "verify a sufficient balance before starting chargeable work, and
 * report the shortfall rather than starting and failing."
 *
 * This is a pre-flight check, not the charge. It exists so a user learns they
 * are short *before* a provider is billed and before a scan occupies a worker.
 * The actual debit happens inside the operation, in one serializable
 * transaction, because a check here and a charge later is a race — the balance
 * can change in between.
 */

import type { NextFunction, Response } from 'express';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { balanceOf } from '../services/credits/balance.js';
import type { AuthedRequest } from './auth.middleware.js';

/** Resolves how much this particular request will cost. */
export type CostResolver = (req: AuthedRequest) => number | Promise<number>;

export function requireCredits(db: PrismaClient, cost: number | CostResolver) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth?.userId;
    if (!userId) {
      res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
      return;
    }

    const required = typeof cost === 'number' ? cost : await cost(req);
    if (required <= 0) {
      next();
      return;
    }

    const balance = await balanceOf(db, userId);
    const available = balance.plan + balance.purchased;

    if (available < required) {
      // 402 Payment Required, with the numbers the user needs to act on. A bare
      // "insufficient credits" leaves them guessing which plan would cover it.
      res.status(402).json({
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `This costs ${required} credits and you have ${available}.`,
          details: {
            required,
            available,
            shortfall: required - available,
            balance: { plan: balance.plan, purchased: balance.purchased },
          },
        },
      });
      return;
    }

    next();
  };
}
