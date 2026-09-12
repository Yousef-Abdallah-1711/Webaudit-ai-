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

export type AuditLogReader = Pick<PrismaClient, 'auditLogEntry' | 'user'>;

export interface AdminAuditLogEntry extends AuditLogRecord {
  /** Looked up separately — `actorId` carries no relation to `User` by
   * design (see the model's own comment). `null` when the actor no longer
   * exists (a demoted-or-deleted operator's earlier action). */
  readonly actorEmail: string | null;
}

export interface ListAuditLogResult {
  readonly entries: readonly AdminAuditLogEntry[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Operator visibility into the append-only log itself (FR-089's own log,
 * read back). List-only — nothing here writes or mutates a row. */
export async function listAuditLog(
  db: AuditLogReader,
  opts: {
    readonly limit?: number | undefined;
    readonly offset?: number | undefined;
    readonly action?: string | undefined;
    readonly actorId?: string | undefined;
    readonly search?: string | undefined;
    readonly from?: Date | undefined;
    readonly to?: Date | undefined;
  } = {},
): Promise<ListAuditLogResult> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db.auditLogEntry.findMany({
      where: {
        ...(opts.action === undefined ? {} : { action: opts.action }),
        ...(opts.actorId === undefined ? {} : { actorId: opts.actorId }),
        ...(opts.search === undefined
          ? {}
          : {
              OR: [
                { action: { contains: opts.search, mode: 'insensitive' } },
                { subjectType: { contains: opts.search, mode: 'insensitive' } },
                { subjectId: { contains: opts.search, mode: 'insensitive' } },
              ],
            }),
        ...(opts.from === undefined && opts.to === undefined
          ? {}
          : {
              createdAt: {
                ...(opts.from === undefined ? {} : { gte: opts.from }),
                ...(opts.to === undefined ? {} : { lte: opts.to }),
              },
            }),
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    db.auditLogEntry.count({
      where: {
        ...(opts.action === undefined ? {} : { action: opts.action }),
        ...(opts.actorId === undefined ? {} : { actorId: opts.actorId }),
        ...(opts.search === undefined
          ? {}
          : {
              OR: [
                { action: { contains: opts.search, mode: 'insensitive' } },
                { subjectType: { contains: opts.search, mode: 'insensitive' } },
                { subjectId: { contains: opts.search, mode: 'insensitive' } },
              ],
            }),
        ...(opts.from === undefined && opts.to === undefined
          ? {}
          : {
              createdAt: {
                ...(opts.from === undefined ? {} : { gte: opts.from }),
                ...(opts.to === undefined ? {} : { lte: opts.to }),
              },
            }),
      },
    }),
  ]);

  const actorIds = [...new Set(rows.map((row) => row.actorId))];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, email: true },
  });
  const emailById = new Map(actors.map((actor) => [actor.id, actor.email]));

  const entries = rows.map((row): AdminAuditLogEntry => ({
    id: row.id,
    actorId: row.actorId,
    actorEmail: emailById.get(row.actorId) ?? null,
    action: row.action,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt,
  }));

  return { entries, total, limit, offset };
}
