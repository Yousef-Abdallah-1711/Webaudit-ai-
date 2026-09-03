/**
 * T209 — GET/POST /admin/queue, from contracts/http-api.md's Administration
 * section:
 *
 *   GET  /admin/queue                  inspect waiting/active/delayed/failed (FR-088)
 *   POST /admin/queue/:jobId/retry     retry a failed job (FR-088)
 *   POST /admin/queue/:jobId/cancel    cancel a job (FR-088)
 *
 * Same not-yet-mounted, not-yet-`requireOperator` setup as every other file
 * in this directory — T211 mounts everything under `/admin` behind the
 * operator gate.
 *
 * `deps.service` defaults to a real `QueueAdminService`, built once when this
 * router is constructed (three long-lived Redis connections, not one per
 * request) — the same `deps.producer ?? createXProducer()` seam
 * `scans.routes.ts` already uses for its own BullMQ producer, so a test can
 * inject one and production gets a real one for free. Nothing in this
 * codebase explicitly closes a production BullMQ connection on shutdown
 * (`scan-phase-producer.ts`'s `close()` is likewise only ever called from
 * test teardown) — these live for the process, same as that one.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import {
  JobNotCancelableError,
  JobNotFoundError,
  JobNotRetryableError,
  createQueueAdminService,
  type QueueAdminService,
} from '../../services/admin/queue.service.js';

export interface AdminQueueRoutesDeps {
  readonly service?: QueueAdminService;
}

const INSPECTABLE_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

const listQuery = z.object({
  states: z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()))
    .pipe(z.array(z.enum(INSPECTABLE_STATES)).min(1))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

function jobIdParam(req: AuthedRequest): string {
  const raw: unknown = req.params['jobId'];
  return typeof raw === 'string' ? raw : '';
}

export function adminQueueRoutes(db: PrismaClient, deps: AdminQueueRoutesDeps = {}): Router {
  const router = Router();
  const service = deps.service ?? createQueueAdminService();
  router.use(requireAuth);

  router.get('/queue', async (req: AuthedRequest, res: Response) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'Invalid queue query.', parsed.error.flatten());
      return;
    }
    const { jobs } = await service.listJobs({
      ...(parsed.data.states === undefined ? {} : { states: parsed.data.states }),
      ...(parsed.data.limit === undefined ? {} : { limit: parsed.data.limit }),
    });
    res.status(200).json({ jobs });
  });

  router.post('/queue/:jobId/retry', async (req: AuthedRequest, res: Response) => {
    try {
      const job = await service.retryJob(db, { operatorId: req.auth!.userId, jobId: jobIdParam(req) });
      res.status(200).json({ job });
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        return;
      }
      if (error instanceof JobNotRetryableError) {
        res.status(409).json({ error: { code: 'JOB_NOT_RETRYABLE', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.post('/queue/:jobId/cancel', async (req: AuthedRequest, res: Response) => {
    try {
      const result = await service.cancelJob(db, {
        operatorId: req.auth!.userId,
        jobId: jobIdParam(req),
      });
      res.status(200).json({ cancelled: result.jobId });
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        return;
      }
      if (error instanceof JobNotCancelableError) {
        res.status(409).json({ error: { code: 'JOB_NOT_CANCELABLE', message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
