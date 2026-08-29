/**
 * T081 — FR-039: "record, for every AI interaction, which provider and model
 * served it, what it consumed, how long it took, what it cost, and whether it
 * succeeded."
 *
 * Every attempt, not every success. A provider that was tried and refused still
 * tells an operator about an outage, and R9 puts cost attribution on the
 * `CapabilityExecution` rather than the scan precisely so "which capability cost
 * this" (SC-009) and "which capability overspends" (FR-082) are aggregations over
 * these rows rather than estimates.
 *
 * **Money in integer micros, never floats.** CLAUDE.md's rule, and FR-081's
 * reconciliation needs exactness: a float total over ten thousand invocations
 * drifts, and a margin report that disagrees with the ledger is worse than no
 * margin report at all.
 *
 * **Recording must not be able to fail the work.** The audit already happened;
 * losing a row is a reporting defect, and turning it into a thrown error would
 * turn it into a failed audit the user paid for. A write failure is reported back
 * rather than raised, and the caller logs it.
 *
 * The database shape is declared structurally rather than imported from the
 * generated Prisma client: this package is used by the worker and the API, and
 * `packages/` must not depend on one app's generated client.
 */

import type { AiOutcome } from '@webaudit/types';
import type { AiInvocationRecord } from './executor.js';

interface AiInvocationRow {
  executionId: string | null;
  scanId: string | null;
  provider: string;
  model: string;
  chainPosition: number;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
  costMicros: number;
  outcome: AiOutcome;
}

/** Only the one model and one method this module touches. */
export interface InvocationWriter {
  aiInvocation: {
    createMany(args: { data: AiInvocationRow[] }): Promise<{ count: number }>;
  };
}

export interface RecordTarget {
  /** Links the cost to the capability that caused it (Principle VI, SC-009). */
  readonly executionId?: string;
  readonly scanId?: string;
}

export interface RecordOutcome {
  readonly written: number;
  /** Set when the write failed. The audit is unaffected. */
  readonly problem?: string;
}

export async function recordInvocations(
  db: InvocationWriter,
  target: RecordTarget,
  invocations: readonly AiInvocationRecord[],
): Promise<RecordOutcome> {
  if (invocations.length === 0) return { written: 0 };

  try {
    const result = await db.aiInvocation.createMany({
      data: invocations.map((invocation) => ({
        executionId: target.executionId ?? null,
        scanId: target.scanId ?? null,
        provider: invocation.provider,
        model: invocation.model,
        chainPosition: invocation.chainPosition,
        promptTokens: invocation.promptTokens,
        outputTokens: invocation.outputTokens,
        latencyMs: invocation.latencyMs,
        costMicros: invocation.costMicros,
        outcome: invocation.outcome,
      })),
    });
    return { written: result.count };
  } catch (error) {
    // Never rethrown. See the module note.
    return { written: 0, problem: error instanceof Error ? error.message : String(error) };
  }
}

/** What one operation cost, in integer micros. FR-081's unit of reconciliation. */
export function totalCostMicros(invocations: readonly AiInvocationRecord[]): number {
  return invocations.reduce((total, invocation) => total + invocation.costMicros, 0);
}

/** Tokens actually consumed, successes and failures alike. FR-082's numerator. */
export function totalTokens(invocations: readonly AiInvocationRecord[]): number {
  return invocations.reduce((total, i) => total + i.promptTokens + i.outputTokens, 0);
}
