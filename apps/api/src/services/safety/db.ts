/**
 * SPEC 008 — the transaction-joining seam (DEC-045 A, amendment A1 §1-2).
 *
 * Every safety operation accepts either a `PrismaClient` (it opens exactly one
 * transaction) or a caller's interactive-transaction client (it joins it: a
 * finalizer's unit write, lease release and audit row commit or roll back as
 * one). Operations that must turn a database failure into a fail-closed result
 * rather than an exception use a savepoint when joined, so the caller's
 * transaction stays usable.
 */

import type { Prisma, PrismaClient } from '../../../prisma/generated/client/index.js';

export type SafetyTx = Prisma.TransactionClient;
export type SafetyDb = PrismaClient | SafetyTx;

/** A full client can open transactions; a transaction client cannot (it is already in one). */
export function isOwnedClient(db: SafetyDb): db is PrismaClient {
  return '$transaction' in db;
}

export async function inTransaction<T>(db: SafetyDb, fn: (tx: SafetyTx) => Promise<T>): Promise<T> {
  if (isOwnedClient(db)) return db.$transaction(fn);
  return fn(db);
}

/**
 * Run `fn` so that any failure leaves no partial effect and yields `onError`
 * instead of throwing. Owned transaction: it rolls back. Joined transaction: a
 * savepoint is rolled back and the caller's transaction continues.
 */
export async function failClosed<T, E>(
  db: SafetyDb,
  fn: (tx: SafetyTx) => Promise<T>,
  onError: (error: unknown) => E,
): Promise<T | E> {
  if (isOwnedClient(db)) {
    try {
      return await db.$transaction(fn);
    } catch (error) {
      return onError(error);
    }
  }
  const tx: SafetyTx = db;
  await tx.$executeRawUnsafe('SAVEPOINT f07_fail_closed');
  try {
    const result = await fn(tx);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT f07_fail_closed');
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT f07_fail_closed');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT f07_fail_closed');
    return onError(error);
  }
}

/** The database clock — the only time source safety decisions use (F-02, FR-178). */
export async function databaseNow(tx: SafetyTx): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const row = rows[0];
  if (row === undefined) throw new Error('database clock unavailable');
  return row.now;
}

/** A closed error for an operation the database function refused on authority grounds. */
export class SafetyForbiddenError extends Error {
  constructor() {
    super('Not permitted to perform this safety operation.');
    this.name = 'SafetyForbiddenError';
  }
}

export function isForbiddenFailure(error: unknown): boolean {
  return String((error as { message?: unknown } | null)?.message ?? error).includes(
    'f07_forbidden',
  );
}

/** The database clock for either a client or a transaction client. */
export async function databaseNowFor(db: SafetyDb): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const row = rows[0];
  if (row === undefined) throw new Error('database clock unavailable');
  return row.now;
}
