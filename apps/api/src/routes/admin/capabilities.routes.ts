/**
 * T207 — operator capability administration, from contracts/http-api.md's
 * Administration section:
 *
 *   GET    /admin/capabilities        list (FR-086)
 *   PATCH  /admin/capabilities/:id    enable, disable, restrict to tiers
 *   DELETE /admin/capabilities/:id    remove — see capabilities.service.ts's
 *                                     module note for the resolved conflict
 *                                     between this contract line and
 *                                     reconcile.ts's "never deleted"
 *
 * Deliberately NOT built here: `POST /admin/capabilities/upload` — that
 * route returns `503 SANDBOX_UNAVAILABLE` while the sandbox service is not
 * deployed (R1), and depends on a different phase of this project entirely.
 *
 * Same not-yet-mounted, not-yet-`requireOperator` setup as every other file
 * in this directory — T211 mounts everything under `/admin` behind the
 * operator gate. `requireAuth` is here for the same reason it is in every
 * other router: a mutation needs `req.auth.userId` for the audit log's
 * `actorId`.
 *
 * One combined PATCH body, not two routes: FR-086 states "enable, disable,
 * restrict... capabilities" as one sentence, an operator plausibly wants to
 * do both in one action (e.g. "turn this on, but only for pro and up"), and
 * both mutations already write to the same subject via the same audit-log
 * pattern as `plans.routes.ts`. `isEnabled` and `planIds` are independently
 * optional; at least one must be given.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  CapabilityHasHistoryError,
  CapabilityNotFoundError,
  PlanNotFoundError,
  listCapabilities,
  removeCapability,
  setCapabilityEnabled,
  setCapabilityPlanRestrictions,
} from '../../services/admin/capabilities.service.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such capability.' } };

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

const patchCapabilityBody = z
  .object({
    isEnabled: z.boolean(),
    planIds: z.array(z.string().trim().min(1)),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one of isEnabled or planIds must be given.',
  });

export function adminCapabilitiesRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/capabilities', async (_req: AuthedRequest, res: Response) => {
    const capabilities = await listCapabilities(db);
    res.status(200).json({ capabilities });
  });

  router.patch('/capabilities/:id', async (req: AuthedRequest, res: Response) => {
    const parsed = patchCapabilityBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid capability update.', parsed.error.flatten());
      return;
    }

    const capabilityId = pathId(req);
    const operatorId = req.auth!.userId;

    try {
      if (parsed.data.isEnabled !== undefined) {
        await setCapabilityEnabled(db, { operatorId, capabilityId, isEnabled: parsed.data.isEnabled });
      }
      if (parsed.data.planIds !== undefined) {
        await setCapabilityPlanRestrictions(db, {
          operatorId,
          capabilityId,
          planIds: parsed.data.planIds,
        });
      }
      const [capability] = (await listCapabilities(db)).filter((c) => c.id === capabilityId);
      res.status(200).json({ capability });
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof PlanNotFoundError) {
        res
          .status(400)
          .json({ error: { code: 'INVALID_PLAN_ID', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.delete('/capabilities/:id', async (req: AuthedRequest, res: Response) => {
    try {
      const result = await removeCapability(db, {
        operatorId: req.auth!.userId,
        capabilityId: pathId(req),
      });
      res.status(200).json({ removed: result.capabilityId });
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof CapabilityHasHistoryError) {
        res.status(409).json({
          error: {
            code: 'CAPABILITY_HAS_HISTORY',
            message: error.message,
            executionCount: error.executionCount,
          },
        });
        return;
      }
      throw error;
    }
  });

  return router;
}
