import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  listCostAlertThresholds,
  updateCostAlertThreshold,
} from '../../services/monitoring/cost-alerts.js';

const scope = z.enum(['PER_USER', 'GLOBAL']);
const patchSchema = z
  .object({
    windowMinutes: z
      .number()
      .int()
      .positive()
      .max(7 * 24 * 60)
      .optional(),
    thresholdMicros: z.number().int().positive().optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export function adminCostAlertsRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/cost-alerts', async (_req: AuthedRequest, res: Response) => {
    res.status(200).json({ thresholds: await listCostAlertThresholds(db) });
  });
  router.patch('/cost-alerts/thresholds/:scope', async (req: AuthedRequest, res: Response) => {
    const parsedScope = scope.safeParse(req.params['scope']);
    const parsed = patchSchema.safeParse(req.body);
    if (!parsedScope.success || !parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_REQUEST', message: 'Invalid cost-alert threshold.' } });
      return;
    }
    try {
      const patch: { windowMinutes?: number; thresholdMicros?: number; isEnabled?: boolean } = {};
      if (parsed.data.windowMinutes !== undefined) patch.windowMinutes = parsed.data.windowMinutes;
      if (parsed.data.thresholdMicros !== undefined)
        patch.thresholdMicros = parsed.data.thresholdMicros;
      if (parsed.data.isEnabled !== undefined) patch.isEnabled = parsed.data.isEnabled;
      const threshold = await updateCostAlertThreshold(db, parsedScope.data, patch);
      res.status(200).json({ threshold });
    } catch {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'Cost-alert threshold not found.' } });
    }
  });
  return router;
}
