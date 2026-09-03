/**
 * T196 — the deadline side of the design-intent questionnaire (FR-041).
 *
 * `phases.ts`'s `awaitQuestionnaire` schedules a delayed `questionnaire-deadline`
 * job on the maintenance queue whenever a scan pauses for design intent. Until
 * this file existed, `workers.ts`'s `dispatch()` threw `JobNotImplementedError`
 * for that job name — the mechanism that decides *who* should resume
 * (`resumeAfterQuestionnaire`'s race guard) already existed and was already
 * tested in isolation (`questionnaire-race.test.ts`), but nothing ever called it
 * from a real delayed job, so a user who never answered stayed parked in
 * `AWAITING_QUESTIONNAIRE` forever.
 *
 * This handler is the body of that job:
 *
 *   1. Read the scan for `requestedModules` (to compute what `RUNNING_PHASE_2`
 *      runs) and `userId` (to recompute the plan's queue priority the same way
 *      the original phase-1 job did — the delayed job carries only the scan id,
 *      so that priority is not available to it and must be looked up again).
 *   2. Call `resumeAfterQuestionnaire` with `reason: 'DEADLINE'`. Its own guard
 *      decides whether this side wins the race against an answer or a skip.
 *   3. **Only on a genuine win** (`resumed === true`) write a `DesignIntent` row
 *      with `source: 'DEFAULTED'` — FR-041's "record in the report that intent
 *      was not supplied". A lost race means an answer or a skip already got
 *      here first and already owns writing its own `DesignIntent` row (a
 *      separate, later task); writing one here too would violate
 *      `DesignIntent.scanId`'s `@unique` constraint and would misrecord
 *      DEFAULTED over an answer that was actually supplied. The ordering is
 *      deliberate: call `resumeAfterQuestionnaire` first, inspect its result,
 *      and only then write — never write speculatively before knowing this
 *      side won.
 *
 * A scan that is already gone (e.g. cancelled and later garbage-collected) is
 * handled the same way the phase handler treats a missing scan elsewhere in
 * this codebase: nothing to run against is not an error.
 */

import type { Queue } from 'bullmq';
import { modulesForPhase } from '@webaudit/config';
import type { PrismaClient } from '../db.js';
import { resumeAfterQuestionnaire, type QuestionnaireTimeoutJobData } from './phases.js';
import { planQueuePriorityFor } from './orchestrator.js';
import { createScanEmitter, type EventPublisher } from './emit.js';
import type { JobRef } from '../queue/workers.js';

export interface QuestionnaireTimeoutHandlerDeps {
  readonly db: PrismaClient;
  readonly queues: { readonly scanPhase: Queue; readonly maintenance: Queue };
  readonly publisher: EventPublisher;
}

export function createQuestionnaireTimeoutHandler(
  deps: QuestionnaireTimeoutHandlerDeps,
): (data: QuestionnaireTimeoutJobData, job: JobRef) => Promise<void> {
  return async function handleQuestionnaireTimeout(
    data: QuestionnaireTimeoutJobData,
  ): Promise<void> {
    const scan = await deps.db.scan.findUnique({
      where: { id: data.scanId },
      select: { userId: true, requestedModules: true },
    });
    // Gone: nothing to resume, and nothing to record intent for.
    if (scan === null) return;

    const modules = modulesForPhase('RUNNING_PHASE_2', scan.requestedModules);
    const emitter = createScanEmitter(data.scanId, { publisher: deps.publisher });

    const outcome = await resumeAfterQuestionnaire(
      {
        scanPhaseQueue: deps.queues.scanPhase,
        maintenanceQueue: deps.queues.maintenance,
        db: deps.db,
        emitter,
        planQueuePriority: await planQueuePriorityFor(deps.db, scan.userId),
      },
      { scanId: data.scanId, reason: 'DEADLINE', modules },
    );

    // Lost the race (or the scan was cancelled/timed out while waiting): an
    // answer or a skip already owns whatever DesignIntent row exists or will
    // exist. Writing here too would violate scanId's @unique constraint and
    // would record DEFAULTED over intent that was actually supplied.
    if (!outcome.resumed) return;

    await deps.db.designIntent.create({
      data: { scanId: data.scanId, source: 'DEFAULTED' },
    });
  };
}
