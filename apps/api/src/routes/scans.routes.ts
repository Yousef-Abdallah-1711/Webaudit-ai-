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
 * observer and has to do this at the source. What it does *not* do: the
 * workspace-teardown observers registered in `state-machine.ts` are
 * process-local to `apps/worker` and never fire for a row this process
 * writes. That gap is follow-up work; recorded in PROGRESS.md rather than
 * left as a silent gap.
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
import { refundForUndelivered } from '@webaudit/config';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
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
  PlanUpgradeRequiredError,
  QuoteMismatchError,
  createScan,
} from '../services/intake/create-scan.js';
import { quoteFor } from '../services/intake/quote.js';
import {
  createScanPhaseProducer,
  type ScanPhaseProducer,
} from '../services/queue/scan-phase-producer.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such scan.' } };

export interface ScanRoutesDeps {
  probe?: ControlProbe;
  producer?: ScanPhaseProducer;
  resolveRequiredControlLevel?: (moduleType: string) => ControlLevel | Promise<ControlLevel>;
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

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

export function scansRoutes(db: PrismaClient, deps: ScanRoutesDeps = {}): Router {
  const router = Router();
  const probe = deps.probe ?? createSafeNetProbe();
  const producer = deps.producer ?? createScanPhaseProducer();
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
        { probe, producer, resolveRequiredControlLevel },
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
    const scan = await db.scan.findFirst({ where: { id: pathId(req), userId } });
    if (scan === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    res.status(200).json({ scan });
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
    const fetchScanWithResults = () =>
      db.scan.findUniqueOrThrow({
        where: { id: pathId(req) },
        include: { moduleResults: { select: { state: true } } },
      });

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

  return router;
}
