/**
 * T039 — Refund by walking allocations back to their originating lots.
 *
 * FR-075: a user is never charged for our failures.
 *
 * "Give back 50 credits" has no single correct answer once operations
 * interleave — unless the system recorded which lots the debit drew from.
 * Getting it wrong destroys credits someone paid cash for, or hands out
 * permanent credits in place of expiring ones. This is the case a two-column
 * balance cannot handle, and the reason CreditAllocation exists.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { withRetry } from '../../db/retry.js';
import type { CreditKind } from '@webaudit/types';

export class NotRefundableError extends Error {
  override readonly name = 'NotRefundableError';
}
export class AlreadyRefundedError extends Error {
  override readonly name = 'AlreadyRefundedError';
}

export class OverRefundError extends Error {
  override readonly name = 'OverRefundError';
  constructor(
    readonly requested: number,
    readonly maxRefundable: number,
  ) {
    super(
      `refund of ${String(requested)} exceeds the ${String(maxRefundable)} ever charged on this debit`,
    );
  }
}

export interface RefundResult {
  id: string;
  type: string;
  amount: number;
  reversesId: string | null;
}

const DAY_MS = 86_400_000;

/**
 * The horizon a refunded plan credit gets when no renewal boundary exists to
 * anchor it to: no subscription row, or one whose `periodEnd` is already past.
 *
 * Thirty days is the period length every plan tier is defined in
 * (`Plan.monthlyCredits`), so a refund issued outside a known period behaves
 * like a grant made at the start of one. It must be a real future date rather
 * than null: `null` means "never expires", which is what a PURCHASED credit is,
 * and a plan credit that never expires would sort level with cash-bought
 * credits in the debit order and let purchases be spent first (SC-022).
 */
export const REFUND_HORIZON_DAYS = 30;

interface Orphan {
  kind: CreditKind;
  expiresAt: Date | null;
  amount: number;
}

/**
 * Refund a partial amount from a debit — at most what was charged on it.
 * Only one refund is allowed per debit (reversesId is @unique in the schema).
 *
 * `refund()` is now a thin wrapper: "refund everything charged" is
 * just the largest legal value of `credits` this function accepts. One
 * lot-walk, one place SC-022's invariants have to hold.
 */
export async function refundPartial(
  db: PrismaClient,
  input: { readonly debitTransactionId: string; readonly credits: number; readonly reason: string },
): Promise<RefundResult> {
  if (input.credits <= 0) {
    throw new NotRefundableError('refund amount must be a positive number of credits');
  }

  return withRetry(
    () =>
      db.$transaction(async (tx) => {
        const original = await tx.creditTransaction.findUnique({
          where: { id: input.debitTransactionId },
          include: { allocations: { include: { lot: true } } },
        });

        if (!original) throw new NotRefundableError('no such transaction');
        if (original.type !== 'DEBIT') {
          throw new NotRefundableError(`cannot refund a ${original.type} transaction`);
        }

        // A single refund can never exceed what was charged on the debit.
        if (input.credits > original.amount) {
          throw new OverRefundError(input.credits, original.amount);
        }

        // `reversesId` is unique in the schema, so only one refund is allowed per debit.
        const existing = await tx.creditTransaction.findFirst({
          where: { reversesId: original.id },
        });
        if (existing) throw new AlreadyRefundedError(`already refunded by ${existing.id}`);

        const refundTx = await tx.creditTransaction.create({
          data: {
            userId: original.userId,
            type: 'REFUND',
            amount: input.credits,
            reason: input.reason,
            scanId: original.scanId,
            issueId: original.issueId,
            reversesId: original.id,
          },
        });

        /**
         * Lock every lot this refund might write to, and re-read it.
         *
         * `original.allocations[].lot` came from an unlocked `include`, and
         * `lotIsAlive` was decided from that snapshot. The expiry sweep clamps
         * `expiresAt` into the past, so between the read and the `increment`
         * below a lot could stop being alive — and the credits landed in it
         * anyway. They are then unspendable for ever, with no EXPIRE ever
         * written against them: the user is told they were refunded and their
         * balance does not move. FR-075 promises a refund on platform fault, and
         * a refund that cannot be spent is not one.
         *
         * `ORDER BY id` matches the sweep's lock order. Two transactions taking
         * the same locks in opposite orders deadlock instead of queueing.
         */
        const lotIds = [...new Set(original.allocations.map((a) => a.lotId))].sort();
        const locked = new Map<string, { expiresAt: Date | null; amountRemaining: number }>();
        if (lotIds.length > 0) {
          const rows = await tx.$queryRaw<
            { id: string; expiresAt: Date | null; amountRemaining: number }[]
          >`
            SELECT id, "expiresAt", "amountRemaining"
            FROM "CreditLot"
            WHERE id = ANY(${lotIds}::text[])
            ORDER BY id
            FOR UPDATE
          `;
          for (const row of rows) {
            locked.set(row.id, { expiresAt: row.expiresAt, amountRemaining: row.amountRemaining });
          }
        }

        /**
         * Read **after** the lock, and the ordering is the whole fix.
         *
         * Taken before, `now` predates whatever the sweep committed while this
         * transaction waited for the lock. The sweep clamps `expiresAt` to the
         * instant it ran, so a lot could come back from the lock carrying a
         * boundary a few milliseconds *later* than this `now` — and be judged
         * alive by a clock reading from before it died. Measured at 17ms in the
         * failing case: the refund poured 60 credits into a lot that had expired
         * seventeen milliseconds earlier, where they stayed, unspendable and
         * unaccounted for.
         *
         * Reading the clock after the lock means every comparison below is made
         * against a moment at or after every commit this transaction waited on.
         */
        const now = new Date();

        /**
         * The renewal boundary refunded plan credits should die at, read inside
         * this transaction so it cannot drift from the lots being written.
         * Resolved at most once, and only if a plan orphan actually appears.
         */
        let planBoundary: Date | undefined;
        const planRefundBoundary = async (): Promise<Date> => {
          if (planBoundary) return planBoundary;
          const sub = await tx.subscription.findUnique({
            where: { userId: original.userId },
            select: { periodEnd: true },
          });
          // Status is deliberately not filtered on: a cancelled subscription
          // still owns its current period, and `periodEnd` is where plan credits
          // die either way. A boundary already past is no boundary at all.
          planBoundary =
            sub && sub.periodEnd > now
              ? sub.periodEnd
              : new Date(now.getTime() + REFUND_HORIZON_DAYS * DAY_MS);
          return planBoundary;
        };

        /**
         * A replacement lot must carry an expiry consistent with its kind, not
         * merely the kind itself. PURCHASED never expires. PLAN always does —
         * dropping its expiry would quietly promote an expiring credit to a
         * permanent one and, because the debit orders by
         * `expiresAt ASC NULLS LAST`, would let it tie with purchased lots and
         * lose to any older purchase.
         */
        const refundLotExpiry = async (
          kind: CreditKind,
          sourceExpiresAt: Date | null,
        ): Promise<Date | null> => {
          if (kind === 'PURCHASED') return null;
          // A source boundary still in the future is the right one; extending it
          // would hand the user more time than the credits ever had.
          if (sourceExpiresAt !== null && sourceExpiresAt > now) return sourceExpiresAt;
          return planRefundBoundary();
        };

        // A dead lot cannot receive credits back, so anything owed to one is
        // regrouped into a fresh lot of the same kind and lifetime. A user must
        // never be refunded into credits that expired while we held them.
        const orphans = new Map<string, Orphan>();
        const addOrphan = async (
          kind: CreditKind,
          sourceExpiresAt: Date | null,
          amount: number,
        ): Promise<void> => {
          if (amount <= 0) return;
          const expiresAt = await refundLotExpiry(kind, sourceExpiresAt);
          const key = `${kind}|${expiresAt?.toISOString() ?? 'never'}`;
          const seen = orphans.get(key);
          if (seen) seen.amount += amount;
          else orphans.set(key, { kind, expiresAt, amount });
        };

        // Proportional share per allocation, floored down; the largest
        // allocation absorbs the flooring remainder so the shares sum to
        // exactly `input.credits`, never more. Same "round down" rule as
        // `refundForUndelivered` — here the remainder lands on the largest
        // share rather than being dropped, since this refund's total is
        // fixed by the caller, not derived from the split itself.
        const shares = original.allocations.map((alloc) => ({
          alloc,
          share: Math.floor((alloc.amount * input.credits) / original.amount),
        }));
        let remainder = input.credits - shares.reduce((sum, s) => sum + s.share, 0);
        for (const s of [...shares].sort((a, b) => b.alloc.amount - a.alloc.amount)) {
          if (remainder <= 0) break;
          s.share += 1;
          remainder -= 1;
        }

        for (const { alloc, share } of shares) {
          if (share <= 0) continue;
          const current = locked.get(alloc.lotId);
          const expiresAt = current?.expiresAt ?? alloc.lot.expiresAt;
          const amountRemaining = current?.amountRemaining ?? alloc.lot.amountRemaining;
          const lotIsAlive = expiresAt === null || expiresAt > now;

          if (lotIsAlive) {
            // Never return more than the lot originally granted: two refunds
            // against one lot must not inflate it past its own grant.
            //
            // Floored at zero. `amountGranted - amountRemaining` is a headroom,
            // and a negative one would make `giveBack` negative, skip the
            // `giveBack > 0` update, and then compute an `overflow` *larger*
            // than the allocation — minting credits from nothing in the
            // replacement lot. Unreachable today (an over-granted lot has never
            // been produced), and free to close.
            const headroom = Math.max(0, alloc.lot.amountGranted - amountRemaining);
            const giveBack = Math.min(share, headroom);
            if (giveBack > 0) {
              await tx.creditLot.update({
                where: { id: alloc.lot.id },
                data: { amountRemaining: { increment: giveBack } },
              });
              await tx.creditAllocation.create({
                data: { transactionId: refundTx.id, lotId: alloc.lot.id, amount: giveBack },
              });
            }
            const overflow = share - giveBack;
            if (overflow > 0) await addOrphan(alloc.lot.kind, expiresAt, overflow);
          } else {
            await addOrphan(alloc.lot.kind, expiresAt, share);
          }
        }

        for (const orphan of orphans.values()) {
          const replacement = await tx.creditLot.create({
            data: {
              userId: original.userId,
              kind: orphan.kind,
              source: 'REFUND',
              amountGranted: orphan.amount,
              amountRemaining: orphan.amount,
              // The kind is preserved *and* so is its lifetime: a refunded
              // purchased credit stays permanent, a refunded plan credit stays
              // expiring — on a live boundary rather than one already past.
              expiresAt: orphan.expiresAt,
            },
          });
          await tx.creditAllocation.create({
            data: { transactionId: refundTx.id, lotId: replacement.id, amount: orphan.amount },
          });
        }

        return {
          id: refundTx.id,
          type: refundTx.type,
          amount: refundTx.amount,
          reversesId: refundTx.reversesId,
        };
      }),
    'refund-partial',
  );
}

/** Refund everything charged on one debit — `refundPartial` at its largest legal value. */
export async function refund(
  db: PrismaClient,
  debitTransactionId: string,
  reason: string,
): Promise<RefundResult> {
  const original = await db.creditTransaction.findUnique({ where: { id: debitTransactionId } });
  if (!original) throw new NotRefundableError('no such transaction');
  if (original.type !== 'DEBIT')
    throw new NotRefundableError(`cannot refund a ${original.type} transaction`);

  const priorRefunds = await db.creditTransaction.findMany({
    where: { reversesId: debitTransactionId },
    select: { id: true },
  });
  if (priorRefunds.length > 0) {
    throw new AlreadyRefundedError(`already refunded by ${priorRefunds[0]!.id}`);
  }

  return refundPartial(db, { debitTransactionId, credits: original.amount, reason });
}
