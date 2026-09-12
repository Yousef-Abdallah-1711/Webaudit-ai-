import { PendingPaymentStatus, type PrismaClient } from '../../../prisma/generated/client/index.js';

type PendingPaymentWriter = Pick<PrismaClient, 'pendingPayment'>;

export async function transitionPendingPayment(
  db: PendingPaymentWriter,
  input: {
    readonly pendingPaymentId: string;
    readonly status: Exclude<PendingPaymentStatus, 'PENDING'>;
  },
): Promise<boolean> {
  const result = await db.pendingPayment.updateMany({
    where: { id: input.pendingPaymentId, status: PendingPaymentStatus.PENDING },
    data: { status: input.status },
  });
  return result.count === 1;
}
