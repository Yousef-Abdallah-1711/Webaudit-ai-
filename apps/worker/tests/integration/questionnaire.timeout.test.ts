/**
 * T196 — the deadline side of the design-intent questionnaire (FR-041).
 *
 * `questionnaire-race.test.ts` already proves `resumeAfterQuestionnaire` itself
 * is race-safe against a fake context, and `questionnaire.no-block.test.ts`
 * (T194) proves the real orchestrator run loop reaches `AWAITING_QUESTIONNAIRE`
 * in the first place. Neither covers what fires when nobody ever answers: the
 * delayed `questionnaire-deadline` job that `phases.ts` schedules alongside the
 * pause. Before this handler existed, `workers.ts`'s `dispatch()` threw
 * `JobNotImplementedError` for that job name — this suite is against the real
 * handler that replaces the throw.
 *
 * Two cases, through the real handler against a real database:
 *
 *   1. A scan genuinely still `AWAITING_QUESTIONNAIRE` when the deadline job
 *      runs resumes to `RUNNING_PHASE_2` (with phase 2's job enqueued), and a
 *      `DesignIntent` row is written with `source: 'DEFAULTED'` — FR-041's
 *      "the report must record that intent was not supplied".
 *   2. A scan that already moved past `AWAITING_QUESTIONNAIRE` (the user
 *      answered or skipped before the deadline fired) is untouched: no second
 *      phase-2 enqueue, and — critically — no `DesignIntent` row written by
 *      this handler, since one may already exist from whoever won the race and
 *      writing a second would violate `DesignIntent.scanId`'s `@unique`
 *      constraint (and would misrecord DEFAULTED over a real answer).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { createQuestionnaireTimeoutHandler } from '../../src/orchestrator/questionnaire-timeout-handler.js';
import type { QuestionnaireTimeoutJobData } from '../../src/orchestrator/phases.js';
import type { JobRef } from '../../src/queue/workers.js';

const FAKE_JOB: JobRef = {
  id: 'job-1',
  name: 'questionnaire-deadline',
  queueName: 'maintenance',
  data: {},
};

interface AddedJob {
  readonly queue: 'scanPhase' | 'maintenance';
  readonly name: string;
  readonly data: unknown;
  readonly opts: unknown;
}

function fakeQueues(): {
  queues: { scanPhase: Queue; maintenance: Queue };
  added: AddedJob[];
} {
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

async function makeScan(state: 'AWAITING_QUESTIONNAIRE' | 'RUNNING_PHASE_2'): Promise<{
  scanId: string;
}> {
  const user = await db.user.create({
    data: { email: `q-timeout-${state}@example.com`, passwordHash: 'x', emailVerifiedAt: new Date() },
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
      requestedModules: ['SECURITY', 'UI'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state,
      ...(state === 'AWAITING_QUESTIONNAIRE'
        ? { questionnaireDeadline: new Date(Date.now() - 1000) }
        : {}),
    },
  });
  return { scanId: scan.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});

afterAll(closeDb);

describe('T196 — the questionnaire deadline handler', () => {
  it(
    'resumes a scan still awaiting the questionnaire, enqueues RUNNING_PHASE_2, ' +
      'and records a DEFAULTED DesignIntent (FR-041)',
    async () => {
      const { scanId } = await makeScan('AWAITING_QUESTIONNAIRE');
      const { queues, added } = fakeQueues();
      const handler = createQuestionnaireTimeoutHandler({
        db,
        queues,
        publisher: { publish: () => Promise.resolve(1) },
      });

      const data: QuestionnaireTimeoutJobData = {
        scanId,
        kind: 'questionnaire-deadline',
        expectedState: 'AWAITING_QUESTIONNAIRE',
      };
      await handler(data, FAKE_JOB);

      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).toBe('RUNNING_PHASE_2');
      expect(after.questionnaireDeadline).toBeNull();

      const phaseJobs = added.filter((job) => job.queue === 'scanPhase');
      expect(phaseJobs).toHaveLength(1);
      expect(phaseJobs[0]?.data).toMatchObject({ scanId, phase: 'RUNNING_PHASE_2', modules: ['UI'] });

      const intent = await db.designIntent.findUnique({ where: { scanId } });
      expect(intent).not.toBeNull();
      expect(intent?.source).toBe('DEFAULTED');
      expect(intent?.audience).toBeNull();
      expect(intent?.stylePreference).toBeNull();
    },
  );

  it(
    'does nothing when the scan already moved past AWAITING_QUESTIONNAIRE ' +
      '(the user answered or skipped first): no second enqueue, no DesignIntent write',
    async () => {
      const { scanId } = await makeScan('RUNNING_PHASE_2');
      const { queues, added } = fakeQueues();
      const handler = createQuestionnaireTimeoutHandler({
        db,
        queues,
        publisher: { publish: () => Promise.resolve(1) },
      });

      const data: QuestionnaireTimeoutJobData = {
        scanId,
        kind: 'questionnaire-deadline',
        expectedState: 'AWAITING_QUESTIONNAIRE',
      };
      await handler(data, FAKE_JOB);

      const after = await db.scan.findUniqueOrThrow({ where: { id: scanId } });
      expect(after.state).toBe('RUNNING_PHASE_2');

      expect(added).toEqual([]);

      const intent = await db.designIntent.findUnique({ where: { scanId } });
      expect(intent).toBeNull();
    },
  );
});
