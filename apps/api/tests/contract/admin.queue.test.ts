/**
 * T209 — GET/POST /admin/queue, /admin/queue/:jobId/retry, /admin/queue/:jobId/cancel.
 *
 * Same not-yet-mounted, not-yet-`requireOperator`-gated setup as every other
 * file in this directory — see admin.capabilities.test.ts's header.
 *
 * Drives real BullMQ state with a real `Worker`, the way
 * `apps/worker/tests/unit/queues.test.ts` constructs real queues/workers
 * rather than faking BullMQ's own state machine — a `failed` or `active` job
 * cannot be produced any other way (BullMQ validates job-state transitions
 * server-side via Lua scripts; a hand-rolled fake would prove nothing about
 * `job.retry()`/`job.remove()`'s real behaviour against those states).
 *
 * Each test obliterates all three queues first: BullMQ job state lives in
 * Redis, not the Postgres `resetDb()` truncates, and this suite's own jobs
 * must not observe another suite's leftovers (or vice versa).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES } from '@webaudit/config';
import { env } from '../../src/config/env.js';
import { adminQueueRoutes } from '../../src/routes/admin/queue.routes.js';
import { createQueueAdminService, type QueueAdminService } from '../../src/services/admin/queue.service.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

const connection: ConnectionOptions = {
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
  maxRetriesPerRequest: null,
};

let service: QueueAdminService;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminQueueRoutes(testDb, service));
  return app;
}
let app: express.Express;

async function tokenFor(userId: string): Promise<string> {
  return new SignJWT({ isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function makeOperatorToken(): Promise<{ token: string; actorId: string }> {
  const actor = await testDb.user.create({
    data: { email: 'operator@example.com', emailVerifiedAt: new Date() },
  });
  return { token: await tokenFor(actor.id), actorId: actor.id };
}

const inspectionQueues = Object.fromEntries(
  Object.values(QUEUE_NAMES).map((name) => [name, new Queue(name, { connection })]),
) as Record<(typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES], Queue>;

async function obliterateAll(): Promise<void> {
  for (const queue of Object.values(inspectionQueues)) {
    await queue.obliterate({ force: true });
  }
}

let workers: Worker[] = [];
async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  await obliterateAll();
  service = createQueueAdminService(connection);
  app = buildApp();
});

afterEach(closeWorkers);

afterAll(async () => {
  await service.close();
  await Promise.all(Object.values(inspectionQueues).map((q) => q.close()));
  await closeDb();
});

describe('GET /queue', () => {
  it('lists a waiting job, tagged with its queue name and state', async () => {
    const { token } = await makeOperatorToken();
    await inspectionQueues[QUEUE_NAMES.scanPhase].add(
      'phase',
      { scanId: 'scan_admin_1', phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      { jobId: 'scan_admin_1:RUNNING_PHASE_1:1' },
    );

    const res = await request(app).get('/queue').set(auth(token)).expect(200);
    const body = res.body as { jobs: { queue: string; id: string; state: string; data: unknown }[] };
    const job = body.jobs.find((j) => j.id === 'scan_admin_1:RUNNING_PHASE_1:1');
    expect(job).toBeDefined();
    expect(job?.queue).toBe(QUEUE_NAMES.scanPhase);
    expect(job?.state).toBe('waiting');
    expect(job?.data).toMatchObject({ scanId: 'scan_admin_1' });
  });

  it('filters to only the requested states', async () => {
    const { token } = await makeOperatorToken();
    await inspectionQueues[QUEUE_NAMES.reverify].add(
      'reverify',
      { issueId: 'issue_admin_1' },
      { jobId: 'reverify:issue_admin_1:1', delay: 60_000 },
    );

    const waitingOnly = await request(app)
      .get('/queue')
      .query({ states: 'waiting' })
      .set(auth(token))
      .expect(200);
    const waitingBody = waitingOnly.body as { jobs: { id: string }[] };
    expect(waitingBody.jobs.some((j) => j.id === 'reverify:issue_admin_1:1')).toBe(false);

    const delayedOnly = await request(app)
      .get('/queue')
      .query({ states: 'delayed' })
      .set(auth(token))
      .expect(200);
    const delayedBody = delayedOnly.body as { jobs: { id: string }[] };
    expect(delayedBody.jobs.some((j) => j.id === 'reverify:issue_admin_1:1')).toBe(true);
  });

  it('rejects an unknown state', async () => {
    const { token } = await makeOperatorToken();
    await request(app).get('/queue').query({ states: 'bogus' }).set(auth(token)).expect(400);
  });
});

describe('POST /queue/:jobId/retry', () => {
  it('404s for a job id that does not exist', async () => {
    const { token } = await makeOperatorToken();
    await request(app).post('/queue/no-such-job/retry').set(auth(token)).expect(404);
  });

  it('409s retrying a job that has not failed', async () => {
    const { token } = await makeOperatorToken();
    await inspectionQueues[QUEUE_NAMES.maintenance].add(
      'workspace-teardown',
      { scanId: 'scan_admin_2' },
      { jobId: 'workspace-teardown-scan_admin_2', delay: 60_000 },
    );

    const res = await request(app)
      .post('/queue/workspace-teardown-scan_admin_2/retry')
      .set(auth(token))
      .expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('JOB_NOT_RETRYABLE');
  });

  it('retries a genuinely failed job and audits the action', async () => {
    const { token, actorId } = await makeOperatorToken();
    const jobId = 'workspace-teardown-scan_admin_3';

    const worker = new Worker(
      QUEUE_NAMES.maintenance,
      (): Promise<void> => Promise.reject(new Error('simulated failure')),
      { connection, concurrency: 1 },
    );
    workers.push(worker);

    const failed = new Promise<void>((resolve) => {
      worker.on('failed', (job) => {
        if (job?.id === jobId) resolve();
      });
    });
    await inspectionQueues[QUEUE_NAMES.maintenance].add(
      'workspace-teardown',
      { scanId: 'scan_admin_3' },
      { jobId, attempts: 1 },
    );
    await failed;
    await worker.close();

    const res = await request(app).post(`/queue/${jobId}/retry`).set(auth(token)).expect(200);
    const body = res.body as { job: { state: string; id: string } };
    expect(body.job.id).toBe(jobId);
    expect(body.job.state).toBe('waiting');

    const job = await inspectionQueues[QUEUE_NAMES.maintenance].getJob(jobId);
    expect(await job?.getState()).not.toBe('failed');

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'QueueJob', action: 'queue.job_retry' },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
    expect(entries[0]?.subjectId).toBe(jobId);
  });
});

describe('POST /queue/:jobId/cancel', () => {
  it('404s for a job id that does not exist', async () => {
    const { token } = await makeOperatorToken();
    await request(app).post('/queue/no-such-job/cancel').set(auth(token)).expect(404);
  });

  it('cancels a waiting job and audits the action', async () => {
    const { token, actorId } = await makeOperatorToken();
    const jobId = 'reverify:issue_admin_4:1';
    await inspectionQueues[QUEUE_NAMES.reverify].add('reverify', { issueId: 'issue_admin_4' }, { jobId });

    const res = await request(app).post(`/queue/${jobId}/cancel`).set(auth(token)).expect(200);
    expect((res.body as { cancelled: string }).cancelled).toBe(jobId);

    const job = await inspectionQueues[QUEUE_NAMES.reverify].getJob(jobId);
    expect(job).toBeUndefined();

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'QueueJob', action: 'queue.job_cancel' },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
    expect(entries[0]?.subjectId).toBe(jobId);
  });

  it('409s cancelling a system-internal workspace-teardown job, leaving it in place — the only mechanism destroying a cancelled scan\'s workspace', async () => {
    const { token } = await makeOperatorToken();
    const jobId = 'workspace-teardown-scan_admin_9';
    await inspectionQueues[QUEUE_NAMES.maintenance].add(
      'workspace-teardown',
      { scanId: 'scan_admin_9' },
      { jobId },
    );

    const res = await request(app).post(`/queue/${jobId}/cancel`).set(auth(token)).expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('JOB_NOT_CANCELABLE');

    const job = await inspectionQueues[QUEUE_NAMES.maintenance].getJob(jobId);
    expect(job).toBeDefined();

    const entries = await testDb.auditLogEntry.findMany({ where: { subjectId: jobId } });
    expect(entries.length).toBe(0);
  });

  it('409s cancelling a system-internal questionnaire-deadline job, leaving it in place', async () => {
    const { token } = await makeOperatorToken();
    const jobId = 'questionnaire-deadline_scan_admin_10';
    await inspectionQueues[QUEUE_NAMES.maintenance].add(
      'questionnaire-deadline',
      { scanId: 'scan_admin_10', kind: 'questionnaire-deadline', expectedState: 'AWAITING_QUESTIONNAIRE' },
      { jobId, delay: 60_000 },
    );

    const res = await request(app).post(`/queue/${jobId}/cancel`).set(auth(token)).expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('JOB_NOT_CANCELABLE');

    const job = await inspectionQueues[QUEUE_NAMES.maintenance].getJob(jobId);
    expect(job).toBeDefined();
  });

  it('409s cancelling a job that is actively being processed, leaving it in place', async () => {
    const { token } = await makeOperatorToken();
    const jobId = 'not-a-protected-name-scan_admin_5';

    let releaseProcessor: () => void = () => {};
    const holdProcessor = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });

    const worker = new Worker(
      QUEUE_NAMES.maintenance,
      async () => {
        await holdProcessor;
      },
      { connection, concurrency: 1 },
    );
    workers.push(worker);

    const active = new Promise<void>((resolve) => {
      worker.on('active', (job) => {
        if (job.id === jobId) resolve();
      });
    });
    await inspectionQueues[QUEUE_NAMES.maintenance].add(
      'some-other-maintenance-task',
      { scanId: 'scan_admin_5' },
      { jobId },
    );
    await active;

    const res = await request(app).post(`/queue/${jobId}/cancel`).set(auth(token)).expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('JOB_NOT_CANCELABLE');

    const job = await inspectionQueues[QUEUE_NAMES.maintenance].getJob(jobId);
    expect(job).toBeDefined();

    releaseProcessor();
    await worker.close();
  });
});
