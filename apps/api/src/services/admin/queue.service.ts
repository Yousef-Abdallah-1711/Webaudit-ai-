/**
 * T209 — operator queue inspection, retry, and cancel (FR-088):
 * `GET /admin/queue`, `POST /admin/queue/:jobId/retry`, `POST /admin/queue/:jobId/cancel`.
 *
 * A raw BullMQ `Queue` per name, exactly the read-only-inspection pattern
 * `apps/api/tests/adverse/teardown-producer-jobid.test.ts` already uses
 * against a real queue — no separate abstraction over BullMQ, since BullMQ's
 * own `Job`/`JobState` types are already the right shape for an admin view.
 * `QUEUE_NAMES` comes from `@webaudit/config`, never re-derived (same reason
 * `scan-phase-producer.ts` imports it rather than hardcoding strings).
 *
 * `retry`/`cancel` take only a `jobId`, matching the contract's
 * `/admin/queue/:jobId/retry` — there is no queue name in the path, and job
 * ids are not consistently prefixed with one (`scanPhase` ids are
 * `scanId:phase:attempt`, `reverify` ids are `reverify:issueId:timestamp`,
 * `maintenance` teardown ids are hyphenated with no colon at all — see
 * `teardown-producer-jobid.test.ts`'s own account of that bug class). So
 * finding a job by id means checking each of the three queues in turn rather
 * than parsing the id.
 *
 * `cancelJob` refuses an `active` job rather than force-removing it: BullMQ
 * removing an active job's queue record does not stop whatever process is
 * mid-execution on it — for a `scanPhase` job that is the running audit
 * itself, which already has its own real cancellation path (the scan cancel
 * route, the state machine, and workspace teardown). Presenting queue-record
 * removal as "cancel" for an active job would be a UI that looks like it
 * stopped the work while the phase keeps running to completion. `retryJob`
 * likewise only accepts a `failed` job — retrying a `waiting` or `active` job
 * is not a coherent action, and retrying a `completed` `scanPhase` job would
 * re-run a phase that already charged credits and wrote results, exactly the
 * double-charge `DEFAULT_JOB_OPTIONS`'s own comment (`attempts: 1`) exists to
 * prevent.
 *
 * `cancelJob` also refuses the two job *names* that are never audit work in
 * the first place: `workspace-teardown` and `questionnaire-deadline`, both on
 * the `maintenance` queue. A whole-feature adversarial review of this task
 * caught the real gap a name-agnostic cancel would leave open: `teardown.ts`'s
 * own module note states the in-process terminal-state observer covers
 * `COMPLETED`/`FAILED`/`TIMED_OUT` only — `CANCELLED` is destroyed exclusively
 * by the `workspace-teardown` job the cancel route enqueues onto this same
 * queue (`state-machine.ts`'s own comment says so too), and
 * `sweepOrphanedWorkspaces` (the crash backstop) is not wired into any
 * production entrypoint today — grep it, it is only ever called from tests.
 * Removing that one queue record with no other mechanism watching it would
 * silently and permanently orphan that scan's on-disk source, defeating
 * R15/FR-090's "destroyed on every exit path" guarantee with a clean 200 and
 * no error anywhere. `questionnaire-deadline` gets the same refusal for the
 * matching reason: it is R4's own resume-or-timeout enforcement for a paused
 * scan, not work an operator would ever mean to "cancel" — removing it leaves
 * a scan in `AWAITING_QUESTIONNAIRE` forever if the customer never answers.
 * Retrying either job name is still allowed — retry re-attempts exactly the
 * cleanup/deadline it already exists to perform, which is the desired
 * recovery path for a job that failed, not a guarantee violation.
 */

import { Queue, type ConnectionOptions, type Job } from 'bullmq';
import { QUEUE_NAMES, type QueueName } from '@webaudit/config';
import { recordAuditLog, type AuditLogWriter } from './audit-log.js';

/**
 * Never legitimate admin "cancel" targets — see the module note above.
 * Matched on `job.name`, not queue or id shape, since both live on
 * `maintenance` alongside jobs that are safe to cancel.
 */
const UNCANCELABLE_SYSTEM_JOB_NAMES = new Set(['workspace-teardown', 'questionnaire-deadline']);

export class JobNotFoundError extends Error {
  override readonly name = 'JobNotFoundError';
  constructor(readonly jobId: string) {
    super(`No such queued job: ${jobId}.`);
  }
}

export class JobNotRetryableError extends Error {
  override readonly name = 'JobNotRetryableError';
  constructor(
    readonly jobId: string,
    readonly state: string,
  ) {
    super(`Job ${jobId} is ${state}, not failed — only a failed job may be retried.`);
  }
}

export class JobNotCancelableError extends Error {
  override readonly name = 'JobNotCancelableError';
  constructor(
    readonly jobId: string,
    reason: 'active' | 'system-job',
    jobName?: string,
  ) {
    super(
      reason === 'active'
        ? `Job ${jobId} is active — its queue record cannot be removed while it is running. ` +
          'Cancel the scan itself instead; that path stops the work and tears down its workspace.'
        : `Job ${jobId} is a "${jobName}" job — a system-internal cleanup/deadline, not audit ` +
          'work, and has no other mechanism guaranteeing it runs. It cannot be cancelled here.',
    );
  }
}

export type InspectableState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed';

export interface AdminJobSummary {
  readonly queue: QueueName;
  readonly id: string;
  readonly name: string;
  readonly state: InspectableState;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly failedReason: string | null;
  readonly timestamp: number;
}

export interface ListJobsInput {
  /** Defaults to every inspectable state except `completed` — FR-088 names waiting, running, failed. */
  readonly states?: readonly InspectableState[];
  /** Per queue, per state. Bounds response size; defaults to 50. */
  readonly limit?: number;
}

function connectionFromEnv(): ConnectionOptions {
  return {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
    maxRetriesPerRequest: null,
  };
}

function summarize(queueName: QueueName, job: Job, state: InspectableState): AdminJobSummary {
  return {
    queue: queueName,
    id: job.id ?? '',
    name: job.name,
    state,
    data: job.data as unknown,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    timestamp: job.timestamp,
  };
}

export interface QueueAdminService {
  listJobs(input?: ListJobsInput): Promise<{ readonly jobs: readonly AdminJobSummary[] }>;
  retryJob(
    db: AuditLogWriter,
    input: { readonly operatorId: string; readonly jobId: string },
  ): Promise<AdminJobSummary>;
  cancelJob(
    db: AuditLogWriter,
    input: { readonly operatorId: string; readonly jobId: string },
  ): Promise<{ readonly jobId: string }>;
  close(): Promise<void>;
}

export function createQueueAdminService(
  connection: ConnectionOptions = connectionFromEnv(),
): QueueAdminService {
  const queues: ReadonlyMap<QueueName, Queue> = new Map(
    Object.values(QUEUE_NAMES).map((name) => [name, new Queue(name, { connection })]),
  );

  async function findJob(jobId: string): Promise<{ queueName: QueueName; job: Job } | null> {
    for (const [queueName, queue] of queues) {
      const job = await queue.getJob(jobId);
      if (job !== undefined && job !== null) return { queueName, job };
    }
    return null;
  }

  return {
    async listJobs(input = {}): Promise<{ readonly jobs: readonly AdminJobSummary[] }> {
      const states = input.states ?? (['waiting', 'active', 'delayed', 'failed'] as const);
      const limit = input.limit ?? 50;

      const jobs: AdminJobSummary[] = [];
      for (const [queueName, queue] of queues) {
        for (const state of states) {
          const found = await queue.getJobs([state], 0, limit - 1);
          for (const job of found) {
            jobs.push(summarize(queueName, job, state));
          }
        }
      }
      return { jobs };
    },

    async retryJob(db, input): Promise<AdminJobSummary> {
      const found = await findJob(input.jobId);
      if (found === null) throw new JobNotFoundError(input.jobId);
      const { queueName, job } = found;

      const state = await job.getState();
      if (state !== 'failed') throw new JobNotRetryableError(input.jobId, state);

      await job.retry();

      await recordAuditLog(db, {
        actorId: input.operatorId,
        action: 'queue.job_retry',
        subjectType: 'QueueJob',
        subjectId: input.jobId,
        before: { queue: queueName, state: 'failed' },
        after: { queue: queueName, state: 'waiting' },
      });

      return summarize(queueName, job, 'waiting');
    },

    async cancelJob(db, input): Promise<{ readonly jobId: string }> {
      const found = await findJob(input.jobId);
      if (found === null) throw new JobNotFoundError(input.jobId);
      const { queueName, job } = found;

      if (UNCANCELABLE_SYSTEM_JOB_NAMES.has(job.name)) {
        throw new JobNotCancelableError(input.jobId, 'system-job', job.name);
      }

      const state = await job.getState();
      if (state === 'active') throw new JobNotCancelableError(input.jobId, 'active');

      await job.remove();

      await recordAuditLog(db, {
        actorId: input.operatorId,
        action: 'queue.job_cancel',
        subjectType: 'QueueJob',
        subjectId: input.jobId,
        before: { queue: queueName, state, name: job.name, data: job.data as unknown },
      });

      return { jobId: input.jobId };
    },

    async close(): Promise<void> {
      await Promise.all([...queues.values()].map((q) => q.close()));
    },
  };
}
