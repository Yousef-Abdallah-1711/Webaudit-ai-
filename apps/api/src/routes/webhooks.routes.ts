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
 * **Idempotent on the provider's event id.** Providers retry deliveries
 * aggressively; a renewal or a purchase applied twice is exactly the SC-022
 * failure. The first thing the handler does after verifying is `INSERT` the
 * event id into `BillingEvent`; a duplicate `INSERT` (P2002) means "already
 * handled" and the response is `200` with nothing re-applied.
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
import { Prisma, type PrismaClient } from '../../prisma/generated/client/index.js';
import {
  cancelSubscription,
  changePlan,
  renewSubscription,
  subscribe,
} from '../services/billing/subscription.service.js';
import { purchaseCredits } from '../services/billing/purchase.service.js';

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
}

function verify(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || signature === '') return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhooksRoutes(db: PrismaClient, deps: WebhookRoutesDeps = {}): Router {
  const router = Router();
  const secret = deps.secret ?? process.env['BILLING_WEBHOOK_SECRET'] ?? '';
  const sigHeader = (deps.signatureHeader ?? 'x-webhook-signature').toLowerCase();

  router.post(
    '/webhooks/billing',
    express.raw({ type: '*/*', limit: '256kb' }),
    async (req: Request, res: Response) => {
      if (secret === '') {
        // Fail closed: an unconfigured webhook secret means we cannot trust any
        // payload, so we accept none.
        res.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Billing webhook is not configured.' } });
        return;
      }

      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));
      const signature = req.header(sigHeader) ?? undefined;
      if (!verify(raw, signature, secret)) {
        res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Signature verification failed.' } });
        return;
      }

      let parsedBody: unknown;
      let event: z.infer<typeof eventSchema>;
      try {
        parsedBody = JSON.parse(raw.toString('utf8'));
        event = eventSchema.parse(parsedBody);
      } catch {
        res.status(400).json({ error: { code: 'BAD_PAYLOAD', message: 'Unparseable webhook body.' } });
        return;
      }

      // Idempotency claim. A duplicate delivery stops here.
      try {
        await db.billingEvent.create({
          data: { id: event.id, type: event.type, payload: parsedBody as Prisma.InputJsonValue },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        throw error;
      }

      const { userId, planId, credits, external } = event.data;
      try {
        switch (event.type) {
          case 'subscription.activated':
          case 'subscription.created':
            if (userId && planId) await subscribe(db, { userId, planId, ...(external ? { external } : {}) });
            break;
          case 'subscription.renewed':
          case 'invoice.paid':
            if (userId) await renewSubscription(db, { userId });
            break;
          case 'subscription.updated':
            if (userId && planId) await changePlan(db, { userId, planId });
            break;
          case 'subscription.canceled':
            if (userId) await cancelSubscription(db, { userId });
            break;
          case 'subscription.expired':
            if (userId) await renewSubscription(db, { userId });
            break;
          case 'credits.purchased':
            if (userId && credits) await purchaseCredits(db, { userId, credits });
            break;
          default:
            // Acknowledged, ignored.
            break;
        }
      } catch (error) {
        // The event is recorded; log the application failure but still 200 so
        // the provider does not spin on a retry we cannot succeed at (a webhook
        // for a deleted user, a plan that was removed). An operator reconciles
        // from `BillingEvent.payload`.
        console.error(`[webhook] ${event.type} (${event.id}) failed to apply:`, error);
        res.status(200).json({ received: true, applied: false });
        return;
      }

      res.status(200).json({ received: true, applied: true });
    },
  );

  return router;
}
