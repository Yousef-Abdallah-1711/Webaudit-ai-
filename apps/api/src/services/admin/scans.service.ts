/**
 * Operator visibility into real scans (admin console's Scans screen).
 *
 * `admin/scans/page.tsx` shipped as a Server Component rendering five
 * hardcoded placeholder rows — real wiring was never built. This is the
 * list-only read side; nothing here mutates a scan.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

export interface AdminScanSummary {
  readonly id: string;
  readonly userEmail: string;
  readonly targetDisplayName: string;
  readonly state: string;
  readonly requestedModules: readonly string[];
  readonly chargedCredits: number;
  readonly overallScore: number | null;
  readonly createdAt: Date;
}

export interface ListScansResult {
  readonly scans: readonly AdminScanSummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export async function listScans(
  db: PrismaClient,
  opts: { readonly limit?: number | undefined; readonly offset?: number | undefined } = {},
): Promise<ListScansResult> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db.scan.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        state: true,
        requestedModules: true,
        chargedCredits: true,
        overallScore: true,
        createdAt: true,
        user: { select: { email: true } },
        target: { select: { displayName: true } },
      },
    }),
    db.scan.count(),
  ]);

  const scans = rows.map(
    (row): AdminScanSummary => ({
      id: row.id,
      userEmail: row.user.email,
      targetDisplayName: row.target.displayName,
      state: row.state,
      requestedModules: row.requestedModules,
      chargedCredits: row.chargedCredits,
      overallScore: row.overallScore,
      createdAt: row.createdAt,
    }),
  );

  return { scans, total, limit, offset };
}
