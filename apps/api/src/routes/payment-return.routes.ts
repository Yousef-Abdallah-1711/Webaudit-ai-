import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import type { PaymentProvider } from '../services/billing/payment-provider.js';
import { applyProviderPaymentEvent } from './webhooks.routes.js';

function one(value: unknown): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? one(value[0]) : undefined;
}

function bool(value: unknown): boolean | undefined {
  const text = one(value);
  return text === 'true' ? true : text === 'false' ? false : undefined;
}

function number(value: unknown): number | undefined {
  const text = one(value);
  if (text === undefined || text.trim() === '') return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function signedPayload(query: Request['query']): unknown {
  return {
    obj: {
      amount_cents: number(query['amount_cents']),
      created_at: one(query['created_at']),
      currency: one(query['currency']),
      error_occured: bool(query['error_occured']),
      has_parent_transaction: bool(query['has_parent_transaction']),
      id: number(query['id']),
      integration_id: number(query['integration_id']),
      is_3d_secure: bool(query['is_3d_secure']),
      is_auth: bool(query['is_auth']),
      is_capture: bool(query['is_capture']),
      is_refunded: bool(query['is_refunded']),
      is_standalone_payment: bool(query['is_standalone_payment']),
      is_voided: bool(query['is_voided']),
      order: { id: number(query['order']) },
      owner: number(query['owner']),
      pending: bool(query['pending']),
      source_data: {
        pan: one(query['source_data.pan']),
        sub_type: one(query['source_data.sub_type']),
        type: one(query['source_data.type']),
      },
      success: bool(query['success']),
    },
  };
}

function redirectTarget(success: boolean): string {
  const base = (process.env['WEB_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/billing?payment=${success ? 'success' : 'failed'}`;
}

/** Paymob's signed browser return is a completion fallback, never an auth bypass. */
export function paymentReturnRoutes(
  db: PrismaClient,
  deps: { readonly paymentProvider?: PaymentProvider } = {},
): Router {
  const router = Router();
  router.get('/billing/payment-return', async (req: Request, res: Response) => {
    const provider = deps.paymentProvider;
    if (provider === undefined) {
      res.status(503).json({
        error: {
          code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
          message: 'Payment provider is not configured.',
        },
      });
      return;
    }

    const orderId = number(req.query['order']);
    if (orderId === undefined) {
      res.status(400).json({ error: { code: 'BAD_PAYLOAD', message: 'Missing Paymob order.' } });
      return;
    }
    const pendingRows = await db.$queryRaw<
      readonly [{ userId: string; kind: string; metadata: unknown; amountMicros: number }]
    >`
      SELECT "userId", "kind", "metadata", "amountMicros"
      FROM "PendingPayment" WHERE "providerReference" = ${String(orderId)} LIMIT 1
    `;
    const pending = pendingRows[0];
    if (pending === undefined) {
      res
        .status(404)
        .json({ error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment was not found.' } });
      return;
    }

    // The redirect includes the order id but not merchant_order_id. Add the
    // owner metadata only after locating the local row; it is not part of
    // Paymob's signed field string and is used solely by the provider adapter
    // to map the verified transaction into our PaymentEvent.
    const metadata =
      typeof pending.metadata === 'object' &&
      pending.metadata !== null &&
      !Array.isArray(pending.metadata)
        ? Object.fromEntries(
            Object.entries(pending.metadata as Record<string, unknown>).filter(
              ([, value]) => typeof value === 'string',
            ),
          )
        : {};
    const context = Buffer.from(
      JSON.stringify({ userId: pending.userId, kind: pending.kind, metadata }),
      'utf8',
    ).toString('base64url');
    const payload = signedPayload(req.query) as { obj: Record<string, unknown> };
    const order = payload.obj['order'] as Record<string, unknown>;
    order['merchant_order_id'] = `webaudit:${context}`;

    const verification = await provider.verifyWebhook(Buffer.from(JSON.stringify(payload)), {
      hmac: one(req.query['hmac']),
    });
    if (!verification.valid || verification.events.length !== 1) {
      res
        .status(401)
        .json({ error: { code: 'BAD_SIGNATURE', message: 'Signature verification failed.' } });
      return;
    }
    const event = verification.events[0]!;
    await applyProviderPaymentEvent(db, event);
    res.redirect(303, redirectTarget(event.type === 'payment.succeeded'));
  });
  return router;
}
