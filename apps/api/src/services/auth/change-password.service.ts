import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { revokeAllSessions } from './session.service.js';

export class InvalidCurrentPasswordError extends Error {}

export async function changePassword(
  db: PrismaClient,
  input: {
    readonly userId: string;
    readonly currentPassword: string;
    readonly newPassword: string;
  },
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  const valid = user?.passwordHash
    ? await verifyPassword(input.currentPassword, user.passwordHash)
    : false;
  if (!user || !valid) throw new InvalidCurrentPasswordError();

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: input.userId }, data: { passwordHash } });
    await revokeAllSessions(tx, input.userId);
  });
}
