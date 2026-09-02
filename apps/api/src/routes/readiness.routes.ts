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
 * on a `GET` that sees a *go* verdict — `run.ts` (the worker) writes only the
 * verdict itself, because R2 and the mailer live in `apps/api`. The two are
 * guarded independently: a `updateMany` on `certificateKey: null` claims
 * certificate generation exactly once, and a separate `updateMany` on
 * `certificateEmailSentAt: null` claims the email exactly once. They do not
 * share a guard — a mailer failure must retry on the next `GET` without
 * regenerating an already-stored certificate, and a certificate failure must
 * not be gated on the email ever sending. If R2 is not configured the verdict
 * still returns and `certificateKey` stays null (documented, matching how
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
import { EntitlementError } from '../services/billing/entitlements.js';
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

/**
 * Placeholder claim value for `certificateEmailSentAt`, distinguishable from
 * any real send timestamp (which will always be long after this date). Never
 * read back as a real "sent at" time — only written by the claim, and only
 * ever followed by either a real timestamp (success) or `null` (release).
 */
const EMAIL_CLAIM_SENTINEL = new Date(0);

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
      res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'A readiness pass needs an acceptedQuote.' },
      });
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
        res.status(error.reason === 'not-found' ? 404 : 409).json({
          error: {
            code: 'BASELINE_NOT_ELIGIBLE',
            message: error.message,
            details: { reason: error.reason },
          },
        });
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
      // FR-079, same envelope as /scans's own EntitlementError case.
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
        derivedScans: {
          select: { id: true, state: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
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

    // FR-072 — first read of a go verdict: generate the certificate, exactly
    // once. Independent of the email step below: a failure here must not be
    // able to leave the email guard stuck, and vice versa (see the fix note
    // on the email step for the regression this split closes).
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
        } catch (error) {
          // Never fail a verdict read over the certificate. Release the claim
          // so a later read retries.
          console.error(`[readiness] certificate for ${scan.id} failed:`, error);
          await db.readinessVerdict.updateMany({
            where: { id: verdict.id, certificateKey: '' },
            data: { certificateKey: null },
          });
          verdict = { ...verdict, certificateKey: null };
        }
      }
    }

    // FR-072 / T166 — send the congratulations email, exactly once, guarded
    // on its own field rather than reusing certificateKey's placeholder.
    //
    // Fix (2026-09-02 engineering review, Finding 1): the email used to share
    // certificateKey's guard. If the email step threw *after* the block above
    // had already committed the real certificateKey, the release-on-failure
    // `updateMany` filtered on the old placeholder value ('') — which no
    // longer matched anything, since the success path had just overwritten
    // it — so the reset silently no-op'd and the email was skipped forever
    // with no retry. certificateEmailSentAt is a second, independent
    // claim/release guard: nothing but this block ever writes it, so its
    // claim-then-release pair can't be defeated by another block's success
    // write the way certificateKey's was.
    if (
      verdict.isReady &&
      verdict.certificateKey !== null &&
      verdict.certificateKey !== '' &&
      verdict.certificateEmailSentAt === null
    ) {
      const claimedEmail = await db.readinessVerdict.updateMany({
        where: { id: verdict.id, certificateEmailSentAt: null },
        data: { certificateEmailSentAt: EMAIL_CLAIM_SENTINEL },
      });
      if (claimedEmail.count === 1) {
        try {
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
          verdict = await db.readinessVerdict.update({
            where: { id: verdict.id },
            data: { certificateEmailSentAt: new Date() },
          });
        } catch (error) {
          console.error(`[readiness] congratulations email for ${scan.id} failed:`, error);
          await db.readinessVerdict.updateMany({
            where: { id: verdict.id, certificateEmailSentAt: EMAIL_CLAIM_SENTINEL },
            data: { certificateEmailSentAt: null },
          });
          verdict = { ...verdict, certificateEmailSentAt: null };
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
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
      return;
    }
    if (scan.verdict.certificateKey === '') {
      res.status(202).json({
        error: {
          code: 'CERTIFICATE_GENERATING',
          message: 'The certificate is being generated; try again shortly.',
        },
      });
      return;
    }
    if (storage === null) {
      res.status(503).json({
        error: { code: 'STORAGE_UNAVAILABLE', message: 'Certificate storage is not configured.' },
      });
      return;
    }
    try {
      const bytes = await storage.getObject(scan.id, READINESS_CERTIFICATE_KEY);
      res.status(200).type('text/html; charset=utf-8').send(Buffer.from(bytes));
    } catch {
      res
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
    }
  });

  return router;
}
