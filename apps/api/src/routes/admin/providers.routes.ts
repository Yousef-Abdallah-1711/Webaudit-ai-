/**
 * T208 — operator AI provider chain administration, from contracts/http-api.md's
 * Administration section:
 *
 *   GET   /admin/providers   the current persisted chain, in fallback order
 *   PATCH /admin/providers   replace-the-set: submit the full intended chain
 *
 * See `providers.service.ts`'s module note for the real, honest scope of
 * what a PATCH here achieves and does not — it persists and validates an
 * operator's declared chain with the real `buildChain` guard; it does not
 * make any running worker use it (no live-reconfiguration mechanism exists).
 *
 * Same not-yet-mounted, not-yet-`requireOperator` setup as every other file
 * in this directory — T211 mounts everything under `/admin` behind the
 * operator gate. `requireAuth` is here for the same reason it is in every
 * other router: a mutation needs `req.auth.userId` for the audit log's
 * `actorId`.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  ProviderChainInvalidError,
  listProviderChain,
  replaceProviderChain,
} from '../../services/admin/providers.service.js';

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

const patchProvidersBody = z.object({
  chain: z.array(
    z.object({
      vendor: z.string(),
      model: z.string(),
      isEnabled: z.boolean().optional(),
    }),
  ),
});

export function adminProvidersRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/providers', async (_req: AuthedRequest, res: Response) => {
    const chain = await listProviderChain(db);
    res.status(200).json({ chain });
  });

  router.patch('/providers', async (req: AuthedRequest, res: Response) => {
    const parsed = patchProvidersBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid provider chain.', parsed.error.flatten());
      return;
    }

    const operatorId = req.auth!.userId;

    try {
      const chain = await replaceProviderChain(db, {
        operatorId,
        entries: parsed.data.chain.map((entry) => ({
          vendor: entry.vendor,
          model: entry.model,
          ...(entry.isEnabled === undefined ? {} : { isEnabled: entry.isEnabled }),
        })),
      });
      res.status(200).json({ chain });
    } catch (error) {
      if (error instanceof ProviderChainInvalidError) {
        res.status(400).json({
          error: { code: 'INVALID_PROVIDER_CHAIN', message: error.message },
        });
        return;
      }
      throw error;
    }
  });

  return router;
}
