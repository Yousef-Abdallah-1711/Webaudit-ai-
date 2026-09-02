/**
 * T186 — purchasing credits outside the plan allocation (FR-078).
 *
 * Purchased credits are a `PURCHASED` `CreditLot` with `expiresAt = null`. That
 * null is load-bearing three ways:
 *
 *   - the renewal expiry sweep only selects lots with a non-null `expiresAt`,
 *     so a purchase survives every renewal (SC-022's first half);
 *   - `debit` orders `expiresAt ASC NULLS LAST` then PLAN-before-PURCHASED, so
 *     plan credits are always spent first (SC-022's second half);
 *   - `balanceOf` reports it under `purchased`, distinct from `plan`.
 *
 * **Refused on the free tier** (`Plan.allowCreditPurchase = false`), so the
 * free allocation stays an evaluation of the product rather than a route around
 * subscribing. `assertEntitled(..., 'CREDIT_PURCHASE')` is the check.
 *
 * The money itself moves externally. `webhooks.routes.ts` calls this on a
 * confirmed payment; `POST /billing/credits/purchase` calls it directly for the
 * dev and test path (the currency amount is a commercial decision the spec
 * leaves open).
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { grantLot } from '../credits/grant.js';
import { assertEntitled } from './entitlements.js';

export class InvalidPurchaseAmountError extends Error {
  override readonly name = 'InvalidPurchaseAmountError';
  constructor() {
    super('A credit purchase must be a positive whole number of credits.');
  }
}

export interface PurchaseResult {
  readonly creditsAdded: number;
  readonly kind: 'PURCHASED';
}

export async function purchaseCredits(
  db: PrismaClient,
  input: { readonly userId: string; readonly credits: number },
): Promise<PurchaseResult> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new InvalidPurchaseAmountError();
  }

  // FR-078: not on the free tier. Throws EntitlementError (→ 403) if refused.
  await assertEntitled(db, input.userId, 'CREDIT_PURCHASE');

  await db.$transaction((tx) =>
    grantLot(tx, {
      userId: input.userId,
      amount: input.credits,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    }),
  );

  return { creditsAdded: input.credits, kind: 'PURCHASED' };
}
