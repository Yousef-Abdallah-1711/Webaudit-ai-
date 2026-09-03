/**
 * Credit lot creation. The full ledger — debit, refund, expiry — lands in 2C
 * (T038-T041). This is the one operation registration needs.
 *
 * Principle VI: a balance is the sum of lots. No balance column exists.
 */
import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';
import type { CreditKind, LotSource } from '@webaudit/types';
import { FREE_ALLOCATION } from '@webaudit/config';

export { FREE_ALLOCATION };

interface GrantInput {
  userId: string;
  amount: number;
  kind: CreditKind;
  source: LotSource;
  expiresAt?: Date | null;
  /**
   * The BillingEvent whose effect this grant is. Only a webhook-driven grant
   * sets this (PROGRESS.md Open Decision #15) — omit it for registration's
   * free allocation and the direct dev/test billing routes, which have no
   * provider event to deduplicate against.
   */
  billingEventId?: string | null;
}

type Tx = Pick<PrismaClient, 'creditLot' | 'creditTransaction' | 'creditAllocation'>;

export class DuplicateBillingEventGrantError extends Error {
  override readonly name = 'DuplicateBillingEventGrantError';
  constructor(readonly billingEventId: string) {
    super(`Credits were already granted for billing event ${billingEventId}.`);
  }
}

/**
 * A Postgres 23505 surfaced by Prisma as P2002 whose `meta.target` names
 * `billingEventId` (matches `create-scan.ts`'s own copy of this check for its
 * own unique index — Prisma reports the raw column list, not the index name).
 */
function isBillingEventIdConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const raw: unknown = error.meta?.['target'];
  const asText = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string').join(',')
    : typeof raw === 'string'
      ? raw
      : '';
  return asText.includes('billingEventId') || asText === '';
}

export async function grantLot(db: Tx, input: GrantInput): Promise<void> {
  // The CreditTransaction insert goes FIRST, not the lot: if this is a
  // duplicate delivery of a billing event already granted, the conflict must
  // be detected before any lot is created — that's what makes the whole
  // grant a no-op under a caller's $transaction, not a lot committed with
  // nothing to prevent a second one on the next retry.
  try {
    await db.creditTransaction.create({
      data: {
        userId: input.userId,
        type: 'GRANT',
        amount: input.amount,
        reason: `grant:${input.source.toLowerCase()}`,
        billingEventId: input.billingEventId ?? null,
      },
    });
  } catch (error) {
    if (
      input.billingEventId !== undefined &&
      input.billingEventId !== null &&
      isBillingEventIdConflict(error)
    ) {
      throw new DuplicateBillingEventGrantError(input.billingEventId);
    }
    throw error;
  }

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
