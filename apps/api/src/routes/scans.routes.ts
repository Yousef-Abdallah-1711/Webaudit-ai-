/**
 * T112 — scan routes, from contracts/http-api.md:
 *
 *   POST /scans/quote     FR-011. Cost for a module selection. Charges nothing.
 *   POST /scans           FR-012. Explicit acceptedQuote. 402/403/409 as documented.
 *   GET  /scans/:id       FR-047. Authoritative current state.
 *   POST /scans/:id/cancel FR-037. Stops future phases from running.
 *
 * **Cancel is scoped, and the scope is honest, not silent.** FR-037 in full
 * is "stops work, destroys workspace, refunds undelivered." This handler
 * writes the guarded terminal transition — a scan once CANCELLED can never
 * be moved anywhere by `apps/worker`'s own `transition()` guard
 * (`state-machine.ts`'s `ALLOWED` table has no outgoing edges from a
 * terminal state), so no future phase ever starts. It also refunds the
 * undelivered share itself, using the same `refundForUndelivered` (shared
 * with the timeout sweep and `apps/worker`'s `terminal-refund.ts` observer)
 * and `refundPartial` (single-shot per debit) that those call sites use —
 * cancellation never goes through `transition()`, so it cannot rely on that
 * observer and has to do this at the source. The workspace-teardown observers
 * registered in `state-machine.ts` are process-local to `apps/worker` and
 * likewise never fire for a row this process writes, so this handler enqueues
 * a `workspace-teardown` job onto the maintenance queue directly (see
 * `teardown-producer.ts`) instead of relying on that observer (2026-09-02
 * review, Finding 10 — previously a documented gap).
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  MODULE_STATES_SCORED,
  MODULE_TYPES,
  SCAN_STATES_TERMINAL,
  type ControlLevel,
  type ModuleState,
} from '@webaudit/types';
import {
  DESIGN_INTENT_QUESTIONS,
  DESIGN_INTENT_WAIT_MS,
  refundForUndelivered,
} from '@webaudit/config';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { EntitlementError } from '../services/billing/entitlements.js';
import { InsufficientCreditsError } from '../services/credits/debit.js';
import { refundPartial } from '../services/credits/refund.js';
import { ControlLevelRequiredError } from '../services/control-gate/reconfirm.js';
import {
  TargetNotAvailableError,
  createSafeNetProbe,
  type ControlProbe,
} from '../services/control-gate/verify.js';
import {
  DuplicateScanError,
  QueueAtCapacityError,
  PlanUpgradeRequiredError,
  QuoteMismatchError,
  createScan,
} from '../services/intake/create-scan.js';
import { quoteFor } from '../services/intake/quote.js';
import {
  RepositoryConnectionMissingError,
  RepositoryConnectionRevokedError,
} from '../services/intake/repos.js';
import {
  createScanPhaseProducer,
  type ScanPhaseProducer,
} from '../services/queue/scan-phase-producer.js';
import {
  createTeardownProducer,
  type TeardownProducer,
} from '../services/queue/teardown-producer.js';
import { createCancelPublisher, type CancelPublisher } from '../services/queue/cancel-publisher.js';
import {
  QuestionnaireAlreadyResolvedError,
  QuestionnaireScanNotFoundError,
  answerQuestionnaire,
  skipQuestionnaire,
} from '../services/scans/questionnaire.service.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such scan.' } };

export interface ScanRoutesDeps {
  probe?: ControlProbe;
  producer?: ScanPhaseProducer;
  teardownProducer?: TeardownProducer;
  /** P0-CANCEL-1's seam — see `cancel-publisher.ts`'s own module note. */
  cancelPublisher?: CancelPublisher;
  resolveRequiredControlLevel?: (moduleType: string) => ControlLevel | Promise<ControlLevel>;
  /** T171's seam — see `CreateScanDeps.checkRepositoryConnection`. */
  checkRepositoryConnection?: (db: PrismaClient, userId: string) => Promise<void>;
}

const quoteBody = z.object({
  targetId: z.string().trim().min(1),
  modules: z.array(z.enum(MODULE_TYPES)).min(1),
});

const createBody = z.object({
  targetId: z.string().trim().min(1),
  modules: z.array(z.enum(MODULE_TYPES)).min(1),
  acceptedQuote: z.number().int().nonnegative(),
});

/** FR-040: every field optional — a partial answer is still an answer. */
const questionnaireAnswerBody = z.object({
  audience: z.string().trim().min(1).optional(),
  stylePreference: z.string().trim().min(1).optional(),
  admiredReferences: z.array(z.string()).optional(),
  brandColors: z.array(z.string()).optional(),
});

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

/**
 * The cancel route's post-write re-fetch, scoped to the caller (P3
 * hardening, full-workflow review Section 6g). The guarded `updateMany` the
 * cancel route runs immediately before this already proves ownership, so a
 * bare-id lookup here was never reachable with a mismatched user in
 * practice — a scan `id` is a unique primary key, so it can only ever name
 * the one row it already names. But the query itself carried no evidence of
 * that scoping, unlike this codebase's own stated discipline for anything
 * touching a user-owned row. Exported (mirroring
 * `apps/api/src/middleware/ratelimit.middleware.ts`'s own `clientKey`) so the
 * scoping is directly testable on its own.
 */
export function fetchCancelledScanForUser(db: PrismaClient, scanId: string, userId: string) {
  return db.scan.findFirstOrThrow({
    where: { id: scanId, userId },
    include: { moduleResults: { select: { state: true } } },
  });
}

export function scansRoutes(db: PrismaClient, deps: ScanRoutesDeps = {}): Router {
  const router = Router();
  const probe = deps.probe ?? createSafeNetProbe();
  const producer = deps.producer ?? createScanPhaseProducer();
  const teardownProducer = deps.teardownProducer ?? createTeardownProducer();
  const cancelPublisher = deps.cancelPublisher ?? createCancelPublisher();
  const resolveRequiredControlLevel = deps.resolveRequiredControlLevel ?? (() => 'NONE' as const);

  router.use(requireAuth);

  router.post('/quote', (req: AuthedRequest, res: Response) => {
    const parsed = quoteBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'A quote needs a targetId and at least one module.');
      return;
    }
    res.status(200).json({ quote: quoteFor(parsed.data.modules) });
  });

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'A scan needs a targetId, at least one module, and an acceptedQuote.');
      return;
    }

    try {
      const scan = await createScan(
        db,
        { userId, ...parsed.data },
        {
          probe,
          producer,
          resolveRequiredControlLevel,
          ...(deps.checkRepositoryConnection === undefined
            ? {}
            : { checkRepositoryConnection: deps.checkRepositoryConnection }),
          ...(producer.getWaitingCount === undefined
            ? {}
            : { getQueueDepth: () => producer.getWaitingCount!() }),
        },
      );
      res.status(201).json({ scan });
    } catch (error) {
      if (error instanceof TargetNotAvailableError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof DuplicateScanError) {
        res.status(409).json({
          error: {
            code: 'DUPLICATE_SCAN',
            message: error.message,
            details: { scanId: error.scanId },
          },
        });
        return;
      }
      if (error instanceof QueueAtCapacityError) {
        res.status(503).json({
          error: {
            code: 'QUEUE_AT_CAPACITY',
            message: error.message,
            details: { depth: error.depth, capacity: error.capacity },
          },
        });
        return;
      }
      if (error instanceof PlanUpgradeRequiredError) {
        res.status(403).json({
          error: {
            code: 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: { inputType: error.inputType, requiredTier: error.requiredTier },
          },
        });
        return;
      }
      if (error instanceof EntitlementError) {
        res.status(403).json({
          error: {
            code:
              error.feature === 'CONCURRENCY'
                ? 'CONCURRENT_LIMIT_REACHED'
                : 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: {
              feature: error.feature,
              current: error.currentTier,
              requiredTier: error.requiredTier,
            },
          },
        });
        return;
      }
      // T171. 409, matching `GET /repos`: the request is well-formed and the
      // caller is authenticated — what is wrong is a precondition they can fix
      // by reconnecting. Nothing was charged; `createScan` refuses ahead of
      // the debit.
      if (
        error instanceof RepositoryConnectionMissingError ||
        error instanceof RepositoryConnectionRevokedError
      ) {
        res.status(409).json({
          error: {
            code:
              error instanceof RepositoryConnectionMissingError
                ? 'REPO_CONNECTION_MISSING'
                : 'REPO_CONNECTION_REVOKED',
            message: error.message,
          },
        });
        return;
      }
      if (error instanceof ControlLevelRequiredError) {
        res.status(403).json({
          error: {
            code: 'CONTROL_LEVEL_REQUIRED',
            message: error.message,
            details: { required: error.required, current: error.current, methods: error.methods },
          },
        });
        return;
      }
      if (error instanceof QuoteMismatchError) {
        res.status(422).json({
          error: {
            code: 'QUOTE_MISMATCH',
            message: error.message,
            details: { currentCredits: error.currentCredits, acceptedQuote: error.acceptedQuote },
          },
        });
        return;
      }
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
  });

  router.get('/:id', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    // `target` and `moduleResults` are included for the live-progress screen
    // — additive only, every existing field on `scan` is untouched.
    // `moduleResults` closes a real gap found in manual testing: per-module
    // status in ScanProgress.tsx updated only from realtime WebSocket
    // events with no REST fallback, so a dropped connection left every
    // badge stuck on "Waiting" forever even after the scan completed.
    // FR-047's "current state served from the database" on resync now
    // covers per-module state too, not just the aggregate scan state.
    const scan = await db.scan.findFirst({
      where: { id: pathId(req), userId },
      include: {
        target: { select: { displayName: true } },
        moduleResults: { select: { module: true, state: true } },
      },
    });
    if (scan === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const queuePosition =
      scan.state === 'QUEUED' && producer.getQueuePosition !== undefined
        ? await producer.getQueuePosition(scan.id)
        : null;
    res.status(200).json({ scan: { ...scan, queuePosition } });
  });

  router.post('/:id/cancel', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const result = await db.scan.updateMany({
      where: { id: pathId(req), userId, state: { notIn: [...SCAN_STATES_TERMINAL] } },
      data: { state: 'CANCELLED', completedAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await db.scan.findFirst({
        where: { id: pathId(req), userId },
        select: { id: true },
      });
      res
        .status(exists === null ? 404 : 409)
        .json(
          exists === null
            ? NOT_FOUND
            : { error: { code: 'ALREADY_TERMINAL', message: 'This scan has already ended.' } },
        );
      return;
    }

    // P0-CANCEL-1: a best-effort accelerant so a worker already handling a
    // phase for this scan can stop before it starts (or persists) further
    // work, rather than waiting to discover the cancellation at its next
    // phase-boundary transition. Published only now, after the guarded write
    // above has actually committed — never before — and its own failure
    // handling (cancel-publisher.ts) means it can never undo or delay this
    // already-succeeded cancellation.
    await cancelPublisher.publishCancellation(pathId(req));

    // FR-090/SC-015's fourth exit path: cancellation never reaches apps/worker's
    // transition() (see this route's own module note), so the workspace
    // teardown observer registered there never fires. Enqueue it directly,
    // out-of-band — a failure here must not undo the cancellation that already
    // committed above.
    try {
      await teardownProducer.enqueueTeardown({ scanId: pathId(req) });
    } catch (error) {
      console.error(`[scans.cancel] teardown enqueue failed for scan ${pathId(req)}:`, error);
    }

    // Refund whatever was charged for work that had not yet run. Cancellation
    // never goes through apps/worker's transition(), so it cannot rely on
    // terminal-refund.ts's observer — it refunds itself, at the source. The
    // CANCELLED write above has already committed, so nothing below this
    // point may propagate unhandled — a re-fetch or lookup that throws here
    // (transient DB error, pool exhaustion) would otherwise surface as a 500
    // to a client whose cancellation actually succeeded, and there is no
    // retry path: a repeated cancel call finds the scan already terminal and
    // never reaches this refund logic again, leaving the credits permanently
    // unrefundable. The whole lookup-through-refund sequence is therefore one
    // try/catch, matching how terminal-refund.ts wraps its own.
    const fetchScanWithResults = () => fetchCancelledScanForUser(db, pathId(req), userId);

    let scan: Awaited<ReturnType<typeof fetchScanWithResults>> | undefined;
    try {
      scan = await fetchScanWithResults();
      const deliveredCount = scan.moduleResults.filter((r) =>
        (MODULE_STATES_SCORED as readonly ModuleState[]).includes(r.state),
      ).length;
      const creditsRefunded = refundForUndelivered({
        chargedCredits: scan.chargedCredits,
        requestedCount: scan.requestedModules.length,
        deliveredCount,
      });
      if (creditsRefunded > 0) {
        const debitTx = await db.creditTransaction.findFirst({
          where: { scanId: scan.id, type: 'DEBIT' },
          select: { id: true },
        });
        if (debitTx) {
          await refundPartial(db, {
            debitTransactionId: debitTx.id,
            credits: creditsRefunded,
            reason: `cancelled:${String(scan.moduleResults.length)}-of-${String(scan.requestedModules.length)}-modules-ran`,
          });
        }
      }
    } catch (error) {
      // The cancellation itself already succeeded and must not be undone by
      // a refund failure — log loudly, respond 200 regardless, matching
      // terminal-refund.ts's own "log and continue" rule. If the scan lookup
      // itself is what failed, `scan` is still unset here — one more attempt
      // so the response can still carry the now-cancelled scan; a second
      // failure back to back is a genuine outage, not this bug, and is left
      // to propagate.
      console.error(`[scans.cancel] refund failed for scan ${pathId(req)}:`, error);
      scan ??= await fetchScanWithResults();
    }

    res.status(200).json({ scan });
  });

  // T199/T200 — FR-040/FR-041/FR-042. The route side of the questionnaire
  // race against `apps/worker`'s own delayed deadline job; see
  // `services/scans/questionnaire.service.ts`'s module note for the ordering
  // discipline and why this cannot simply call into `apps/worker`.
  router.get('/:id/questionnaire', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({
      where: { id: pathId(req), userId },
      select: { state: true, questionnaireDeadline: true },
    });
    if (scan === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    // Valid at any state, not only mid-pause: a client polling this route
    // needs to know the deadline while waiting, and needs an unambiguous
    // signal to stop showing the prompt once the pause has ended, however it
    // ended (answered, skipped, or defaulted).
    res.status(200).json({
      questionnaire: {
        state: scan.state,
        resolved: scan.state !== 'AWAITING_QUESTIONNAIRE',
        questionnaireDeadline: scan.questionnaireDeadline,
        questions: DESIGN_INTENT_QUESTIONS,
        waitMs: DESIGN_INTENT_WAIT_MS,
      },
    });
  });

  router.post('/:id/questionnaire', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = questionnaireAnswerBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'The questionnaire answer is malformed.', parsed.error.flatten());
      return;
    }

    try {
      await answerQuestionnaire(db, producer, {
        scanId: pathId(req),
        userId,
        answer: parsed.data,
      });
    } catch (error) {
      if (error instanceof QuestionnaireScanNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof QuestionnaireAlreadyResolvedError) {
        res.status(409).json({
          error: {
            code: 'QUESTIONNAIRE_ALREADY_RESOLVED',
            message:
              'This questionnaire is no longer waiting for an answer — it was already answered, skipped, or its deadline already passed.',
          },
        });
        return;
      }
      throw error;
    }

    const scan = await db.scan.findUniqueOrThrow({ where: { id: pathId(req) } });
    res.status(200).json({ scan });
  });

  router.post('/:id/questionnaire/skip', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;

    try {
      await skipQuestionnaire(db, producer, { scanId: pathId(req), userId });
    } catch (error) {
      if (error instanceof QuestionnaireScanNotFoundError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof QuestionnaireAlreadyResolvedError) {
        res.status(409).json({
          error: {
            code: 'QUESTIONNAIRE_ALREADY_RESOLVED',
            message:
              'This questionnaire is no longer waiting for an answer — it was already answered, skipped, or its deadline already passed.',
          },
        });
        return;
      }
      throw error;
    }

    const scan = await db.scan.findUniqueOrThrow({ where: { id: pathId(req) } });
    res.status(200).json({ scan });
  });

  return router;
}
