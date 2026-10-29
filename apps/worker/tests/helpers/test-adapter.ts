/**
 * Deterministic, TEST-ONLY execution adapter. It is not an engine (SPEC 010-012 own those): it only lets the whole
 * queue -> worker -> host -> finalizer path run without one. Behaviour is chosen by `unit.configuration.behavior`.
 */

import { admissionRequest, type SafetyWorld } from '../../../api/tests/helpers/safety-fixtures.js';
import type { ExecutionAdapter } from '../../src/execution-runtime/adapter.js';

export type Behavior =
  | { kind: 'COMPLETE' }
  | { kind: 'EFFECTS'; count: number }
  | { kind: 'THROW' }
  | { kind: 'INFRA' }
  | { kind: 'CUSTOMER_EXIT'; code: number }
  /** Does nothing until aborted (a hung engine). */
  | { kind: 'HANG' }
  /** A real child process that ignores AbortSignal and exits only when killed by its parent. */
  | { kind: 'PROCESS_HANG' }
  /** Wait briefly, then request the host-mediated F07 checkpoint. */
  | { kind: 'CHECKPOINT_WAIT'; ms: number }
  /** Works for `ms`, honouring abort. */
  | { kind: 'WAIT'; ms: number };

export interface TestAdapterHandle {
  adapter: ExecutionAdapter;
}

export function createTestAdapter(
  world: SafetyWorld,
  engineId = 'engine.x',
  opts: { hardStopMarginMs?: number; lease?: 'L' | 'N' } = {},
): TestAdapterHandle {
  const adapter: ExecutionAdapter = {
    engineId,
    executionUnitClass: 'BROWSER',
    leaseClass: opts.lease ?? 'L',
    childModuleUrl: new URL('./test-adapter-child.ts', import.meta.url).href,
    childExportName: 'runTestAdapterChild',
    ...(opts.hardStopMarginMs === undefined ? {} : { hardStopMarginMs: opts.hardStopMarginMs }),
    onUnitExpired: () => Promise.resolve('TERMINATED'),
    admissionRequestFor: (u) =>
      admissionRequest(world, {
        executionId: u.id,
        idempotencyKey: u.idempotencyKey,
        consumes: { request: true, concurrency: (opts.lease ?? 'L') === 'L' },
      }),
  };
  return { adapter };
}
