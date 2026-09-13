/**
 * T008's database-backed refund authorization gate.
 *
 * `PaymentProvider.refund(providerReference, amountMicros)` is a thin adapter
 * over Paymob's own refund API — it has no idea what this system recorded
 * about that transaction. Before this module existed, nothing in the
 * codebase called `refund()` at all, so there was no real authorization
 * check anywhere: a caller with a `providerReference` and an amount could
 * request a refund against any transaction, whether or not this system ever
 * recorded it as a real, completed payment. This module is the missing
 * gate: refund only ever proceeds against a `PendingPayment` this system
 * itself recorded as `SUCCEEDED`, and only for an amount that does not
 * exceed what was actually charged.
 *
 * Deliberately out of scope here: whether and how a refund claws back
 * already-granted (and possibly already-spent) credits. FR-P08 requires a
 * refund to "never grant negative credits below zero," which is a real
 * product decision about partial/full clawback semantics this module does
 * not make on its own — see the module note below at the return site. This
 * function's job ends at "was this refund authorized against a real,
 * recorded payment, and did the provider confirm it" — the credit-ledger
 * consequence, if any, is a separate, explicitly deferred decision.
 */
import { PendingPaymentStatus, type PrismaClient } from '../../../prisma/generated/client/index.js';
import type { PaymentProvider, PaymentRefundResult } from './payment-provider.js';

export class RefundNotAuthorizedError extends Error {
  override readonly name = 'RefundNotAuthorizedError';
  constructor(message: string) {
    super(message);
  }
}

export interface RefundPaymentInput {
  readonly providerReference: string;
  readonly amountMicros: number;
}

interface PendingPaymentAuthRow {
  readonly id: string;
  readonly status: PendingPaymentStatus;
  readonly amountMicros: number;
}

/**
 * @throws RefundNotAuthorizedError when no matching payment exists, it was
 *   never recorded as succeeded, or the requested amount exceeds what was
 *   actually charged. Never calls the provider in any of those cases.
 */
export async function refundPayment(
  db: PrismaClient,
  provider: PaymentProvider,
  input: RefundPaymentInput,
): Promise<PaymentRefundResult> {
  if (!Number.isSafeInteger(input.amountMicros) || input.amountMicros <= 0) {
    throw new RefundNotAuthorizedError('Refund amount must be a positive whole number of micros.');
  }

  const rows = await db.$queryRaw<readonly PendingPaymentAuthRow[]>`
    SELECT "id", "status", "amountMicros"
    FROM "PendingPayment"
    WHERE "providerReference" = ${input.providerReference}
    LIMIT 1
  `;
  const pending = rows[0];

  if (pending === undefined) {
    throw new RefundNotAuthorizedError(
      `No recorded payment matches provider reference ${input.providerReference}.`,
    );
  }
  if (pending.status !== PendingPaymentStatus.SUCCEEDED) {
    throw new RefundNotAuthorizedError(
      `Payment ${pending.id} is not in a refundable state (status: ${pending.status}).`,
    );
  }
  if (input.amountMicros > pending.amountMicros) {
    throw new RefundNotAuthorizedError(
      `Refund amount (${String(input.amountMicros)}) exceeds the amount actually charged ` +
        `(${String(pending.amountMicros)}) for payment ${pending.id}.`,
    );
  }

  // The provider call itself, only reached once the authorization above holds.
  // Deliberately not implemented here: writing a BillingEvent/adjusting any
  // CreditLot/CreditTransaction as a consequence of this refund. Whether a
  // refund claws back already-granted credits (and, if the credits were
  // already spent, how a resulting negative balance is prevented per
  // FR-P08) is a product decision this module does not make -- wiring an
  // admin-facing refund endpoint and the credit-ledger consequence is
  // separate, explicitly deferred follow-up work, not silently assumed here.
  return provider.refund(input.providerReference, input.amountMicros);
}
