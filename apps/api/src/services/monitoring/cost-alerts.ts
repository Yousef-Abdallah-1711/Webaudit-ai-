import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';

export interface CostAlertResult {
  readonly fired: number;
  readonly events: readonly {
    scope: string;
    userId: string | null;
    observedMicros: number;
    thresholdMicros: number;
  }[];
}

interface Threshold {
  id: string;
  scope: string;
  windowMinutes: number;
  thresholdMicros: number;
  isEnabled: boolean;
}

async function claimEvent(
  db: PrismaClient,
  input: {
    scope: string;
    userId: string | null;
    windowStart: Date;
    windowEnd: Date;
    observedMicros: number;
    thresholdMicros: number;
  },
): Promise<boolean> {
  const rows = await db.$queryRaw<readonly { id: string }[]>(Prisma.sql`
    INSERT INTO "CostAlertEvent" ("id", "scope", "userId", "windowStart", "windowEnd", "observedMicros", "thresholdMicros")
    SELECT gen_random_uuid()::text, ${input.scope}, ${input.userId}, ${input.windowStart}, ${input.windowEnd}, ${input.observedMicros}, ${input.thresholdMicros}
    WHERE NOT EXISTS (
      SELECT 1 FROM "CostAlertEvent"
      WHERE "scope" = ${input.scope}
        AND COALESCE("userId", '') = COALESCE(CAST(${input.userId} AS text), '')
        AND "windowStart" = ${input.windowStart}
        AND "windowEnd" = ${input.windowEnd}
    )
    RETURNING "id"
  `);
  return rows.length === 1;
}

/** Computes and idempotently records spend breaches. It never touches credit-ledger tables. */
export async function evaluateCostAlerts(
  db: PrismaClient,
  now = new Date(),
): Promise<CostAlertResult> {
  const thresholds = (await db.costAlertThreshold.findMany({
    where: { isEnabled: true },
  })) as Threshold[];
  const events: Array<CostAlertResult['events'][number]> = [];
  for (const threshold of thresholds) {
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - threshold.windowMinutes * 60_000);
    if (threshold.scope === 'GLOBAL') {
      const rows = await db.aiInvocation.aggregate({
        where: { createdAt: { gt: windowStart, lte: windowEnd } },
        _sum: { costMicros: true },
      });
      const observedMicros = rows._sum.costMicros ?? 0;
      if (
        observedMicros >= threshold.thresholdMicros &&
        (await claimEvent(db, {
          scope: threshold.scope,
          userId: null,
          windowStart,
          windowEnd,
          observedMicros,
          thresholdMicros: threshold.thresholdMicros,
        }))
      ) {
        events.push({
          scope: threshold.scope,
          userId: null,
          observedMicros,
          thresholdMicros: threshold.thresholdMicros,
        });
      }
      continue;
    }
    if (threshold.scope !== 'PER_USER') continue;
    const rows = await db.$queryRaw<
      readonly { userId: string; observedMicros: number }[]
    >(Prisma.sql`
      SELECT s."userId", COALESCE(SUM(i."costMicros"), 0)::int AS "observedMicros"
      FROM "AiInvocation" i JOIN "Scan" s ON s."id" = i."scanId"
      WHERE i."createdAt" > ${windowStart} AND i."createdAt" <= ${windowEnd}
      GROUP BY s."userId" HAVING COALESCE(SUM(i."costMicros"), 0) >= ${threshold.thresholdMicros}
    `);
    for (const row of rows) {
      if (
        await claimEvent(db, {
          scope: threshold.scope,
          userId: row.userId,
          windowStart,
          windowEnd,
          observedMicros: Number(row.observedMicros),
          thresholdMicros: threshold.thresholdMicros,
        })
      ) {
        events.push({
          scope: threshold.scope,
          userId: row.userId,
          observedMicros: Number(row.observedMicros),
          thresholdMicros: threshold.thresholdMicros,
        });
      }
    }
  }
  return { fired: events.length, events };
}

export async function listCostAlertThresholds(db: PrismaClient) {
  return db.costAlertThreshold.findMany({ orderBy: { scope: 'asc' } });
}

export async function updateCostAlertThreshold(
  db: PrismaClient,
  scope: string,
  patch: { windowMinutes?: number; thresholdMicros?: number; isEnabled?: boolean },
) {
  return db.costAlertThreshold.update({ where: { scope }, data: patch });
}
