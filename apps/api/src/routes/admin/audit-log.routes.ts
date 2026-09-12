/**
 * Operator visibility into the append-only audit log itself:
 * `GET /admin/audit-log` (list-only, FR-089's own log read back).
 *
 * Not yet wrapped in `requireOperator` here — `admin/index.ts` mounts every
 * admin route behind the gate at one aggregation point, matching every
 * sibling router in this directory.
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import { listAuditLog } from '../../services/admin/audit-log.js';

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
}

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  action: z.string().trim().min(1).optional(),
  actorId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function adminAuditLogRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/audit-log', async (req: AuthedRequest, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'limit and offset, if given, must be non-negative integers.');
      return;
    }
    const result = await listAuditLog(db, {
      ...parsed.data,
      from: parsed.data.from === undefined ? undefined : new Date(parsed.data.from),
      to: parsed.data.to === undefined ? undefined : new Date(parsed.data.to),
    });
    res.status(200).json(result);
  });

  return router;
}
