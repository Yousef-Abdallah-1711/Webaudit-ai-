/**
 * T205 (plans half) — operator plan-tier administration, from
 * contracts/http-api.md's Administration section:
 *
 *   GET   /admin/plans        list, including inactive tiers (FR-084)
 *   POST  /admin/plans        define a new tier (FR-084)
 *   PATCH /admin/plans/:id    change an existing tier's entitlements (FR-084)
 *
 * Same wiring note as `admin/users.routes.ts`: not yet mounted under `/admin`,
 * not yet wrapped in `requireOperator` — that is T211's job. `requireAuth` is
 * here for the same reason it is in every other router: a mutation needs
 * `req.auth.userId` for the audit log's `actorId`.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { INPUT_TYPES } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  DuplicatePlanIdError,
  PlanNotFoundError,
  createPlan,
  getPlan,
  listPlans,
  updatePlan,
} from '../../services/admin/plans.service.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such plan.' } };

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

const listQuery = z.object({
  // Operator tooling needs to see a deactivated tier to reactivate it — the
  // public `/billing/plans` list stays active-only and is unaffected by this.
  includeInactive: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

const createPlanBody = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/, 'id must be lowercase, starting with a letter'),
  name: z.string().trim().min(1).max(200),
  monthlyCredits: z.number().int().min(0),
  creditsRecur: z.boolean(),
  allowedInputTypes: z.array(z.enum(INPUT_TYPES)).min(1),
  allowLoadGeneration: z.boolean(),
  allowReadinessPass: z.boolean(),
  allowCreditPurchase: z.boolean(),
  allowCustomCapability: z.boolean(),
  concurrentScanLimit: z.number().int().positive(),
  queuePriority: z.number().int(),
  retentionDays: z.number().int().positive(),
  isActive: z.boolean().optional(),
});

const updatePlanBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    monthlyCredits: z.number().int().min(0),
    creditsRecur: z.boolean(),
    allowedInputTypes: z.array(z.enum(INPUT_TYPES)).min(1),
    allowLoadGeneration: z.boolean(),
    allowReadinessPass: z.boolean(),
    allowCreditPurchase: z.boolean(),
    allowCustomCapability: z.boolean(),
    concurrentScanLimit: z.number().int().positive(),
    queuePriority: z.number().int(),
    retentionDays: z.number().int().positive(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be given.' });

export function adminPlansRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/plans', async (req: AuthedRequest, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'includeInactive, if given, must be "true" or "false".');
      return;
    }
    const plans = await listPlans(db, { includeInactive: parsed.data.includeInactive });
    res.status(200).json({ plans });
  });

  router.post('/plans', async (req: AuthedRequest, res: Response) => {
    const parsed = createPlanBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid plan definition.', parsed.error.flatten());
      return;
    }
    try {
      const plan = await createPlan(db, { operatorId: req.auth!.userId, ...parsed.data });
      res.status(201).json({ plan });
    } catch (error) {
      if (error instanceof DuplicatePlanIdError) {
        res.status(409).json({ error: { code: 'DUPLICATE_PLAN_ID', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/plans/:id', async (req: AuthedRequest, res: Response) => {
    try {
      const plan = await getPlan(db, pathId(req));
      res.status(200).json({ plan });
    } catch (error) {
      if (error instanceof PlanNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      throw error;
    }
  });

  router.patch('/plans/:id', async (req: AuthedRequest, res: Response) => {
    const parsed = updatePlanBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid plan update.', parsed.error.flatten());
      return;
    }
    try {
      const plan = await updatePlan(db, {
        operatorId: req.auth!.userId,
        planId: pathId(req),
        patch: parsed.data,
      });
      res.status(200).json({ plan });
    } catch (error) {
      if (error instanceof PlanNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      throw error;
    }
  });

  return router;
}
