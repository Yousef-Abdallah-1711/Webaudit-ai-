/**
 * T167 — readiness routes, from contracts/http-api.md:
 *
 *   POST /scans/:id/readiness              FR-066, FR-067. `403` while critical/high remain.
 *   GET  /scans/:id/readiness              FR-068 through FR-072.
 *   GET  /scans/:id/readiness/certificate  FR-072. The shareable artifact.
 *
 * `POST /scans/:baselineScanId/readiness` creates the readiness scan against
 * that baseline (`create.ts`). `GET /scans/:id/readiness` accepts either the
 * baseline's id (→ the premature check + whether a pass has been started) or
 * the readiness scan's id (→ the verdict once it is computed).
 *
 * **The certificate and the congratulations email are generated lazily here**,
 * on the first `GET` that sees a *go* verdict with no `certificateKey` yet —
 * `run.ts` (the worker) writes only the verdict itself, because R2 and the
 * mailer live in `apps/api`. A guarded `updateMany` on `certificateKey: null`
 * makes it happen exactly once; if R2 is not configured the verdict still
 * returns and `certificateKey` stays null (documented, matching how
 * `storage/reports.ts` is real-but-unconsumed until something needs it).
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import type { Mailer } from '../services/email/mailer.js';
import { createConsoleMailer } from '../services/email/mailer.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { InsufficientCreditsError } from '../services/credits/debit.js';
import { QuoteMismatchError } from '../services/intake/create-scan.js';
import {
  BaselineNotEligibleError,
  ReadinessNotOnPlanError,
  ReadinessPrematureError,
  countOutstandingBlocking,
  createReadinessScan,
} from '../services/readiness/create.js';
import {
  generateReadinessCertificate,
  READINESS_CERTIFICATE_KEY,
  type CertificateInput,
} from '../services/readiness/certificate.js';
import { sendReadinessCongratulations } from '../services/email/readiness.js';
import { createReportStorage, type ReportStorage } from '../services/storage/reports.js';
import {
  createScanPhaseProducer,
  type ScanPhaseProducer,
} from '../services/queue/scan-phase-producer.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'No such scan.' } };

export interface ReadinessRoutesDeps {
  producer?: ScanPhaseProducer;
  /** Where the certificate is stored. `null` disables certificate generation. */
  storage?: ReportStorage | null;
  mailer?: Mailer;
  /** Base URL used to build the certificate link in the email. */
  webUrl?: string;
}

function pathId(req: AuthedRequest): string {
  const raw: unknown = req.params['id'];
  return typeof raw === 'string' ? raw : '';
}

const createBody = z.object({ acceptedQuote: z.number().int().nonnegative() });

/** Try to build a real R2 client; a missing config is not fatal here. */
function defaultStorage(): ReportStorage | null {
  try {
    return createReportStorage();
  } catch {
    return null;
  }
}

export function readinessRoutes(db: PrismaClient, deps: ReadinessRoutesDeps = {}): Router {
  const router = Router();
  const producer = deps.producer ?? createScanPhaseProducer();
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const mailer = deps.mailer ?? createConsoleMailer();
  const webUrl = (deps.webUrl ?? process.env['WEB_URL'] ?? '').replace(/\/+$/, '');

  router.use(requireAuth);

  router.post('/scans/:id/readiness', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_REQUEST', message: 'A readiness pass needs an acceptedQuote.' } });
      return;
    }

    try {
      const scan = await createReadinessScan(
        db,
        { userId, baselineScanId: pathId(req), acceptedQuote: parsed.data.acceptedQuote },
        { producer },
      );
      res.status(201).json({ scan });
    } catch (error) {
      if (error instanceof BaselineNotEligibleError) {
        res
          .status(error.reason === 'not-found' ? 404 : 409)
          .json({ error: { code: 'BASELINE_NOT_ELIGIBLE', message: error.message, details: { reason: error.reason } } });
        return;
      }
      if (error instanceof ReadinessNotOnPlanError) {
        res.status(403).json({
          error: {
            code: 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: { requiredTier: error.requiredTier },
          },
        });
        return;
      }
      if (error instanceof ReadinessPrematureError) {
        res.status(403).json({
          error: {
            code: 'READINESS_PREMATURE',
            message: error.message,
            details: { outstandingBlocking: error.outstandingBlocking },
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
      // DuplicateScanError shares the shape used by /scans.
      if (error instanceof Error && error.name === 'DuplicateScanError') {
        res.status(409).json({ error: { code: 'DUPLICATE_SCAN', message: error.message } });
        return;
      }
      throw error;
    }
  });

  router.get('/scans/:id/readiness', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({
      where: { id: pathId(req), userId },
      select: {
        id: true,
        kind: true,
        state: true,
        baselineScanId: true,
        completedAt: true,
        target: { select: { displayName: true, canonicalValue: true } },
        verdict: true,
        derivedScans: { select: { id: true, state: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (scan === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }

    if (scan.kind !== 'READINESS') {
      // Baseline id: report the FR-066 premature status and any pass started.
      const outstandingBlocking = await countOutstandingBlocking(db, scan.id);
      res.status(200).json({
        readiness: {
          baselineScanId: scan.id,
          premature: outstandingBlocking > 0,
          outstandingBlocking,
          readinessScanId: scan.derivedScans[0]?.id ?? null,
          readinessScanState: scan.derivedScans[0]?.state ?? null,
        },
      });
      return;
    }

    if (scan.verdict === null) {
      res.status(200).json({
        readiness: {
          scanId: scan.id,
          baselineScanId: scan.baselineScanId,
          state: scan.state,
          verdict: null,
        },
      });
      return;
    }

    let verdict = scan.verdict;

    // FR-072 — first read of a go verdict: generate the certificate + send the
    // congratulations email, exactly once.
    if (verdict.isReady && verdict.certificateKey === null && storage !== null) {
      const claimed = await db.readinessVerdict.updateMany({
        where: { id: verdict.id, certificateKey: null },
        data: { certificateKey: '' }, // placeholder claim; replaced on success below
      });
      if (claimed.count === 1) {
        try {
          const outcomes = (verdict.moduleOutcomes ??
            []) as unknown as CertificateInput['moduleOutcomes'];
          const cert = await generateReadinessCertificate(storage, {
            scanId: scan.id,
            verdictId: verdict.id,
            targetName: scan.target.displayName || scan.target.canonicalValue,
            overallScore: verdict.overallScore,
            baselineScore: verdict.baselineScore,
            completedAt: scan.completedAt ?? verdict.createdAt,
            moduleOutcomes: outcomes,
          });
          verdict = await db.readinessVerdict.update({
            where: { id: verdict.id },
            data: { certificateKey: cert.certificateKey },
          });
          const user = await db.user.findUniqueOrThrow({
            where: { id: userId },
            select: { email: true },
          });
          await sendReadinessCongratulations(mailer, user.email, {
            targetName: scan.target.displayName || scan.target.canonicalValue,
            score: verdict.overallScore,
            baselineScore: verdict.baselineScore,
            certificateUrl: `${webUrl}/scans/${scan.id}/readiness/certificate`,
            reportUrl: `${webUrl}/reports/${scan.id}`,
          });
        } catch (error) {
          // Never fail a verdict read over the certificate. Release the claim so
          // a later read retries.
          console.error(`[readiness] certificate/email for ${scan.id} failed:`, error);
          await db.readinessVerdict.updateMany({
            where: { id: verdict.id, certificateKey: '' },
            data: { certificateKey: null },
          });
          verdict = { ...verdict, certificateKey: null };
        }
      }
    }

    res.status(200).json({
      readiness: {
        scanId: scan.id,
        baselineScanId: scan.baselineScanId,
        state: scan.state,
        verdict: {
          ...verdict,
          certificateKey: verdict.certificateKey === '' ? null : verdict.certificateKey,
        },
      },
    });
  });

  router.get('/scans/:id/readiness/certificate', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({
      where: { id: pathId(req), userId },
      select: { id: true, verdict: { select: { certificateKey: true } } },
    });
    if (scan === null || scan.verdict?.certificateKey === null || scan.verdict === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
      return;
    }
    if (storage === null) {
      res.status(503).json({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Certificate storage is not configured.' } });
      return;
    }
    try {
      const bytes = await storage.getObject(scan.id, READINESS_CERTIFICATE_KEY);
      res.status(200).type('text/html; charset=utf-8').send(Buffer.from(bytes));
    } catch {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
    }
  });

  return router;
}
