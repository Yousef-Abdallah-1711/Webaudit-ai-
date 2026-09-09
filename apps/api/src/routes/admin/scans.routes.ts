/**
 * Operator visibility into real scans: `GET /admin/scans` (list-only).
 *
 * Not yet wrapped in `requireOperator` here — `admin/index.ts` mounts every
 * admin route behind the gate at one aggregation point, matching every
 * sibling router in this directory (`adminUsersRoutes` etc.).
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import { listScans } from '../../services/admin/scans.service.js';

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
}

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function adminScansRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/scans', async (req: AuthedRequest, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'limit and offset, if given, must be non-negative integers.');
      return;
    }
    const result = await listScans(db, parsed.data);
    res.status(200).json(result);
  });

  return router;
}
