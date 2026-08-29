/**
 * T097 — persist, then publish. In that order, always.
 *
 * R5: "Every event is **also** persisted as scan state before publishing.
 * Persist-then-publish is what makes FR-047 work: a user returning after being
 * away is served current state from the database, then receives live events from
 * the socket."
 *
 * **The ordering is the whole guarantee, and reversing it is invisible in
 * testing.** Publish-then-persist works perfectly until a client acts on it. The
 * client receives `module:complete`, calls `GET /scans/:id` to fetch the
 * findings, and the row is not there yet — so the report shows an area that the
 * progress bar says finished. Worse on reconnect: the client fetches
 * authoritative state, misses the event that was published before the write, and
 * sits at 60% for ever. Every one of those is a race that reproduces on a slow
 * database and never on a fast one.
 *
 * So `emit` writes first and returns the write's result. If the write throws,
 * nothing is published, and the caller sees the failure.
 *
 * **A publish failure is not a work failure.** Redis is transport here, not a
 * record — the constitution is explicit that it "is cache, queue and rate-limit
 * state only, never a system of record". The state is already durable, and a
 * client that missed a live event recovers by fetching (FR-047). Throwing here
 * would fail an audit because a fan-out channel hiccuped, which is the wrong
 * trade in both directions.
 */

import { SCAN_EVENTS_CHANNEL, type ScanEvent, type ScanEventEnvelope } from '@webaudit/types';

/** Just the publish half of a Redis client. */
export interface EventPublisher {
  publish(channel: string, message: string): Promise<number>;
}

/**
 * What a given event must have written before it is allowed out.
 *
 * A function rather than a flag: the persistence differs per event, and making
 * the caller supply it is what keeps "did this get persisted?" from becoming a
 * boolean somebody sets to true.
 */
export type PersistStep = () => Promise<void>;

export interface EmitOptions {
  readonly publisher: EventPublisher;
  /** Injected so a test can assert ordering without a real clock. */
  readonly now?: () => Date;
  /**
   * Where a publish failure is reported. Not a throw — see the module note.
   * Defaults to `console.warn`.
   */
  readonly onPublishFailure?: (event: ScanEvent, error: unknown) => void;
}

export interface EmitResult {
  readonly persisted: true;
  /** False when Redis refused. The state is durable regardless. */
  readonly published: boolean;
}

/**
 * Persist the state this event describes, then publish the event.
 *
 * @param persist runs first. If it throws, nothing is published and the throw
 *   propagates — a state we failed to record must not be announced.
 */
export async function emit(
  event: ScanEvent,
  persist: PersistStep,
  options: EmitOptions,
): Promise<EmitResult> {
  // First. Always. The comment at the top of this file is the reason.
  await persist();

  const envelope: ScanEventEnvelope = {
    scanId: event.scanId,
    emittedAt: (options.now?.() ?? new Date()).toISOString(),
    event,
  };

  try {
    await options.publisher.publish(SCAN_EVENTS_CHANNEL, JSON.stringify(envelope));
    return { persisted: true, published: true };
  } catch (error) {
    const report =
      options.onPublishFailure ??
      ((failed: ScanEvent, cause: unknown): void => {
        console.warn(
          `[realtime] could not publish ${failed.type} for ${failed.scanId}; ` +
            'state is persisted and the client will recover on fetch (FR-047)',
          cause,
        );
      });
    report(event, error);
    return { persisted: true, published: false };
  }
}

/**
 * An emitter bound to one scan, so a caller cannot emit an event for a scan it
 * is not running.
 *
 * Small, but it removes a class of mistake: with a free function, a phase job
 * holding two ids can publish progress against the wrong one, and the event
 * arrives in a room the user does not own.
 */
export interface ScanEmitter {
  emit(event: ScanEvent, persist: PersistStep): Promise<EmitResult>;
}

export function createScanEmitter(scanId: string, options: EmitOptions): ScanEmitter {
  return {
    emit(event: ScanEvent, persist: PersistStep): Promise<EmitResult> {
      if (event.scanId !== scanId) {
        return Promise.reject(
          new Error(
            `This emitter is bound to scan ${scanId} but the event names ${event.scanId}. ` +
              'An event published against the wrong scan lands in a room its owner cannot see.',
          ),
        );
      }
      return emit(event, persist, options);
    },
  };
}
