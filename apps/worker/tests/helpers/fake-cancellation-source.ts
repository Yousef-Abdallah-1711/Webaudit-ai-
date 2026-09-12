/**
 * An in-memory `CancellationSource` test double — no Redis connection.
 * Mirrors this repo's existing `EventPublisher`/`ScanEmitter` fake-injection
 * pattern (a capturing fake for unit-level assertions; the dedicated adverse
 * test for P0-CANCEL-1 exercises the real Redis-backed implementation
 * end to end instead of this one).
 */
import type { CancellationSource } from '../../src/orchestrator/cancellation.js';

export interface FakeCancellationSource extends CancellationSource {
  /** Synchronously fires every listener currently registered for this scan,
   *  simulating the cancel route's Redis publish having been received. */
  cancel(scanId: string): void;
}

export function createFakeCancellationSource(): FakeCancellationSource {
  const listeners = new Map<string, Set<() => void>>();

  return {
    subscribe(scanId, onCancel) {
      let forScan = listeners.get(scanId);
      if (forScan === undefined) {
        forScan = new Set();
        listeners.set(scanId, forScan);
      }
      forScan.add(onCancel);

      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;
        listeners.get(scanId)?.delete(onCancel);
      };
    },
    cancel(scanId) {
      for (const onCancel of [...(listeners.get(scanId) ?? [])]) onCancel();
    },
  };
}
