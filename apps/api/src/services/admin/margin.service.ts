/**
 * T206 — operator margin reporting (FR-085, SC-009): "Operators MUST be able
 * to see revenue, provider cost, and resulting margin per audit, per area,
 * and per capability." SC-009: "margin is attributable to the individual
 * capability that caused the cost."
 *
 * **No dollar-margin figure is computed here, and that is deliberate, not an
 * oversight.** `Scan.chargedCredits` (revenue) is denominated in credits.
 * `CapabilityExecution.costMicros` (cost) is denominated in real USD micros
 * — genuine provider spend, recorded by `@webaudit/ai-executor` per
 * Principle VI. This codebase has no credit-to-dollar conversion rate
 * anywhere (PROGRESS.md's Open Decision #3: "Monetary price points for the
 * four tiers are unset"). Subtracting one from the other, or dividing one by
 * an invented rate, would fabricate a number this codebase has no basis for.
 * So revenue and cost are reported side by side wherever revenue has a real
 * basis (per scan and per area — see below), and no `marginMicros` /
 * `marginUsd` field exists anywhere. `note` says this in the response
 * itself so a client never has to guess why the field is missing.
 *
 * The three levels FR-085 names:
 *
 *  - **Per audit (scan)**: `chargedCredits` (as charged, not quoted — a scan
 *    may be charged less than quoted, see `packages/config/src/refund.ts`)
 *    against that scan's own executions' summed `costMicros`.
 *  - **Per area (module)**: cost sums natively via Prisma `groupBy` on
 *    `CapabilityExecution.module` (a plain scalar column). Revenue does not:
 *    `Scan.requestedModules` is a native array column with no relational
 *    table to join or group on, and a scan's `chargedCredits` is a single
 *    lump sum never decomposed per module at charge time. This service
 *    attributes a scan's revenue to each of its requested areas by an even
 *    split, floor-rounded — the same divide-by-requested-count shape this
 *    codebase already uses for refunds (`refundForUndelivered`). It is an
 *    attribution convention, not a fabricated rate: it stays in credits
 *    throughout, never touches `costMicros`, and is called out in `note`.
 *    **Unlike `refundForUndelivered`, the remainder here is not tracked
 *    anywhere**: when `chargedCredits` does not divide evenly across
 *    `requestedModules.length`, the leftover credits (at most
 *    `requestedModules.length - 1`) are simply not attributed to any area —
 *    summing a scan's own per-area rows back up can total strictly less than
 *    its real `chargedCredits`. Acceptable for a read-only report over
 *    real money that is never moved by this figure; not acceptable if this
 *    number is ever used for anything that writes back to the ledger.
 *  - **Per capability**: the SC-009 assertion's actual target. Grouped by
 *    `capabilityId` via `groupBy(['capabilityId', 'module', 'succeeded'])` —
 *    real aggregation, not a JS sum over every row — then merged in memory
 *    only to fold the `succeeded` split back into one row per capability
 *    (at most two input rows per capability). No revenue figure is reported
 *    at this level at all: a capability execution carries no credit charge
 *    of its own, so inventing one here (even an even split) would be a
 *    number with no reference in any table.
 */

import type { ModuleType } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

const DEFAULT_WINDOW_DAYS = 90;

export interface MarginWindow {
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
}

export interface ScanMarginRow {
  readonly scanId: string;
  /** Revenue, in credits, as actually charged (not quoted). */
  readonly chargedCredits: number;
  /** Real provider cost, in USD micros, summed over this scan's executions. */
  readonly costMicros: number;
}

export interface AreaMarginRow {
  readonly module: ModuleType;
  /**
   * Revenue in credits, attributed to this area by an even, floor-rounded
   * split of each contributing scan's `chargedCredits` across its
   * `requestedModules` — see this file's module note. Never mixed with
   * `costMicros`.
   */
  readonly chargedCredits: number;
  /** Real provider cost, in USD micros, summed over this area's executions. */
  readonly costMicros: number;
}

export interface CapabilityMarginRow {
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly module: ModuleType;
  /** Real provider cost, in USD micros, summed over this capability's executions. */
  readonly costMicros: number;
  readonly executionCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
}

export interface MarginReport {
  readonly window: { readonly from: string; readonly to: string };
  readonly perScan: readonly ScanMarginRow[];
  readonly perArea: readonly AreaMarginRow[];
  readonly perCapability: readonly CapabilityMarginRow[];
  /** Explains, in the response itself, why no computed dollar margin exists. */
  readonly note: string;
}

const NOTE =
  'Revenue (chargedCredits) is denominated in credits; cost (costMicros) is real USD micros. ' +
  'This codebase has no published credit-to-dollar conversion rate, so no computed margin ' +
  "figure is reported. Per-area revenue is an even, floor-rounded split of each scan's " +
  'chargedCredits across its requestedModules (the same attribution shape used for refunds) ' +
  '-- unlike a refund, any leftover credits from that rounding are not attributed to any area, ' +
  "so a scan's own per-area rows can sum to slightly less than its real chargedCredits. " +
  'Per-capability rows carry cost only, since a single capability execution has no credit ' +
  'charge of its own.';

function resolveWindow(input: MarginWindow): { from: Date; to: Date } {
  const to = input.to ?? new Date();
  const from = input.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getMarginReport(
  db: PrismaClient,
  window: MarginWindow = {},
): Promise<MarginReport> {
  const { from, to } = resolveWindow(window);
  const scanWhere = { createdAt: { gte: from, lte: to } };

  // --- Per scan: revenue from Scan itself, cost via a native groupBy on
  // CapabilityExecution restricted to scans in the window (via the relation
  // filter, so this stays a real database aggregation, not a JS sum).
  const scans = await db.scan.findMany({
    where: scanWhere,
    select: { id: true, chargedCredits: true, requestedModules: true },
  });
  const scanIds = scans.map((s) => s.id);

  const costByScan = await db.capabilityExecution.groupBy({
    by: ['scanId'],
    where: { scanId: { in: scanIds } },
    _sum: { costMicros: true },
  });
  const costByScanMap = new Map<string, number>(
    costByScan.map((r) => [r.scanId, r._sum.costMicros ?? 0]),
  );

  const perScan: ScanMarginRow[] = scans.map((s) => ({
    scanId: s.id,
    chargedCredits: s.chargedCredits,
    costMicros: costByScanMap.get(s.id) ?? 0,
  }));

  // --- Per area (module): cost is a native groupBy. Revenue has no
  // relational path (requestedModules is an array column) — attributed here
  // by an even, floor-rounded split per scan, in credits only (see the
  // module note above and `packages/config/src/refund.ts`'s precedent).
  const costByModule = await db.capabilityExecution.groupBy({
    by: ['module'],
    where: { scan: scanWhere },
    _sum: { costMicros: true },
  });
  const areaCostMap = new Map<ModuleType, number>(
    costByModule.map((r) => [r.module, r._sum.costMicros ?? 0]),
  );

  const areaRevenueMap = new Map<ModuleType, number>();
  for (const scan of scans) {
    const modules = scan.requestedModules;
    if (modules.length === 0) continue;
    const share = Math.floor(scan.chargedCredits / modules.length);
    for (const module of modules) {
      areaRevenueMap.set(module, (areaRevenueMap.get(module) ?? 0) + share);
    }
  }

  const allModules = new Set<ModuleType>([...areaCostMap.keys(), ...areaRevenueMap.keys()]);
  const perArea: AreaMarginRow[] = [...allModules].map((module) => ({
    module,
    chargedCredits: areaRevenueMap.get(module) ?? 0,
    costMicros: areaCostMap.get(module) ?? 0,
  }));

  // --- Per capability: the SC-009 target. Real groupBy on
  // (capabilityId, module, succeeded) — at most two rows per capability,
  // folded together here rather than summed from raw execution rows.
  const capabilityGroups = await db.capabilityExecution.groupBy({
    by: ['capabilityId', 'module', 'succeeded'],
    where: { scan: scanWhere },
    _sum: { costMicros: true },
    _count: { _all: true },
  });

  interface Accum {
    module: ModuleType;
    costMicros: number;
    executionCount: number;
    succeededCount: number;
    failedCount: number;
  }
  const byCapability = new Map<string, Accum>();
  for (const g of capabilityGroups) {
    const existing = byCapability.get(g.capabilityId) ?? {
      module: g.module,
      costMicros: 0,
      executionCount: 0,
      succeededCount: 0,
      failedCount: 0,
    };
    existing.costMicros += g._sum.costMicros ?? 0;
    existing.executionCount += g._count._all;
    if (g.succeeded) existing.succeededCount += g._count._all;
    else existing.failedCount += g._count._all;
    byCapability.set(g.capabilityId, existing);
  }

  const capabilityIds = [...byCapability.keys()];
  const capabilities = await db.capability.findMany({
    where: { id: { in: capabilityIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(capabilities.map((c) => [c.id, c.name]));

  const perCapability: CapabilityMarginRow[] = capabilityIds.map((capabilityId) => {
    const acc = byCapability.get(capabilityId)!;
    return {
      capabilityId,
      capabilityName: nameById.get(capabilityId) ?? capabilityId,
      module: acc.module,
      costMicros: acc.costMicros,
      executionCount: acc.executionCount,
      succeededCount: acc.succeededCount,
      failedCount: acc.failedCount,
    };
  });

  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    perScan,
    perArea,
    perCapability,
    note: NOTE,
  };
}
