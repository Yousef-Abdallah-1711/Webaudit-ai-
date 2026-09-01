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
import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';

/**
 * A Postgres 23505 surfaced by Prisma as P2002 whose `meta.target` names all of
 * `columns` (Prisma reports the raw partial index `Scan_one_active_per_target`
 * as its column list `["userId","targetId"]`, not the index name).
 */
function isUniqueConstraintViolation(error: unknown, columns: readonly string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const raw: unknown = error.meta?.['target'];
  const asText = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string').join(',')
    : typeof raw === 'string'
      ? raw
      : '';
  return columns.every((c) => asText.includes(c)) || asText === '';
}
import { debit, InsufficientCreditsError } from '../credits/debit.js';
import { totalAvailable } from '../credits/balance.js';
import { TargetNotAvailableError, type ControlProbe } from '../control-gate/verify.js';
import { ControlLevelRequiredError, reconfirmControl } from '../control-gate/reconfirm.js';
import { quoteFor } from './quote.js';
import { assertRepositoryConnectionLive } from './repos.js';
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
  /**
   * Whether the user's GitHub connection still works. Defaults to a real
   * request against GitHub; a suite injects a fake so it needs no credential.
   * Consulted only for a REPOSITORY target.
   */
  readonly checkRepositoryConnection?: (db: PrismaClient, userId: string) => Promise<void>;
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
  // These three reads are independent — run them together rather than in
  // series on the scan-create hot path (review finding L11). Each result is
  // checked below, in the order the contract's refusals are specified.
  const [target, running, userPlan] = await Promise.all([
    db.target.findFirst({
      where: { id: input.targetId, userId: input.userId },
      select: { id: true, inputType: true, canonicalValue: true },
    }),
    // FR-018, before anything else: a request against an already-running scan
    // of the same target is refused outright.
    db.scan.findFirst({
      where: {
        userId: input.userId,
        targetId: input.targetId,
        state: { notIn: [...SCAN_STATES_TERMINAL] },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    }),
    // Only the plan fields this function reads — not the whole User row
    // (which carries the password hash) just to reach `subscription.plan`
    // (review finding L10).
    db.user.findUnique({
      where: { id: input.userId },
      select: {
        subscription: {
          select: {
            plan: { select: { id: true, allowedInputTypes: true, queuePriority: true } },
          },
        },
      },
    }),
  ]);

  if (target === null) throw new TargetNotAvailableError(input.targetId);
  if (running !== null) throw new DuplicateScanError(running.id);

  // FR-016: the plan must permit this target's input type.
  const plan =
    userPlan?.subscription?.plan ??
    (await db.plan.findUniqueOrThrow({
      where: { id: 'free' },
      select: { id: true, allowedInputTypes: true, queuePriority: true },
    }));
  if (!plan.allowedInputTypes.includes(target.inputType)) {
    const permitting = await db.plan.findMany({
      where: { isActive: true, allowedInputTypes: { has: target.inputType } },
      orderBy: { monthlyCredits: 'asc' },
      select: { id: true },
    });
    throw new PlanUpgradeRequiredError(target.inputType, permitting[0]?.id ?? null);
  }

  // T171 / FR-007: a REPOSITORY audit cannot be delivered without a working
  // GitHub credential, and whether the credential still works is only knowable
  // by using it. Checked here — one cheap request, ahead of the debit — so a
  // revoked connection is a refusal rather than a refund. Both outcomes leave
  // the user unbilled (Principle VI), but only the refusal leaves them without
  // a failed scan in their history for something they did nothing wrong to
  // cause. The refund path still exists behind this, for the revocation that
  // happens in the seconds after this check passes.
  if (target.inputType === 'REPOSITORY') {
    await (deps.checkRepositoryConnection ?? assertRepositoryConnectionLive)(db, input.userId);
  }

  // FR-017: refuse the whole scan only when every requested module is gated
  // out for the target's *current* level — re-confirmed live, never read
  // from the cached column (reconfirm.ts's own module note). A selection
  // that mixes gated and ungated modules starts; the gated ones are filtered
  // per-module later, inside module-runner's resolveApplicable.
  const gated = await Promise.all(
    input.modules.map(async (moduleType) => ({
      moduleType,
      required: await deps.resolveRequiredControlLevel(moduleType),
    })),
  );
  // The live re-confirmation is a DNS/HTTP probe of the target. Skip it when
  // nothing in the selection needs more than NONE — the common URL scan — so
  // scan creation is not gated on a needless network round trip (review
  // finding M6). The orchestrator's own per-phase check already does this.
  const anyGate = gated.some((g) => controlLevelRank(g.required) > 0);
  const reconfirmed = anyGate
    ? await reconfirmControl(db, { targetId: target.id, userId: input.userId }, deps.probe)
    : { level: 'NONE' as const };
  const allGated = gated.every(
    (g) => controlLevelRank(g.required) > controlLevelRank(reconfirmed.level),
  );
  if (allGated) {
    const strictest = gated.reduce((max, g) =>
      controlLevelRank(g.required) > controlLevelRank(max.required) ? g : max,
    );
    throw new ControlLevelRequiredError(target.id, strictest.required, reconfirmed.level);
  }

  // FR-012: no silent reprice between quote and accept. The accepted quote is
  // for the whole selection the user saw priced.
  const currentQuote = quoteFor(input.modules).credits;
  if (currentQuote !== input.acceptedQuote) {
    throw new QuoteMismatchError(currentQuote, input.acceptedQuote);
  }

  // US1 scenario 8 / FR-017 (review finding: T108's second assertion): a module
  // whose required control level exceeds the target's current level will be
  // skipped at execution and reported unavailable-pending-verification — so it
  // must not be charged for. Charge only the modules whose gate is met.
  const chargeableModules = gated
    .filter((g) => controlLevelRank(g.required) <= controlLevelRank(reconfirmed.level))
    .map((g) => g.moduleType);
  const chargeCredits = quoteFor(chargeableModules).credits;

  // Pre-flight only — cheap, and avoids writing a Scan row for the ordinary
  // "cannot afford it" case. `debit()` below is the authoritative, race-safe
  // check; a race that slips past this still fails there, and the row it
  // wrote is removed. The pre-flight compares against the amount actually
  // debited, not the full quote.
  const available = await totalAvailable(db, input.userId);
  if (available < chargeCredits) {
    throw new InsufficientCreditsError(chargeCredits, available);
  }

  // `chargedCredits` is written here, not in a later update: a crash between
  // `debit` succeeding and a separate `update` would otherwise leave a real
  // charge with `chargedCredits: 0`, and the refund path reads that column
  // (review finding M5). The row is deleted below if `debit` never succeeds.
  let created: { id: string; state: string; quotedCredits: number; chargedCredits: number };
  try {
    created = await db.scan.create({
      data: {
        userId: input.userId,
        targetId: target.id,
        requestedModules: [...input.modules],
        capabilitySnapshot: {},
        // The full selection was quoted; only the gate-met modules are charged.
        quotedCredits: input.acceptedQuote,
        chargedCredits: chargeCredits,
      },
      select: { id: true, state: true, quotedCredits: true, chargedCredits: true },
    });
  } catch (error) {
    // The partial unique index `Scan_one_active_per_target` rejected this row:
    // a concurrent request won the FR-018 race between the findFirst above and
    // here (review finding H4). This request never debited — refuse cleanly.
    if (isUniqueConstraintViolation(error, ['userId', 'targetId'])) {
      const winner = await db.scan.findFirst({
        where: {
          userId: input.userId,
          targetId: input.targetId,
          state: { notIn: [...SCAN_STATES_TERMINAL] },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      throw new DuplicateScanError(winner?.id ?? input.targetId);
    }
    throw error;
  }

  try {
    if (chargeCredits > 0) {
      await debit(db, {
        userId: input.userId,
        amount: chargeCredits,
        reason: 'scan:create',
        scanId: created.id,
      });
    }
  } catch (error) {
    // Principle VI: never a paid-for row with nothing charged, and never a
    // charge with no row. `debit` throws before writing anything, so the
    // fix here is symmetric — remove the row this function just wrote.
    await db.scan.delete({ where: { id: created.id } });
    throw error;
  }

  const charged = created;

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
