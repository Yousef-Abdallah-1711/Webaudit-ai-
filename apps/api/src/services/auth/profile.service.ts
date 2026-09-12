import type { PrismaClient } from '../../../prisma/generated/client/index.js';

export interface ProfileView {
  readonly name: string | null;
}

export async function updateProfile(
  db: Pick<PrismaClient, '$executeRaw' | '$queryRaw'>,
  input: { readonly userId: string; readonly name: string },
): Promise<ProfileView> {
  await db.$executeRaw`UPDATE "User" SET name = ${input.name}, "updatedAt" = NOW() WHERE id = ${input.userId}`;
  const rows = await db.$queryRaw<
    ProfileView[]
  >`SELECT name FROM "User" WHERE id = ${input.userId}`;
  return { name: rows[0]?.name ?? null };
}
