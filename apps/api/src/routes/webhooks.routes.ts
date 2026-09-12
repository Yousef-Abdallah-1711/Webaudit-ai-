/**
 * T187 — the billing webhook. `POST /webhooks/billing`.
 *
 * **Signature-verified.** The payment provider signs the raw request body with
 * a shared secret; this route recomputes the HMAC-SHA256 and compares it
 * `timingSafeEqual`. A body that does not verify is `401` and nothing is
 * applied — a forged "you were paid, grant 4000 credits" must not move a
 * balance. The raw bytes are required for this, so the route mounts its own
 * `express.raw` parser ahead of the app's `express.json`.
 *
 * **Idempotent on the provider's event id — but "received" is not "applied."**
 * Providers retry deliveries aggressively; a renewal or a purchase applied
 * twice is exactly the SC-022 failure. The first thing the handler does after
 * verifying is `INSERT` the event id into `BillingEvent`; a duplicate
 * `INSERT` (P2002) means this event id was seen before, but only a row whose
 * `appliedAt` is already set is a genuine duplicate — that one short-circuits
 * to `200` with nothing re-applied. A row that exists with `appliedAt` still
 * null means a prior attempt's effect never finished (a transient failure),
 * so this delivery retries the effect instead of silently treating the row's
 * mere existence as "handled." An effect that still fails here responds
 * `500` (not `200`) so the provider actually retries again.
 *
 * Event → effect:
 *   subscription.activated  → subscribe(userId, planId)
 *   subscription.renewed    → renewSubscription(userId)      (invoice paid)
 *   subscription.updated    → changePlan(userId, planId)
 *   subscription.canceled   → cancelSubscription(userId)     (at period end)
 *   subscription.expired    → renewSubscription(userId)      (lapses a cancelled sub)
 *   credits.purchased       → purchaseCredits(userId, credits)
 * Anything else is acknowledged and ignored.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import express from 'express';
import { z } from 'zod';
import {
  PendingPaymentStatus,
  Prisma,
  type PrismaClient,
} from '../../prisma/generated/client/index.js';
import {
  cancelSubscription,
  changePlan,
  renewSubscription,
  subscribe,
} from '../services/billing/subscription.service.js';
import { purchaseCredits } from '../services/billing/purchase.service.js';
import type { PaymentEvent, PaymentProvider } from '../services/billing/payment-provider.js';
import { createReceiptForPaymentEvent } from '../services/billing/receipt.js';
import { transitionPendingPayment } from '../services/billing/pending-payment.js';

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z
    .object({
      userId: z.string().min(1).max(64).optional(),
      planId: z.string().min(1).max(32).optional(),
      credits: z.number().int().positive().optional(),
      external: z
        .object({ customerId: z.string().optional(), subscriptionId: z.string().optional() })
        .optional(),
    })
    .default({}),
});

export interface WebhookRoutesDeps {
  /** The shared signing secret. Defaults to `BILLING_WEBHOOK_SECRET`. */
  secret?: string;
  /** Header the provider puts the signature in. */
  signatureHeader?: string;
  paymentProvider?: PaymentProvider;
}

function verify(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || signature === '') return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PendingPaymentRow {
  readonly id: string;
  readonly userId: string;
  readonly kind: string;
  readonly amountMicros: number;
  readonly status: string;
  readonly metadata: unknown;
}

function requestHeaders(req: Request): Readonly<Record<string, string | undefined>> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
  }
  return headers;
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

async function createOrRetryBillingEvent(
  db: PrismaClient,
  event: PaymentEvent,
): Promise<'apply' | 'duplicate'> {
  const inserted = await db.$queryRaw<readonly { id: string }[]>(
    Prisma.sql`
      INSERT INTO "BillingEvent" ("id", "type", "payload")
      VALUES (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `,
  );
  if (inserted.length > 0) {
    return 'apply';
  }
  const existing = await db.billingEvent.findUniqueOrThrow({ where: { id: event.id } });
  return existing.appliedAt === null ? 'apply' : 'duplicate';
}

export async function applyProviderPaymentEvent(
  db: PrismaClient,
  event: PaymentEvent,
): Promise<void> {
  // All terminal provider outcomes close the pending row.  Only a successful
  // payment grants entitlements; failed/cancelled/refunded events are still
  // recorded so the expiry worker cannot later misclassify them as pending.
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

  await transitionPendingPayment(db, {
    pendingPaymentId: pending.id,
    status: terminalStatus,
  });
}

export function webhooksRoutes(db: PrismaClient, deps: WebhookRoutesDeps = {}): Router {
  const router = Router();
  const secret = deps.secret ?? process.env['BILLING_WEBHOOK_SECRET'] ?? '';
  const sigHeader = (deps.signatureHeader ?? 'x-webhook-signature').toLowerCase();
  const paymentProvider = deps.paymentProvider;

  router.post(
    '/webhooks/billing',
    express.raw({ type: '*/*', limit: '256kb' }),
    async (req: Request, res: Response) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));

      if (paymentProvider !== undefined) {
        const verified = await paymentProvider.verifyWebhook(raw, requestHeaders(req));
        if (!verified.valid) {
          res.status(401).json({
            error: { code: 'BAD_SIGNATURE', message: 'Signature verification failed.' },
          });
          return;
        }

        try {
          for (const event of verified.events) {
            const action = await createOrRetryBillingEvent(db, event);
            if (action === 'duplicate') continue;
            await applyProviderPaymentEvent(db, event);
            await db.billingEvent.update({
              where: { id: event.id },
              data: { appliedAt: new Date() },
            });
          }
        } catch (error) {
          console.error('[webhook] provider payment event failed to apply:', error);
          res.status(500).json({
            error: { code: 'WEBHOOK_APPLY_FAILED', message: 'Failed to apply webhook effect.' },
          });
          return;
        }

        res.status(200).json({ received: true, applied: true });
        return;
      }

      if (secret === '') {
        // Fail closed: an unconfigured webhook secret means we cannot trust any
        // payload, so we accept none.
        res.status(503).json({
          error: {
            code: 'WEBHOOK_NOT_CONFIGURED',
            message: 'Billing webhook is not configured.',
          },
        });
        return;
      }

      const signature = req.header(sigHeader) ?? undefined;
      if (!verify(raw, signature, secret)) {
        res
          .status(401)
          .json({ error: { code: 'BAD_SIGNATURE', message: 'Signature verification failed.' } });
        return;
      }

      let parsedBody: unknown;
      let event: z.infer<typeof eventSchema>;
      try {
        parsedBody = JSON.parse(raw.toString('utf8'));
        event = eventSchema.parse(parsedBody);
      } catch {
        res
          .status(400)
          .json({ error: { code: 'BAD_PAYLOAD', message: 'Unparseable webhook body.' } });
        return;
      }

      // Idempotency: a row that already exists AND was already applied is a
      // genuine duplicate delivery — no-op. A row that exists but was never
      // applied (a prior attempt's effect failed) is retried below rather
      // than treated as handled.
      try {
        await db.billingEvent.create({
          data: { id: event.id, type: event.type, payload: parsedBody as Prisma.InputJsonValue },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.billingEvent.findUniqueOrThrow({ where: { id: event.id } });
          if (existing.appliedAt !== null) {
            res.status(200).json({ received: true, duplicate: true });
            return;
          }
          // Fall through: received but never applied, retry the effect now.
        } else {
          throw error;
        }
      }

      const { userId, planId, credits, external } = event.data;
      try {
        switch (event.type) {
          case 'subscription.activated':
          case 'subscription.created':
            if (userId && planId) {
              await subscribe(db, {
                userId,
                planId,
                ...(external ? { external } : {}),
                billingEventId: event.id,
              });
            }
            break;
          case 'subscription.renewed':
          case 'invoice.paid':
            if (userId) await renewSubscription(db, { userId, billingEventId: event.id });
            break;
          case 'subscription.updated':
            if (userId && planId) await changePlan(db, { userId, planId });
            break;
          case 'subscription.canceled':
            if (userId) await cancelSubscription(db, { userId });
            break;
          case 'subscription.expired':
            if (userId) await renewSubscription(db, { userId, billingEventId: event.id });
            break;
          case 'credits.purchased':
            if (userId && credits)
              await purchaseCredits(db, { userId, credits, billingEventId: event.id });
            break;
          default:
            // Acknowledged, ignored — still counts as applied.
            break;
        }
        await db.billingEvent.update({ where: { id: event.id }, data: { appliedAt: new Date() } });
      } catch (error) {
        // Unlike before: this is a 500, not a 200. The row exists with
        // appliedAt still null, so the provider's retry re-enters this same
        // branch and tries the effect again. changePlan/cancelSubscription
        // converge to a target state and are safe to re-invoke.
        // subscribe/renewSubscription/purchaseCredits are now fully
        // idempotent under retry too (PROGRESS.md Open Decision #15,
        // resolved): each passes this event's id into grantLot, which keys
        // the grant on `CreditTransaction.billingEventId` (unique) — a
        // second attempt at the same event throws `DuplicateBillingEventGrantError`
        // instead of creating a second lot, and each effect function catches
        // that specifically to return the already-committed state rather
        // than re-throwing. BillingEvent.payload still allows manual
        // reconciliation for anything this doesn't cover.
        console.error(`[webhook] ${event.type} (${event.id}) failed to apply:`, error);
        res.status(500).json({
          error: { code: 'WEBHOOK_APPLY_FAILED', message: 'Failed to apply webhook effect.' },
        });
        return;
      }

      res.status(200).json({ received: true, applied: true });
    },
  );

  return router;
}
