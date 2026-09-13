/**
 * The single, shared "verified payment event -> applied effect" path.
 *
 * Both `POST /webhooks/billing` (the real webhook delivery) and
 * `GET /billing/payment-return` (T011's signed-redirect completion fallback)
 * must apply a `PaymentEvent` through the exact same idempotency and
 * cross-validation machinery — whichever one reaches a given transaction
 * first has to "win" and the other has to become a safe no-op, and both need
 * the same durable `BillingEvent` audit row regardless of which path
 * completed the payment. Before this module existed, the redirect route
 * called `applyProviderPaymentEvent` directly and skipped the
 * `BillingEvent` gate/finalization entirely — a payment completed only via
 * the redirect fallback (the exact scenario that fallback exists for) left
 * no `BillingEvent` row at all, breaking reconciliation (FR-P09) for that
 * payment. This module is the fix: one function, `applyVerifiedPaymentEvent`,
 * that both routes call instead of each re-implementing the sequence.
 */
import {
  Prisma,
  PendingPaymentStatus,
  type PrismaClient,
} from '../../../prisma/generated/client/index.js';
import { subscribe } from './subscription.service.js';
import { purchaseCredits } from './purchase.service.js';
import type { PaymentEvent } from './payment-provider.js';
import { createReceiptForPaymentEvent } from './receipt.js';
import { transitionPendingPayment } from './pending-payment.js';
import type { Mailer } from '../email/mailer.js';

interface PendingPaymentRow {
  readonly id: string;
  readonly userId: string;
  readonly kind: string;
  readonly amountMicros: number;
  readonly status: PendingPaymentStatus;
  readonly metadata: unknown;
}

function metadataValue(metadata: unknown, key: string): string | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
    return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

async function findPendingPayment(
  db: PrismaClient,
  providerReference: string,
): Promise<PendingPaymentRow | null> {
  const rows = await db.$queryRaw<readonly PendingPaymentRow[]>`
    SELECT "id", "userId", "kind", "amountMicros", "status", "metadata"
    FROM "PendingPayment"
    WHERE "providerReference" = ${providerReference}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function eventMatchesPending(event: PaymentEvent, pending: PendingPaymentRow): boolean {
  if (event.userId !== pending.userId) return false;
  if (event.amountMicros !== pending.amountMicros) return false;
  if (event.metadata.kind !== pending.kind) return false;
  if (metadataValue(pending.metadata, 'kind') !== event.metadata.kind) return false;

  if (event.metadata.kind === 'subscription') {
    return (
      event.metadata.planId !== undefined &&
      event.metadata.planId === metadataValue(pending.metadata, 'planId')
    );
  }
  if (event.metadata.kind === 'credits') {
    return (
      event.metadata.credits !== undefined &&
      event.metadata.credits === metadataValue(pending.metadata, 'credits')
    );
  }
  return false;
}

/**
 * Applies one already-HMAC-verified event's effect: subscribe/purchase credits,
 * write a receipt, and close the pending payment. Idempotent by construction —
 * `grantLot`'s `billingEventId` uniqueness (via `purchaseCredits`/`subscribe`)
 * and `createReceiptForPaymentEvent`'s `ON CONFLICT DO NOTHING` both make a
 * second call for the same `event.id` a safe no-op, which is what lets this
 * run from two different completion paths (webhook, redirect) racing for the
 * same transaction without double-granting.
 *
 * Callers must go through `applyVerifiedPaymentEvent` below, not this
 * function directly, so the `BillingEvent` gate/finalization is never skipped.
 */
async function applyProviderPaymentEvent(db: PrismaClient, event: PaymentEvent): Promise<void> {
  const terminalStatus =
    event.type === 'payment.succeeded'
      ? PendingPaymentStatus.SUCCEEDED
      : event.type === 'payment.failed'
        ? PendingPaymentStatus.FAILED
        : event.type === 'subscription.cancelled'
          ? PendingPaymentStatus.CANCELLED
          : undefined;
  if (terminalStatus === undefined) return;

  const pending = await findPendingPayment(db, event.providerReference);
  if (pending === null) {
    throw new Error(`No pending payment for provider reference ${event.providerReference}.`);
  }
  if (pending.status !== PendingPaymentStatus.PENDING) return;
  if (!eventMatchesPending(event, pending)) {
    throw new Error(`Payment event ${event.id} does not match its pending payment.`);
  }

  if (event.type === 'payment.succeeded' && event.metadata.kind === 'subscription') {
    await subscribe(db, {
      userId: event.userId,
      planId: event.metadata.planId!,
      billingEventId: event.id,
    });
  } else if (event.type === 'payment.succeeded' && event.metadata.kind === 'credits') {
    await purchaseCredits(db, {
      userId: event.userId,
      credits: Number(event.metadata.credits),
      billingEventId: event.id,
    });
  }

  if (event.type === 'payment.succeeded') {
    await createReceiptForPaymentEvent(db, event);
  }

  // The atomic guard, so a second concurrent caller that reached this same
  // pending row cannot also transition it: `transitionPendingPayment` only
  // succeeds from PENDING, and this is the one write that closes that window.
  // (Real double-application of the *effects* above is additionally, and
  // independently, prevented by billingEventId uniqueness — this call is what
  // keeps PendingPayment.status itself correct under the same race.)
  await transitionPendingPayment(db, { pendingPaymentId: pending.id, status: terminalStatus });
}

export interface ApplyVerifiedPaymentEventResult {
  /** False when this event id was already fully applied by an earlier call. */
  readonly applied: boolean;
}

async function sendPaymentConfirmation(
  db: PrismaClient,
  event: PaymentEvent,
  mailer: Mailer | undefined,
): Promise<void> {
  if (mailer === undefined || event.type !== 'payment.succeeded') return;

  try {
    const user = await db.user.findUnique({
      where: { id: event.userId },
      select: { email: true },
    });
    if (user === null) {
      console.error(`[payment] cannot send confirmation: user ${event.userId} was not found`);
      return;
    }
    await mailer.sendPaymentConfirmation(user.email);
  } catch (error) {
    console.error('[payment] confirmation email failed after payment was applied:', error);
  }
}

/**
 * The one entry point every completion path (webhook POST, redirect GET) must
 * call. Gates on `BillingEvent`'s unique event id exactly like the original
 * webhook route did, then applies the effect, then finalizes `appliedAt` —
 * so every completed payment gets exactly one durable, reconciliation-ready
 * `BillingEvent` row regardless of which path completed it.
 */
export async function applyVerifiedPaymentEvent(
  db: PrismaClient,
  event: PaymentEvent,
  options: { readonly mailer?: Mailer } = {},
): Promise<ApplyVerifiedPaymentEventResult> {
  const inserted = await db.$queryRaw<readonly { id: string }[]>(
    Prisma.sql`
      INSERT INTO "BillingEvent" ("id", "type", "payload")
      VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `,
  );

  if (inserted.length === 0) {
    const existing = await db.billingEvent.findUniqueOrThrow({ where: { id: event.id } });
    if (existing.appliedAt !== null) return { applied: false };
    // A row exists but a prior attempt's effect never finished (transient
    // failure) -- fall through and retry the effect, matching the original
    // webhook route's own "received is not applied" behavior.
  }

  await applyProviderPaymentEvent(db, event);
  // A duplicate delivery can observe the BillingEvent row between the
  // insert and the first caller's finalization. Claim finalization itself
  // atomically so only the winner sends the success email.
  const finalized = await db.billingEvent.updateMany({
    where: { id: event.id, appliedAt: null },
    data: { appliedAt: new Date() },
  });
  if (finalized.count === 1) await sendPaymentConfirmation(db, event, options.mailer);
  return { applied: finalized.count === 1 };
}
