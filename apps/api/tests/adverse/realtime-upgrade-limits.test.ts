/**
 * P3 (full-workflow review, Section 6d) — the raw WebSocket upgrade accepted
 * every connection unconditionally: no check of the handshake's `Origin`
 * header, and no cap on how many sockets one source could hold open at once.
 * `maxRoomsPerConnection` only ever bounded subscriptions *within* an
 * already-open socket, never how many sockets a single client could open in
 * the first place. Per-subscription authorisation (this file's sibling,
 * `realtime-authorisation.test.ts`) was already solid — this is a different,
 * earlier layer: the upgrade itself.
 *
 * Same real-HTTP-server, real-`ws`-client style as
 * `realtime-authorisation.test.ts`, since the thing under test
 * (`verifyClient`) only ever runs during the real WebSocket handshake — a
 * fake/mocked server would not exercise it at all.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createRealtimeServer, type RealtimeServer } from '../../src/services/realtime/server.js';

let http: Server;
let realtime: RealtimeServer | undefined;
let port = 0;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  http = createServer();
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
  port = (http.address() as AddressInfo).port;
});

afterEach(async () => {
  await realtime?.close();
  realtime = undefined;
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

afterAll(closeDb);

/** Resolves `true` on a successful upgrade ('open'), `false` on a refusal. Closes the socket either way. */
function attempt(options?: { origin?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`, {
      ...(options?.origin === undefined ? {} : { origin: options.origin }),
    });
    socket.once('open', () => {
      resolve(true);
      socket.close();
    });
    socket.once('unexpected-response', () => resolve(false));
    socket.once('error', () => resolve(false));
  });
}

/** Like `attempt`, but leaves the socket open on success — for tests that need to hold a connection slot. */
function connectAndHold(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

describe('the WebSocket upgrade caps connections per source address', () => {
  it('refuses a connection once the source is already at its cap', async () => {
    realtime = createRealtimeServer({ server: http, db: testDb, maxConnectionsPerIp: 2 });

    // Held open deliberately — the cap counts open connections, and closing
    // early (as the plain `attempt` helper does) would free the slot before
    // the third handshake even starts.
    const s1 = await connectAndHold();
    const s2 = await connectAndHold();

    expect(await attempt()).toBe(false);

    s1.close();
    s2.close();
  });

  it('does not cap connections at all when no limit is configured (default behaviour unchanged)', async () => {
    realtime = createRealtimeServer({ server: http, db: testDb });

    expect(await attempt()).toBe(true);
    expect(await attempt()).toBe(true);
    expect(await attempt()).toBe(true);
  });

  it('frees a slot once a capped-out socket disconnects', async () => {
    realtime = createRealtimeServer({ server: http, db: testDb, maxConnectionsPerIp: 1 });

    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });

    expect(await attempt()).toBe(false);

    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await attempt()).toBe(true);
  });
});

describe('the WebSocket upgrade checks Origin when an allowlist is configured', () => {
  it('refuses a connection from an origin not on the allowlist', async () => {
    realtime = createRealtimeServer({
      server: http,
      db: testDb,
      allowedOrigins: new Set(['http://allowed.example.com']),
    });

    expect(await attempt({ origin: 'http://not-allowed.example.com' })).toBe(false);
  });

  it('accepts a connection from an allowed origin', async () => {
    realtime = createRealtimeServer({
      server: http,
      db: testDb,
      allowedOrigins: new Set(['http://allowed.example.com']),
    });

    expect(await attempt({ origin: 'http://allowed.example.com' })).toBe(true);
  });

  it("accepts a connection with no Origin header at all, same as this repo's own CORS rule for non-browser callers", async () => {
    realtime = createRealtimeServer({
      server: http,
      db: testDb,
      allowedOrigins: new Set(['http://allowed.example.com']),
    });

    expect(await attempt()).toBe(true);
  });

  it('does not check Origin at all when no allowlist is configured (default behaviour unchanged)', async () => {
    realtime = createRealtimeServer({ server: http, db: testDb });

    expect(await attempt({ origin: 'http://anything-at-all.example.com' })).toBe(true);
  });
});
