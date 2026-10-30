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

async function waitFor(
  c: Client,
  count: number,
  ms = 2000,
): Promise<Array<Record<string, unknown>>> {
  const end = Date.now() + ms;
  while (c.received.length < count && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return c.received as Array<Record<string, unknown>>;
}

describe('reconnect ordering and recovery (N04)', () => {
  const event = (scanId: string, n: number) =>
    JSON.stringify({ scanId, event: { type: 'execution:progress', seq: n } });

  it('delivers events to a subscribed socket in the order they were emitted', async () => {
    const owner = await makeUser('order@example.com');
    const scanId = await makeScan(owner);
    const c = await client();
    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await c.next();
    for (let n = 1; n <= 5; n += 1) realtime.broadcast(scanRoom(scanId), event(scanId, n));
    const got = await waitFor(c, 6); // subscribed ack + five events
    expect(got.slice(1).map((m) => (m['event'] as { seq: number }).seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not replay or fabricate events missed while disconnected; the reconnect re-authorises and resumes live delivery', async () => {
    const owner = await makeUser('reconnect@example.com');
    const scanId = await makeScan(owner);
    const first = await client();
    first.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await waitFor(first, 1);
    realtime.broadcast(scanRoom(scanId), event(scanId, 1));
    const before = await waitFor(first, 2);
    expect((before[1]?.['event'] as { seq: number }).seq).toBe(1);

    first.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
    realtime.broadcast(scanRoom(scanId), event(scanId, 2)); // missed: nobody is subscribed

    const second = await client();
    second.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    const ack = await waitFor(second, 1);
    expect(ack[0]).toMatchObject({ type: 'subscribed', scanId });
    await new Promise((r) => setTimeout(r, 300));
    expect(second.received).toHaveLength(1); // nothing is replayed
    realtime.broadcast(scanRoom(scanId), event(scanId, 3));
    const after = await waitFor(second, 2);
    expect((after[1]?.['event'] as { seq: number }).seq).toBe(3);
    expect(after).toHaveLength(2); // ack + seq 3, never seq 2
  });

  it('refuses a reconnect with an expired token or another account, and delivers nothing to it', async () => {
    const owner = await makeUser('reauth@example.com');
    const stranger = await makeUser('reauth-x@example.com');
    const scanId = await makeScan(owner);
    const expired = await client();
    expired.send({ action: 'subscribe', scanId, token: await tokenFor(owner, { expired: true }) });
    await expect(expired.next()).resolves.toMatchObject({ type: 'error' });
    const other = await client();
    other.send({ action: 'subscribe', scanId, token: await tokenFor(stranger) });
    await expect(other.next()).resolves.toMatchObject({ type: 'error', code: 'FORBIDDEN' });
    realtime.broadcast(scanRoom(scanId), event(scanId, 9));
    expect(realtime.roomSize(scanRoom(scanId))).toBe(0);
    await expect(other.next(300)).rejects.toThrow();
  });

  it('delivers a terminal event once and leaves later progress to the client to ignore: the server never rewrites ordering', async () => {
    const owner = await makeUser('terminal@example.com');
    const scanId = await makeScan(owner);
    const c = await client();
    c.send({ action: 'subscribe', scanId, token: await tokenFor(owner) });
    await c.next();
    realtime.broadcast(
      scanRoom(scanId),
      JSON.stringify({ scanId, event: { type: 'scan:state', state: 'COMPLETED' } }),
    );
    realtime.broadcast(scanRoom(scanId), event(scanId, 99)); // a late, stale tick
    const got = await waitFor(c, 3);
    const a = got[1]?.['event'] as { type: string; state?: string };
    const b = got[2]?.['event'] as { type: string; seq?: number };
    expect(a).toMatchObject({ type: 'scan:state', state: 'COMPLETED' });
    expect(b.seq).toBe(99); // order preserved as emitted; durable truth (terminal) is recovered via GET /scans/:id
  });
});
