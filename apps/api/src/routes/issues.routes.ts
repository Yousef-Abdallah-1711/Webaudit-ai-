/**
 * T154 — the fix-loop routes, from contracts/http-api.md:
 *
 *   POST /issues/:id/assert-fixed   FR-058. Charges 3 credits; queues re-verification.
 *   GET  /issues/:id/attempts       FR-061, FR-065. The issue's verification history.
 *
 * `GET /issues/:id` itself lives in `reports.routes.ts` (T118); this router
 * adds the two write/history routes and is mounted at the application root the
 * same way, since it also spans the `/issues/...` prefix only.
 *
 * **The response never asserts resolution.** `POST /issues/:id/assert-fixed`
 * returns the issue in `ASSERTED_FIXED` and the queued job id — a verdict
 * arrives later as an `issue:verified` realtime event and a new
 * `VerificationAttempt` row. The state moves to `RESOLVED` only when a check
 * passes, in `recordVerificationAttempt`, and nowhere else (SC-007).
 *
 * **The charge happens before the work** (Principle VI): a `DEBIT` for
 * `REVERIFY_COST` is taken here, and its id travels in the job so the worker
 * can refund it exactly if the outcome is `ERRORED` or `UNVERIFIABLE` (FR-075).
 * A lost race on the state transition refunds immediately, here.
 */

import { Router, type Response } from 'express';
import { REVERIFY_COST } from '@webaudit/config';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { debit, InsufficientCreditsError } from '../services/credits/debit.js';
import { refund } from '../services/credits/refund.js';
import { ASSERTABLE_FROM, canAssertFixed } from '../services/issues/state-machine.js';
import { listVerificationAttempts } from '../services/issues/attempts.js';
import {
  createReverifyProducer,
  type ReverifyProducer,
} from '../services/queue/reverify-producer.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such issue.' } };

export interface IssueRoutesDeps {
  /** Omit for a real BullMQ producer on `REDIS_URL`. */
  producer?: ReverifyProducer;
}

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

export function issuesRoutes(db: PrismaClient, deps: IssueRoutesDeps = {}): Router {
  const router = Router();
  const producer = deps.producer ?? createReverifyProducer();
  router.use(requireAuth);

  router.post('/issues/:id/assert-fixed', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const issueId = pathId(req);

    const issue = await db.issue.findFirst({
      where: { id: issueId, scan: { userId } },
      select: { id: true, state: true, scanId: true },
    });
    if (issue === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    if (!canAssertFixed(issue.state)) {
      res.status(409).json({
        error: {
          code: 'ISSUE_NOT_ASSERTABLE',
          message: `This issue is ${issue.state}. A fix can be asserted only from ${ASSERTABLE_FROM.join(', ')}.`,
          details: { state: issue.state },
        },
      });
      return;
    }

    // Charge before the work (Principle VI). FR-074: report the shortfall
    // rather than starting and failing.
    let debitId: string;
    try {
      const charged = await debit(db, {
        userId,
        amount: REVERIFY_COST,
        reason: 'reverify:issue',
        issueId: issue.id,
      });
      debitId = charged.id;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        res.status(402).json({
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: error.message,
            details: { required: error.required, available: error.available },
          },
        });
        return;
      }
      throw error;
    }

    // Guarded transition into ASSERTED_FIXED. One conditional updateMany, never
    // read-then-write — the same shape the scan state machine uses.
    const moved = await db.issue.updateMany({
      where: { id: issue.id, state: { in: [...ASSERTABLE_FROM] } },
      data: { state: 'ASSERTED_FIXED', assertedFixedAt: new Date() },
    });
    if (moved.count !== 1) {
      // Someone else asserted it (a double click, a second tab) between our read
      // and our write. Undo the charge and report the conflict.
      await refund(db, debitId, `reverify:lost-assert-race:${issue.id}`).catch((error: unknown) => {
        console.error(`[issues.assert-fixed] refund after lost race failed for ${issue.id}:`, error);
      });
      res.status(409).json({
        error: {
          code: 'ISSUE_NOT_ASSERTABLE',
          message: 'This issue was already asserted fixed. A re-check is already under way.',
        },
      });
      return;
    }

    const { jobId } = await producer.enqueueReverify({
      issueId: issue.id,
      debitTransactionId: debitId,
      creditsCharged: REVERIFY_COST,
    });

    res.status(202).json({
      issue: { id: issue.id, state: 'ASSERTED_FIXED', scanId: issue.scanId },
      reverification: { jobId, creditsCharged: REVERIFY_COST },
    });
  });

  router.get('/issues/:id/attempts', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const issue = await db.issue.findFirst({
      where: { id: pathId(req), scan: { userId } },
      select: { id: true },
    });
    if (issue === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const attempts = await listVerificationAttempts(db, issue.id);
    res.status(200).json({ attempts });
  });

  return router;
}
