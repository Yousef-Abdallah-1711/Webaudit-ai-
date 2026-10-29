/**
 * The seam between the platform's execution host and an engine (SPEC 010-012 will implement it; the platform ships none).
 * The host owns everything contractual — claim, F07 admission, status edges, the ≤5 s loop, lease renewal, the hard stop,
 * finalization, refusal reasons. An adapter only says what is engine-specific.
 */

import type { AdmissionRequest } from '@webaudit/api/safety';
import type { RecordedEvidence } from '@webaudit/api/evidence';
import type {
  DispatchUnit,
  EffectDecision,
  ForkedChild,
  ProgressTick,
  UnitObservation,
} from '@webaudit/api/execution-runtime';
import type { EvidenceKind } from '@webaudit/api/prisma-client';

export interface AdapterUnit extends DispatchUnit {
  configuration: unknown;
}

/** What `run` may do. Every externally visible effect must go through `authorizeEffect` first (DEC-051). */
export interface AdapterContext {
  readonly unit: AdapterUnit;
  /** Aborted when the host decides the unit must stop (stop, lease lost, deadline, hard stop). Honour it promptly. */
  readonly signal: AbortSignal;
  authorizeEffect(kind: string, ordinal: number): Promise<EffectDecision>;
  confirmEffect(kind: string, ordinal: number): Promise<boolean>;
  recordEvidence(
    kind: EvidenceKind,
    payload: unknown,
    contentType?: string,
  ): Promise<RecordedEvidence>;
  /** Fire-and-forget; published immediately, snapshotted durably at most once per throttle interval. */
  progress(tick: ProgressTick): void;
}

export interface ExecutionAdapter {
  readonly engineId: string;
  /** Class L consumes an F07 concurrency lease; class N does not. */
  readonly leaseClass: 'L' | 'N';
  readonly hardStopMarginMs?: number;
  admissionRequestFor(unit: DispatchUnit): AdmissionRequest;
  hasCapacity?(unit: DispatchUnit): Promise<boolean>;
  guards?(unit: DispatchUnit): Promise<string | null>;
  proofs?(unit: DispatchUnit): Promise<string | null>;
  /** The inert child under the start gate. Absent: a no-op child. */
  forkInertChild?(unit: DispatchUnit): Promise<ForkedChild>;
  /** The work. Returns what actually happened; the host classifies it (the engine never self-reports a failure class). */
  run(context: AdapterContext): Promise<UnitObservation>;
  /** Termination confirmation for `expirePlanUnits`; absent means "not confirmed gone". */
  onUnitExpired?(unit: { id: string }): Promise<'TERMINATED' | 'PENDING'>;
}

export interface AdapterRegistry {
  find(engineId: string): ExecutionAdapter | undefined;
  list(): readonly ExecutionAdapter[];
}

export function createAdapterRegistry(adapters: readonly ExecutionAdapter[] = []): AdapterRegistry {
  const byId = new Map<string, ExecutionAdapter>();
  for (const a of adapters) {
    if (byId.has(a.engineId)) throw new Error(`duplicate execution adapter for ${a.engineId}`);
    byId.set(a.engineId, a);
  }
  return { find: (id) => byId.get(id), list: () => [...byId.values()] };
}
