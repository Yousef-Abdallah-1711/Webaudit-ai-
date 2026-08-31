/**
 * T151 — `VerificationAttempt` persistence, with the issue's state transition
 * in the same transaction and under the same optimistic guard the scan state
 * machine uses.
 *
 * **This function is the only writer of `Issue.state = RESOLVED` anywhere in
 * the system.** That is what makes SC-007 structural rather than a rule to
 * remember: `outcomeToState` (`state-machine.ts`) is a total function whose
 * only `RESOLVED` branch is `PASSED`, `assertResolvedOnlyOnPass` re-checks
 * that at runtime before the write, and the write itself is guarded on the
 * issue still being `ASSERTED_FIXED` — so a user asserting a fix they did not
 * make gets a `FAILED` attempt and an issue that is still `OPEN`, every time.
 *
 * **The write order is deliberate.** The guarded `updateMany` happens first;
 * the `VerificationAttempt` row is only created when it moved a row. A job
 * that runs twice (BullMQ retries a re-verification, `REVERIFY_JOB_OPTIONS`)
 * therefore records exactly one attempt: the second run finds the issue no
 * longer `ASSERTED_FIXED`, moves nothing, and writes nothing.
 *
 * **Refunds live outside the transaction.** `refundPartial` runs its own
 * serializable transaction (R2), and a refund failure must never roll back or
 * fail a verdict the user is waiting on — it is logged and swallowed, matching
 * `terminal-refund.ts`'s own rule.
 */

import type { Prisma, PrismaClient } from '../../../prisma/generated/client/index.js';
import type { VerificationOutcome } from '@webaudit/types';
import { refundPartial } from '../credits/refund.js';
import {
  assertResolvedOnlyOnPass,
  outcomeIsRefundable,
  outcomeToState,
  timestampFieldFor,
} from './state-machine.js';

export interface RecordAttemptInput {
  readonly issueId: string;
  readonly outcome: VerificationOutcome;
  /** FR-061: required on FAILED, present as a reason on UNVERIFIABLE/ERRORED. */
  readonly evidence?: Record<string, unknown>;
  readonly creditsCharged: number;
  readonly durationMs: number;
  /**
   * The `DEBIT` transaction the assert-fixed route created for this re-check.
   * Passed so a refundable outcome (`ERRORED`, `UNVERIFIABLE`) can be returned
   * to the exact lot it was drawn from. Omit only when there was no charge.
   */
  readonly debitTransactionId?: string;
}

export interface RecordAttemptResult {
  /** False when the issue was not `ASSERTED_FIXED` — a stale or duplicate job. */
  readonly applied: boolean;
  readonly attemptId: string | null;
  readonly issueState: string | null;
  readonly creditsRefunded: number;
}

export class VerificationEvidenceMissingError extends Error {
  override readonly name = 'VerificationEvidenceMissingError';
  constructor() {
    super('A FAILED re-verification must carry current failing evidence (FR-061).');
  }
}

export async function recordVerificationAttempt(
  db: PrismaClient,
  input: RecordAttemptInput,
  onRefundError: (error: unknown) => void = (error) =>
    console.warn('[reverify] refund after re-check failed:', error),
): Promise<RecordAttemptResult> {
  // FR-061 is a hard precondition, checked before any write: a negative
  // verdict without evidence is a requirement violation, not a terse answer.
  if (input.outcome === 'FAILED' && input.evidence === undefined) {
    throw new VerificationEvidenceMissingError();
  }

  const next = outcomeToState(input.outcome);
  assertResolvedOnlyOnPass(input.outcome, next);
  const tsField = timestampFieldFor(next);

  const written = await db.$transaction(async (tx) => {
    const issue = await tx.issue.findUnique({
      where: { id: input.issueId },
      select: { id: true, state: true },
    });
    if (issue === null || issue.state !== 'ASSERTED_FIXED') {
      return { applied: false as const, attemptId: null, issueState: issue?.state ?? null };
    }

    const now = new Date();
    const moved = await tx.issue.updateMany({
      where: { id: input.issueId, state: 'ASSERTED_FIXED' },
      data: {
        state: next,
        ...(tsField === null ? {} : { [tsField]: now }),
        ...(next === 'RESOLVED' ? { previouslyResolved: true } : {}),
      },
    });
    if (moved.count !== 1) {
      // Lost the race with a concurrent write — leave everything as the winner
      // left it, record nothing.
      return { applied: false as const, attemptId: null, issueState: null };
    }

    const attempt = await tx.verificationAttempt.create({
      data: {
        issueId: input.issueId,
        outcome: input.outcome,
        // Spread rather than `?? undefined` (exactOptionalPropertyTypes), and
        // cast to Prisma's JSON input type — a plain `Record<string, unknown>`
        // is structurally wider than `InputJsonValue` even though every value
        // this function is ever given is JSON-serialisable.
        ...(input.evidence === undefined
          ? {}
          : { evidence: input.evidence as Prisma.InputJsonValue }),
        creditsCharged: input.creditsCharged,
        durationMs: input.durationMs,
      },
      select: { id: true },
    });

    return { applied: true as const, attemptId: attempt.id, issueState: next };
  });

  let creditsRefunded = 0;
  if (
    written.applied &&
    input.debitTransactionId !== undefined &&
    input.creditsCharged > 0 &&
    outcomeIsRefundable(input.outcome)
  ) {
    try {
      const refund = await refundPartial(db, {
        debitTransactionId: input.debitTransactionId,
        credits: input.creditsCharged,
        reason: `reverify-${input.outcome.toLowerCase()}:${input.issueId}`,
      });
      creditsRefunded = refund.amount;
    } catch (error) {
      onRefundError(error);
    }
  }

  return {
    applied: written.applied,
    attemptId: written.attemptId,
    issueState: written.issueState,
    creditsRefunded,
  };
}

/** An issue's history: its ordered verification attempts (FR-065). */
export async function listVerificationAttempts(
  db: PrismaClient,
  issueId: string,
): Promise<
  {
    id: string;
    outcome: string;
    evidence: unknown;
    creditsCharged: number;
    durationMs: number;
    createdAt: Date;
  }[]
> {
  return db.verificationAttempt.findMany({
    where: { issueId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      outcome: true,
      evidence: true,
      creditsCharged: true,
      durationMs: true,
      createdAt: true,
    },
  });
}
