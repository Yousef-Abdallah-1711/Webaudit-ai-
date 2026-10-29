/**
 * Progress (progress-event-contract.md, FR-027/027a).
 *
 * Two halves. `emitProgress` is ephemeral and high-frequency (published, never written to Postgres, never read back
 * as truth). `snapshotProgress` is durable, throttled and last-write-wins: one `UPDATE` of one row, refused once the unit
 * is terminal (a terminal row is frozen by a trigger as well). Neither is part of finalization; progress is informational.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import { redactText } from '@webaudit/redaction';
import {
  SCAN_EVENTS_CHANNEL,
  type ExecutionUnitClass,
  type ScanEventEnvelope,
} from '@webaudit/types';
import type { SafetyDb } from '../safety/db.js';

export const PROGRESS_LIMITS = {
  labelMax: 200,
  /** Serialized snapshot ceiling: bounded so progress can never become a payload channel. */
  snapshotMaxBytes: 1024,
  /** Durable-write throttle; the ephemeral channel already delivered every tick to live listeners. */
  minSnapshotIntervalMs: 2000,
} as const;

export interface ProgressTick {
  label: string;
  completedUnits?: number;
  totalUnits?: number;
  indeterminate?: boolean;
}

export type ProgressRefusal = 'INVALID_TICK';

export class ProgressTickError extends Error {
  constructor(readonly reason: ProgressRefusal) {
    super(reason);
    this.name = 'ProgressTickError';
  }
}

export interface NormalizedProgress {
  label: string;
  completedUnits: number | null;
  totalUnits: number | null;
  /** True whenever the total is not genuinely known: a UI must then show an indeterminate indicator, never a guessed bar. */
  indeterminate: boolean;
}

const nonNegInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Rule 1: never fabricate a percentage — an unknown total is `indeterminate`, whatever the caller said about the count. */
export function normalizeTick(tick: ProgressTick): NormalizedProgress {
  const label = typeof tick.label === 'string' ? tick.label.trim() : '';
  if (label === '' || label.length > PROGRESS_LIMITS.labelMax)
    throw new ProgressTickError('INVALID_TICK');
  const redactedLabel = redactText(label);
  if (tick.completedUnits !== undefined && !nonNegInt(tick.completedUnits))
    throw new ProgressTickError('INVALID_TICK');
  if (tick.totalUnits !== undefined && !nonNegInt(tick.totalUnits))
    throw new ProgressTickError('INVALID_TICK');
  const total = tick.totalUnits ?? null;
  const done = tick.completedUnits ?? null;
  if (total !== null && done !== null && done > total) throw new ProgressTickError('INVALID_TICK');
  const known = total !== null && total > 0 && done !== null;
  return {
    label: redactedLabel,
    completedUnits: known ? done : null,
    totalUnits: known ? total : null,
    indeterminate: tick.indeterminate === true || !known,
  };
}

export const unitProgressChannel = (executionUnitId: string): string =>
  `unit-progress:${executionUnitId}`;

export interface ProgressPublisher {
  publish(channel: string, message: string): Promise<number>;
}

export interface EmitProgressOptions {
  scanId?: string;
  executionPlanId?: string;
  planKind?: 'INITIAL' | 'REVERIFY';
  executionUnitClass?: ExecutionUnitClass;
  now?: Date;
}

/** Ephemeral: publishes to the per-unit channel and, for scan-owned units, the authenticated scan-room event path. */
export function emitProgress(
  publisher: ProgressPublisher,
  executionUnitId: string,
  tick: ProgressTick,
  options: EmitProgressOptions = {},
): void {
  let message: string;
  try {
    const now = options.now ?? new Date();
    const progress = normalizeTick(tick);
    if (
      options.scanId !== undefined &&
      options.executionPlanId !== undefined &&
      options.planKind !== undefined &&
      options.executionUnitClass !== undefined
    ) {
      const envelope: ScanEventEnvelope = {
        scanId: options.scanId,
        emittedAt: now.toISOString(),
        event: {
          type: 'execution:progress',
          scanId: options.scanId,
          executionPlanId: options.executionPlanId,
          planKind: options.planKind,
          executionUnitId,
          executionUnitClass: options.executionUnitClass,
          at: now.toISOString(),
          ...progress,
        },
      };
      message = JSON.stringify(envelope);
    } else {
      message = JSON.stringify({ executionUnitId, ...progress, at: now.toISOString() });
    }
  } catch {
    return; // an invalid tick is dropped: progress is informational
  }
  const isScanOwned =
    options.scanId !== undefined &&
    options.executionPlanId !== undefined &&
    options.planKind !== undefined &&
    options.executionUnitClass !== undefined;
  if (isScanOwned) {
    const unitMessage = JSON.stringify({
      executionUnitId,
      ...normalizeTick(tick),
      at: (options.now ?? new Date()).toISOString(),
    });
    void publisher.publish(SCAN_EVENTS_CHANNEL, message).catch(() => undefined);
    void publisher
      .publish(unitProgressChannel(executionUnitId), unitMessage)
      .catch(() => undefined);
    return;
  }
  void publisher.publish(unitProgressChannel(executionUnitId), message).catch(() => undefined);
}

export type SnapshotResult =
  'APPLIED' | 'THROTTLED' | 'REJECTED_TERMINAL' | 'NOT_ACTIVE' | 'NOT_FOUND';

/**
 * Durable write. `boundary` marks a status-transition boundary, which bypasses the throttle. A terminal unit is
 * rejected (FR-027a) and reported through `onAnomaly`, never applied.
 */
export async function snapshotProgress(
  db: SafetyDb,
  executionUnitId: string,
  tick: ProgressTick,
  options: {
    boundary?: boolean;
    minIntervalMs?: number;
    onAnomaly?: (message: string) => void;
  } = {},
): Promise<SnapshotResult> {
  const p = normalizeTick(tick);
  const body = JSON.stringify({
    label: p.label,
    completedUnits: p.completedUnits,
    totalUnits: p.totalUnits,
  });
  if (Buffer.byteLength(body, 'utf8') > PROGRESS_LIMITS.snapshotMaxBytes)
    throw new ProgressTickError('INVALID_TICK');
  const interval = options.minIntervalMs ?? PROGRESS_LIMITS.minSnapshotIntervalMs;
  const throttle =
    options.boundary === true
      ? Prisma.empty
      : Prisma.sql`AND ("progressSnapshot" IS NULL OR (("progressSnapshot"->>'at')::timestamptz) < clock_timestamp() - (${interval}::int * interval '1 millisecond'))`;
  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "ExecutionUnit"
       SET "progressSnapshot" = (${body}::jsonb || jsonb_build_object('at', clock_timestamp())),
           "progressIndeterminate" = ${p.indeterminate}
     WHERE id = ${executionUnitId} AND status IN ('ADMITTED','DISPATCHED','RUNNING') ${throttle}`);
  if (updated === 1) return 'APPLIED';
  const row = await db.$queryRaw<Array<{ status: string }>>(
    Prisma.sql`SELECT status::text AS status FROM "ExecutionUnit" WHERE id = ${executionUnitId}`,
  );
  if (row[0] === undefined) return 'NOT_FOUND';
  if (['ADMITTED', 'DISPATCHED', 'RUNNING'].includes(row[0].status)) return 'THROTTLED';
  if (row[0].status === 'PLANNED') return 'NOT_ACTIVE'; // nothing has started: there is no progress to report yet
  options.onAnomaly?.(
    `progress write rejected for terminal unit ${executionUnitId} (${row[0].status})`,
  );
  return 'REJECTED_TERMINAL';
}
