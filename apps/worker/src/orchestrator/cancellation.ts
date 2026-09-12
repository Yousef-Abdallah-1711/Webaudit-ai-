/**
 * P0-CANCEL-1 — the worker's side of checkpoint-based cooperative cancellation.
 *
 * `apps/api`'s cancel route publishes a best-effort notification on a per-scan
 * Redis channel immediately after its own guarded `updateMany` commits
 * (`scans.routes.ts`). This module is the subscriber half: it lets
 * `orchestrator.ts` register interest in exactly one scan for exactly the
 * lifetime of the phase-job invocation handling it, and nothing longer — a
 * scan's execution spans multiple BullMQ jobs, each of which may land on a
 * different worker process, so a subscription that outlived one job's
 * handling would either leak or need a second, unrelated cross-process
 * cleanup mechanism. See specs/002-fix-cancel-timeout-refunds/research.md
 * (Decision 2) for the full reasoning.
 *
 * This channel is a hint to check, never the authority — a message that never
 * arrives, or fails validation, must never stop a scan from eventually being
 * discovered as cancelled the way it always has been: the next phase-boundary
 * transition losing its guarded race. Losing this signal degrades to today's
 * behavior, not to a stuck scan.
 */

import Redis from 'ioredis';
import { cancellationSignalSchema, scanCancelChannel } from '@webaudit/config';

export interface CancellationSource {
  /**
   * Registers interest in one scan's cancellation. `onCancel` may be called
   * more than once (idempotent by design — callers just flip a flag or call
   * `AbortController.abort()`, both already idempotent). Returns an
   * unsubscribe function the caller MUST call (typically in a `finally`) once
   * it stops caring — failing to do so leaks a subscription for the life of
   * the underlying connection.
   */
  subscribe(scanId: string, onCancel: () => void): () => void;
}

/**
 * A real, Redis-backed `CancellationSource`. One dedicated subscriber
 * connection shared across every scan this worker process is concurrently
 * handling — a Redis connection in subscriber mode can listen on many
 * channels at once, so there is no need for one connection per scan.
 *
 * Built the same way `apps/api`'s existing realtime subscriber client is
 * (`maxRetriesPerRequest: null` so a blocking read failing during a Redis
 * restart reconnects instead of throwing; an explicit `.on('error', ...)`
 * so a reconnage blip logs instead of becoming an uncaught exception) —
 * closing the one gap the prior full-workflow review found on this same
 * worker process's *publisher* client, which had no equivalent handler.
 */
export function createRedisCancellationSource(redisUrl: string): CancellationSource & {
  close(): Promise<void>;
} {
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  client.on('error', (error: unknown) => {
    console.error('[cancellation] redis subscriber connection error:', error);
  });

  const listeners = new Map<string, Set<() => void>>();

  client.on('message', (channel: string, raw: string) => {
    const forChannel = listeners.get(channel);
    if (forChannel === undefined || forChannel.size === 0) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`[cancellation] discarding unparseable message on ${channel}`);
      return;
    }
    const result = cancellationSignalSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(
        `[cancellation] discarding invalid message on ${channel}:`,
        result.error.message,
      );
      return;
    }
    for (const onCancel of [...forChannel]) onCancel();
  });

  return {
    subscribe(scanId, onCancel) {
      const channel = scanCancelChannel(scanId);
      let forChannel = listeners.get(channel);
      if (forChannel === undefined) {
        forChannel = new Set();
        listeners.set(channel, forChannel);
        // Fire-and-forget: a subscribe that hasn't completed yet by the time
        // a cancellation is published is exactly the "signal missed, fall
        // back to the phase-boundary guard" case this module's own header
        // already accepts as correct, not a bug to guard against here.
        client.subscribe(channel).catch((error: unknown) => {
          console.error(`[cancellation] failed to subscribe to ${channel}:`, error);
        });
      }
      forChannel.add(onCancel);

      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;
        const current = listeners.get(channel);
        if (current === undefined) return;
        current.delete(onCancel);
        if (current.size === 0) {
          listeners.delete(channel);
          client.unsubscribe(channel).catch((error: unknown) => {
            console.error(`[cancellation] failed to unsubscribe from ${channel}:`, error);
          });
        }
      };
    },
    close() {
      return client.quit().then(() => undefined);
    },
  };
}
