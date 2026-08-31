/**
 * T135 — the realtime client, with reconnect-and-resync.
 *
 * Wire protocol, from `apps/api/src/services/realtime/server.ts` (T099):
 * client → server messages are `{action:'subscribe'|'unsubscribe'|'ping',
 * scanId?, token?}`; `subscribe` carries the access token on *every* message
 * (never cached from connect — the server re-verifies ownership on each
 * call), and a refused subscription answers with `{type:'error', code,
 * scanId?}` **without closing the socket**. Broadcasts are
 * `ScanEventEnvelope` JSON (`{scanId, emittedAt, event}`).
 *
 * **Resync, not just reconnect.** FR-047: "a user returning after being away
 * is served current state from the database, then receives live events from
 * the socket." A gap — the tab was asleep, the network blipped — means
 * events published during that gap are gone; there is no server-side replay.
 * So `onResync` fires after every successful (re)subscribe, not only the
 * first one, and the caller's job is to re-fetch `GET /scans/:id` (and the
 * report, once terminal) there — this module only owns the socket, not what
 * "current state" means to its caller.
 *
 * **Backoff, capped and jittered.** An API restart that drops every open
 * socket at once must not have every client reconnect in the same instant.
 */

import type { ScanEvent, ScanEventEnvelope } from '@webaudit/types';
import { API_BASE } from './api';

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 1_000;

interface ServerMessage {
  readonly type?: 'subscribed' | 'unsubscribed' | 'pong' | 'error';
  readonly code?: string;
  readonly scanId?: string;
}

function isEnvelope(value: unknown): value is ScanEventEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    typeof (value as { event?: unknown }).event === 'object'
  );
}

export interface RealtimeClientOptions {
  readonly scanId: string;
  /** Re-read on every (re)subscribe, in case a refresh rotated it. */
  getToken: () => string | undefined;
  onEvent: (event: ScanEvent) => void;
  /** Fires after every successful subscribe, including the first. */
  onResync: () => void;
  onError?: (code: string) => void;
}

export interface RealtimeClient {
  close(): void;
}

export function connectRealtime(options: RealtimeClientOptions): RealtimeClient {
  let socket: WebSocket | undefined;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReconnect(): void {
    if (closed) return;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    // Full jitter: a thundering herd of clients must not all retry on the
    // same tick after a shared disruption (e.g. an API restart).
    const delay = Math.random() * backoff;
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function subscribe(): void {
    const token = options.getToken();
    if (token === undefined) return; // Nothing to authorise yet; caller retries once signed in.
    socket?.send(JSON.stringify({ action: 'subscribe', scanId: options.scanId, token }));
  }

  function connect(): void {
    if (closed) return;
    const wsBase = API_BASE.replace(/^http/, 'ws');
    socket = new WebSocket(`${wsBase}/realtime`);

    socket.addEventListener('open', () => {
      attempt = 0;
      subscribe();
    });

    socket.addEventListener('message', (ev: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return; // An unparseable frame is the server's own concern, not this client's.
      }

      if (isEnvelope(parsed)) {
        options.onEvent(parsed.event);
        return;
      }

      const message = parsed as ServerMessage;
      if (message.type === 'subscribed') {
        options.onResync();
        return;
      }
      if (message.type === 'error' && message.code !== undefined) {
        options.onError?.(message.code);
      }
    });

    socket.addEventListener('close', () => {
      socket = undefined;
      scheduleReconnect();
    });

    // The socket also emits 'close' after an error, so this only ensures the
    // failure is not silently swallowed before that happens.
    socket.addEventListener('error', () => {
      socket?.close();
    });
  }

  connect();

  return {
    close(): void {
      closed = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket?.close();
      socket = undefined;
    },
  };
}
