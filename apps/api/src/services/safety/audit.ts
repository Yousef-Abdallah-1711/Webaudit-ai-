/**
 * SPEC 008 `contracts/execution-audit-contract.md` — the one TypeScript write
 * path for `ExecutionAuditEvent` (FR-020/022/023/024).
 *
 * Events produced by the SQL functions (admission, release, reclaim, stop
 * lifecycle) are written inside those functions in the operation's own
 * transaction and carry fixed structural payloads only. Events a TypeScript
 * caller originates come through here: the payload is redacted with
 * `@webaudit/redaction` unconditionally (no bypass flag), and a redaction
 * failure stores `{"_redactionFailed": true}` rather than dropping the event or
 * writing the raw value (boundary rule 2). The database function additionally
 * bounds the payload (object, <= 8 KiB) and the outcome string.
 */

import { redactText } from '@webaudit/redaction';
import { EXECUTION_AUDIT_EVENT_TYPES, type ExecutionAuditEventType } from '@webaudit/types';
import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from './db.js';

export { EXECUTION_AUDIT_EVENT_TYPES };
export type { ExecutionAuditEventType };

export interface ExecutionAuditContext {
  targetId?: string;
  targetAuthorizationId?: string;
  scopeId?: string;
  environmentAtEvent?: string;
  scanId?: string;
  executionId?: string;
  executionClass?: string;
}

const REDACTION_FAILED = { _redactionFailed: true } as const;
const MAX_DEPTH = 8;

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[[TRUNCATED]]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) out[key] = redactValue(inner, depth + 1);
    return out;
  }
  return value;
}

/** Exported for tests: never throws, never returns the raw value on failure. */
export function redactAuditPayload(
  payload: unknown,
  redact: (value: unknown, depth: number) => unknown = redactValue,
): Record<string, unknown> | null {
  if (payload === undefined || payload === null) return null;
  try {
    const redacted = redact(payload, 0);
    if (redacted === null || typeof redacted !== 'object' || Array.isArray(redacted)) {
      return { value: redacted };
    }
    return redacted as Record<string, unknown>;
  } catch {
    return { ...REDACTION_FAILED };
  }
}

export async function recordExecutionAuditEvent(
  db: SafetyDb,
  input: {
    eventType: ExecutionAuditEventType;
    actorId: string;
    context?: ExecutionAuditContext;
    outcome: string;
    /** Raw, pre-redaction: this function redacts it; callers never do. */
    payload?: unknown;
  },
): Promise<string> {
  const c = input.context ?? {};
  const payload = redactAuditPayload(input.payload);
  const payloadJson = payload === null ? null : JSON.stringify(payload);
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT public.f07_record_audit_ts(
      ${input.eventType}::"ExecutionAuditEventType", ${input.actorId},
      ${c.targetId ?? null}, ${c.targetAuthorizationId ?? null}, ${c.scopeId ?? null},
      ${c.environmentAtEvent ?? null}, ${c.scanId ?? null}, ${c.executionId ?? null},
      ${c.executionClass ?? null}, ${input.outcome}, ${payloadJson}::jsonb) AS id`);
  const row = rows[0];
  if (row === undefined) throw new Error('audit write returned no id');
  return row.id;
}

export interface ExecutionAuditRow {
  id: string;
  eventType: ExecutionAuditEventType;
  actorId: string;
  targetId: string | null;
  targetAuthorizationId: string | null;
  scanId: string | null;
  executionId: string | null;
  outcome: string;
  payload: unknown;
  timestamp: Date;
}

/**
 * Tenant-scoped reconstruction (boundary rule 3, T029): ownership is
 * re-derived through the caller's own grants, targets and scans — there is no
 * bare cross-tenant query path. Events with no tenant-owned identifier
 * (tenant/platform-scope operator stops) are not returned.
 */
export async function listExecutionAuditEvents(
  db: SafetyDb,
  input: { userId: string; targetAuthorizationId?: string; executionId?: string; limit?: number },
): Promise<ExecutionAuditRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  return db.$queryRaw<ExecutionAuditRow[]>(Prisma.sql`
    SELECT e.id, e."eventType", e."actorId", e."targetId", e."targetAuthorizationId", e."scanId",
           e."executionId", e.outcome, e.payload, e."timestamp"
    FROM "ExecutionAuditEvent" e
    WHERE (e."targetAuthorizationId" IN (SELECT id FROM "TargetAuthorization" WHERE "userId" = ${input.userId})
        OR e."targetId" IN (SELECT id FROM "Target" WHERE "userId" = ${input.userId})
        OR e."scanId" IN (SELECT id FROM "Scan" WHERE "userId" = ${input.userId}))
      AND (${input.targetAuthorizationId ?? null}::text IS NULL OR e."targetAuthorizationId" = ${input.targetAuthorizationId ?? null})
      AND (${input.executionId ?? null}::text IS NULL OR e."executionId" = ${input.executionId ?? null})
    ORDER BY e."timestamp", e.id
    LIMIT ${limit}`);
}
