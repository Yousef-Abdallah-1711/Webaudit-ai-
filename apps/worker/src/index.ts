/**
 * @webaudit/worker — T104b, the process.
 *
 * BullMQ consumer: orchestrator, module runner, re-verification.
 *
 * Everything this service needs has existed since 2J and none of it ran, because
 * there was no process. This file is that process, and it is deliberately thin:
 * read configuration, refuse to start if it is missing, open the queues, start
 * the workers, and shut both down in the right order. The audit itself belongs to
 * T113 — see `queue/workers.ts` for the seam it plugs into.
 *
 * **It fails closed, and the failure mode it is closing is specific.** A worker
 * that boots without `REDIS_URL` cannot consume a queue, but it can bind nothing,
 * log nothing alarming, and answer a process-liveness check perfectly. The
 * deployment looks healthy while every audit on the platform sits in a queue
 * nobody is reading, and the first symptom is a customer asking why their scan
 * has said "queued" for an hour. `redisConnection()` in `queues.ts` already throws
 * for exactly this reason; this file calls it before it creates anything, so the
 * process dies at boot with the variable named rather than degrading into a
 * healthy-looking no-op. That is `config/env.ts`'s philosophy applied to the one
 * thing this service cannot do without.
 *
 * **Producers as well as consumers.** The worker opens the queue producers too,
 * not only the workers. That is not symmetry for its own sake: R4's resumable
 * design has a phase job enqueue the *next* phase and schedule the questionnaire
 * deadline from inside the job it is currently running (`phases.ts`). A worker
 * that could only consume would run phase 1 and stop.
 *
 * **Shutdown lets in-flight jobs finish.** `Worker.close()` without force stops
 * fetching new jobs and waits for the ones already running. A phase job is
 * `attempts: 1` — it has charged credits and written rows, and it is never
 * retried — so killing it mid-flight is not a delayed retry, it is a failed scan
 * that has to be refunded. Waiting is the cheap option. There is still a
 * deadline, because a shutdown that waits for ever is a deployment that hangs
 * until the platform sends SIGKILL, which is the same interruption with less
 * information in the log.
 */

import { pathToFileURL } from 'node:url';
import { type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { createExecutorFromEnv, type AiExecutor } from '@webaudit/ai-executor';
import { createQueues, redisConnection, type QueueSet } from './queue/queues.js';
import { createWorkers, type JobHandlers, type WorkerSet } from './queue/workers.js';
import { installProcessGuards } from './process-guards.js';
import { createWorkerDb, type PrismaClient } from './db.js';
import { createUploadStorage, type UploadStorage } from '@webaudit/api/intake';
import { createPhaseHandler } from './orchestrator/orchestrator.js';
import { createReverifyHandler } from './reverify/runner.js';
import {
  createTimeoutSweepHandler,
  scheduleTimeoutSweep,
} from './orchestrator/timeout-scheduler.js';
import { installTerminalRefund } from './orchestrator/terminal-refund.js';
import { installTerminalTeardown } from './workspace/teardown.js';
import type { EventPublisher } from './orchestrator/emit.js';

export const SERVICE_NAME = '@webaudit/worker' as const;

/**
 * How long a shutdown waits for in-flight jobs.
 *
 * Two minutes because a phase job is the unit here and plan.md sizes a whole
 * audit at ~5 minutes across several phases; one phase finishing inside two
 * minutes is the common case. Must stay comfortably below the platform's own
 * SIGKILL timeout, or the grace period is a fiction and the escalation below
 * never gets to run.
 */
const DEFAULT_SHUTDOWN_GRACE_MS = 120_000;

/**
 * Environment reads are validated rather than coerced.
 *
 * A typo in `WORKER_SHUTDOWN_GRACE_MS` silently becoming the default is the kind
 * of thing that is discovered during an incident, when the operator who set it
 * is certain they configured it.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer of milliseconds, received "${raw}".`);
  }
  return parsed;
}

function requiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${name} is not set. The worker cannot manage scan workspaces without it.`);
  }
  return raw;
}

export interface WorkerServiceOptions {
  /** Omit to read `REDIS_URL`, which is required. */
  readonly connection?: ConnectionOptions;
  /**
   * Omit for the real orchestrator (T113), built from `db`/`publisher`/
   * `executor` below. Pass an explicit value only to run the placeholders
   * from `workers.ts` (proving they still refuse a job by name) or a fake
   * for a suite that wants neither.
   */
  readonly handlers?: JobHandlers;
  /**
   * The database the real handlers read and write. Omit to read
   * `DATABASE_URL` — a suite MUST override this with its own test database
   * client, or it reaches the same database a real deployment would.
   */
  readonly db?: PrismaClient;
  /** Where scan events are published. Omit for a real `ioredis` client on `connection`. */
  readonly publisher?: EventPublisher;
  /** Omit to read `AI_MODE`/`AI_CHAIN` via `createExecutorFromEnv()`. */
  readonly executor?: AiExecutor;
  readonly shutdownGraceMs?: number;
  /**
   * Defaults to true: the production path is the default path. A suite that
   * starts a service in-process passes false, so it does not take ownership of
   * the test runner's signals.
   */
  readonly installSignalHandlers?: boolean;
}

export interface WorkerService {
  readonly queues: QueueSet;
  readonly workers: WorkerSet;
  /** Idempotent. A second SIGTERM must not start a second shutdown. */
  shutdown(reason?: string): Promise<void>;
}

export function startWorker(options: WorkerServiceOptions = {}): WorkerService {
  // First of all — before Redis, before the queues. `process-guards.ts` covers
  // a capability's detached throw, and the fewer other things start before that
  // backstop exists, the smaller the window a real one costs us. Uninstalled
  // when this instance shuts down, so tests that start and stop several workers
  // in one process do not accumulate listeners.
  const uninstallProcessGuards = installProcessGuards();

  // Before anything else is constructed. An absent REDIS_URL must stop the
  // process, not produce a half-built service that reports itself up.
  const connection = options.connection ?? redisConnection();
  const graceMs =
    options.shutdownGraceMs ??
    positiveIntFromEnv('WORKER_SHUTDOWN_GRACE_MS', DEFAULT_SHUTDOWN_GRACE_MS);

  const queues = createQueues(connection);

  // Built lazily-but-eagerly: only when no explicit `handlers` was given, so
  // a caller that wants the placeholders (or a fake) never pays for a real
  // database connection or AI executor it will not use.
  let publisherToClose: Redis | undefined;
  let uploadStorage: UploadStorage | undefined;
  let uninstallTerminalRefund: (() => void) | undefined;
  let uninstallTerminalTeardown: (() => void) | undefined;
  const handlers =
    options.handlers ??
    (() => {
      const db = options.db ?? createWorkerDb();
      const workspaceBaseDir = requiredEnv('WORKSPACE_BASE_DIR');
      uninstallTerminalRefund = installTerminalRefund({ db });
      uninstallTerminalTeardown = installTerminalTeardown({
        baseDir: workspaceBaseDir,
        db,
      });
      const publisher =
        options.publisher ??
        (() => {
          // `connection` always comes from `redisConnection()` unless the
          // caller passed its own — both shapes used anywhere in this
          // codebase carry `url`, but `ConnectionOptions` is a wider union
          // that does not statically guarantee it.
          const url = (connection as { url?: string }).url ?? process.env['REDIS_URL'] ?? '';
          const client = new Redis(url, { maxRetriesPerRequest: null });
          publisherToClose = client;
          return client;
        })();
      const executor = options.executor ?? createExecutorFromEnv();
      return {
        phase: createPhaseHandler({
          db,
          queues,
          publisher,
          executor,
          // T174. `createUploadStorage` reads the R2 variables when it is
          // first called rather than now, so a deployment that only audits
          // URLs still boots without them — and one that is asked to audit an
          // archive fails loudly at that point instead of silently reporting
          // no source attached.
          source: {
            baseDir: workspaceBaseDir,
            get uploadStorage() {
              return (uploadStorage ??= createUploadStorage());
            },
          },
        }),
        // FR-038: the repeatable sweep that terminates stuck scans and refunds
        // their undelivered share. Registered as a repeatable job below.
        timeoutSweep: createTimeoutSweepHandler({ db, publisher }),
        // FR-059 (T150): the targeted re-verification runner. `apps/api`'s
        // assert-fixed route is its only producer.
        reverify: createReverifyHandler({ db, publisher }),
      };
    })();
  const workers = createWorkers({ connection, handlers });

  // The repeatable maintenance job. Idempotent — a stable jobId means a
  // redeploy replaces the schedule rather than stacking a second one. Only
  // done for the real handler path; a caller supplying its own `handlers`
  // (a test, the placeholder path) opts out.
  if (options.handlers === undefined) {
    void scheduleTimeoutSweep(queues.maintenance).catch((error: unknown) => {
      console.error(
        `[worker] could not schedule the timeout sweep; stuck scans will not be ` +
          `recovered until this is resolved: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  let shuttingDown: Promise<void> | undefined;

  const shutdown = (reason = 'shutdown'): Promise<void> => {
    // Returning the in-flight promise rather than starting again: a platform
    // that sends SIGTERM then SIGINT would otherwise close the queues from under
    // a drain that is still running.
    if (shuttingDown !== undefined) return shuttingDown;

    shuttingDown = (async (): Promise<void> => {
      console.warn(`[worker] ${reason} — draining, up to ${String(graceMs)}ms for running jobs.`);

      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), graceMs);
        // Do not hold the event loop open on account of the deadline itself.
        timer.unref();
      });

      // Stop fetching, wait for what is running. Raced rather than escalated with
      // a forced close: BullMQ returns the same closing promise on a second
      // call, so `close(true)` after `close(false)` would not actually force
      // anything. Abandoning the wait is what forcing means here — the running
      // job's lock expires and another worker reclaims it as stalled, which is
      // the correct outcome for work we could not finish.
      const outcome = await Promise.race([
        workers.close(false).then(() => 'drained' as const),
        deadline,
      ]);
      if (timer !== undefined) clearTimeout(timer);

      if (outcome === 'timeout') {
        console.error(
          `[worker] jobs still running after ${String(graceMs)}ms. Abandoning the wait; ` +
            'they will be reclaimed as stalled. If this recurs, the grace period is ' +
            'shorter than a phase job takes.',
        );
      }

      // After the workers: a producer closed first would break a job that is
      // still finishing and needs to enqueue its successor.
      await queues.close();
      if (publisherToClose !== undefined) publisherToClose.disconnect();
      uninstallTerminalRefund?.();
      uninstallTerminalTeardown?.();
      uninstallProcessGuards();
      console.warn('[worker] stopped.');
    })();

    return shuttingDown;
  };

  if (options.installSignalHandlers ?? true) {
    // `once`, not `on`: a repeated signal is handled by the idempotence above,
    // and accumulating listeners across a hot reload is its own leak.
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  }

  return { queues, workers, shutdown };
}

/**
 * True when this module is the process entrypoint.
 *
 * The service must not start merely because something imported this file — a
 * suite importing `startWorker` would otherwise open Redis connections on
 * import, which is how a test run ends up with dozens of them.
 */
function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    // `pathToFileURL` rather than building the URL by hand, for the same reason
    // the API entrypoint gives: on Windows a raw `C:\Users\...` path becomes
    // `file://C:/Users/...`, where `C` parses as the *host*. The comparison then
    // never matches and the worker silently declines to start — a failure whose
    // only symptom is a queue nobody reads.
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  try {
    startWorker();
    console.warn(
      `[worker] ${SERVICE_NAME} consuming — phase orchestrator, re-verification, and the ` +
        `repeatable timeout sweep.`,
    );
  } catch (error) {
    // Exit non-zero so an orchestrator restarts or reports rather than treating a
    // dead process as a deliberate stop.
    console.error(
      `[worker] refusing to start: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
