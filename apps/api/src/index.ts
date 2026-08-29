/**
 * @webaudit/api — T104b, the process.
 *
 * Express API. Holds database and provider credentials.
 *
 * `createApp` is a factory so tests can inject a database and a mailer, which
 * meant nothing ever called it outside a suite: the routes, the WebSocket server
 * and the Redis fan-out were all built, tested, and unreachable because no
 * process existed to hold them. This file is that process, and it does four
 * things in an order that matters.
 *
 * **The order is the interesting part, in both directions.**
 *
 * Starting up: the HTTP server must exist before the WebSocket server, because
 * `ws` upgrades an existing `http.Server` rather than binding its own port — one
 * port, one TLS terminator, one thing for the platform to health-check. And the
 * fan-out must be attached to the socket layer before the port opens, or a client
 * that connects in the first milliseconds subscribes to a room nothing is
 * publishing into and sits at 0% until it reconnects.
 *
 * Shutting down: `server.close()` stops accepting new connections immediately but
 * resolves only when every existing one has ended — and a WebSocket never ends on
 * its own. So the listener is closed first (stop accepting), then the fan-out
 * (stop producing events for sockets that are about to go), then the sockets, and
 * only then is the drain awaited. Reversing any pair either hangs the shutdown
 * until the platform's SIGKILL or drops HTTP requests that were already in
 * flight.
 *
 * **It fails closed on `REDIS_URL`.** The rate limiter deliberately does not — it
 * warns and falls back to per-process counters, because a limiter is a cache and
 * refusing all traffic when a cache is down is a worse outcome than a weaker
 * limit. The fan-out is not a cache. It is the only path by which a worker's
 * progress reaches a browser, and from Phase 3 it is also the only path by which
 * the API can enqueue a scan at all. An API deployed with no Redis would accept a
 * scan request it cannot queue and show a progress bar that never moves, while
 * every health check passes. `config/env.ts` states the principle for secrets —
 * absent configuration must stop the process, not downgrade the guarantee — and
 * this is the same call for the one dependency this service cannot fake.
 */

import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Redis } from 'ioredis';
import type { PrismaClient } from '../prisma/generated/client/index.js';
import { createApp } from './app.js';
import { prisma, disconnect } from './db/client.js';
import { createRealtimeServer, type RealtimeServer } from './services/realtime/server.js';
import { startFanout, type Fanout, type RedisSubscriber } from './services/realtime/fanout.js';
import { reconcileCapabilitiesAtBoot } from './services/registry/boot.js';
import { buildResolveRequiredControlLevel } from './services/registry/resolve-required-control-level.js';
import type { RateLimiters } from './middleware/ratelimit.middleware.js';

export const SERVICE_NAME = '@webaudit/api' as const;

const DEFAULT_PORT = 3001;

/**
 * How long the drain waits before closing live connections by hand.
 *
 * Shorter than the worker's grace period on purpose: the unit here is an HTTP
 * request measured in milliseconds, not an audit phase measured in minutes. A
 * request still open after fifteen seconds is hung, and waiting on it only delays
 * the deploy.
 */
const DEFAULT_DRAIN_MS = 15_000;

/**
 * `PORT` first, then `API_PORT`.
 *
 * `PORT` because that is what every platform injects, `API_PORT` because that is
 * what `.env.example` reads next to `API_URL`. An unparseable value throws rather
 * than falling back: a typo that silently becomes 3001 means the platform's
 * health check hits a port nothing is on, and the deploy fails with a message
 * about the health check rather than about the typo. Zero is allowed and is not a
 * mistake — it asks the OS for an ephemeral port, which is how a test binds
 * without racing another suite for 3001.
 */
function portFromEnv(): number {
  const raw = process.env['PORT'] ?? process.env['API_PORT'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new Error(`PORT must be an integer between 0 and 65535, received "${raw}".`);
  }
  return parsed;
}

/**
 * The subscriber connection for the fan-out.
 *
 * A dedicated client, never the one the rate limiter uses. Redis puts a
 * subscribed connection into a mode where it accepts nothing but further
 * subscribe/unsubscribe commands, so sharing it would break every rate-limit
 * lookup the moment the fan-out starts — a failure that only appears once both
 * features are live, which is now.
 *
 * `maxRetriesPerRequest: null` for the reason `queues.ts` gives: with a retry
 * limit, a blocking command that fails during a Redis restart takes the process
 * down instead of reconnecting.
 */
function createSubscriber(url: string): RedisSubscriber & { disconnect(): void } {
  const client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });

  // ioredis emits `error` on every failed reconnection attempt, and an
  // EventEmitter with no `error` listener rethrows as an uncaught exception. A
  // Redis blip must not take down an API that can still serve every route.
  client.on('error', (error: Error) => {
    console.warn(`[realtime] subscriber error: ${error.message}`);
  });

  // Adapted explicitly rather than passed as-is. ioredis's `on` is heavily
  // overloaded and its structural fit with `RedisSubscriber` is an accident that
  // a version bump can revoke; naming the four methods we use makes the coupling
  // a compile error rather than a runtime surprise.
  return {
    subscribe: (channel: string) => client.subscribe(channel),
    on: (event: 'message', listener: (channel: string, message: string) => void) =>
      client.on(event, listener),
    unsubscribe: (channel: string) => client.unsubscribe(channel),
    quit: () => client.quit(),
    disconnect: () => client.disconnect(),
  };
}

export interface ApiServiceOptions {
  /** Omit to read `PORT`/`API_PORT`. Zero binds an ephemeral port. */
  readonly port?: number;
  /**
   * The fan-out's Redis subscriber. Omit to build one from `REDIS_URL`, which is
   * then required — see the module note on why this one fails closed. A suite
   * injects a fake so it can deliver an event without a Redis instance.
   */
  readonly subscriber?: RedisSubscriber;
  /**
   * The database. Omit for the process-wide singleton, which is also the only
   * case this service disconnects on shutdown — an injected client belongs to
   * whoever injected it, and closing somebody else's pool out from under them is
   * how a suite starts failing in whichever file happens to run next.
   *
   * The seam exists for the same reason `createApp` is a factory: a suite that
   * needs to prove the fan-out reaches a real socket has to own the rows the
   * subscription is authorised against.
   */
  readonly db?: PrismaClient;
  /** Defaults to true. A suite that does not need real capability rows may skip it. */
  readonly reconcileCapabilities?: boolean;
  readonly drainMs?: number;
  /**
   * Defaults to true: the production path is the default path. A suite that
   * starts the service in-process passes false so it does not take ownership of
   * the test runner's signals.
   */
  readonly installSignalHandlers?: boolean;
}

export interface ApiService {
  readonly server: Server;
  readonly realtime: RealtimeServer;
  readonly fanout: Fanout;
  /** The bound port. Resolved, so it is the real one when `port` was 0. */
  readonly port: number;
  /** Idempotent. A second SIGTERM must not start a second shutdown. */
  shutdown(reason?: string): Promise<void>;
}

export async function startApi(options: ApiServiceOptions = {}): Promise<ApiService> {
  const port = options.port ?? portFromEnv();
  const drainMs = options.drainMs ?? DEFAULT_DRAIN_MS;

  // Before anything is constructed, so a missing variable is a boot failure with
  // the variable named rather than a service that runs with realtime silently
  // dead.
  let subscriber = options.subscriber;
  let ownedSubscriber: { disconnect(): void } | undefined;
  if (subscriber === undefined) {
    const url = process.env['REDIS_URL'];
    if (url === undefined || url === '') {
      throw new Error(
        'REDIS_URL is not set. Refusing to start: the API cannot fan out scan progress ' +
          'without it, and a process that serves every route while every progress bar is ' +
          'frozen passes its health check. Set REDIS_URL (pnpm services:up provides one).',
      );
    }
    const created = createSubscriber(url);
    subscriber = created;
    ownedSubscriber = created;
  }

  const db = options.db ?? prisma;
  const ownsDb = options.db === undefined;

  // Disk → database, so a scan can never be charged for and executed
  // against a capability the Capability table has never heard of
  // (CapabilityExecution's own foreign key). See boot.ts's module note.
  if (options.reconcileCapabilities ?? true) {
    await reconcileCapabilitiesAtBoot(db);
  }

  // FR-017's whole-scan control-level gate — with no `scans` deps, the
  // `() => 'NONE'` default in `scans.routes.ts` wins and the gate never
  // actually fires in production, which is exactly the finding this closes.
  const app = createApp({
    db,
    scans: { resolveRequiredControlLevel: buildResolveRequiredControlLevel(db) },
  });
  const server = createServer(app);

  // `ws` upgrades this server rather than binding a second port. Constructed
  // before `listen` so no connection can arrive before there is something to
  // handle the upgrade.
  const realtime = createRealtimeServer({ server, db });

  // Attached before the port opens: a client that subscribes in the first
  // milliseconds must not miss the channel.
  const fanout = await startFanout({ subscriber, broadcaster: realtime });

  const boundPort = await new Promise<number>((resolve, reject) => {
    const onError = (error: Error): void => {
      // A listen failure — port in use, permission denied — must reject the
      // start rather than surface later as an unhandled 'error' event on a
      // service the caller believes is up.
      server.removeListener('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });

  let shuttingDown: Promise<void> | undefined;

  const shutdown = (reason = 'shutdown'): Promise<void> => {
    if (shuttingDown !== undefined) return shuttingDown;

    shuttingDown = (async (): Promise<void> => {
      console.warn(`[api] ${reason} — draining, up to ${String(drainMs)}ms.`);

      // 1. Stop accepting. Synchronous effect; the callback is the drain.
      const drained = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      // Keep-alive sockets that are between requests will otherwise hold the
      // drain open for their whole timeout while carrying no work.
      server.closeIdleConnections();

      // 2. Stop producing events, before the sockets that would receive them go.
      //    A broadcast into a closing socket is not harmful, but a fan-out still
      //    subscribed after the sockets are gone keeps a Redis connection open
      //    and delays the exit.
      try {
        await fanout.stop();
      } catch (error) {
        // Never let a transport failure block the shutdown. Redis is not the
        // system of record; there is nothing here to lose.
        console.warn(`[api] fan-out stop failed: ${describe(error)}`);
      }
      ownedSubscriber?.disconnect();

      // 3. Close the sockets. Until this runs, `drained` cannot resolve: a
      //    WebSocket is a connection that never ends on its own.
      try {
        await realtime.close();
      } catch (error) {
        console.warn(`[api] websocket close failed: ${describe(error)}`);
      }

      // 4. Now wait for in-flight HTTP. Bounded, then closed by hand — a request
      //    still open after the deadline is hung, and waiting only delays the
      //    deploy until the platform's SIGKILL, which is the same interruption
      //    with less in the log.
      const timer = setTimeout(() => {
        console.error(`[api] connections still open after ${String(drainMs)}ms — closing them.`);
        server.closeAllConnections();
      }, drainMs);
      timer.unref();
      await drained;
      clearTimeout(timer);

      // 5. Release the shared resources the app owns. The limiters hold a Redis
      //    connection and the fallback stores' timers; app.ts parks them on
      //    `app.locals` precisely so whoever owns the lifecycle can do this.
      const limiters = app.locals['rateLimiters'] as RateLimiters | undefined;
      if (limiters !== undefined) {
        try {
          await limiters.shutdown();
        } catch (error) {
          console.warn(`[api] rate limiter shutdown failed: ${describe(error)}`);
        }
      }

      // 6. The connection pool last: anything above might still have been
      //    finishing a query. Only ours — see `options.db`.
      if (ownsDb) await disconnect();
      console.warn('[api] stopped.');
    })();

    return shuttingDown;
  };

  if (options.installSignalHandlers ?? true) {
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT', () => void shutdown('SIGINT'));
  }

  return { server, realtime, fanout, port: boundPort, shutdown };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * True when this module is the process entrypoint.
 *
 * The service must not start merely because something imported this file — a
 * suite importing `startApi` would otherwise bind a port on import.
 */
function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  // `pathToFileURL` rather than string concatenation: on Windows a raw
  // `file://C:\...` parses `c` as the host and never matches.
  return import.meta.url === pathToFileURL(entry).href;
}

if (isEntrypoint()) {
  startApi()
    .then((service) => {
      console.warn(`[api] ${SERVICE_NAME} listening on ${String(service.port)}.`);
    })
    .catch((error: unknown) => {
      // Exit non-zero so an orchestrator restarts or reports, rather than
      // treating a dead process as a deliberate stop.
      console.error(`[api] refusing to start: ${describe(error)}`);
      process.exitCode = 1;
    });
}
