/**
 * T098 — the API-side Redis subscriber, fanning out to per-scan rooms.
 *
 * R5: "Worker publishes progress to a Redis pub/sub channel; the API service
 * subscribes and fans out to the sockets in that user's room." Workers scale
 * independently and are not addressable by browsers, so this hop exists to turn
 * one publish into N socket writes in the process that holds the sockets.
 *
 * **This is a trust boundary, so the envelope is validated.** CLAUDE.md: "Validate
 * at every boundary with Zod — HTTP input, capability output, AI responses, queue
 * payloads." A Redis channel is all four's cousin: anything with the credential
 * can publish to it, a rolling deploy means an older worker may still be
 * publishing last release's shape, and a malformed envelope that reaches a socket
 * becomes a client-side crash nobody can debug from the server. So a message that
 * does not parse is dropped and counted, never forwarded.
 *
 * **Validation belongs here rather than in `packages/types`.** That package is
 * dependency-free so `apps/web` can render a severity badge without pulling in
 * Zod or the database layer. The schema lives where the untrusted input arrives.
 *
 * **The fan-out routes on the envelope's `scanId`, never on the payload's.** They
 * are the same value, and duplicating it is deliberate — routing must not depend
 * on knowing the shape of ten payloads, and an event type added later must not be
 * able to land in the wrong room by having its id in an unexpected field.
 */

import { z } from 'zod';
import {
  SCAN_EVENTS_CHANNEL,
  SCAN_EVENT_TYPES,
  scanRoom,
  type ScanEventEnvelope,
} from '@webaudit/types';

/**
 * Deliberately loose on the payload and strict on the envelope.
 *
 * The envelope is what this file acts on: it routes on `scanId` and orders on
 * `emittedAt`. The payload is forwarded verbatim to a client that has its own
 * types for it, so re-declaring all ten shapes here would mean two schemas to
 * keep in step and a rolling deploy where the API rejects events it does not yet
 * know about. `type` is checked against the known set so a garbled message is
 * still caught.
 */
const envelopeSchema = z.object({
  scanId: z.string().min(1).max(64),
  emittedAt: z.string().datetime(),
  event: z.object({ type: z.enum(SCAN_EVENT_TYPES) }).passthrough(),
});

/** What a socket layer must give the fan-out. Nothing more. */
export interface RoomBroadcaster {
  /** Sends to every socket in the room. A room with no sockets is a no-op. */
  broadcast(room: string, payload: string): void;
}

export interface RedisSubscriber {
  subscribe(channel: string): Promise<unknown>;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  unsubscribe(channel: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

export interface FanoutStats {
  readonly received: number;
  readonly forwarded: number;
  /** Messages that failed validation. A non-zero value is worth an alert. */
  readonly dropped: number;
}

export interface FanoutOptions {
  readonly subscriber: RedisSubscriber;
  readonly broadcaster: RoomBroadcaster;
  readonly onDrop?: (raw: string, problem: string) => void;
}

export interface Fanout {
  readonly stats: FanoutStats;
  /** Exposed so a test can deliver a message without a Redis instance. */
  handleMessage(channel: string, raw: string): void;
  stop(): Promise<void>;
}

export async function startFanout(options: FanoutOptions): Promise<Fanout> {
  let received = 0;
  let forwarded = 0;
  let dropped = 0;

  const drop = (raw: string, problem: string): void => {
    dropped += 1;
    const report =
      options.onDrop ??
      ((_raw: string, why: string): void => {
        console.warn(`[realtime] dropped an unusable event: ${why}`);
      });
    report(raw, problem);
  };

  const handleMessage = (channel: string, raw: string): void => {
    if (channel !== SCAN_EVENTS_CHANNEL) return;
    received += 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      drop(raw, 'not valid JSON');
      return;
    }

    const result = envelopeSchema.safeParse(parsed);
    if (!result.success) {
      drop(raw, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }

    const envelope = result.data as unknown as ScanEventEnvelope;
    // Routed on the envelope. See the module note.
    options.broadcaster.broadcast(scanRoom(envelope.scanId), JSON.stringify(envelope));
    forwarded += 1;
  };

  options.subscriber.on('message', handleMessage);
  await options.subscriber.subscribe(SCAN_EVENTS_CHANNEL);

  return {
    get stats(): FanoutStats {
      return { received, forwarded, dropped };
    },
    handleMessage,
    async stop(): Promise<void> {
      await options.subscriber.unsubscribe(SCAN_EVENTS_CHANNEL);
      await options.subscriber.quit();
    },
  };
}
