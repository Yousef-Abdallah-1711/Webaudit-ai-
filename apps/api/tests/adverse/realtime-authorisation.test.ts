/**
 * T099 — "Server authorises per subscription — scan ownership is re-checked on
 * subscribe, not inferred from the connection."
 *
 * The emphasis is the contract's. This suite is the adversarial reading of it,
 * because the tempting implementation — authenticate once at connect, trust every
 * later message — passes a happy-path test and fails in two ways that only show
 * up in production:
 *
 *   - A socket outlives a 15-minute access token, so trusting the connection
 *     means a revoked user keeps receiving events until they disconnect. This
 *     repository already fixed that exact class of bug once, when the operator
 *     check moved off the token claim and onto a database read.
 *   - Knowing *who* is connected says nothing about which scans they own, and the
 *     client supplies the scan id.
 *
 * So the suite subscribes with tokens belonging to the wrong user, with no token,
 * with a forged token, and to a scan that exists but belongs to somebody else —
 * and asserts that no event ever reaches the wrong socket.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { SignJWT } from 'jose';
import { scanRoom } from '@webaudit/types';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createRealtimeServer, type RealtimeServer } from '../../src/services/realtime/server.js';

let http: Server;
let realtime: RealtimeServer;
let port = 0;

/** Mints a token the real `verifyAccessToken` will accept. */
async function tokenFor(userId: string, options: { expired?: boolean } = {}): Promise<string> {
  const secret = new TextEncoder().encode(process.env['JWT_ACCESS_SECRET']);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(options.expired === true ? now - 7200 : now)
    .setExpirationTime(options.expired === true ? now - 3600 : now + 900)
    .sign(secret);
}

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

async function makeScan(userId: string): Promise<string> {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: `https://${email(userId)}`,
      displayName: 'x',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      requestedModules: ['SEO'],
      capabilitySnapshot: {},
      quotedCredits: 10,
    },
  });
  return scan.id;
}

function email(seed: string): string {
  return `${seed.slice(0, 8)}.example.com`;
}

/** One client, with a queue of what it received. */
interface Client {
  readonly socket: WebSocket;
  readonly received: unknown[];
  send(message: unknown): void;
  /** Resolves with the next message, or rejects after `ms`. */
  next(ms?: number): Promise<Record<string, unknown>>;
  close(): void;
}

async function connect(): Promise<Client> {
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`);
  const received: unknown[] = [];
  const waiting: ((value: Record<string, unknown>) => void)[] = [];

  socket.on('message', (data) => {
    const parsed: unknown = JSON.parse(
      Buffer.isBuffer(data)
        ? data.toString('utf8')
        : Buffer.from(data as ArrayBuffer).toString('utf8'),
    );
    received.push(parsed);
    waiting.shift()?.(parsed as Record<string, unknown>);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    socket,
    received,
    send: (message) => socket.send(JSON.stringify(message)),
    next: (ms = 2000) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no message within the wait')), ms);
        waiting.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      }),
    close: () => socket.close(),
  };
}

const clients: Client[] = [];

async function client(): Promise<Client> {
  const c = await connect();
  clients.push(c);
  return c;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  http = createServer();
  realtime = createRealtimeServer({ server: http, db: testDb });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
  port = (http.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  await realtime.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

afterAll(closeDb);

describe('a subscription is authorised on every subscribe', () => {
  it('accepts the owner and delivers events to them', async () => {
    const owner = await makeUser('owner@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await expect(c.next()).resolves.toMatchObject({ type: 'subscribed', scanId });

    realtime.broadcast(scanRoom(scanId), JSON.stringify({ scanId, event: { type: 'scan:state' } }));
    await expect(c.next()).resolves.toMatchObject({ scanId });
  });

  it('refuses a scan belonging to another account', async () => {
    const owner = await makeUser('owner2@example.com');
    const stranger = await makeUser('stranger@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId, token: await tokenFor(stranger) });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'FORBIDDEN' });

    // And no event reaches them.
    realtime.broadcast(scanRoom(scanId), JSON.stringify({ scanId, event: { type: 'scan:state' } }));
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
  });

  it('gives the same answer for a scan that does not exist', async () => {
    // A distinguishable response is an oracle for which scan ids are real.
    const stranger = await makeUser('stranger2@example.com');
    const c = await client();

    c.send({ action: 'subscribe', scanId: 'clzzzznotarealid', token: await tokenFor(stranger) });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'FORBIDDEN' });
  });

  it('refuses a subscribe with no token', async () => {
    const owner = await makeUser('owner3@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });
  });

  it('refuses an expired token even on a socket that is already open', async () => {
    // The reason authorisation is per subscription. A socket outlives a token.
    const owner = await makeUser('owner4@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner, { expired: true }) });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
  });

  it('refuses a token signed with the wrong key', async () => {
    const owner = await makeUser('owner5@example.com');
    const scanId = await makeScan(owner);
    const forged = await new SignJWT({ sub: owner, isOperator: false })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('a-different-secret-that-is-long-enough-to-sign-with'));

    const c = await client();
    c.send({ action: 'subscribe', scanId, token: forged });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'UNAUTHORIZED' });
  });

  it('does not let one authorised subscription authorise the next', async () => {
    // The core of the requirement. The same socket subscribes to its own scan,
    // then to somebody else's, and the second must be refused on its own merits.
    const owner = await makeUser('owner6@example.com');
    const other = await makeUser('other6@example.com');
    const mine = await makeScan(owner);
    const theirs = await makeScan(other);
    const c = await client();

    c.send({ action: 'subscribe', scanId: mine, token: await tokenFor(owner) });
    await expect(c.next()).resolves.toMatchObject({ type: 'subscribed' });

    c.send({ action: 'subscribe', scanId: theirs, token: await tokenFor(owner) });
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'FORBIDDEN' });

    expect(realtime.roomSize(scanRoom(mine))).toBe(1);
    expect(realtime.roomSize(scanRoom(theirs))).toBe(0);
  });

  it('keeps the socket open after a refusal', async () => {
    // A user with two tabs should lose one subscription, not the connection.
    const owner = await makeUser('owner7@example.com');
    const other = await makeUser('other7@example.com');
    const theirs = await makeScan(other);
    const mine = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId: theirs, token: await tokenFor(owner) });
    await expect(c.next()).resolves.toMatchObject({ code: 'FORBIDDEN' });

    c.send({ action: 'subscribe', scanId: mine, token: await tokenFor(owner) });
    await expect(c.next()).resolves.toMatchObject({ type: 'subscribed' });
    expect(c.socket.readyState).toBe(WebSocket.OPEN);
  });
});

describe('the room is derived, never supplied', () => {
  it('ignores a client-supplied room name', async () => {
    const owner = await makeUser('owner8@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    // A client that could name its own room could name someone else's.
    c.send({
      action: 'subscribe',
      scanId,
      room: 'scan:someone-else',
      token: await tokenFor(owner),
    });
    await expect(c.next()).resolves.toMatchObject({ type: 'subscribed' });

    expect(realtime.roomSize(scanRoom(scanId))).toBe(1);
    expect(realtime.roomSize('scan:someone-else')).toBe(0);
  });
});

describe('the socket refuses malformed input', () => {
  it.each([
    ['not JSON', 'garbage'],
    ['a scalar', '42'],
    ['an unknown action', JSON.stringify({ action: 'delete-everything' })],
    ['no action', JSON.stringify({ scanId: 's' })],
  ])('answers %s with an error and stays open', async (_label, raw) => {
    const c = await client();
    c.socket.send(raw);
    await expect(c.next()).resolves.toMatchObject({ type: 'error', code: 'BAD_MESSAGE' });
    expect(c.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('refuses a subscribe with no scanId', async () => {
    const c = await client();
    c.send({ action: 'subscribe', token: 'anything' });
    await expect(c.next()).resolves.toMatchObject({ code: 'SCAN_ID_REQUIRED' });
  });

  it('answers a ping without needing a token', async () => {
    // Keepalive must not require re-authenticating; it carries no data.
    const c = await client();
    c.send({ action: 'ping' });
    await expect(c.next()).resolves.toMatchObject({ type: 'pong' });
  });
});

describe('unsubscribe and disconnect leave no room membership behind', () => {
  it('removes the socket on unsubscribe', async () => {
    const owner = await makeUser('owner9@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await c.next();
    expect(realtime.roomSize(scanRoom(scanId))).toBe(1);

    c.send({ action: 'unsubscribe', scanId });
    await expect(c.next()).resolves.toMatchObject({ type: 'unsubscribed' });
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
  });

  it('removes the socket on disconnect, so a dead socket is never written to', async () => {
    const owner = await makeUser('owner10@example.com');
    const scanId = await makeScan(owner);
    const c = await client();

    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await c.next();
    expect(realtime.roomSize(scanRoom(scanId))).toBe(1);

    c.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
    expect(realtime.connectionCount).toBe(0);
  });
});
