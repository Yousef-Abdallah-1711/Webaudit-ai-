/**
 * T206 — operator margin reporting, from contracts/http-api.md's
 * Administration section:
 *
 *   GET /admin/margin   FR-085. Per scan, area, capability.
 *
 * Same wiring note as `admin/plans.routes.ts` and `admin/users.routes.ts`:
 * not yet mounted under `/admin`, not yet wrapped in `requireOperator` —
 * that is T211's job. This route is read-only, so unlike the plans/users
 * mutations it has no audit-log write and no need for `req.auth.userId`;
 * `requireAuth` stays in place purely to match the rest of the admin
 * surface's authentication requirement.
 */

import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../../middleware/auth.middleware.js';
import { getMarginReport } from '../../services/admin/margin.service.js';

function badRequest(res: Response, message: string, details?: unknown): void {
  res.status(400).json({
    error: { code: 'INVALID_REQUEST', message, ...(details === undefined ? {} : { details }) },
  });
}

const marginQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function adminMarginRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/margin', async (req: AuthedRequest, res: Response) => {
    const parsed = marginQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'from and to, if given, must be ISO 8601 datetimes.', parsed.error.flatten());
      return;
    }
    const report = await getMarginReport(db, {
      from: parsed.data.from === undefined ? undefined : new Date(parsed.data.from),
      to: parsed.data.to === undefined ? undefined : new Date(parsed.data.to),
    });
    res.status(200).json({ report });
  });

  router.get('/margin/export', async (req: AuthedRequest, res: Response) => {
    const parsed = marginQuery.safeParse(req.query);
    if (!parsed.success) {
      badRequest(res, 'from and to, if given, must be ISO 8601 datetimes.', parsed.error.flatten());
      return;
    }
    const report = await getMarginReport(db, {
      from: parsed.data.from === undefined ? undefined : new Date(parsed.data.from),
      to: parsed.data.to === undefined ? undefined : new Date(parsed.data.to),
    });
    const rows = [
      ['section', 'id', 'module', 'credits', 'cost_micros', 'count', 'succeeded', 'failed'],
      ...report.perScan.map((row) => [
        'scan',
        row.scanId,
        '',
        row.chargedCredits,
        row.costMicros,
        '',
        '',
        '',
      ]),
      ...report.perArea.map((row) => [
        'area',
        '',
        row.module,
        row.chargedCredits,
        row.costMicros,
        '',
        '',
        '',
      ]),
      ...report.perCapability.map((row) => [
        'capability',
        row.capabilityId,
        row.module,
        '',
        row.costMicros,
        row.executionCount,
        row.succeededCount,
        row.failedCount,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    res
      .status(200)
      .type('text/csv')
      .set('Content-Disposition', 'attachment; filename="margin-report.csv"')
      .send(csv);
  });

  return router;
}
