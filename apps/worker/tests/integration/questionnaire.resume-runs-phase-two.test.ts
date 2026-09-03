/**
 * Phase 8 Critical regression — the phase-2 job a questionnaire resume
 * enqueues must actually RUN the UI area.
 *
 * **What was broken, and why every existing suite missed it.**
 * `questionnaire.no-block.test.ts` proves the pause is reached.
 * `questionnaire.timeout.test.ts` proves the deadline resumes it.
 * `questionnaire-race.test.ts` proves exactly one side wins.
 * `apps/api`'s `questionnaire.test.ts` proves the routes resume it.
 * Every one of them stops at *"the phase-2 job was enqueued with the right
 * payload"*, and none of them ever runs that job. So nothing noticed that the
 * enqueued job was a no-op:
 *
 *   - both resume paths (`resumeAfterQuestionnaire` here, and `apps/api`'s
 *     `questionnaire.service.ts`) perform the guarded transition
 *     `AWAITING_QUESTIONNAIRE -> RUNNING_PHASE_2` and *then* enqueue the
 *     phase-2 job;
 *   - `handlePhase` opened by transitioning the scan *into* the phase its job
 *     names — so by the time the resumed job ran, it attempted
 *     `RUNNING_PHASE_2 -> RUNNING_PHASE_2`;
 *   - `state-machine.ts`'s `ALLOWED` table has no self-edge for any state
 *     (deliberately — see `questionnaire.no-block.test.ts`'s own fixture
 *     comment), so `outcome.moved` was `false` and `handlePhase` returned
 *     having run zero modules.
 *
 * The UI area was therefore never audited on any scan that paused for design
 * intent, and the scan sat at `RUNNING_PHASE_2` until the FR-038 timeout sweep
 * eventually timed it out and refunded it. The whole of US6 was non-functional.
 *
 * **This suite is the missing assertion**: it takes the payload a real resume
 * actually enqueued, parses it through the real queue-boundary schema
 * (`phaseJobSchema` — `.strict()`, so a payload carrying a field the schema
 * does not know is refused here rather than silently stripped), and runs it
 * through the real `createPhaseHandler`. Then it asserts what a user paid for:
 * a `UI` `ModuleResult` row, and a scan that moved on.
 *
 * Two cases:
 *
 *   1. **No registry seeded**, so `loadCapabilities` loads nothing and every
 *      module resolves NOT_APPLICABLE — no network, no AI, fast, and
 *      deterministic. What is under test is that the resumed job *ran the
 *      phase at all*: a `UI` `ModuleResult` row exists, the scan walked
 *      forward past `RUNNING_PHASE_2`, and `RUNNING_MASTER` was enqueued.
 *      This is the case that is RED against the bug.
 *   2. **The real registry reconciled** (as `orchestrator-ui-module.test.ts`
 *      does), with a SUPPLIED `DesignIntent` row already written by the
 *      resume — so the resumed phase really runs the design capability and
 *      really reads the user's answers through
 *      `buildDesignIntentInput`/`CapabilityInput.designIntent`. That is the
 *      feature US6 exists to deliver, end to end.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import { resumeAfterQuestionnaire, type EnqueueContext } from '../../src/orchestrator/phases.js';
import { createScanEmitter } from '../../src/orchestrator/emit.js';
import { phaseJobSchema, type JobRef } from '../../src/queue/workers.js';
import type { PhaseJobData } from '../../src/orchestrator/phases.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };

interface AddedJob {
  readonly queue: 'scanPhase' | 'maintenance';
  readonly name: string;
  readonly data: unknown;
}

function fakeQueues(): { queues: OrchestratorOptions['queues']; added: AddedJob[] } {
  const added: AddedJob[] = [];
  const make = (queue: 'scanPhase' | 'maintenance'): Queue =>
    ({
      add: (name: string, data: unknown) => {
        added.push({ queue, name, data });
        return Promise.resolve({ id: 'stub-job' });
      },
    }) as unknown as Queue;
  return { queues: { scanPhase: make('scanPhase'), maintenance: make('maintenance') }, added };
}

function makeOptions(queues: OrchestratorOptions['queues']): OrchestratorOptions {
  return {
    db,
    queues,
    publisher: { publish: () => Promise.resolve(1) },
    executor: createExecutorFromEnv(),
    moduleTimeoutMs: 20_000,
  };
}

function makeContext(queues: OrchestratorOptions['queues'], scanId: string): EnqueueContext {
  return {
    scanPhaseQueue: queues.scanPhase,
    maintenanceQueue: queues.maintenance,
    db,
    emitter: createScanEmitter(scanId, { publisher: { publish: () => Promise.resolve(1) } }),
    planQueuePriority: 40,
  };
}

async function makeScan(
  email: string,
  state: 'QUEUED' | 'AWAITING_QUESTIONNAIRE',
): Promise<{ scanId: string }> {
  const user = await db.user.create({
    data: { email, passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  const target = await db.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://example.com',
      displayName: 'https://example.com',
      controlLevel: 'NONE',
    },
  });
  const scan = await db.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      // A scan must request at least one non-UI area to have a phase 1 at all
      // (`phaseJobSchema` refuses an empty module list), so 'SECURITY' is the
      // realistic companion here — the same pair `questionnaire.no-block.
      // test.ts` and `questionnaire.timeout.test.ts` both use.
      requestedModules: ['SECURITY', 'UI'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state,
      ...(state === 'AWAITING_QUESTIONNAIRE'
        ? { questionnaireDeadline: new Date(Date.now() + 600_000) }
        : {}),
    },
  });
  return { scanId: scan.id };
}

/**
 * The single phase job a resume enqueued, taken from the queue double and put
 * back through the real queue-boundary schema — the same parse `dispatch()`
 * performs in production, so a payload this handler could not actually be
 * handed fails here rather than passing on a hand-built object.
 */
function dequeuePhaseJob(added: readonly AddedJob[]): PhaseJobData {
  const phaseJobs = added.filter((job) => job.queue === 'scanPhase' && job.name === 'phase');
  expect(phaseJobs, 'the resume must have enqueued exactly one phase job').toHaveLength(1);
  return phaseJobSchema.parse(phaseJobs[0]?.data);
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});

afterAll(closeDb);

describe('Phase 8 regression — a resumed phase-2 job actually runs the UI area', () => {
  it(
    'runs the phase the resume enqueued: a UI ModuleResult is written and the scan ' +
      'walks forward past RUNNING_PHASE_2 to RUNNING_MASTER',
    async () => {
      const { scanId } = await makeScan('q-resume-runs@example.com', 'QUEUED');

      // 1. Reach the pause through the real run loop, exactly as production does.
      const first = fakeQueues();
      const handleFirst = createPhaseHandler(makeOptions(first.queues));
      await handleFirst(
        { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
        FAKE_JOB,
      );
      expect((await db.scan.findUniqueOrThrow({ where: { id: scanId } })).state).toBe(
        'AWAITING_QUESTIONNAIRE',
      );

      // 2. Resume, through the real resume path (the deadline handler's own body).
      const resumed = fakeQueues();
      const outcome = await resumeAfterQuestionnaire(makeContext(resumed.queues, scanId), {
        scanId,
        reason: 'DEADLINE',
        modules: ['UI'],
      });
      expect(outcome.resumed).toBe(true);
      expect((await db.scan.findUniqueOrThrow({ where: { id: scanId } })).state).toBe(
        'RUNNING_PHASE_2',
      );

      // 3. Run the job the resume enqueued. This is the step no existing suite
      //    took, and the step the bug lived in.
      const job = dequeuePhaseJob(resumed.added);
      expect(job).toMatchObject({ scanId, phase: 'RUNNING_PHASE_2', modules: ['UI'] });

      const ran = fakeQueues();
      const handleSecond = createPhaseHandler(makeOptions(ran.queues));
      await handleSecond(job, FAKE_JOB);

      // 4. What the user paid for: the UI area was actually audited.
      const uiResult = await db.moduleResult.findUnique({
        where: { scanId_module: { scanId, module: 'UI' } },
      });
      expect(uiResult, 'the resumed phase must have persisted a UI ModuleResult').not.toBeNull();

      // 5. And the scan moved on rather than parking at RUNNING_PHASE_2 until
      //    the FR-038 timeout sweep refunded it.
      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).not.toBe('RUNNING_PHASE_2');
      expect(after.state).toBe('RUNNING_PHASE_3');

      const nextJobs = ran.added.filter((j) => j.queue === 'scanPhase');
      expect(nextJobs).toHaveLength(1);
      expect(nextJobs[0]?.data).toMatchObject({ scanId, phase: 'RUNNING_MASTER' });
    },
  );

  it(
    'audits design with the answers the user supplied: the real design capability runs ' +
      'and CapabilityInput.designIntent carries the DesignIntent row the resume wrote',
    async () => {
      // The production boot path — the 13 real capabilities plus the
      // module-ai:<module> sentinels persist needs (finding C1).
      await reconcileCapabilitiesAtBoot(db);

      const { scanId } = await makeScan('q-resume-intent@example.com', 'AWAITING_QUESTIONNAIRE');
      // What an answered questionnaire leaves behind. Written before the
      // resume enqueues, which is the ordering this fix also corrected.
      await db.designIntent.create({
        data: {
          scanId,
          source: 'SUPPLIED',
          answeredAt: new Date(),
          audience: 'Small business owners',
          stylePreference: 'Minimal',
          brandColors: ['#123456'],
        },
      });

      const resumed = fakeQueues();
      const outcome = await resumeAfterQuestionnaire(makeContext(resumed.queues, scanId), {
        scanId,
        reason: 'ANSWERED',
        modules: ['UI'],
      });
      expect(outcome.resumed).toBe(true);

      const ran = fakeQueues();
      const handle = createPhaseHandler(makeOptions(ran.queues));
      await handle(dequeuePhaseJob(resumed.added), FAKE_JOB);

      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).not.toBe('FAILED');
      expect(after.state).not.toBe('RUNNING_PHASE_2');

      const uiResult = await db.moduleResult.findUnique({
        where: { scanId_module: { scanId, module: 'UI' } },
      });
      expect(uiResult, 'the UI ModuleResult must be persisted').not.toBeNull();
      // The real design capability ran, rather than resolving NOT_APPLICABLE
      // for want of an enabled capability — which is what makes the
      // `designIntent` threading above meaningful rather than incidental.
      expect(uiResult?.state).not.toBe('NOT_APPLICABLE');

      const execution = await db.capabilityExecution.findFirst({
        where: { scanId, module: 'UI' },
      });
      expect(execution, 'a UI capability execution row must exist').not.toBeNull();
    },
  );
});
