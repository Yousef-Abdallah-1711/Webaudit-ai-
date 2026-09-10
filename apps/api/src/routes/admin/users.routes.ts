/**
 * T205 (users half) — operator user administration, from
 * contracts/http-api.md's Administration section:
 *
 *   GET   /admin/users               list (FR-083)
 *   GET   /admin/users/:id           detail (FR-083)
 *   PATCH /admin/users/:id           manage — today, only `isOperator` (FR-083)
 *   POST  /admin/users/:id/credits   grant/adjust credits (PLAN.md, ADMIN-002)
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
 *
 * ─── `POST /users/:id/credits` (PLAN.md, Finding HIGH-2 / ADMIN-002) ──────
 *
 * The only operator-facing way to grant credits directly, added because none
 * existed anywhere in this codebase before this task. Lives here rather than
 * in its own `admin/credits.routes.ts` file: it is a sub-resource of a user
 * (`/users/:id/credits`), the same nesting `PATCH /users/:id` already
 * establishes for "manage this user," and a one-endpoint file would be a
 * needless split. All the actual validation and the financial effect live in
 * `services/credits/adjust.ts`'s `adjustCredits` — this handler only maps
 * HTTP in and out.
 *
 * `100_000` as the per-call ceiling is deliberately far below the user-facing
 * purchase route's `1_000_000` (`billing.routes.ts`): an operator grant is a
 * correction or a goodwill gesture, not a bulk top-up, and a lower ceiling
 * limits the blast radius of a compromised or mistaken operator action
 * without blocking any real use case `PLAN_TIERS`' own numbers suggest
 * (the largest paid tier grants 4,000/month).
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  UserNotFoundError,
  getUser,
  listUsers,
  updateUser,
} from '../../services/admin/users.service.js';
import { InvalidCreditAdjustmentError, adjustCredits } from '../../services/credits/adjust.js';

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

/**
 * `expiresAt` is required, not optional-with-a-default: an operator states
 * explicitly whether this grant expires and when (PLAN.md §13's own
 * reasoning) — `null` for a `PURCHASED` grant, an ISO datetime for `PLAN`.
 * `adjustCredits` itself is the actual enforcement of which combinations are
 * valid; this schema only shapes the wire format.
 */
const adjustCreditsBody = z
  .object({
    amount: z.number().int().positive().max(100_000),
    kind: z.enum(['PLAN', 'PURCHASED']),
    expiresAt: z.string().datetime().nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

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

  router.post('/users/:id/credits', async (req: AuthedRequest, res: Response) => {
    const parsed = adjustCreditsBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(
        res,
        'credits requires amount (positive int), kind (PLAN|PURCHASED), expiresAt (ISO datetime or null), and reason (non-empty).',
        parsed.error.flatten(),
      );
      return;
    }
    try {
      const result = await adjustCredits(db, {
        operatorId: req.auth!.userId,
        targetUserId: pathId(req),
        amount: parsed.data.amount,
        kind: parsed.data.kind,
        expiresAt: parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt),
        reason: parsed.data.reason,
      });
      res.status(201).json({
        transactionId: result.transactionId,
        lotId: result.lotId,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
      });
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof InvalidCreditAdjustmentError) {
        badRequest(res, error.message);
        return;
      }
      throw error;
    }
  });

  return router;
}
