/**
 * T118 — report and issue read routes, from contracts/http-api.md:
 *
 *   GET /scans/:id/report    FR-048. Score, summary, per-area results.
 *   GET /scans/:id/issues    FR-057. Filter by severity and state.
 *   GET /issues/:id          FR-050, FR-051.
 *
 * **There is no `Report` row anywhere in the schema.** data-model.md is
 * explicit that a report is synthesized on read from `Scan` +
 * `ModuleResult[]` + `Issue[]` — this file is that synthesis, not a
 * passthrough to a stored document.
 *
 * **`Scan.overallScore`/`Scan.summary` are whatever T114 last wrote**,
 * `null`/absent until `RUNNING_MASTER` runs. A report requested before a
 * scan reaches that phase still returns `200` with a null score — FR-053's
 * "never invent a number" applies here exactly as it does inside
 * `overallScore()` itself.
 *
 * Three routes here, two different path prefixes (`/scans/...`,
 * `/issues/...`), so this router is mounted at the application root rather
 * than under one prefix, the same way `oauthRoutes` is mounted at `/auth`
 * alongside `authRoutes` rather than nested under it.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import { SEVERITIES, ISSUE_STATES } from '@webaudit/types';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { ReportNotExportableError, exportReport } from '../services/storage/export.js';

const NOT_FOUND_SCAN = { error: { code: 'NOT_FOUND', message: 'No such scan.' } };
const NOT_FOUND_ISSUE = { error: { code: 'NOT_FOUND', message: 'No such issue.' } };

function pathParam(req: AuthedRequest, name: string): string {
  const raw: unknown = req.params[name];
  return typeof raw === 'string' ? raw : '';
}

const issueFilter = z.object({
  severity: z.enum(SEVERITIES).optional(),
  state: z.enum(ISSUE_STATES).optional(),
});

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: 'INVALID_REQUEST', message } });
}

export function reportsRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/scans/:id/report', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({
      where: { id: pathParam(req, 'id'), userId },
      include: {
        moduleResults: {
          select: {
            module: true,
            state: true,
            score: true,
            summary: true,
            skippedReason: true,
            degradedReason: true,
          },
        },
      },
    });
    if (scan === null) {
      res.status(404).json(NOT_FOUND_SCAN);
      return;
    }

    // FR-092: a report whose retention period lapsed is removed, not returned.
    // The row survives so the credit history still resolves it.
    if (scan.reportRemovedAt !== null) {
      res.status(410).json({
        error: {
          code: 'REPORT_REMOVED',
          message: 'This report passed its retention period and has been removed.',
          details: { removedAt: scan.reportRemovedAt },
        },
      });
      return;
    }

    const issues = await db.issue.findMany({
      where: { scanId: scan.id },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      // `module` is on ModuleResult, not Issue itself — flattened onto each
      // issue below so a client can filter/group by area without a second
      // round trip or cross-referencing `moduleResultId` by hand.
      include: { moduleResult: { select: { module: true } } },
    });

    res.status(200).json({
      report: {
        scanId: scan.id,
        state: scan.state,
        // Never coerced — null means no area produced a score (FR-053).
        score: scan.overallScore,
        summary: scan.summary,
        areas: scan.moduleResults,
        issues: issues.map(({ moduleResult, ...issue }) => ({ ...issue, module: moduleResult.module })),
      },
    });
  });

  router.get('/scans/:id/issues', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const parsed = issueFilter.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'severity must be one of the known severities and state one of the known states.');
      return;
    }

    const scan = await db.scan.findFirst({
      where: { id: pathParam(req, 'id'), userId },
      select: { id: true },
    });
    if (scan === null) {
      res.status(404).json(NOT_FOUND_SCAN);
      return;
    }

    const issues = await db.issue.findMany({
      where: {
        scanId: scan.id,
        ...(parsed.data.severity === undefined ? {} : { severity: parsed.data.severity }),
        ...(parsed.data.state === undefined ? {} : { state: parsed.data.state }),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
    });
    res.status(200).json({ issues });
  });

  router.get('/scans/:id/export', async (req: AuthedRequest, res: Response) => {
    // FR-093 — a self-contained artifact so the report outlives retention.
    try {
      const { html, filename } = await exportReport(db, {
        scanId: pathParam(req, 'id'),
        userId: req.auth!.userId,
      });
      res
        .status(200)
        .type('text/html; charset=utf-8')
        .set('Content-Disposition', `attachment; filename="${filename}"`)
        .send(html);
    } catch (error) {
      if (error instanceof ReportNotExportableError) {
        res
          .status(error.reason === 'not-found' ? 404 : error.reason === 'removed' ? 410 : 409)
          .json({ error: { code: 'NOT_EXPORTABLE', message: error.message, details: { reason: error.reason } } });
        return;
      }
      throw error;
    }
  });

  router.get('/issues/:id', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    // Ownership is via the issue's scan — the same 404-for-both pattern
    // every other route in this codebase uses for "not found" vs "not yours".
    const issue = await db.issue.findFirst({
      where: { id: pathParam(req, 'id'), scan: { userId } },
    });
    if (issue === null) {
      res.status(404).json(NOT_FOUND_ISSUE);
      return;
    }
    res.status(200).json({ issue });
  });

  return router;
}
