/**
 * T104b — the queue consumer's dispatch boundary.
 *
 * This suite exists because of a specific failure mode. Until now the worker had
 * queue *producers* and no consumer, so an enqueued phase job sat in Redis for
 * ever — visibly broken, and therefore harmless. The moment a `Worker` exists
 * there is a second, worse possibility: a consumer that acknowledges the job and
 * reports success without running the audit. A scan would then move to a terminal
 * state having measured nothing, and the credits are already spent. A queue with
 * no consumer loses time; a consumer that lies loses money and trust.
 *
 * So the assertions here are mostly negative. The placeholder must **never**
 * resolve, it must name the task that replaces it, and a malformed payload must
 * fail for the payload's reason rather than being swallowed by the placeholder —
 * because "not implemented" on a job that was garbage in the first place is a
 * misleading diagnosis that costs an hour.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  JOB_NAMES,
  JobNotImplementedError,
  UnknownJobError,
  dispatch,
  phaseJobSchema,
  questionnaireTimeoutJobSchema,
  type JobHandlers,
} from '../../src/queue/workers.js';
import { QUEUE_NAMES } from '../../src/queue/queues.js';
import type { PhaseJobData, QuestionnaireTimeoutJobData } from '../../src/orchestrator/phases.js';

const VALID_PHASE: PhaseJobData = {
  scanId: 'scan_abc',
  phase: 'RUNNING_PHASE_1',
  modules: ['SEO', 'PERFORMANCE'],
  attempt: 1,
};

const VALID_DEADLINE: QuestionnaireTimeoutJobData = {
  scanId: 'scan_abc',
  kind: 'questionnaire-deadline',
  expectedState: 'AWAITING_QUESTIONNAIRE',
};

function phaseJob(data: unknown) {
  return { id: 'j1', name: JOB_NAMES.phase, queueName: QUEUE_NAMES.scanPhase, data };
}

function deadlineJob(data: unknown) {
  return {
    id: 'j2',
    name: JOB_NAMES.questionnaireDeadline,
    queueName: QUEUE_NAMES.maintenance,
    data,
  };
}

describe('the placeholder processor fails loudly', () => {
  it('refuses a well-formed phase job rather than reporting success', async () => {
    // The single most important assertion in this file. A resolved promise here
    // means BullMQ marks the job completed and the phase is never run again —
    // silent data loss with a green dashboard.
    await expect(dispatch(phaseJob(VALID_PHASE))).rejects.toThrow(JobNotImplementedError);
  });

  it('names the task that will replace it, so the seam is findable', async () => {
    const error = await dispatch(phaseJob(VALID_PHASE)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JobNotImplementedError);
    expect((error as JobNotImplementedError).owningTask).toBe('T113');
    // The message, not just a field: this string is what an operator reads in a
    // failed-job record, and it is the only context they get.
    expect((error as Error).message).toContain('T113');
    expect((error as Error).message).toContain(QUEUE_NAMES.scanPhase);
  });

  it('refuses the questionnaire deadline job too', async () => {
    await expect(dispatch(deadlineJob(VALID_DEADLINE))).rejects.toThrow(JobNotImplementedError);
  });
});

describe('payloads are validated at the queue boundary', () => {
  it('rejects a phase job whose modules are not audit areas', async () => {
    const error = await dispatch(phaseJob({ ...VALID_PHASE, modules: ['ACCESSIBILITY'] })).catch(
      (e: unknown) => e,
    );
    // Not a JobNotImplementedError: the payload was wrong, and saying
    // "not implemented" would send the next person to the wrong file.
    expect(error).not.toBeInstanceOf(JobNotImplementedError);
    expect(String(error)).toContain('modules');
  });

  it('rejects a phase job with a state that is not a ScanState', async () => {
    await expect(dispatch(phaseJob({ ...VALID_PHASE, phase: 'RUNNING_PHASE_9' }))).rejects.toThrow(
      /phase/,
    );
  });

  it('rejects a phase job with no scan id', async () => {
    await expect(dispatch(phaseJob({ ...VALID_PHASE, scanId: '' }))).rejects.toThrow(/scanId/);
  });

  it('rejects an attempt count that is not a positive integer', async () => {
    await expect(dispatch(phaseJob({ ...VALID_PHASE, attempt: 0 }))).rejects.toThrow(/attempt/);
  });

  it('rejects an unexpected extra field rather than ignoring it', async () => {
    // Strict, not stripped. An extra key means the producer and the consumer
    // disagree about the payload — during a rolling deploy that is exactly the
    // moment to stop, not to guess which half of the field set matters.
    await expect(dispatch(phaseJob({ ...VALID_PHASE, promptText: 'hello' }))).rejects.toThrow();
  });

  it('rejects a deadline job whose expected state has drifted', async () => {
    // `expectedState` is the guard that stops a stale delayed job moving a scan
    // that has already resumed. A payload that lost it is not runnable.
    await expect(
      dispatch(deadlineJob({ scanId: 'scan_abc', kind: 'questionnaire-deadline' })),
    ).rejects.toThrow(/expectedState/);
  });

  it('accepts the exact shapes phases.ts produces', () => {
    // Guards against the schemas drifting away from the producers in the same
    // repository, which typecheck alone would not catch: `satisfies` proves the
    // schema output is assignable, not that a real payload parses.
    expect(phaseJobSchema.safeParse(VALID_PHASE).success).toBe(true);
    expect(questionnaireTimeoutJobSchema.safeParse(VALID_DEADLINE).success).toBe(true);
  });
});

describe('an unrecognised job name is a failure, not a no-op', () => {
  it('refuses a job on the reverify queue, which has no producer yet', async () => {
    // FR-059's payload lands in Phase 4. Until then there is no shape to
    // validate, so the honest answer is to refuse the job rather than to invent
    // a permissive schema and run it.
    await expect(
      dispatch({ id: 'j3', name: 'reverify', queueName: QUEUE_NAMES.reverify, data: {} }),
    ).rejects.toThrow(UnknownJobError);
  });

  it('refuses an unnamed maintenance job', async () => {
    await expect(
      dispatch({ id: 'j4', name: 'vacuum', queueName: QUEUE_NAMES.maintenance, data: {} }),
    ).rejects.toThrow(UnknownJobError);
  });
});

describe('the seam a real processor drops into', () => {
  it('hands the handler parsed data, and awaits it', async () => {
    const seen: PhaseJobData[] = [];
    let finished = false;
    const handlers: JobHandlers = {
      phase: async (data) => {
        seen.push(data);
        await new Promise((r) => setTimeout(r, 5));
        finished = true;
      },
    };

    await dispatch(phaseJob(VALID_PHASE), handlers);

    // Awaited, not fired and forgotten: BullMQ decides a job is done when the
    // processor's promise settles, so a dispatch that does not await would
    // acknowledge a phase that is still running.
    expect(finished).toBe(true);
    expect(seen).toEqual([VALID_PHASE]);
  });

  it('does not reach the handler when the payload is invalid', async () => {
    const phase = vi.fn(() => Promise.resolve());
    await expect(dispatch(phaseJob({ scanId: 'x' }), { phase })).rejects.toThrow();
    expect(phase).not.toHaveBeenCalled();
  });

  it('lets a handler failure propagate unchanged', async () => {
    const boom = new Error('provider chain exhausted');
    await expect(
      dispatch(phaseJob(VALID_PHASE), { phase: () => Promise.reject(boom) }),
    ).rejects.toBe(boom);
  });

  it('routes the deadline job to its own handler', async () => {
    const deadline = vi.fn((_data: unknown) => Promise.resolve());
    await dispatch(deadlineJob(VALID_DEADLINE), { questionnaireDeadline: deadline });
    expect(deadline).toHaveBeenCalledTimes(1);
    expect(deadline.mock.calls[0]?.[0]).toEqual(VALID_DEADLINE);
  });
});
