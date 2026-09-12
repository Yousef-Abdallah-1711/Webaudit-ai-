import { PendingPaymentStatus, type PrismaClient } from '../../../prisma/generated/client/index.js';
import { transitionPendingPayment } from './pending-payment.js';

export async function sweepExpiredPendingPayments(
  db: PrismaClient,
  input: {
    readonly now?: Date;
    readonly abandonmentWindowMs: number;
    readonly batchSize?: number;
    readonly onBeforeTransition?: (pendingPaymentId: string) => Promise<void>;
  },
): Promise<number> {
  const cutoff = new Date((input.now ?? new Date()).getTime() - input.abandonmentWindowMs);
  const candidates = await db.pendingPayment.findMany({
    where: { status: PendingPaymentStatus.PENDING, createdAt: { lte: cutoff } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: input.batchSize ?? 50,
  });
  let expired = 0;
  for (const payment of candidates) {
    await input.onBeforeTransition?.(payment.id);
    if (
      await transitionPendingPayment(db, {
        pendingPaymentId: payment.id,
        status: PendingPaymentStatus.EXPIRED,
      })
    ) {
      expired += 1;
    }
  }
  return expired;
}
