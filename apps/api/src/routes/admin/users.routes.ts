/**
 * T205 (users half) — operator user administration, from
 * contracts/http-api.md's Administration section:
 *
 *   GET   /admin/users        list (FR-083)
 *   GET   /admin/users/:id    detail (FR-083)
 *   PATCH /admin/users/:id    manage — today, only `isOperator` (FR-083)
 *
 * **Not yet mounted under `/admin` and not yet wrapped in `requireOperator`.**
 * That wiring is T211's job: it mounts every admin route at once behind the
 * operator gate. This router declares full paths (`/users`, `/users/:id`)
 * exactly the way `reportsRoutes`/`issuesRoutes` do, so mounting it later is a
 * one-line `app.use(adminUsersRoutes(db))` under whatever gate T211 installs.
 *
 * `router.use(requireAuth)` is here for the same reason it is in every other
 * router in this codebase (`billingRoutes`, `targetsRoutes`, ...): a mutation
 * needs `req.auth.userId` regardless of which authorization layer sits in
 * front of it. `requireOperator` is deliberately absent — see the note above.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import { UserNotFoundError, getUser, listUsers, updateUser } from '../../services/admin/users.service.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such user.' } };

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
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const patchUserBody = z.object({ isOperator: z.boolean() }).strict();

export function adminUsersRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/users', async (req: AuthedRequest, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'limit and offset, if given, must be non-negative integers.');
      return;
    }
    const result = await listUsers(db, parsed.data);
    res.status(200).json(result);
  });

  router.get('/users/:id', async (req: AuthedRequest, res: Response) => {
    try {
      const user = await getUser(db, pathId(req));
      res.status(200).json({ user });
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      throw error;
    }
  });

  router.patch('/users/:id', async (req: AuthedRequest, res: Response) => {
    const parsed = patchUserBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'The only field this endpoint accepts today is isOperator: boolean.');
      return;
    }
    try {
      const user = await updateUser(db, {
        operatorId: req.auth!.userId,
        userId: pathId(req),
        isOperator: parsed.data.isOperator,
      });
      res.status(200).json({ user });
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      throw error;
    }
  });

  return router;
}
