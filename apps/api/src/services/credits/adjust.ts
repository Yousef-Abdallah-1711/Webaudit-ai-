/**
 * ADMIN-001 (PLAN.md, Finding HIGH-2) — the operator's only way to grant
 * credits to a user directly, outside a real purchase or subscription
 * payment.
 *
 * Before this file existed, no such capability existed anywhere in this
 * codebase at all — not insecurely, not partially: genuinely absent. This is
 * the "OPERATOR" entry in `PLAN.md`'s §11 allowlist of legitimate credit
 * sources, and it is deliberately built as a thin, audited wrapper around
 * `grantLot` rather than a parallel insert path:
 *
 *   - The actual `CreditTransaction`/`CreditLot` writes are `grantLot`'s
 *     own, unchanged — the same function every other legitimate grant path
 *     (free signup, subscription, purchase, webhook) already goes through.
 *     `adjustCredits` adds nothing to *how* a lot is created; it only adds
 *     *who may ask for one, and the record of having asked*.
 *   - `source: 'ADMIN_GRANT'` (schema.prisma's `LotSource` enum) makes an
 *     operator grant structurally distinguishable from a real purchase or
 *     subscription renewal in the ledger — never just a string in `reason`
 *     that a query could miss.
 *   - The grant and its `AuditLogEntry` land in one `$transaction`, so a
 *     credit grant without an audit trail (or an audit trail for a grant
 *     that never actually landed) cannot happen.
 *
 * Deliberately grant-only in this first pass (PLAN.md §13). An operator
 * *removing* credits is a debit, and `debit()` already exists, already
 * locks, and already handles insufficient balance — inventing a second
 * decrement path here would be exactly the kind of duplicate financial
 * mutation surface this whole audit exists to eliminate. See TASKS.md's
 * `ADMIN-005 [BLOCKED]` for why that is deferred to a product decision
 * rather than built speculatively.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { CreditBalance } from '@webaudit/types';
import { grantLot } from './grant.js';
import { balanceOf } from './balance.js';
import { UserNotFoundError } from '../admin/users.service.js';
import { recordAuditLog } from '../admin/audit-log.js';

export class InvalidCreditAdjustmentError extends Error {
  override readonly name = 'InvalidCreditAdjustmentError';
  constructor(message: string) {
    super(message);
  }
}

export interface AdjustCreditsInput {
  /** `requireOperator`'s own `req.auth.userId` — never client-supplied. */
  readonly operatorId: string;
  readonly targetUserId: string;
  readonly amount: number;
  readonly kind: 'PLAN' | 'PURCHASED';
  /**
   * Required, not defaulted — an operator states explicitly whether this
   * grant expires and when. `null` is only valid for `kind: 'PURCHASED'`,
   * mirroring `grantLot`'s own implicit rule that a purchased credit never
   * expires (see `refund.ts`'s `refundLotExpiry` for the same rule enforced
   * on the refund side).
   */
  readonly expiresAt: Date | null;
  readonly reason: string;
}

export interface AdjustCreditsResult {
  readonly transactionId: string;
  readonly lotId: string;
  readonly balanceBefore: CreditBalance;
  readonly balanceAfter: CreditBalance;
}

function validate(input: AdjustCreditsInput): void {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new InvalidCreditAdjustmentError('amount must be a positive whole number of credits');
  }
  if (input.kind !== 'PLAN' && input.kind !== 'PURCHASED') {
    throw new InvalidCreditAdjustmentError(`invalid kind: ${String(input.kind)}`);
  }
  if (input.kind === 'PURCHASED' && input.expiresAt !== null) {
    throw new InvalidCreditAdjustmentError('a PURCHASED grant must never expire');
  }
  if (input.reason.trim().length === 0) {
    throw new InvalidCreditAdjustmentError('reason is required');
  }
}

/**
 * Grants `input.amount` credits to `input.targetUserId`, sourced
 * `ADMIN_GRANT`, and records exactly one `AuditLogEntry` for it — atomically:
 * both write or neither does.
 */
export async function adjustCredits(
  db: PrismaClient,
  input: AdjustCreditsInput,
): Promise<AdjustCreditsResult> {
  validate(input);

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });
    if (user === null) throw new UserNotFoundError(input.targetUserId);

    const balanceBefore = await balanceOf(tx, input.targetUserId);

    const { transactionId, lotId } = await grantLot(tx, {
      userId: input.targetUserId,
      amount: input.amount,
      kind: input.kind,
      source: 'ADMIN_GRANT',
      expiresAt: input.expiresAt,
      reason: input.reason,
    });

    const balanceAfter = await balanceOf(tx, input.targetUserId);

    await recordAuditLog(tx, {
      actorId: input.operatorId,
      action: 'credits.adjust',
      subjectType: 'User',
      subjectId: input.targetUserId,
      before: { plan: balanceBefore.plan, purchased: balanceBefore.purchased },
      after: { plan: balanceAfter.plan, purchased: balanceAfter.purchased },
    });

    return { transactionId, lotId, balanceBefore, balanceAfter };
  });
}
