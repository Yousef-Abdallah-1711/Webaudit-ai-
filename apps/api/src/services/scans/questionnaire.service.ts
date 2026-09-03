/**
 * T199/T200 — FR-040/FR-042: the user-facing side of the mid-audit
 * design-intent questionnaire.
 *
 * `apps/worker/src/orchestrator/phases.ts`'s `awaitQuestionnaire` (T194) pauses
 * a scan to `AWAITING_QUESTIONNAIRE` without holding a worker slot, and a
 * delayed job (`questionnaire-timeout-handler.ts`, T196) resumes it with
 * `DesignIntent.source: 'DEFAULTED'` if nothing answers in time. This module is
 * the other side of that same race: the API route calls `answerQuestionnaire`
 * or `skipQuestionnaire` when a human actually responds.
 *
 * **`apps/api` cannot import from `apps/worker`** — the two are separate
 * deployments (CLAUDE.md's "five deployable units"), and `apps/worker`
 * depends on `apps/api`'s generated Prisma client, not the reverse. So this
 * file replicates the same tiny pieces of logic `apps/worker` already has,
 * the same way `scan-phase-producer.ts` already replicates `enqueuePhase`'s
 * job-id shape rather than importing it:
 *
 *   - the guarded transition itself (`state-machine.ts`'s `transition()` is
 *     one conditional `updateMany`, and this route needs exactly the same
 *     shape — see this route file's own `POST /:id/cancel` for the identical
 *     pattern used in-process rather than borrowed);
 *   - `planQueuePriorityFor` (`apps/worker/src/orchestrator/orchestrator.ts`),
 *     duplicated below verbatim so phase 2 is enqueued at the same priority
 *     the worker itself would have used.
 *
 * **Ordering matters, and it matches `questionnaire-timeout-handler.ts`'s own
 * discipline exactly**: the guarded transition happens first; only a genuine
 * win writes the `DesignIntent` row; and only once that row is durable is
 * phase 2 enqueued. Both boundaries are load-bearing, for different reasons.
 *
 * *Write only after winning*, because `DesignIntent.scanId` is `@unique` and
 * this route races the worker's own deadline handler for the same scan —
 * whichever side's guarded `updateMany` matches zero rows must do nothing
 * further. Writing speculatively before confirming the transition won would let
 * both sides attempt the insert and would misrecord a real answer if the
 * deadline actually won first.
 *
 * *Write before enqueueing*, because the enqueue is the instant the phase-2 job
 * becomes visible to a worker, and reading this row is among that job's first
 * acts (`buildDesignIntentInput` in `apps/worker/src/orchestrator/
 * orchestrator.ts`). With the write after the enqueue there is a real window in
 * which a fast worker finds no row, `designIntent` is omitted from
 * `CapabilityInput` entirely, and the design audit silently runs with none of
 * the answers the user just typed — discarding exactly the data FR-040 exists
 * to collect. A failed write now stops the enqueue instead, leaving the scan at
 * `RUNNING_PHASE_2` for the FR-038 sweep to time out and refund, and the caller
 * gets a 500 rather than a quietly answer-less audit.
 */

import { modulesForPhase } from '@webaudit/config';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { ScanPhaseProducer } from '../queue/scan-phase-producer.js';

/** The scan does not exist, or does not belong to the caller. Maps to 404. */
export class QuestionnaireScanNotFoundError extends Error {}

/**
 * The guarded transition matched no row *and* the scan exists and is this
 * caller's: the deadline already fired, or this questionnaire was already
 * answered or skipped. Maps to 409.
 */
export class QuestionnaireAlreadyResolvedError extends Error {}

/**
 * Duplicated from `apps/worker/src/orchestrator/orchestrator.ts`'s
 * `planQueuePriorityFor` — see this file's own module note for why importing
 * it is not an option. Kept behaviourally identical: the caller's own plan if
 * subscribed, else the free plan's priority, else `40`.
 */
async function planQueuePriorityFor(db: PrismaClient, userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { subscription: { select: { plan: { select: { queuePriority: true } } } } },
  });
  if (user?.subscription?.plan) return user.subscription.plan.queuePriority;
  const free = await db.plan.findUnique({ where: { id: 'free' }, select: { queuePriority: true } });
  return free?.queuePriority ?? 40;
}

export interface DesignIntentAnswer {
  readonly audience?: string | undefined;
  readonly stylePreference?: string | undefined;
  readonly admiredReferences?: readonly string[] | undefined;
  readonly brandColors?: readonly string[] | undefined;
}

/**
 * Resume a paused scan under a guarded transition, then (only on a genuine
 * win) enqueue phase 2 and record why. Shared by `answerQuestionnaire` and
 * `skipQuestionnaire` — a skip is an answer of "use the defaults", the same
 * relationship `phases.ts`'s own `skipQuestionnaire` has to
 * `resumeAfterQuestionnaire`.
 */
async function resume(
  db: PrismaClient,
  producer: ScanPhaseProducer,
  input: { readonly scanId: string; readonly userId: string },
  writeDesignIntent: () => Promise<void>,
): Promise<void> {
  const result = await db.scan.updateMany({
    where: { id: input.scanId, userId: input.userId, state: 'AWAITING_QUESTIONNAIRE' },
    data: { state: 'RUNNING_PHASE_2', questionnaireDeadline: null },
  });

  if (result.count === 0) {
    const exists = await db.scan.findFirst({
      where: { id: input.scanId, userId: input.userId },
      select: { id: true },
    });
    throw exists === null
      ? new QuestionnaireScanNotFoundError()
      : new QuestionnaireAlreadyResolvedError();
  }

  const scan = await db.scan.findUniqueOrThrow({
    where: { id: input.scanId },
    select: { requestedModules: true },
  });
  const modules = modulesForPhase('RUNNING_PHASE_2', scan.requestedModules);

  // After the transition is confirmed won — so the loser of the race writes
  // nothing — and BEFORE the enqueue. See this file's module note: the enqueue
  // is the moment a worker can pick the job up, and a worker that gets there
  // first finds no `DesignIntent` row and audits the design with no answers at
  // all.
  await writeDesignIntent();

  await producer.enqueuePhaseTwo({
    scanId: input.scanId,
    modules,
    planQueuePriority: await planQueuePriorityFor(db, input.userId),
  });
}

/** FR-040: a real answer. Partial is still an answer — every field is optional. */
export async function answerQuestionnaire(
  db: PrismaClient,
  producer: ScanPhaseProducer,
  input: { readonly scanId: string; readonly userId: string; readonly answer: DesignIntentAnswer },
): Promise<void> {
  await resume(db, producer, input, () =>
    db.designIntent
      .create({
        data: {
          scanId: input.scanId,
          source: 'SUPPLIED',
          answeredAt: new Date(),
          ...(input.answer.audience === undefined ? {} : { audience: input.answer.audience }),
          ...(input.answer.stylePreference === undefined
            ? {}
            : { stylePreference: input.answer.stylePreference }),
          ...(input.answer.admiredReferences === undefined
            ? {}
            : { admiredReferences: [...input.answer.admiredReferences] }),
          ...(input.answer.brandColors === undefined
            ? {}
            : { brandColors: [...input.answer.brandColors] }),
        },
      })
      .then(() => undefined),
  );
}

/** FR-042: skip and continue immediately, with no content fields recorded. */
export async function skipQuestionnaire(
  db: PrismaClient,
  producer: ScanPhaseProducer,
  input: { readonly scanId: string; readonly userId: string },
): Promise<void> {
  await resume(db, producer, input, () =>
    db.designIntent
      .create({ data: { scanId: input.scanId, source: 'SKIPPED' } })
      .then(() => undefined),
  );
}
