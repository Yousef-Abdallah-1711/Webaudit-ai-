import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { createRealtimeServer, type RealtimeServer } from '../../src/services/realtime/server.js';

const db = { scan: { findFirst: async () => null } };
let httpServer: http.Server | undefined;
let realtime: RealtimeServer | undefined;

afterEach(async () => {
  await realtime?.close();
  realtime = undefined;
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()) ?? resolve());
  httpServer = undefined;
});

describe('realtime heartbeat', () => {
  it('terminates a socket that never answers WebSocket ping frames', async () => {
    httpServer = http.createServer();
    realtime = createRealtimeServer({ server: httpServer, db, heartbeatIntervalMs: 20 });
    await new Promise<void>((resolve) => httpServer?.listen(0, '127.0.0.1', () => resolve()));
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('server did not bind');

    const socket = net.createConnection(address.port, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(
          'GET /realtime HTTP/1.1\r\n' +
            'Host: 127.0.0.1\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
            'Sec-WebSocket-Version: 13\r\n\r\n',
        );
        socket.once('data', () => resolve());
      });
    });
    expect(realtime.connectionCount).toBe(1);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('heartbeat did not terminate socket')), 500);
      socket.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(realtime.connectionCount).toBe(0);
  });
});
