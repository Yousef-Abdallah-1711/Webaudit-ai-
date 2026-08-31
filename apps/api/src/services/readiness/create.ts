/**
 * T161 — create a readiness scan, or refuse before any work starts.
 *
 * A readiness pass (`Scan.kind = READINESS`) is an ordinary scan that points at
 * the `INITIAL` scan it will be compared against (`baselineScanId`) and always
 * runs all five areas fresh (FR-067). Everything else is the same refuse-before-
 * charge shape as `create-scan.ts`:
 *
 *   - the baseline must be the caller's own completed *initial* audit;
 *   - the plan must permit a readiness pass (`Plan.allowReadinessPass`, FR-079);
 *   - **FR-066**: it is refused as *premature* while any CRITICAL or HIGH issue
 *     on the baseline is still outstanding — the route surfaces that as a 403
 *     with the outstanding count, and `GET /scans/:id/readiness` reports the
 *     same so the pass can be "offered but marked premature";
 *   - FR-018 one-active-scan-per-target still applies;
 *   - the accepted quote must equal `READINESS_PASS_COST` (60).
 *
 * The 60-credit charge is debited once, here, before the scan row's phase job
 * is enqueued — Principle VI.
 */

import { ALL_AREAS, READINESS_PASS_COST } from '@webaudit/config';
import { SCAN_STATES_TERMINAL, SEVERITIES_BLOCKING } from '@webaudit/types';
import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';
import { debit, InsufficientCreditsError } from '../credits/debit.js';
import { totalAvailable } from '../credits/balance.js';
import { DuplicateScanError, QuoteMismatchError } from '../intake/create-scan.js';
import { modulesForPhase } from '@webaudit/config';
import type { ScanPhaseProducer } from '../queue/scan-phase-producer.js';

export class BaselineNotEligibleError extends Error {
  override readonly name = 'BaselineNotEligibleError';
  constructor(readonly reason: 'not-found' | 'not-initial' | 'not-completed') {
    super(
      reason === 'not-found'
        ? 'No such completed audit to run a readiness pass against.'
        : reason === 'not-initial'
          ? 'A readiness pass runs against an initial audit, not another readiness pass.'
          : 'The baseline audit has not finished yet.',
    );
  }
}

export class ReadinessNotOnPlanError extends Error {
  override readonly name = 'ReadinessNotOnPlanError';
  constructor(readonly requiredTier: string | null) {
    super('The current plan does not include the production-readiness pass.');
  }
}

export class ReadinessPrematureError extends Error {
  override readonly name = 'ReadinessPrematureError';
  constructor(readonly outstandingBlocking: number) {
    super(
      `The readiness pass is premature: ${String(outstandingBlocking)} critical or high ` +
        'issue(s) are still outstanding on the baseline audit.',
    );
  }
}

export interface CreateReadinessInput {
  readonly userId: string;
  readonly baselineScanId: string;
  readonly acceptedQuote: number;
}

export interface CreateReadinessDeps {
  readonly producer: ScanPhaseProducer;
}

export interface CreatedReadinessScan {
  readonly id: string;
  readonly state: string;
  readonly kind: string;
  readonly baselineScanId: string;
  readonly quotedCredits: number;
  readonly chargedCredits: number;
}

/** Outstanding CRITICAL/HIGH issues on a scan — anything not RESOLVED. */
export async function countOutstandingBlocking(
  db: PrismaClient,
  scanId: string,
): Promise<number> {
  return db.issue.count({
    where: {
      scanId,
      severity: { in: [...SEVERITIES_BLOCKING] },
      state: { not: 'RESOLVED' },
    },
  });
}

export async function createReadinessScan(
  db: PrismaClient,
  input: CreateReadinessInput,
  deps: CreateReadinessDeps,
): Promise<CreatedReadinessScan> {
  const baseline = await db.scan.findFirst({
    where: { id: input.baselineScanId, userId: input.userId },
    select: {
      id: true,
      kind: true,
      state: true,
      targetId: true,
      user: {
        select: {
          subscription: {
            select: { plan: { select: { allowReadinessPass: true, queuePriority: true } } },
          },
        },
      },
    },
  });
  if (baseline === null) throw new BaselineNotEligibleError('not-found');
  if (baseline.kind !== 'INITIAL') throw new BaselineNotEligibleError('not-initial');
  if (baseline.state !== 'COMPLETED') throw new BaselineNotEligibleError('not-completed');

  const plan =
    baseline.user.subscription?.plan ??
    (await db.plan.findUniqueOrThrow({
      where: { id: 'free' },
      select: { allowReadinessPass: true, queuePriority: true },
    }));
  if (!plan.allowReadinessPass) {
    const permitting = await db.plan.findMany({
      where: { isActive: true, allowReadinessPass: true },
      orderBy: { monthlyCredits: 'asc' },
      select: { id: true },
    });
    throw new ReadinessNotOnPlanError(permitting[0]?.id ?? null);
  }

  // FR-066 — premature while any blocking issue is unresolved.
  const outstanding = await countOutstandingBlocking(db, baseline.id);
  if (outstanding > 0) throw new ReadinessPrematureError(outstanding);

  // FR-018 — no other scan of this target may be running.
  const running = await db.scan.findFirst({
    where: {
      userId: input.userId,
      targetId: baseline.targetId,
      state: { notIn: [...SCAN_STATES_TERMINAL] },
    },
    select: { id: true },
  });
  if (running !== null) throw new DuplicateScanError(running.id);

  if (input.acceptedQuote !== READINESS_PASS_COST) {
    throw new QuoteMismatchError(READINESS_PASS_COST, input.acceptedQuote);
  }

  const available = await totalAvailable(db, input.userId);
  if (available < READINESS_PASS_COST) {
    throw new InsufficientCreditsError(READINESS_PASS_COST, available);
  }

  let created: CreatedReadinessScan;
  try {
    created = await db.scan.create({
      data: {
        user: { connect: { id: input.userId } },
        target: { connect: { id: baseline.targetId } },
        kind: 'READINESS',
        baseline: { connect: { id: baseline.id } },
        requestedModules: [...ALL_AREAS],
        capabilitySnapshot: {},
        quotedCredits: READINESS_PASS_COST,
        chargedCredits: READINESS_PASS_COST,
      },
      select: {
        id: true,
        state: true,
        kind: true,
        baselineScanId: true,
        quotedCredits: true,
        chargedCredits: true,
      },
    }) as CreatedReadinessScan;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const winner = await db.scan.findFirst({
        where: {
          userId: input.userId,
          targetId: baseline.targetId,
          state: { notIn: [...SCAN_STATES_TERMINAL] },
        },
        select: { id: true },
      });
      throw new DuplicateScanError(winner?.id ?? baseline.targetId);
    }
    throw error;
  }

  try {
    await debit(db, {
      userId: input.userId,
      amount: READINESS_PASS_COST,
      reason: 'scan:readiness',
      scanId: created.id,
    });
  } catch (error) {
    await db.scan.delete({ where: { id: created.id } });
    throw error;
  }

  await deps.producer.enqueueFirstPhase({
    scanId: created.id,
    modules: modulesForPhase('RUNNING_PHASE_1', [...ALL_AREAS]),
    planQueuePriority: plan.queuePriority,
  });

  return created;
}
