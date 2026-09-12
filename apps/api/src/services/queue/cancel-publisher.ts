/**
 * P0-CANCEL-1 — the publisher half of the per-scan cancellation channel
 * (specs/002-fix-cancel-timeout-refunds/contracts/cancellation-channel.md).
 *
 * A best-effort accelerant, never the authority: `scans.routes.ts`'s cancel
 * route calls this only *after* its own guarded `updateMany` has already
 * committed `state: CANCELLED`. A publish failure here must never fail that
 * already-succeeded request and must never be retried in a way that could
 * delay the response — the worker's existing phase-boundary guard is the
 * fallback if this message is lost, exactly as it was before this channel
 * existed.
 *
 * Same shape as `teardown-producer.ts`: a small, lazily-connected client this
 * route owns, not shared with the realtime fan-out subscriber (which is in a
 * different mode — an ioredis connection that has issued `SUBSCRIBE` cannot
 * also `PUBLISH` on the same connection).
 */

import { Redis, type RedisOptions } from 'ioredis';
import { cancellationSignalSchema, scanCancelChannel } from '@webaudit/config';

export interface CancelPublisher {
  publishCancellation(scanId: string): Promise<void>;
  close(): Promise<void>;
}

function connectionFromEnv(): { url: string; options: RedisOptions } {
  return {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
    options: { maxRetriesPerRequest: null },
  };
}

export function createCancelPublisher(
  connection: { url: string; options: RedisOptions } = connectionFromEnv(),
): CancelPublisher {
  const client = new Redis(connection.url, connection.options);
  client.on('error', (error: unknown) => {
    console.error('[cancel-publisher] redis connection error:', error);
  });

  return {
    async publishCancellation(scanId: string): Promise<void> {
      const signal = cancellationSignalSchema.parse({
        scanId,
        reason: 'user_cancelled',
        at: new Date().toISOString(),
      });
      try {
        await client.publish(scanCancelChannel(scanId), JSON.stringify(signal));
      } catch (error) {
        // Best-effort only (see this module's own header) — the cancel
        // request has already succeeded and must not fail because of this.
        console.error(`[cancel-publisher] failed to publish cancellation for ${scanId}:`, error);
      }
    },
    close: () => client.quit().then(() => undefined),
  };
}
