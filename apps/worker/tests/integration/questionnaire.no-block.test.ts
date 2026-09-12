/**
 * T194 — the real orchestrator run loop actually triggers the design-intent
 * pause (FR-040), not just the isolated mechanism.
 *
 * `apps/worker/tests/adverse/questionnaire-race.test.ts` and
 * `questionnaire-jobid.test.ts` already prove `awaitQuestionnaire` itself is
 * race-safe and non-blocking against a fake context — that mechanism is
 * correct and is NOT re-tested here. What neither of those covers, and what
 * this file is for, is the wiring claim: before T194, nothing in
 * `createPhaseHandler`'s run loop ever called `awaitQuestionnaire` at all
 * (`orchestrator.ts`'s own former module note said so), so a scan requesting
 * UI ran straight through `RUNNING_PHASE_2` with no pause, no matter how
 * correct the pause mechanism was in isolation.
 *
 * Two cases, through the real `createPhaseHandler` against a real database:
 *
 *   1. A scan requesting `['SECURITY', 'UI']` completes phase 1 and lands in
 *      `AWAITING_QUESTIONNAIRE` — not `RUNNING_PHASE_2` — with a deadline set
 *      and a `questionnaire-deadline` job scheduled on the maintenance queue.
 *      `RUNNING_PHASE_2` is never enqueued.
 *   2. A scan requesting only `['SECURITY']` is unaffected: it walks forward
 *      past the empty phase 2/3 exactly as before and lands enqueued on
 *      `RUNNING_MASTER` — no regression for the common, non-UI case.
 *
 * No Capability rows are seeded for either scan. `enabledCapabilityIdsFor`
 * then resolves an empty enabled set for every requested module, so
 * `loadCapabilities` loads nothing and each module resolves NOT_APPLICABLE —
 * deliberately, so this suite makes no network calls and needs no AI chain,
 * matching Principle IV/III. What is under test is the phase transition, not
 * any capability's findings.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };

interface AddedJob {
  readonly queue: 'scanPhase' | 'maintenance';
  readonly name: string;
  readonly data: unknown;
  readonly opts: unknown;
}

/** Records every job added to either queue, so a test can assert what was
 * (and was not) enqueued, not just the resulting scan state. */
function fakeQueues(): { queues: OrchestratorOptions['queues']; added: AddedJob[] } {
  const added: AddedJob[] = [];
  const make = (queue: 'scanPhase' | 'maintenance'): Queue =>
    ({
      add: (name: string, data: unknown, opts: unknown) => {
        added.push({ queue, name, data, opts });
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

async function makeScan(
  requestedModules: readonly ('SECURITY' | 'UI')[],
): Promise<{ scanId: string }> {
  const user = await db.user.create({
    data: {
      email: `q-${requestedModules.join('-')}@example.com`,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
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
      requestedModules: [...requestedModules],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      // QUEUED, matching every other orchestrator integration test's fixture:
      // `handlePhase`'s own entry transition moves `scan.state -> data.phase`
      // (`QUEUED -> RUNNING_PHASE_1` here), which is a self-transition and
      // therefore illegal if the scan already started in `RUNNING_PHASE_1`
      // (`state-machine.ts`'s `ALLOWED` table has no state pointing at
      // itself).
      state: 'QUEUED',
    },
  });
  return { scanId: scan.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});

afterAll(closeDb);

describe('T194 — the real run loop triggers the design-intent pause', () => {
  it(
    'pauses at AWAITING_QUESTIONNAIRE, with a deadline and a scheduled timeout job, ' +
      'instead of enqueueing RUNNING_PHASE_2, when UI was requested',
    async () => {
      const { scanId } = await makeScan(['SECURITY', 'UI']);
      const { queues, added } = fakeQueues();
      const handlePhase = createPhaseHandler(makeOptions(queues));

      await handlePhase(
        { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
        FAKE_JOB,
      );

      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).toBe('AWAITING_QUESTIONNAIRE');
      expect(after.questionnaireDeadline).not.toBeNull();

      // RUNNING_PHASE_2 must never have been enqueued to the phase queue.
      const phaseJobs = added.filter((job) => job.queue === 'scanPhase');
      expect(phaseJobs).toEqual([]);

      // The delayed deadline job was scheduled on the maintenance queue.
      const deadlineJobs = added.filter(
        (job) => job.queue === 'maintenance' && job.name === 'questionnaire-deadline',
      );
      expect(deadlineJobs).toHaveLength(1);
      expect(deadlineJobs[0]?.data).toMatchObject({
        scanId,
        kind: 'questionnaire-deadline',
        expectedState: 'AWAITING_QUESTIONNAIRE',
      });
    },
  );

  it(
    'is unaffected for a scan that never requested UI: it walks forward to ' +
      'RUNNING_MASTER exactly as before, never touching AWAITING_QUESTIONNAIRE',
    async () => {
      const { scanId } = await makeScan(['SECURITY']);
      const { queues, added } = fakeQueues();
      const handlePhase = createPhaseHandler(makeOptions(queues));

      await handlePhase(
        { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
        FAKE_JOB,
      );

      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).not.toBe('AWAITING_QUESTIONNAIRE');
      expect(after.questionnaireDeadline).toBeNull();

      const phaseJobs = added.filter((job) => job.queue === 'scanPhase');
      expect(phaseJobs).toHaveLength(1);
      expect(phaseJobs[0]?.data).toMatchObject({ scanId, phase: 'RUNNING_MASTER' });

      const deadlineJobs = added.filter((job) => job.name === 'questionnaire-deadline');
      expect(deadlineJobs).toEqual([]);
    },
  );
});
