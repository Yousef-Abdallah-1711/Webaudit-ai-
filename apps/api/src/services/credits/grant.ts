/**
 * Credit lot creation. The full ledger — debit, refund, expiry — lands in 2C
 * (T038-T041). This is the one operation registration needs.
 *
 * Principle VI: a balance is the sum of lots. No balance column exists.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { CreditKind, LotSource } from '@webaudit/types';
import { FREE_ALLOCATION } from '@webaudit/config';

export { FREE_ALLOCATION };

interface GrantInput {
  userId: string;
  amount: number;
  kind: CreditKind;
  source: LotSource;
  expiresAt?: Date | null;
}

type Tx = Pick<PrismaClient, 'creditLot' | 'creditTransaction' | 'creditAllocation'>;

export async function grantLot(db: Tx, input: GrantInput): Promise<void> {
  await db.creditLot.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      source: input.source,
      amountGranted: input.amount,
      amountRemaining: input.amount,
      expiresAt: input.expiresAt ?? null,
    },
  });
  await db.creditTransaction.create({
    data: {
      userId: input.userId,
      type: 'GRANT',
      amount: input.amount,
      reason: `grant:${input.source.toLowerCase()}`,
    },
  });
}

/**
 * The free tier's one-time 50 credits. Deliberately below a full audit's 80 —
 * see spec.md, Plan Tiers. `expiresAt` is null: this grant does not renew, so
 * there is no renewal boundary to expire it at.
 */
export function grantFreeAllocation(db: Tx, userId: string): Promise<void> {
  return grantLot(db, {
    userId,
    amount: FREE_ALLOCATION,
    kind: 'PLAN',
    source: 'FREE_GRANT',
    expiresAt: null,
  });
}
