/**
 * T150 — the narrow re-verification runner. Invokes exactly one check.
 *
 * R14: "Re-verification resolves the issue's fingerprint to its check, runs
 * **only** that check against the recorded location, and compares the outcome.
 * There is no path by which a user assertion alone changes state." This file is
 * that path made concrete:
 *
 *   load the issue → it must be `ASSERTED_FIXED`, or this job is stale and does
 *   nothing → resolve the one capability that owns its `checkId`
 *   (`resolve-check.ts`) → build the same `CodeLayerContext` a code-layer
 *   capability gets, contained the same way (`containCapabilityCall`: a throw, a
 *   rejection, and a hang are one shape of result, never an exception) → hand
 *   the check's verdict to `recordVerificationAttempt`, which is the only writer
 *   of `RESOLVED` and only writes it on `PASSED` (SC-007).
 *
 * **What this runner deliberately does not do:** call `runModule`, load the
 * other capabilities in the module, or fetch anything the check does not ask
 * for. FR-059's "MUST NOT re-audit" is a property of only ever touching one
 * capability's `reverify`.
 *
 * **Refunds happen inside `recordVerificationAttempt`**, not here — an
 * `ERRORED` or `UNVERIFIABLE` outcome means the platform did not deliver a
 * verdict the user can act on, so the 3-credit re-check charge is returned to
 * its originating lot (FR-075). A `FAILED` re-check is a real, delivered
 * verdict and stays charged.
 */

import { REVERIFY_COST } from '@webaudit/config';
import type { VerificationOutcome } from '@webaudit/types';
import {
  createCodeLayerContext,
  runAsCapability,
  containCapabilityCall,
  describeThrown,
  type CodeLayerContext,
  type ReverifyResult,
} from '@webaudit/capability-sdk';
import { recordVerificationAttempt } from '@webaudit/api/issues';
import type { PrismaClient } from '../db.js';
import { createScanEmitter, type EventPublisher } from '../orchestrator/emit.js';
import { resolveReverifyCapability, type CapabilityResolver } from './resolve-check.js';

/**
 * A re-verification job. The assert-fixed route (`apps/api`) is its only
 * producer; it carries the issue and the debit so the runner can refund the
 * exact charge on a non-delivered verdict.
 */
export interface ReverifyJobData {
  readonly issueId: string;
  /** The `DEBIT` transaction for this re-check, so a refund lands in the right lot. */
  readonly debitTransactionId?: string | undefined;
  /** What was charged. Always `REVERIFY_COST` today; carried so the refund is exact. */
  readonly creditsCharged: number;
}

export interface ReverifyRunnerDeps {
  readonly db: PrismaClient;
  readonly publisher: EventPublisher;
  /** Injectable for tests; defaults to the real capability loader. */
  readonly loadForModule?: CapabilityResolver;
  /** Wall-clock bound on the single check. */
  readonly timeoutMs?: number;
  /** Injectable for tests that want neither a real browser nor real egress. */
  readonly makeContext?: (signal: AbortSignal, capabilityId: string) => CodeLayerContext;
}

export interface ReverifyRunResult {
  readonly applied: boolean;
  readonly outcome: VerificationOutcome | null;
  readonly issueState: string | null;
  readonly creditsRefunded: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** The three `ReverifyResult` shapes, plus a reason string, folded to what we persist. */
function outcomeOf(
  result: ReverifyResult,
): { outcome: VerificationOutcome; evidence: Record<string, unknown> | undefined } {
  switch (result.outcome) {
    case 'PASSED':
      return { outcome: 'PASSED', evidence: undefined };
    case 'FAILED':
      return { outcome: 'FAILED', evidence: { ...result.evidence } };
    case 'UNVERIFIABLE':
      return { outcome: 'UNVERIFIABLE', evidence: { reason: result.reason } };
  }
}

/** `issue:verified` only carries these; `ERRORED` maps to the client's "couldn't verify". */
function eventOutcomeOf(outcome: VerificationOutcome): 'PASSED' | 'FAILED' | 'UNVERIFIABLE' | 'ERRORED' {
  return outcome;
}

export async function runReverification(
  deps: ReverifyRunnerDeps,
  data: ReverifyJobData,
): Promise<ReverifyRunResult> {
  const none: ReverifyRunResult = {
    applied: false,
    outcome: null,
    issueState: null,
    creditsRefunded: 0,
  };

  const issue = await deps.db.issue.findUnique({
    where: { id: data.issueId },
    select: {
      id: true,
      state: true,
      checkId: true,
      location: true,
      evidence: true,
      scanId: true,
      moduleResult: { select: { module: true } },
    },
  });
  // Gone, or already given a verdict (a BullMQ retry after a post-write blip):
  // nothing to do, and nothing to charge or refund.
  if (issue === null || issue.state !== 'ASSERTED_FIXED') return none;

  const capability = await resolveReverifyCapability(
    { module: issue.moduleResult.module, checkId: issue.checkId },
    deps.loadForModule,
  );

  let outcome: VerificationOutcome;
  let evidence: Record<string, unknown> | undefined;
  let durationMs = 0;

  if (capability === null) {
    // FR-063: no entry point → UNVERIFIABLE, never RESOLVED. Refunded, because
    // "we have no way to check this" is a gap in our coverage, not a service.
    outcome = 'UNVERIFIABLE';
    evidence = { reason: `No re-verification entry point is registered for ${issue.checkId}.` };
  } else {
    const controller = new AbortController();
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    const ctx =
      deps.makeContext?.(controller.signal, capability.id) ??
      createCodeLayerContext({ signal: controller.signal, capabilityId: capability.id });

    const contained = await containCapabilityCall(
      () =>
        runAsCapability(capability.id, () =>
          capability.reverify!(
            {
              checkId: issue.checkId,
              ...(issue.location === null ? {} : { location: issue.location }),
              ...(isRecord(issue.evidence) ? { evidence: issue.evidence } : {}),
            },
            ctx,
          ),
        ),
      { timeoutMs },
    );
    clearTimeout(timer);
    durationMs = contained.durationMs;

    if (contained.kind === 'resolved') {
      ({ outcome, evidence } = outcomeOf(contained.value));
    } else if (contained.kind === 'timeout') {
      outcome = 'ERRORED';
      evidence = { error: `The re-verification check did not finish within ${String(timeoutMs)}ms.` };
    } else {
      outcome = 'ERRORED';
      evidence = { error: describeThrown(contained.error) };
    }
  }

  const recorded = await recordVerificationAttempt(deps.db, {
    issueId: issue.id,
    outcome,
    ...(evidence === undefined ? {} : { evidence }),
    creditsCharged: data.creditsCharged || REVERIFY_COST,
    durationMs,
    ...(data.debitTransactionId === undefined ? {} : { debitTransactionId: data.debitTransactionId }),
  });

  if (recorded.applied && recorded.issueState !== null) {
    const emitter = createScanEmitter(issue.scanId, { publisher: deps.publisher });
    await emitter.emit(
      {
        type: 'issue:verified',
        issueId: issue.id,
        scanId: issue.scanId,
        outcome: eventOutcomeOf(outcome),
        state: recorded.issueState as 'OPEN' | 'ASSERTED_FIXED' | 'RESOLVED' | 'UNVERIFIABLE',
      },
      () => Promise.resolve(),
    );
  }

  return {
    applied: recorded.applied,
    outcome,
    issueState: recorded.issueState,
    creditsRefunded: recorded.creditsRefunded,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The BullMQ handler. Thin: parse is done in `workers.ts`, the work is above.
 */
export function createReverifyHandler(
  deps: ReverifyRunnerDeps,
): (data: ReverifyJobData) => Promise<void> {
  return async (data: ReverifyJobData): Promise<void> => {
    await runReverification(deps, data);
  };
}
