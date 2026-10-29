/**
 * The seam between the platform's execution host and an engine (SPEC 010-012 will implement it; the platform ships none).
 * The host owns everything contractual — claim, F07 admission, status edges, the ≤5 s loop, lease renewal, the hard stop,
 * finalization, refusal reasons. An adapter only says what is engine-specific.
 */

import type { AdmissionRequest } from '@webaudit/api/safety';
import type { RecordedEvidence } from '@webaudit/api/evidence';
import type { DispatchUnit, EffectDecision, ProgressTick } from '@webaudit/api/execution-runtime';
import type { EvidenceKind } from '@webaudit/api/prisma-client';
import { isPassiveClass, type ExecutionUnitClass } from '@webaudit/api/planning';
import { EXEC_QUEUE_NAMES, queueNameForUnitClass } from '@webaudit/config';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AdapterUnit extends DispatchUnit {
  configuration: unknown;
}

export type ChildCheckpointResult = { outcome: 'PROCEED' } | { outcome: 'STOP'; reason: string };

/** Child-process context. Every externally visible effect must go through the host's `authorizeEffect` (DEC-051). */
export interface AdapterContext {
  readonly unit: AdapterUnit;
  /** Aborted when the host decides the unit must stop (stop, lease lost, deadline, hard stop). Honour it promptly. */
  readonly signal: AbortSignal;
  /** F07 checkpoint relayed to the parent; lease tokens and authorization internals never cross IPC. */
  safetyCheckpoint(): Promise<ChildCheckpointResult>;
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
  /** Queue class consumed by this adapter. Engine IDs remain the lookup key for a unit. */
  readonly executionUnitClass: ExecutionUnitClass;
  /** Class L consumes an F07 concurrency lease; class N does not. */
  readonly leaseClass: 'L' | 'N';
  readonly hardStopMarginMs?: number;
  /** Local, reviewed module loaded only inside the per-unit child process. */
  readonly childModuleUrl: string;
  readonly childExportName: string;
  admissionRequestFor(unit: DispatchUnit): AdmissionRequest;
  hasCapacity?(unit: DispatchUnit): Promise<boolean>;
  guards?(unit: DispatchUnit): Promise<string | null>;
  proofs?(unit: DispatchUnit): Promise<string | null>;
  /** Idempotent termination confirmation used by `expirePlanUnits` before a non-passive engine is activated. */
  onUnitExpired(unit: { id: string }): Promise<'TERMINATED' | 'PENDING'>;
}

export interface AdapterRegistry {
  find(engineId: string): ExecutionAdapter | undefined;
  list(): readonly ExecutionAdapter[];
}

export function createAdapterRegistry(adapters: readonly ExecutionAdapter[] = []): AdapterRegistry {
  const byId = new Map<string, ExecutionAdapter>();
  for (const a of adapters) {
    if (byId.has(a.engineId)) throw new Error(`duplicate execution adapter for ${a.engineId}`);
    let childModule: URL;
    try {
      childModule = new URL(a.childModuleUrl);
    } catch {
      throw new Error(`execution adapter ${a.engineId} has an invalid child module URL`);
    }
    if (
      childModule.protocol !== 'file:' ||
      childModule.hostname !== '' ||
      childModule.search.length > 0 ||
      childModule.hash.length > 0 ||
      !/^[A-Za-z_$][\w$]*$/.test(a.childExportName)
    ) {
      throw new Error(
        `execution adapter ${a.engineId} must use a local file module and named export`,
      );
    }
    const workspace = resolve(process.cwd());
    const moduleRelativePath = relative(workspace, resolve(fileURLToPath(childModule)));
    if (
      moduleRelativePath === '' ||
      moduleRelativePath === '..' ||
      moduleRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(moduleRelativePath)
    ) {
      throw new Error(`execution adapter ${a.engineId} child module must be inside the workspace`);
    }
    const queueName = queueNameForUnitClass(a.executionUnitClass);
    const executionQueueNames: readonly string[] = Object.values(EXEC_QUEUE_NAMES);
    if (queueName === null || !executionQueueNames.includes(queueName)) {
      throw new Error(
        `execution adapter ${a.engineId} has no dispatch queue for ${a.executionUnitClass}`,
      );
    }
    if (!isPassiveClass(a.executionUnitClass) && a.onUnitExpired === undefined) {
      throw new Error(
        `execution adapter ${a.engineId} must define onUnitExpired for ${a.executionUnitClass}`,
      );
    }
    if (
      a.hardStopMarginMs !== undefined &&
      (!Number.isSafeInteger(a.hardStopMarginMs) || a.hardStopMarginMs <= 0)
    ) {
      throw new Error(`execution adapter ${a.engineId} has an invalid hardStopMarginMs`);
    }
    byId.set(a.engineId, a);
  }
  return { find: (id) => byId.get(id), list: () => [...byId.values()] };
}
