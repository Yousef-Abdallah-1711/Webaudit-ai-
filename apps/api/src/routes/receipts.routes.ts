import { Router, type Response } from 'express';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';

interface ReceiptListRow {
  readonly id: string;
  readonly billingEventId: string;
  readonly providerReference: string;
  readonly kind: string;
  readonly amountMicros: number;
  readonly createdAt: Date;
}

interface ReceiptHtmlRow {
  readonly html: string;
}

export function receiptsRoutes(db: PrismaClient): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/billing/receipts', async (req: AuthedRequest, res: Response) => {
    const rows = await db.$queryRaw<readonly ReceiptListRow[]>`
      SELECT "id", "billingEventId", "providerReference", "kind", "amountMicros", "createdAt"
      FROM "Receipt"
      WHERE "userId" = ${req.auth!.userId}
      ORDER BY "createdAt" DESC
      LIMIT 100
    `;

    res.status(200).json({
      receipts: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });

  router.get('/billing/receipts/:id', async (req: AuthedRequest, res: Response) => {
    const rows = await db.$queryRaw<readonly ReceiptHtmlRow[]>`
      SELECT "html"
      FROM "Receipt"
      WHERE "id" = ${req.params.id} AND "userId" = ${req.auth!.userId}
      LIMIT 1
    `;
    const receipt = rows[0];
    if (receipt === undefined) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such receipt.' } });
      return;
    }

    res.status(200).type('text/html; charset=utf-8').send(receipt.html);
  });

  return router;
}
