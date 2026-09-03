/**
 * T205 (users half) — operator view and management of user accounts, their
 * plans, and their balances (FR-083).
 *
 * Balance is never recomputed here — `balanceOf` (T040, packages/services/
 * credits/balance.ts) is the one place a balance is derived from `CreditLot`
 * rows, and this service reuses it rather than re-deriving a second copy that
 * could drift from the real one (Principle VI: "the balance is the sum of
 * movements").
 *
 * "Manage" (FR-083's own word) is deliberately narrow here: the only mutable
 * field is `isOperator` — promoting or demoting an operator. Password resets
 * and email changes are user-account-lifecycle concerns with their own
 * existing auth flows; inventing an admin-side copy of them is out of scope
 * for this task and not requested by FR-083.
 *
 * Every mutation calls `recordAuditLog` (T210) so FR-089 holds for this
 * surface from the first route it grows.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { balanceOf } from '../credits/balance.js';
import { recordAuditLog } from './audit-log.js';

export class UserNotFoundError extends Error {
  override readonly name = 'UserNotFoundError';
  constructor(readonly userId: string) {
    super(`No such user: ${userId}.`);
  }
}

export interface AdminUserSummary {
  readonly id: string;
  readonly email: string;
  readonly isOperator: boolean;
  readonly createdAt: Date;
  readonly planId: string;
  readonly subscriptionStatus: string | null;
  readonly balance: { readonly plan: number; readonly purchased: number };
}

export interface AdminUserDetail extends AdminUserSummary {
  readonly emailVerifiedAt: Date | null;
  readonly githubLogin: string | null;
  readonly updatedAt: Date;
  readonly subscription: {
    readonly planId: string;
    readonly status: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
    readonly cancelAtPeriodEnd: boolean;
  } | null;
  readonly balance: AdminUserSummary['balance'] & { readonly planExpiresAt: Date | null };
}

export interface ListUsersResult {
  readonly users: readonly AdminUserSummary[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Users are on the `free` tier by implication when there is no `Subscription` row. */
const FREE_PLAN_ID = 'free';

export async function listUsers(
  db: PrismaClient,
  // Each field explicitly unioned with `undefined`, not bare `?:` — this
  // repo runs with `exactOptionalPropertyTypes`, and the Zod-parsed query
  // object the route hands in carries the key with value `undefined` when a
  // param is omitted, which a bare `?:` does not accept.
  opts: { readonly limit?: number | undefined; readonly offset?: number | undefined } = {},
): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        email: true,
        isOperator: true,
        createdAt: true,
        subscription: { select: { planId: true, status: true } },
      },
    }),
    db.user.count(),
  ]);

  const users = await Promise.all(
    rows.map(async (row): Promise<AdminUserSummary> => {
      const balance = await balanceOf(db, row.id);
      return {
        id: row.id,
        email: row.email,
        isOperator: row.isOperator,
        createdAt: row.createdAt,
        planId: row.subscription?.planId ?? FREE_PLAN_ID,
        subscriptionStatus: row.subscription?.status ?? null,
        balance: { plan: balance.plan, purchased: balance.purchased },
      };
    }),
  );

  return { users, total, limit, offset };
}

export async function getUser(db: PrismaClient, userId: string): Promise<AdminUserDetail> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isOperator: true,
      emailVerifiedAt: true,
      githubLogin: true,
      createdAt: true,
      updatedAt: true,
      subscription: {
        select: {
          planId: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });
  if (row === null) throw new UserNotFoundError(userId);

  const balance = await balanceOf(db, userId);

  return {
    id: row.id,
    email: row.email,
    isOperator: row.isOperator,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    emailVerifiedAt: row.emailVerifiedAt,
    githubLogin: row.githubLogin,
    planId: row.subscription?.planId ?? FREE_PLAN_ID,
    subscriptionStatus: row.subscription?.status ?? null,
    subscription: row.subscription ?? null,
    balance: {
      plan: balance.plan,
      purchased: balance.purchased,
      planExpiresAt: balance.planExpiresAt,
    },
  };
}

export interface UpdateUserInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  readonly userId: string;
  /** The only mutable field today — see the module note above. */
  readonly isOperator?: boolean;
}

/**
 * Applies the patch and records one `AuditLogEntry` naming what changed.
 * A no-op patch (nothing set, or setting the field to its current value)
 * still writes the row it reads, but before/after will be identical — that
 * is honest, not a bug: the operator issued the request either way.
 */
export async function updateUser(
  db: PrismaClient,
  input: UpdateUserInput,
): Promise<AdminUserDetail> {
  const before = await db.user.findUnique({
    where: { id: input.userId },
    select: { isOperator: true },
  });
  if (before === null) throw new UserNotFoundError(input.userId);

  if (input.isOperator !== undefined) {
    await db.user.update({
      where: { id: input.userId },
      data: { isOperator: input.isOperator },
    });
  }

  const after = await getUser(db, input.userId);

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'user.update',
    subjectType: 'User',
    subjectId: input.userId,
    before: { isOperator: before.isOperator },
    after: { isOperator: after.isOperator },
  });

  return after;
}
