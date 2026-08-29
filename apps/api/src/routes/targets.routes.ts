/**
 * T057 — target and verification routes, from contracts/http-api.md:
 *
 *   GET  /targets                    list
 *   POST /targets                    validates and canonicalises; 422 on SSRF refusal (FR-014)
 *   POST /targets/:id/attest         FR-017 Level 1 — records who and when
 *   POST /targets/:id/verify/start   issues a token; returns what to publish
 *   POST /targets/:id/verify/check   confirms; re-checked again at execution time (R11)
 *
 * Two things here are deliberate and easy to undo by accident.
 *
 * **`POST /targets` never contacts the target.** It runs `assertPublicTarget`,
 * which is form and DNS only. An authenticated endpoint that fetches whatever
 * URL a caller names is the amplifier `safe-net` exists to prevent, and FR-013's
 * reachability check belongs at scan time where the user has accepted a quote.
 *
 * **A missing target and someone else's target return the same 404.** Every
 * handler here resolves the target by (id, userId). Distinguishing "not yours"
 * from "not found" turns these routes into an oracle for which target ids exist.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { SsrfRefusedError, assertPublicTarget } from '@webaudit/safe-net';
import { VERIFICATION_METHODS } from '@webaudit/types';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { AttestationNotPermittedError, attestControl } from '../services/control-gate/attest.js';
import {
  TargetNotAvailableError,
  VerificationFailedError,
  checkVerification,
  createSafeNetProbe,
  startVerification,
  type ControlProbe,
} from '../services/control-gate/verify.js';
import { ACCEPTED_METHODS } from '../services/control-gate/reconfirm.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such target.' } };

export interface TargetRoutesDeps {
  /** How published tokens are read. Injectable so a suite need not host a file. */
  probe?: ControlProbe;
  /**
   * Canonicalises and refuses a URL target. Injectable for the same reason —
   * the default performs a real DNS lookup.
   */
  validateTarget?: (url: string) => Promise<{ origin: string }>;
}

const createTargetBody = z.object({
  inputType: z.enum(['URL', 'REPOSITORY']),
  value: z.string().trim().min(1).max(2048),
  displayName: z.string().trim().min(1).max(200).optional(),
});

const startVerifyBody = z.object({
  method: z.enum(VERIFICATION_METHODS),
});

/** `owner/repo`, the only shape `GET /repos` and the source auditor can act on. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/**
 * Express 5 types `req.params` loosely enough that a repeated `?id=` could
 * arrive as an array. Anything that is not a single string is not an id.
 */
function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

export function targetsRoutes(db: PrismaClient, deps: TargetRoutesDeps = {}): Router {
  const router = Router();
  const probe = deps.probe ?? createSafeNetProbe();
  const validateTarget = deps.validateTarget ?? assertPublicTarget;

  router.use(requireAuth);

  router.get('/', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const targets = await db.target.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        inputType: true,
        canonicalValue: true,
        displayName: true,
        controlLevel: true,
        attestedAt: true,
        createdAt: true,
      },
    });
    res.status(200).json({ targets });
  });

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = createTargetBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'A target needs an inputType of URL or REPOSITORY and a value.', {
        // ARCHIVE targets are created by the upload path, which owns the
        // streaming size and traversal guards (FR-015). Inventing one here
        // would mean a target row with no archive behind it.
        note: 'Archive targets are created by POST /scans/upload.',
      });
      return;
    }

    const { inputType, value, displayName } = parsed.data;

    let canonicalValue: string;
    if (inputType === 'URL') {
      try {
        canonicalValue = (await validateTarget(value)).origin;
      } catch (error) {
        if (error instanceof SsrfRefusedError) {
          // 422: the request was well-formed and we understood it; the target
          // itself is one we refuse to audit.
          res.status(422).json({
            error: {
              code: 'TARGET_REFUSED',
              message: 'That address cannot be audited.',
              details: { reason: error.reason, addressClass: error.addressClass ?? null },
            },
          });
          return;
        }
        throw error;
      }
    } else {
      if (!REPO_PATTERN.test(value)) {
        badRequest(res, 'A repository target must be in owner/repo form.');
        return;
      }
      canonicalValue = value.toLowerCase();
    }

    // FR-018: one target row per user per thing. A repeat submission returns the
    // row that already exists rather than charging into a unique violation — and
    // must not reset the control level established against it.
    const existing = await db.target.findUnique({
      where: { userId_inputType_canonicalValue: { userId, inputType, canonicalValue } },
      select: {
        id: true,
        inputType: true,
        canonicalValue: true,
        displayName: true,
        controlLevel: true,
      },
    });
    if (existing !== null) {
      res.status(200).json({ target: existing });
      return;
    }

    const created = await db.target.create({
      data: { userId, inputType, canonicalValue, displayName: displayName ?? canonicalValue },
      select: {
        id: true,
        inputType: true,
        canonicalValue: true,
        displayName: true,
        controlLevel: true,
      },
    });
    res.status(201).json({ target: created });
  });

  router.post('/:id/attest', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    try {
      const result = await attestControl(db, { targetId: pathId(req), userId });
      res.status(200).json({ target: result });
    } catch (error) {
      if (error instanceof AttestationNotPermittedError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      throw error;
    }
  });

  router.post('/:id/verify/start', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = startVerifyBody.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'A verification method is required.', { methods: ACCEPTED_METHODS });
      return;
    }

    try {
      const issued = await startVerification(db, {
        targetId: pathId(req),
        userId,
        method: parsed.data.method,
      });
      // The token is returned exactly once here, because the user has to publish
      // it. It is not a secret — it is about to be world-readable by design.
      res.status(201).json({ verification: issued });
    } catch (error) {
      if (error instanceof TargetNotAvailableError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof VerificationFailedError) {
        badRequest(res, error.detail, { methods: ACCEPTED_METHODS });
        return;
      }
      throw error;
    }
  });

  router.post('/:id/verify/check', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    try {
      const result = await checkVerification(db, { targetId: pathId(req), userId }, probe);
      res.status(200).json({ verification: result });
    } catch (error) {
      if (error instanceof TargetNotAvailableError) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      if (error instanceof VerificationFailedError) {
        // 409, not 400: the request was correct and the platform did the work.
        // What failed is the state of the world — the token is not published.
        res.status(409).json({
          error: {
            code: 'VERIFICATION_NOT_CONFIRMED',
            message: error.detail,
            details: { method: error.method, methods: ACCEPTED_METHODS },
          },
        });
        return;
      }
      throw error;
    }
  });

  return router;
}
