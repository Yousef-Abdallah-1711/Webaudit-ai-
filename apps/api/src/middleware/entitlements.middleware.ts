/**
 * T185 — entitlement enforcement as Express middleware.
 *
 * FR-016 / FR-079: an operation the plan does not permit is refused **before
 * any work starts and before any charge**, naming the tier that would permit
 * it. This middleware runs ahead of the route handler that debits, so the
 * outcome is a `403`, never a debit-then-refund.
 *
 * The decision logic lives in `services/billing/entitlements.ts`; this file is
 * only the HTTP shell — resolve the user, run the assertion, translate an
 * `EntitlementError` into the uniform error envelope.
 */

import type { NextFunction, Response } from 'express';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import type { AuthedRequest } from './auth.middleware.js';
import {
  EntitlementError,
  assertConcurrencyHeadroom,
  assertEntitled,
  type EntitlementFeature,
} from '../services/billing/entitlements.js';

function refuse(res: Response, error: EntitlementError): void {
  res.status(403).json({
    error: {
      code: error.feature === 'CONCURRENCY' ? 'CONCURRENT_LIMIT_REACHED' : 'PLAN_UPGRADE_REQUIRED',
      message: error.message,
      details: { feature: error.feature, current: error.currentTier, requiredTier: error.requiredTier },
    },
  });
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } });
}

/** Refuses unless the caller's effective plan permits `feature`. */
export function requireEntitlement(db: PrismaClient, feature: EntitlementFeature) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth?.userId;
    if (userId === undefined) {
      unauthorized(res);
      return;
    }
    try {
      await assertEntitled(db, userId, feature);
      next();
    } catch (error) {
      if (error instanceof EntitlementError) {
        refuse(res, error);
        return;
      }
      next(error);
    }
  };
}

/** Refuses when the caller already has their plan's limit of concurrent audits running (FR-079). */
export function requireConcurrencyHeadroom(db: PrismaClient) {
  return async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth?.userId;
    if (userId === undefined) {
      unauthorized(res);
      return;
    }
    try {
      await assertConcurrencyHeadroom(db, userId);
      next();
    } catch (error) {
      if (error instanceof EntitlementError) {
        refuse(res, error);
        return;
      }
      next(error);
    }
  };
}
