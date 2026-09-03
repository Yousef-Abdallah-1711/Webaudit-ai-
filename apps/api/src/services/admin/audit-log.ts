/**
 * T210 — the single append point for `AuditLogEntry` (FR-089).
 *
 * Every operator mutation this phase adds — user management, plan management,
 * and everything after — writes through this one function so the shape of an
 * audit row is consistent by construction rather than by every call site
 * remembering to match it.
 *
 * `actorId` carries no foreign key to `User` by design (see the model's own
 * comment in schema.prisma): it is an immutable fact about who acted, not a
 * live pointer. This function does not — and must not — validate that the
 * actor exists; that would silently reintroduce the coupling the missing FK
 * exists to avoid, and would make an audit write fail for the one case
 * (a demoted-or-deleted operator's earlier-queued action landing late) where
 * the row still has to be written.
 *
 * Append-only by convention, not by constraint: nothing in this codebase may
 * call `.update()` or `.delete()` on `auditLogEntry`, and this module offers
 * no way to.
 */

import type { Prisma, PrismaClient } from '../../../prisma/generated/client/index.js';

export type AuditLogWriter = Pick<PrismaClient, 'auditLogEntry'>;

export interface AuditLogInput {
  /** The operator who took the action. Not validated against `User` — see above. */
  readonly actorId: string;
  /** e.g. "user.update", "plan.create". Free text, consistent per call site. */
  readonly action: string;
  /** e.g. "User", "Plan". */
  readonly subjectType: string;
  readonly subjectId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly subjectType: string;
  readonly subjectId: string | null;
  readonly before: Prisma.JsonValue | null;
  readonly after: Prisma.JsonValue | null;
  readonly createdAt: Date;
}

/**
 * Writes one audit row. Thin and obviously correct on purpose — the value of
 * this function is that there is exactly one of it, not that it does
 * anything clever.
 */
export async function recordAuditLog(
  db: AuditLogWriter,
  input: AuditLogInput,
): Promise<AuditLogRecord> {
  return db.auditLogEntry.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
      // Cast to Prisma's JSON input type — a plain `unknown` is structurally
      // wider than `InputJsonValue` even though every value passed here is
      // JSON-serialisable (see issues/attempts.ts for the same pattern).
      ...(input.before === undefined ? {} : { before: input.before as Prisma.InputJsonValue }),
      ...(input.after === undefined ? {} : { after: input.after as Prisma.InputJsonValue }),
    },
  });
}
