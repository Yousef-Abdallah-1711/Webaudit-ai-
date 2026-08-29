/**
 * T104b — the API actually boots, and actually stops.
 *
 * Every other suite in this app builds the Express app with `createApp` and
 * drives it through supertest, which never binds a port and never touches the
 * WebSocket upgrade or the fan-out. That is why "neither service boots" survived
 * ten sub-phases of green tests: nothing was asserting that the pieces compose
 * into a process.
 *
 * Two things here are deliberately end to end rather than mocked.
 *
 * **The fan-out is asserted through a real socket**, not by reading the fan-out's
 * own counter. The first version of this suite checked `fanout.stats.forwarded`,
 * and a mutation that replaced `broadcaster: realtime` with a broadcaster that
 * throws the message away passed every assertion — because `forwarded` counts
 * what the fan-out handed on, not what anybody received. So the test now creates
 * a user, a scan, an access token, and a live subscription, and asserts the bytes
 * arrive at the client. That is the wiring; the counter is not.
 *
 * **The shutdown is asserted with a socket open.** A WebSocket connection never
 * ends on its own, so awaiting the HTTP drain before closing the sockets hangs
 * for ever — and nothing in a unit test would notice. Here it is a timeout.
 *
 * The Redis subscriber is injected, so this suite needs no Redis.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { SignJWT } from 'jose';
import { SCAN_EVENTS_CHANNEL, scanRoom } from '@webaudit/types';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { startApi, type ApiService } from '../../src/index.js';
import type { RedisSubscriber } from '../../src/services/realtime/fanout.js';

/** The same shape `fanout.test.ts` uses: messages arrive on demand. */
function fakeSubscriber(): RedisSubscriber & {
  deliver(channel: string, raw: string): void;
  readonly quits: number;
} {
  let listener: ((channel: string, message: string) => void) | undefined;
  let quits = 0;
  return {
    subscribe: () => Promise.resolve(1),
    on: (_event, fn) => {
      listener = fn;
      return undefined;
    },
    unsubscribe: () => Promise.resolve(1),
    quit: () => {
      quits += 1;
      return Promise.resolve('OK');
    },
    deliver: (channel, raw) => listener?.(channel, raw),
    get quits() {
      return quits;
    },
  };
}

let service: ApiService | undefined;

async function boot(subscriber: RedisSubscriber): Promise<ApiService> {
  service = await startApi({
    // The test database, so this suite owns the rows a subscription is authorised
    // against. `startApi` does not disconnect an injected client — `closeDb` owns
    // this one.
    db: testDb,
    // Ephemeral: a fixed port would race whichever suite ran last, and 3001 may
    // be a developer's running API.
    port: 0,
    subscriber,
    drainMs: 2_000,
    // This process belongs to vitest. Taking its signals would make Ctrl-C during
    // a watch run shut the runner down through our handler.
    installSignalHandlers: false,
  });
  return service;
}

/** Mints a token the real `verifyAccessToken` accepts. */
async function tokenFor(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env['JWT_ACCESS_SECRET']);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(secret);
}

async function makeUserAndScan(): Promise<{ userId: string; scanId: string; token: string }> {
  const user = await testDb.user.create({
    data: { email: 'boot@example.com', emailVerifiedAt: new Date() },
  });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://boot.example.com',
      displayName: 'boot',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SEO'],
      capabilitySnapshot: {},
      quotedCredits: 10,
    },
  });
  return { userId: user.id, scanId: scan.id, token: await tokenFor(user.id) };
}

/** A socket with a queue of what it received. */
async function connect(port: number): Promise<{
  send(message: unknown): void;
  next(ms?: number): Promise<Record<string, unknown>>;
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
    next: (ms = 2_000) => {
      const already = buffered.shift();
      if (already !== undefined) return Promise.resolve(already);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no message within the wait')), ms);
        waiting.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    close: () => socket.close(),
  };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});

afterEach(async () => {
  await service?.shutdown('test cleanup');
  service = undefined;
});

afterAll(async () => {
  await closeDb();
});

describe('the API process starts', () => {
  it('listens on a real port and answers /health', async () => {
    const started = await boot(fakeSubscriber());

    expect(started.port).toBeGreaterThan(0);
    expect(started.server.listening).toBe(true);

    const response = await fetch(`http://127.0.0.1:${String(started.port)}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('serves routes as well as the health probe', async () => {
    const started = await boot(fakeSubscriber());
    // Unauthenticated, so 401 is the correct answer — the point is that the
    // router is mounted in the running process, not only in a supertest harness.
    const response = await fetch(`http://127.0.0.1:${String(started.port)}/targets`);
    expect(response.status).toBe(401);
  });

  it('accepts a WebSocket upgrade on the same port', async () => {
    const started = await boot(fakeSubscriber());
    const client = await connect(started.port);

    client.send({ action: 'ping' });

    // One port for HTTP and WebSocket is the deployment assumption: one TLS
    // terminator, one thing for the platform to health-check.
    expect(await client.next()).toEqual({ type: 'pong' });
    expect(started.realtime.connectionCount).toBe(1);
    client.close();
  });
});

describe('the fan-out reaches a subscribed socket', () => {
  it('delivers a published event end to end', async () => {
    const subscriber = fakeSubscriber();
    const started = await boot(subscriber);
    const { scanId, token } = await makeUserAndScan();

    const client = await connect(started.port);
    client.send({ action: 'subscribe', scanId, token });
    expect(await client.next()).toEqual({ type: 'subscribed', scanId });
    expect(started.realtime.roomSize(scanRoom(scanId))).toBe(1);

    // What a worker publishes.
    subscriber.deliver(
      SCAN_EVENTS_CHANNEL,
      JSON.stringify({
        scanId,
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: { type: 'scan:state', scanId, state: 'RUNNING_PHASE_1', progressPercent: 10 },
      }),
    );

    // The wiring under test is `broadcaster: realtime` in `startApi`. Asserted
    // on what the client received, not on the fan-out's own counter: that
    // counter increments even when the broadcaster is a black hole, which is how
    // the first version of this test passed a mutation that unwired it.
    const received = await client.next();
    expect(received['scanId']).toBe(scanId);
    expect(received['event']).toMatchObject({ type: 'scan:state', state: 'RUNNING_PHASE_1' });
    expect(started.fanout.stats.forwarded).toBe(1);

    client.close();
  });

  it('drops an unusable envelope instead of forwarding it to a client', async () => {
    const subscriber = fakeSubscriber();
    const started = await boot(subscriber);

    subscriber.deliver(SCAN_EVENTS_CHANNEL, '{not json');

    expect(started.fanout.stats.dropped).toBe(1);
    expect(started.fanout.stats.forwarded).toBe(0);
  });
});

describe('the API process stops', () => {
  it('shuts down cleanly with an open WebSocket, and releases the port', async () => {
    const subscriber = fakeSubscriber();
    const started = await boot(subscriber);
    const port = started.port;

    const client = await connect(port);

    // The assertion is that this resolves at all. A WebSocket never closes on
    // its own, so awaiting the HTTP drain before closing the sockets hangs here
    // until vitest kills the suite.
    await started.shutdown('test');
    service = undefined;

    expect(started.server.listening).toBe(false);
    expect(subscriber.quits).toBe(1);

    // The port is genuinely released: the next deploy binds it immediately
    // rather than crashing on EADDRINUSE.
    await expect(fetch(`http://127.0.0.1:${String(port)}/health`)).rejects.toThrow();
    client.close();
  });

  it('is idempotent — a second signal does not shut down twice', async () => {
    const subscriber = fakeSubscriber();
    const started = await boot(subscriber);

    // A platform that sends SIGTERM and then SIGINT would otherwise close the
    // subscriber from under a drain that is still running.
    await Promise.all([started.shutdown('SIGTERM'), started.shutdown('SIGINT')]);
    await started.shutdown('again');
    service = undefined;

    expect(subscriber.quits).toBe(1);
  });

  it('leaves an injected database client connected', async () => {
    const started = await boot(fakeSubscriber());
    await started.shutdown('test');
    service = undefined;

    // Disconnecting a client the caller owns is how one suite starts breaking
    // whichever file runs after it.
    await expect(testDb.user.count()).resolves.toBeTypeOf('number');
  });
});

describe('the API fails closed', () => {
  it('refuses to start without REDIS_URL when no subscriber is supplied', async () => {
    const saved = process.env['REDIS_URL'];
    delete process.env['REDIS_URL'];
    try {
      // A silently realtime-dead API passes every health check it has. The
      // failure has to be at boot, naming the variable.
      await expect(startApi({ port: 0, db: testDb, installSignalHandlers: false })).rejects.toThrow(
        /REDIS_URL/,
      );
    } finally {
      if (saved !== undefined) process.env['REDIS_URL'] = saved;
    }
  });

  it('refuses an unparseable PORT rather than falling back to 3001', async () => {
    const saved = process.env['PORT'];
    process.env['PORT'] = 'eighty';
    try {
      await expect(
        startApi({ subscriber: fakeSubscriber(), db: testDb, installSignalHandlers: false }),
      ).rejects.toThrow(/PORT/);
    } finally {
      if (saved === undefined) delete process.env['PORT'];
      else process.env['PORT'] = saved;
    }
  });
});
