/**
 * T111 — FR-012/FR-016/FR-017/FR-018: create a scan, or refuse before any
 * work starts.
 *
 * Every refusal below runs before the single `debit()` call at the bottom —
 * `contracts/http-api.md`'s own line for `POST /scans` is "refuses rather
 * than starts when it cannot deliver," and Principle VI ("never charge for
 * our failures") means a target that turns out to be someone else's, or a
 * plan that cannot audit it, or a stale quote, must all be free to attempt.
 *
 * **The whole accepted quote is debited once, here, at creation** — not
 * split per module and refunded for whichever modules a control-level gate
 * later excludes. `packages/capabilities-vendored/` is empty until T119–124,
 * so in this sub-phase every module resolves to zero capabilities regardless
 * of gating — there is no way to observe a partial refund either passing or
 * failing yet, and building one now would be implementing ahead of anything
 * that can prove it correct. `gated-check-partial.test.ts` (T108) stays RED
 * for that reason, not because this file is wrong; recorded in PROGRESS.md.
 *
 * **`capabilitySnapshot` is `{}` in this sub-phase**, honestly, for the same
 * reason: R10 asks for "resolved once at scan start," and there is nothing
 * to resolve yet. A `CapabilityRegistry` needs to be built once at API boot
 * and threaded down as a real seam before this can snapshot anything real —
 * that is follow-up work, not a T110–T118 requirement any test here checks.
 */

import type { ControlLevel, ModuleType } from '@webaudit/types';
import { controlLevelRank, SCAN_STATES_TERMINAL } from '@webaudit/types';
import { modulesForPhase } from '@webaudit/config';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { debit, InsufficientCreditsError } from '../credits/debit.js';
import { totalAvailable } from '../credits/balance.js';
import { TargetNotAvailableError, type ControlProbe } from '../control-gate/verify.js';
import { ControlLevelRequiredError, reconfirmControl } from '../control-gate/reconfirm.js';
import { quoteFor } from './quote.js';
import type { ScanPhaseProducer } from '../queue/scan-phase-producer.js';

export class PlanUpgradeRequiredError extends Error {
  override readonly name = 'PlanUpgradeRequiredError';
  constructor(
    readonly inputType: string,
    readonly requiredTier: string | null,
  ) {
    super(`The current plan does not permit auditing a ${inputType} target.`);
  }
}

export class QuoteMismatchError extends Error {
  override readonly name = 'QuoteMismatchError';
  constructor(
    readonly currentCredits: number,
    readonly acceptedQuote: number,
  ) {
    super('The accepted quote no longer matches the current price.');
  }
}

export class DuplicateScanError extends Error {
  override readonly name = 'DuplicateScanError';
  constructor(readonly scanId: string) {
    super('A scan of this target is already running.');
  }
}

export interface CreateScanInput {
  readonly userId: string;
  readonly targetId: string;
  readonly modules: readonly ModuleType[];
  readonly acceptedQuote: number;
}

export interface CreateScanDeps {
  readonly probe: ControlProbe;
  readonly producer: ScanPhaseProducer;
  /** How a requested module's required control level is resolved (T106's seam). */
  readonly resolveRequiredControlLevel: (
    moduleType: ModuleType,
  ) => ControlLevel | Promise<ControlLevel>;
}

export interface CreatedScan {
  readonly id: string;
  readonly state: string;
  readonly quotedCredits: number;
  readonly chargedCredits: number;
}

export async function createScan(
  db: PrismaClient,
  input: CreateScanInput,
  deps: CreateScanDeps,
): Promise<CreatedScan> {
  const target = await db.target.findFirst({
    where: { id: input.targetId, userId: input.userId },
    select: { id: true, inputType: true, canonicalValue: true },
  });
  if (target === null) throw new TargetNotAvailableError(input.targetId);

  // FR-018, before anything else is checked: a request against an already-
  // running scan of the same target is refused outright, cheaply.
  const running = await db.scan.findFirst({
    where: { userId: input.userId, targetId: input.targetId, state: { notIn: [...SCAN_STATES_TERMINAL] } },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (running !== null) throw new DuplicateScanError(running.id);

  // FR-016: the plan must permit this target's input type.
  const user = await db.user.findUnique({
    where: { id: input.userId },
    include: { subscription: { include: { plan: true } } },
  });
  const plan =
    user?.subscription?.plan ?? (await db.plan.findUniqueOrThrow({ where: { id: 'free' } }));
  if (!plan.allowedInputTypes.includes(target.inputType)) {
    const permitting = await db.plan.findMany({
      where: { isActive: true, allowedInputTypes: { has: target.inputType } },
      orderBy: { monthlyCredits: 'asc' },
      select: { id: true },
    });
    throw new PlanUpgradeRequiredError(target.inputType, permitting[0]?.id ?? null);
  }

  // FR-017: refuse the whole scan only when every requested module is gated
  // out for the target's *current* level — re-confirmed live, never read
  // from the cached column (reconfirm.ts's own module note). A selection
  // that mixes gated and ungated modules starts; the gated ones are filtered
  // per-module later, inside module-runner's resolveApplicable.
  const reconfirmed = await reconfirmControl(db, { targetId: target.id, userId: input.userId }, deps.probe);
  const gated = await Promise.all(
    input.modules.map(async (moduleType) => ({
      moduleType,
      required: await deps.resolveRequiredControlLevel(moduleType),
    })),
  );
  const allGated = gated.every((g) => controlLevelRank(g.required) > controlLevelRank(reconfirmed.level));
  if (allGated) {
    const strictest = gated.reduce((max, g) =>
      controlLevelRank(g.required) > controlLevelRank(max.required) ? g : max,
    );
    throw new ControlLevelRequiredError(target.id, strictest.required, reconfirmed.level);
  }

  // FR-012: no silent reprice between quote and accept.
  const currentQuote = quoteFor(input.modules).credits;
  if (currentQuote !== input.acceptedQuote) {
    throw new QuoteMismatchError(currentQuote, input.acceptedQuote);
  }

  // Pre-flight only — cheap, and avoids writing a Scan row for the ordinary
  // "cannot afford it" case. `debit()` below is the authoritative, race-safe
  // check; a race that slips past this still fails there, and the row it
  // wrote is removed.
  const available = await totalAvailable(db, input.userId);
  if (available < input.acceptedQuote) {
    throw new InsufficientCreditsError(input.acceptedQuote, available);
  }

  const created = await db.scan.create({
    data: {
      userId: input.userId,
      targetId: target.id,
      requestedModules: [...input.modules],
      capabilitySnapshot: {},
      quotedCredits: input.acceptedQuote,
    },
    select: { id: true, state: true, quotedCredits: true, chargedCredits: true },
  });

  try {
    await debit(db, {
      userId: input.userId,
      amount: input.acceptedQuote,
      reason: 'scan:create',
      scanId: created.id,
    });
  } catch (error) {
    // Principle VI: never a paid-for row with nothing charged, and never a
    // charge with no row. `debit` throws before writing anything, so the
    // fix here is symmetric — remove the row this function just wrote.
    await db.scan.delete({ where: { id: created.id } });
    throw error;
  }

  const charged = await db.scan.update({
    where: { id: created.id },
    data: { chargedCredits: input.acceptedQuote },
    select: { id: true, state: true, quotedCredits: true, chargedCredits: true },
  });

  // The first job carries only RUNNING_PHASE_1's own subset (everything but
  // UI, per phase-modules.ts) — `PhaseJobData.modules`' own contract is
  // "which areas this phase runs", not the whole scan's selection.
  await deps.producer.enqueueFirstPhase({
    scanId: created.id,
    modules: modulesForPhase('RUNNING_PHASE_1', input.modules),
    planQueuePriority: plan.queuePriority,
  });

  return charged;
}
