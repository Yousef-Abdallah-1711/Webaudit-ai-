/**
 * T038 — Lot-ordered debit in a serializable transaction.
 *
 * FR-078: expiring credits are consumed first.
 * FR-074: a shortfall is reported before any work starts, never mid-operation.
 * Principle VI: no balance column — the balance is the sum of unexpired lots.
 *
 * The whole operation is one transaction with the candidate lots locked
 * `FOR UPDATE`. Two audits starting simultaneously is the ordinary case on a
 * Pro plan (three concurrent scans), and without the lock both would read the
 * same `amountRemaining`, both decide they can afford it, and both decrement.
 *
 * Deliberately READ COMMITTED, not Serializable. The row lock is what prevents
 * overselling — a locked lot cannot be modified by anyone not holding its lock —
 * so Serializable added 40001 aborts without adding safety. The only thing
 * READ COMMITTED misses is a lot inserted concurrently, and a new grant can only
 * *add* credits, so not seeing it is conservative: we may report a shortfall a
 * concurrent grant would have covered, but we can never oversell.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { withRetry } from '../../db/retry.js';

export class InsufficientCreditsError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Insufficient credits: ${required} required, ${available} available`);
    this.name = 'InsufficientCreditsError';
  }
}

export interface DebitInput {
  userId: string;
  amount: number;
  reason: string;
  scanId?: string;
  issueId?: string;
}

interface LockedLot {
  id: string;
  amountRemaining: number;
}

export interface DebitResult {
  id: string;
  amount: number;
}

export async function debit(db: PrismaClient, input: DebitInput): Promise<DebitResult> {
  if (input.amount <= 0) throw new Error('debit amount must be positive');

  return withRetry(
    () =>
      db.$transaction(async (tx) => {
        const now = new Date();

        /**
         * Consumption order, and the reason this is raw SQL rather than a Prisma
         * query: Prisma cannot express `FOR UPDATE`, and without the row lock the
         * ordering guarantee is decoration.
         *
         * Three keys, in this order and for three different reasons:
         *
         * 1. `expiresAt ASC NULLS LAST` — credits about to die are spent first
         *    (FR-078). This is and stays the leading key: a purchased credit must
         *    never be spent ahead of a plan credit that has a deadline.
         * 2. `kind`, PLAN before PURCHASED — the tiebreak `expiresAt` alone cannot
         *    make. A null `expiresAt` means "no deadline", which is true of every
         *    PURCHASED lot *and* of a PLAN lot that does not renew: the free
         *    tier's one-time grant (`grantFreeAllocation`) is exactly that. Those
         *    two tie in the NULLS LAST group, so without this key the winner is
         *    decided by `createdAt` — and a user who bought credits before
         *    spending their free grant would have the purchase drawn first,
         *    violating SC-022 with no refund involved at all. Spelled as a CASE
         *    rather than `"kind" ASC` so the guarantee does not silently depend on
         *    the declaration order of the CreditKind enum.
         * 3. `createdAt ASC` — deterministic, oldest-first among genuine equals.
         */
        const lots = await tx.$queryRaw<LockedLot[]>`
        SELECT id, "amountRemaining"
        FROM "CreditLot"
        WHERE "userId" = ${input.userId}
          AND "amountRemaining" > 0
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
        ORDER BY "expiresAt" ASC NULLS LAST,
                 CASE WHEN "kind" = 'PLAN' THEN 0 ELSE 1 END ASC,
                 "createdAt" ASC
        FOR UPDATE
      `;

        const available = lots.reduce((n, l) => n + l.amountRemaining, 0);
        if (available < input.amount) {
          // Nothing has been written, and the throw rolls back the lock. FR-074
          // reports the shortfall rather than starting and failing.
          throw new InsufficientCreditsError(input.amount, available);
        }

        const transaction = await tx.creditTransaction.create({
          data: {
            userId: input.userId,
            type: 'DEBIT',
            amount: input.amount,
            reason: input.reason,
            scanId: input.scanId ?? null,
            issueId: input.issueId ?? null,
          },
        });

        let outstanding = input.amount;
        for (const lot of lots) {
          if (outstanding === 0) break;
          const take = Math.min(lot.amountRemaining, outstanding);

          await tx.creditLot.update({
            where: { id: lot.id },
            data: { amountRemaining: { decrement: take } },
          });
          // The allocation is what makes a later refund correct: it records which
          // lot each credit came from, which a balance column cannot.
          await tx.creditAllocation.create({
            data: { transactionId: transaction.id, lotId: lot.id, amount: take },
          });

          outstanding -= take;
        }

        return { id: transaction.id, amount: transaction.amount };
      }),
    'debit',
  );
}
