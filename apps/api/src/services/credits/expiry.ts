/**
 * T041 — Renewal expiry sweep.
 *
 * FR-078: unused plan credits expire at renewal; purchased credits never do.
 *
 * The sweep only ever touches lots with a non-null `expiresAt` at or before the
 * sweep instant. Every PURCHASED lot has `expiresAt = null`, so it cannot be
 * selected — that is the half of SC-022 the schema makes true by construction
 * rather than by this function being careful.
 *
 * A swept lot is left *observably* expired, not merely emptied. See the clamp
 * below: an emptied lot that still claims a future boundary is a lot a refund
 * will happily pour credits back into.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { withRetry } from '../../db/retry.js';

export interface ExpiryResult {
  lotsExpired: number;
  creditsDestroyed: number;
}

export async function expireRenewedLots(
  db: PrismaClient,
  userId: string,
  asOf: Date = new Date(),
): Promise<ExpiryResult> {
  return withRetry(
    () =>
      db.$transaction(async (tx) => {
        /**
         * Locked, and raw SQL for the same reason `debit` gives: Prisma cannot
         * express `FOR UPDATE`, and this was the one credit mutator without it.
         *
         * The unlocked version read a snapshot, totalled it, then blocked on the
         * row lock a concurrent debit was holding and zeroed whatever was
         * actually left — so `creditsDestroyed` described a state that no longer
         * existed. Principle VI makes the movement history the authoritative
         * balance, so that EXPIRE row is not a cosmetic overstatement: a
         * statement rebuilt from `CreditTransaction` disagrees with the lots by
         * exactly the racing debit, and can sum below zero. This file's own note
         * below says silent destruction is what makes users distrust a balance;
         * an EXPIRE for credits that were spent rather than lost is the same
         * problem wearing a receipt.
         *
         * `ORDER BY id` fixes the lock order. `refund` now locks the same rows,
         * and two transactions taking the same locks in opposite orders is a
         * deadlock rather than a wait.
         */
        const dead = await tx.$queryRaw<{ id: string; amountRemaining: number }[]>`
          SELECT id, "amountRemaining"
          FROM "CreditLot"
          WHERE "userId" = ${userId}
            AND "amountRemaining" > 0
            -- Load-bearing: this is what excludes every purchased lot.
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" <= ${asOf}
          ORDER BY id
          FOR UPDATE
        `;

        if (dead.length === 0) return { lotsExpired: 0, creditsDestroyed: 0 };

        // Totalled from the locked read, so it describes the rows about to be
        // zeroed rather than the rows as they were before someone else's commit.
        const creditsDestroyed = dead.reduce((n, l) => n + l.amountRemaining, 0);
        const ids = dead.map((l) => l.id);

        await tx.creditLot.updateMany({
          where: { id: { in: ids } },
          data: { amountRemaining: 0 },
        });

        /**
         * "Swept" and "expired" must be the same observable state.
         *
         * Zeroing `amountRemaining` alone is not enough when `asOf` is ahead of
         * the wall clock — a renewal boundary being swept at is, by construction.
         * Such a lot keeps an `expiresAt` in the future, so every reader that
         * compares against `new Date()` still calls it alive: `refund` walks
         * credits back into it and resurrects credits this very transaction wrote
         * an EXPIRE against, and `balanceOf` would count them again the moment
         * they were resurrected.
         *
         * Clamping the boundary to the instant the destruction is actually
         * observable closes that without a new column. `deadAt` is the earlier of
         * the sweep instant and now: a back-dated sweep leaves the (already past)
         * boundary alone, while a forward-dated one records that these credits
         * died here.
         *
         * The `gt` filter is load-bearing — the clamp may only ever move a
         * boundary earlier. Writing `deadAt` unconditionally would push an
         * already-expired lot's boundary forward and hand back a lifetime it
         * never had.
         */
        const deadAt = new Date(Math.min(asOf.getTime(), Date.now()));
        await tx.creditLot.updateMany({
          where: { id: { in: ids }, expiresAt: { gt: deadAt } },
          data: { expiresAt: deadAt },
        });

        // Recorded as a movement so FR-076's history explains where the credits
        // went. Silent destruction is what makes users distrust a balance.
        await tx.creditTransaction.create({
          data: {
            userId,
            type: 'EXPIRE',
            amount: creditsDestroyed,
            reason: 'expire:renewal',
          },
        });

        return { lotsExpired: dead.length, creditsDestroyed };
      }),
    'expireRenewedLots',
  );
}

/** How many plan credits a user is about to lose. Drives the FR-078 warning. */
export async function creditsExpiringBefore(
  db: Pick<PrismaClient, 'creditLot'>,
  userId: string,
  boundary: Date,
): Promise<number> {
  const lots = await db.creditLot.findMany({
    where: { userId, amountRemaining: { gt: 0 }, expiresAt: { not: null, lte: boundary } },
    select: { amountRemaining: true },
  });
  return lots.reduce((n, l) => n + l.amountRemaining, 0);
}
