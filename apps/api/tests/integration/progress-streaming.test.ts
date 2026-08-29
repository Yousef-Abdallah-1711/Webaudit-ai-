/**
 * T107 — FR-033: "System MUST run independent audit areas concurrently and
 * deliver each area's result as soon as it is available, rather than
 * holding all results until the last finishes."
 *
 * **Deliberately end to end, through the real queue, not the fan-out layer
 * alone.** `boot.test.ts` already proves a published Redis event reaches a
 * subscribed socket, using an injected fake subscriber and a hand-written
 * envelope — that machinery already works today and would pass immediately
 * here, which is the opposite of a useful RED. What FR-033 actually claims
 * is about the *orchestrator*: that running two areas produces two
 * independent completions, not one. Proving that needs a real phase job,
 * consumed by a real worker, over a real Redis connection (already running
 * on :6389 in this environment) — this file boots a real `startApi` and a
 * real `startWorker` (T104a/T104b, both already built) and drives an actual
 * `phase` job through them, the same composition `boot.test.ts` proves for
 * the API half alone.
 *
 * **RED right now, and for a documented reason.** `apps/worker/src/queue/
 * workers.ts`'s `dispatch()` throws `JobNotImplementedError` naming T113 for
 * every real `phase` job — there is no orchestrator yet, so nothing ever
 * runs a module, let alone two independently. This file asserts both
 * halves of that: the job fails today, by name, and zero `module:complete`
 * events reach the client where FR-033 says there should be two. T113 (the
 * orchestrator run loop) is what turns this green — once it runs
 * `SECURITY` and `SEO` concurrently and emits each on completion, the two
 * assertions below flip from "documenting why nothing arrived" to "proving
 * something did, independently."
 *
 * **`apps/api` gained a test-only dependency on `@webaudit/worker`.**
 * Nothing importable existed to boot the real worker from another package —
 * `apps/worker/package.json` had no `main`/`exports` at all, since nothing
 * had ever consumed it as a package; every other suite that needed the
 * worker's own machinery lived inside `apps/worker/tests/`. Both changes
 * are additive and test-only: `apps/worker/package.json` now exposes
 * `./src/index.ts` the same way every `packages/*` workspace package
 * already does (`main`/`types`/`exports` all pointing at TS source, no
 * build step), and `@webaudit/worker`/`bullmq` are `apps/api`'s
 * `devDependencies`, never `dependencies` — production `apps/api` code
 * still cannot reach `apps/worker`, and the five deployable units stay
 * five deployments. Deliberately not a raw relative import
 * (`../../../worker/src/index.js`) into another service's `src/`, which
 * would have worked but would have made the coupling invisible outside a
 * diff of this one file.
 */

import { afterEach, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { WebSocket } from 'ws';
import { QueueEvents, type ConnectionOptions } from 'bullmq';
import { SignJWT } from 'jose';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { startApi, type ApiService } from '../../src/index.js';
import { startWorker, type WorkerService } from '@webaudit/worker';

const connection: ConnectionOptions = {
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
  maxRetriesPerRequest: null,
};

let api: ApiService | undefined;
let worker: WorkerService | undefined;
let queueEvents: QueueEvents | undefined;

beforeEach(async () => {
  process.env['WORKSPACE_BASE_DIR'] = tmpdir();
  await resetDb();
  await seedPlans();
});

afterEach(async () => {
  await queueEvents?.close();
  queueEvents = undefined;
  await worker?.shutdown('test cleanup');
  worker = undefined;
  await api?.shutdown('test cleanup');
  api = undefined;
});

afterAll(closeDb);

async function tokenFor(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env['JWT_ACCESS_SECRET']);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(secret);
}

async function makeUserAndScan(): Promise<{ scanId: string; token: string }> {
  const user = await testDb.user.create({
    data: { email: 'progress@example.com', emailVerifiedAt: new Date() },
  });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://progress.example.com',
      displayName: 'progress',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SECURITY', 'SEO'],
      capabilitySnapshot: {},
      quotedCredits: 30,
    },
  });
  return { scanId: scan.id, token: await tokenFor(user.id) };
}

async function connect(port: number): Promise<{
  send(message: unknown): void;
  next(ms?: number): Promise<Record<string, unknown> | undefined>;
  close(): void;
}> {
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`);
  const waiting: ((value: Record<string, unknown>) => void)[] = [];
  const buffered: Record<string, unknown>[] = [];

  socket.on('message', (data: Buffer) => {
    const parsed = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
    const next = waiting.shift();
    if (next !== undefined) next(parsed);
    else buffered.push(parsed);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    next: (ms = 500) => {
      const already = buffered.shift();
      if (already !== undefined) return Promise.resolve(already);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        waiting.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    close: () => socket.close(),
  };
}

describe('independent area delivery over the real queue and realtime pipe (FR-033)', () => {
  it('runs a real phase job for two areas and delivers two independent module:complete events', async () => {
    api = await startApi({ db: testDb, port: 0, installSignalHandlers: false });
    // Real handlers now (T113's orchestrator), pointed at the same test
    // database — not the placeholder this file originally exercised. With
    // packages/capabilities-vendored/ still empty, both areas resolve
    // NOT_APPLICABLE (state.ts's own correct answer for zero applicable
    // capabilities), but FR-033 is about *independent delivery*, not about
    // what state each area lands in — module:complete must still fire once
    // per area, separately, which is exactly what this asserts.
    worker = startWorker({ connection, db: testDb, installSignalHandlers: false });
    queueEvents = new QueueEvents(worker.queues.scanPhase.name, { connection });
    await queueEvents.waitUntilReady();

    const { scanId, token } = await makeUserAndScan();
    const client = await connect(api.port);
    client.send({ action: 'subscribe', scanId, token });
    expect(await client.next(2_000)).toEqual({ type: 'subscribed', scanId });

    const jobId = `${scanId}:RUNNING_PHASE_1:1`;
    const completed = new Promise<void>((resolve) => {
      queueEvents?.on('completed', ({ jobId: completedId }) => {
        if (completedId === jobId) resolve();
      });
    });

    await worker.queues.scanPhase.add(
      'phase',
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY', 'SEO'], attempt: 1 },
      { jobId },
    );

    await completed;

    // FR-033 itself: two requested areas, delivered independently.
    const received: Record<string, unknown>[] = [];
    for (let i = 0; i < 6; i += 1) {
      const message = await client.next(500);
      if (message === undefined) break;
      received.push(message);
    }
    const moduleCompletions = received
      .map((m) => m['event'])
      .filter(
        (e): e is { type: string; module: string } =>
          typeof e === 'object' &&
          e !== null &&
          (e as { type?: unknown }).type === 'module:complete',
      );

    expect(moduleCompletions.map((e) => e.module).sort()).toEqual(['SECURITY', 'SEO']);

    client.close();
  }, 20_000);
});
