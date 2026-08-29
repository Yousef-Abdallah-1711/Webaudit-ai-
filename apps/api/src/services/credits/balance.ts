/**
 * T040 — Derived balance.
 *
 * Principle VI: "the balance is the sum of movements". There is no balance
 * column in the schema, so this is the only way to read one — enforced
 * structurally rather than by convention.
 *
 * Two figures, never one (FR-078): plan credits expire at renewal, purchased
 * credits do not, so a single number would hide which half a user is about to
 * lose.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { CreditBalance, CreditKind } from '@webaudit/types';

type LotReader = Pick<PrismaClient, 'creditLot'>;

export async function balanceOf(db: LotReader, userId: string): Promise<CreditBalance> {
  const now = new Date();
  const lots = await db.creditLot.findMany({
    where: {
      userId,
      amountRemaining: { gt: 0 },
      // An expired lot still exists as a row; it just cannot be counted or spent.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { kind: true, amountRemaining: true, expiresAt: true },
  });

  const sum = (kind: CreditKind): number =>
    lots.filter((l) => l.kind === kind).reduce((n, l) => n + l.amountRemaining, 0);

  // The soonest plan expiry is what the user is about to lose, which is what
  // FR-078's pre-renewal warning has to state.
  const nextExpiry = lots
    .filter((l) => l.kind === 'PLAN' && l.expiresAt !== null)
    .map((l) => l.expiresAt as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    plan: sum('PLAN'),
    purchased: sum('PURCHASED'),
    planExpiresAt: nextExpiry ?? null,
  };
}

/** Total spendable now. For affordability checks only — never displayed as one figure. */
export async function totalAvailable(db: LotReader, userId: string): Promise<number> {
  const b = await balanceOf(db, userId);
  return b.plan + b.purchased;
}
