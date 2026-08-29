/**
 * T099 — the WebSocket server, with authorisation per subscription.
 *
 * The contract's phrasing is the requirement, and the emphasis is theirs: "Server
 * authorises per subscription — scan ownership is re-checked on subscribe, **not
 * inferred from the connection**."
 *
 * That distinction is the whole security model of this file. The tempting design
 * authenticates the socket once at connect, remembers the user, and treats every
 * later `subscribe` as trusted because the connection is. It is wrong in two
 * ways, and only one of them is obvious:
 *
 *   - **A socket is long-lived.** Access tokens are 15 minutes; a socket can be
 *     open for an hour. Trusting the connection means a revoked user keeps
 *     receiving events for as long as they stay connected — revocation with no
 *     effect, which FR-008 does not allow. This repository has already fixed that
 *     exact bug once: finding M-something moved the operator check off the token
 *     claim and onto a database read for the same reason.
 *   - **Ownership is per scan, not per user.** Knowing *who* is connected does not
 *     say which scans they own, and a client supplies the scan id. So every
 *     `subscribe` re-reads ownership for that specific scan.
 *
 * **The room name is derived, never supplied.** A client sends a scan id; the
 * server computes `scanRoom(scanId)` after authorising it. If the client could
 * name its own room it could name someone else's, and every check above would be
 * decoration.
 *
 * **A refused subscription does not close the socket.** A user with two tabs, one
 * on a scan they no longer own, should lose that subscription and keep the other.
 * Closing would also make the refusal indistinguishable from a network fault.
 */

import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import { scanRoom } from '@webaudit/types';
import { verifyAccessToken } from '../auth/session.service.js';
import type { RoomBroadcaster } from './fanout.js';

/** Only the read this module needs. */
export interface ScanOwnershipReader {
  scan: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

interface ClientMessage {
  readonly action: 'subscribe' | 'unsubscribe' | 'ping';
  readonly scanId?: string;
  /**
   * Sent with every subscribe. Not stored on the connection — see the module
   * note on why the connection is not the authority.
   */
  readonly token?: string;
}

interface Connection {
  readonly socket: WebSocket;
  readonly rooms: Set<string>;
}

export interface RealtimeServerOptions {
  readonly server: Server;
  readonly db: ScanOwnershipReader;
  readonly path?: string;
  /** Bounds how many scans one socket may watch. */
  readonly maxRoomsPerConnection?: number;
}

export interface RealtimeServer extends RoomBroadcaster {
  readonly connectionCount: number;
  roomSize(room: string): number;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 4 * 1024;

/**
 * `ws` hands over `Buffer | ArrayBuffer | Buffer[]`, and only the first has a
 * `toString` that means anything — the others stringify to `[object …]`, which
 * would then fail to parse and be reported as a malformed message rather than as
 * a frame we did not decode.
 */
function rawToString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return '';
}

function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const message = parsed as Record<string, unknown>;
    const action = message['action'];
    if (action !== 'subscribe' && action !== 'unsubscribe' && action !== 'ping') return null;
    return {
      action,
      ...(typeof message['scanId'] === 'string' ? { scanId: message['scanId'] } : {}),
      ...(typeof message['token'] === 'string' ? { token: message['token'] } : {}),
    };
  } catch {
    return null;
  }
}

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServer {
  const wss = new WebSocketServer({
    server: options.server,
    path: options.path ?? '/realtime',
    maxPayload: MAX_MESSAGE_BYTES,
  });

  const connections = new Map<WebSocket, Connection>();
  /** room -> sockets. Rebuilt on disconnect so a dead socket is never written. */
  const rooms = new Map<string, Set<WebSocket>>();
  const maxRooms = options.maxRoomsPerConnection ?? 10;

  const send = (socket: WebSocket, payload: unknown): void => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  const leave = (socket: WebSocket, room: string): void => {
    rooms.get(room)?.delete(socket);
    if (rooms.get(room)?.size === 0) rooms.delete(room);
    connections.get(socket)?.rooms.delete(room);
  };

  wss.on('connection', (socket: WebSocket) => {
    connections.set(socket, { socket, rooms: new Set() });

    socket.on('message', (data) => {
      void (async (): Promise<void> => {
        const message = parseMessage(rawToString(data));
        if (message === null) {
          send(socket, { type: 'error', code: 'BAD_MESSAGE' });
          return;
        }

        if (message.action === 'ping') {
          send(socket, { type: 'pong' });
          return;
        }

        const scanId = message.scanId;
        if (scanId === undefined || scanId === '') {
          send(socket, { type: 'error', code: 'SCAN_ID_REQUIRED' });
          return;
        }
        const room = scanRoom(scanId);

        if (message.action === 'unsubscribe') {
          leave(socket, room);
          send(socket, { type: 'unsubscribed', scanId });
          return;
        }

        // ─── subscribe: authorise, every time ─────────────────────────────
        if (message.token === undefined || message.token === '') {
          send(socket, { type: 'error', code: 'UNAUTHORIZED', scanId });
          return;
        }

        let userId: string;
        try {
          // Verified on this message, not remembered from connect. An expired or
          // revoked token fails here even on a socket that has been open for
          // an hour.
          userId = (await verifyAccessToken(message.token)).sub;
        } catch {
          send(socket, { type: 'error', code: 'UNAUTHORIZED', scanId });
          return;
        }

        // Ownership of *this* scan, read now. Knowing who is connected does not
        // say which scans they own.
        const owned = await options.db.scan.findFirst({
          where: { id: scanId, userId },
          select: { id: true },
        });
        if (owned === null) {
          // The same response for "not yours" and "does not exist": a
          // distinguishable one is an oracle for which scan ids are real.
          send(socket, { type: 'error', code: 'FORBIDDEN', scanId });
          return;
        }

        const connection = connections.get(socket);
        if (connection === undefined) return;
        if (!connection.rooms.has(room) && connection.rooms.size >= maxRooms) {
          send(socket, { type: 'error', code: 'TOO_MANY_SUBSCRIPTIONS', scanId });
          return;
        }

        connection.rooms.add(room);
        const members = rooms.get(room) ?? new Set<WebSocket>();
        members.add(socket);
        rooms.set(room, members);
        send(socket, { type: 'subscribed', scanId });
      })();
    });

    const cleanup = (): void => {
      const connection = connections.get(socket);
      if (connection !== undefined) {
        for (const room of connection.rooms) {
          rooms.get(room)?.delete(socket);
          if (rooms.get(room)?.size === 0) rooms.delete(room);
        }
      }
      connections.delete(socket);
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });

  return {
    broadcast(room: string, payload: string): void {
      const members = rooms.get(room);
      if (members === undefined) return;
      for (const socket of members) {
        if (socket.readyState === socket.OPEN) socket.send(payload);
      }
    },

    get connectionCount(): number {
      return connections.size;
    },

    roomSize(room: string): number {
      return rooms.get(room)?.size ?? 0;
    },

    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        for (const socket of connections.keys()) socket.close();
        wss.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
