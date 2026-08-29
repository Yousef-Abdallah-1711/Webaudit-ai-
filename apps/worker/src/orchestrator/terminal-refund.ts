/**
 * Refunds the undelivered share of a scan's charge whenever it reaches a
 * terminal state through this process's own `transition()` — FAILED (a
 * throwing phase job) and COMPLETED (a gated module that was never met, or
 * any other requested-but-undelivered area) alike. One mechanism, the same
 * `refundForUndelivered` math the timeout sweep already uses, registered as
 * a terminal observer exactly like `installTerminalTeardown`.
 *
 * CANCELLED is deliberately not handled here: cancellation is written
 * directly by `apps/api`'s own process via `updateMany`, which never calls
 * this process's `transition()` — it is refunded at the source instead. See
 * `apps/api/src/routes/scans.routes.ts`.
 *
 * TIMED_OUT is deliberately not handled here either — it is left to
 * `sweepTimedOutScans` (`timeout.ts`), which is not yet scheduled in
 * production (its only caller today is a test); see PROGRESS.md.
 */
import { MODULE_STATES_SCORED, type ModuleState } from '@webaudit/types';
import { refundForUndelivered } from '@webaudit/config';
import { refundPartial } from '@webaudit/api/credits';
import { onTerminalTransition, type TerminalTransition } from './state-machine.js';
import type { PrismaClient } from '../db.js';

const REFUNDABLE_TERMINALS = new Set(['FAILED', 'COMPLETED']);

function isDelivered(state: ModuleState): boolean {
  return (MODULE_STATES_SCORED as readonly ModuleState[]).includes(state);
}

export interface InstallTerminalRefundOptions {
  readonly db: PrismaClient;
  readonly onError?: (error: unknown, context: string) => void;
}

export function installTerminalRefund(options: InstallTerminalRefundOptions): () => void {
  const onError =
    options.onError ?? ((error, context) => console.warn(`[terminal-refund] ${context}:`, error));

  const observer = async (info: TerminalTransition): Promise<void> => {
    if (!REFUNDABLE_TERMINALS.has(info.to)) return;

    try {
      const scan = await options.db.scan.findUnique({
        where: { id: info.scanId },
        select: {
          chargedCredits: true,
          requestedModules: true,
          moduleResults: { select: { state: true } },
        },
      });
      if (!scan) return;

      const deliveredCount = scan.moduleResults.filter((r) => isDelivered(r.state)).length;
      const creditsRefunded = refundForUndelivered({
        chargedCredits: scan.chargedCredits,
        requestedCount: scan.requestedModules.length,
        deliveredCount,
      });
      if (creditsRefunded <= 0) return;

      const debitTx = await options.db.creditTransaction.findFirst({
        where: { scanId: info.scanId, type: 'DEBIT' },
        select: { id: true },
      });
      if (!debitTx) return;

      await refundPartial(options.db, {
        debitTransactionId: debitTx.id,
        credits: creditsRefunded,
        reason: `${info.to === 'FAILED' ? 'platform-failure' : 'undelivered-module'}:${info.scanId}`,
      });
    } catch (error) {
      // A refund failure must not crash the process or block the transition
      // that already happened — matches `notifyTerminal`'s own "log and
      // swallow" rule for every other terminal observer.
      onError(error, `refunding scan ${info.scanId} on transition to ${info.to}`);
    }
  };

  return onTerminalTransition(observer);
}
