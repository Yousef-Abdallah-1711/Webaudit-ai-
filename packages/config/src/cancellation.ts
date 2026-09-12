/**
 * The per-scan cancellation notification channel and message shape, shared
 * between `apps/api` (publisher — the cancel route, once its own guarded
 * `updateMany` has committed) and `apps/worker` (subscriber — the orchestrator,
 * for the lifetime of one phase-job invocation).
 *
 * Lives here rather than `packages/types` for the same reason `queues.ts`
 * does (see that file's own module note): `packages/types` is deliberately
 * dependency-free so `apps/web` never pulls in a validation library just to
 * render a progress bar. This is backend-only, producer/consumer-shared
 * config — exactly `packages/config`'s existing scope — and Zod is already a
 * dependency of both apps that use it.
 *
 * This channel is a best-effort accelerant, never the authority: the guarded
 * DB write is what actually cancels a scan (see `contracts/
 * cancellation-channel.md` under specs/002-fix-cancel-timeout-refunds/). A
 * message that fails validation, or never arrives at all, must never be
 * treated as a cancellation and must never crash the receiving process — it
 * is discarded, and the worker falls back to discovering the cancellation at
 * its next natural phase-boundary transition, exactly as it did before this
 * channel existed.
 */

import { z } from 'zod';

/** One channel per scan — never client-suppliable, always derived server-side. */
export function scanCancelChannel(scanId: string): string {
  return `scan:cancel:${scanId}`;
}

export const cancellationSignalSchema = z.object({
  scanId: z.string().min(1),
  /** A literal today; kept as a field so a future caller (e.g. an operator
   *  force-cancel) can reuse this same channel and shape without a breaking
   *  change. */
  reason: z.literal('user_cancelled'),
  /** Diagnostics only — never used to decide whether a cancellation "took". */
  at: z.string().datetime(),
});

export type CancellationSignal = z.infer<typeof cancellationSignalSchema>;
